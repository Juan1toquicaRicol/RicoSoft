import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { obtenerObligacionesAbiertas } from "../analitica/analitica.controller";
import { construirContextoPlaneacionSiesa } from "../inventario/inventario.controller";
import { calcularPatronesRecurrentesTenant } from "../toma-fisica/toma-fisica.controller";
import {
  leerVentasMensualesSiesa,
  leerTopClientesVentaSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import { calcularResumenVentas } from "../../lib/ventas-siesa";
import {
  construirIndicadoresGerenciales,
  resumirPorCategoria,
  type EntradasCentroGerencial,
  type EntradaFinanzas,
  type EntradaVentas,
} from "../../domain/gerencial/indicadores";

const DIA_MS = 24 * 60 * 60 * 1000;
const ESTADOS_SOLICITUD_ACTIVOS = ["Pendiente", "En Cotización"];

/**
 * Concentración de CxP en el proveedor con mayor saldo — misma agregación
 * (agrupar por proveedor, sumar saldo, % del total) que ya usa
 * obtenerResumenGerencial (analitica.controller.ts), pero esa función vive
 * inline dentro de un handler enorme y no es importable sin arrastrar todo
 * lo demás (cartera, flujo proyectado, alertas). Se replica aquí SOLO la
 * agregación (agrupar+sumar), no ninguna fórmula de saldo — el saldo en sí
 * viene de obtenerObligacionesAbiertas, reutilizado tal cual.
 */
function calcularConcentracionTopProveedor(
  obligaciones: { proveedorId: string | null; proveedor: string; saldo: number }[],
): { concentracionTopProveedor: number | null; nombreTopProveedor: string | null } {
  const totalCxP = obligaciones.reduce((acc, o) => acc + o.saldo, 0);
  if (totalCxP <= 0) return { concentracionTopProveedor: null, nombreTopProveedor: null };

  const porProveedor = new Map<string, { nombre: string; saldo: number }>();
  for (const o of obligaciones) {
    const clave = o.proveedorId ?? o.proveedor;
    const actual = porProveedor.get(clave) ?? { nombre: o.proveedor, saldo: 0 };
    actual.saldo += o.saldo;
    porProveedor.set(clave, actual);
  }
  const top = [...porProveedor.values()].sort((a, b) => b.saldo - a.saldo)[0];
  return {
    concentracionTopProveedor: top ? Math.round((top.saldo / totalCxP) * 1000) / 10 : null,
    nombreTopProveedor: top?.nombre ?? null,
  };
}

/**
 * Centro Gerencial — endpoint único que compone en una sola pantalla lo que
 * ya calculan por separado: finanzas (analitica.controller.ts, CxP real),
 * ventas (lib/ventas-siesa.ts sobre v470_ventas/t461), inventario/
 * producción/compras/riesgos (domain/planeacion/decisiones.ts, vía
 * construirContextoPlaneacionSiesa) y diferencias recurrentes de toma
 * física (lib/toma-fisica.ts). NINGUNA fórmula se recalcula aquí — este
 * controller solo orquesta llamadas paralelas y traduce los resultados a
 * IndicadorGerencial (domain/gerencial/indicadores.ts).
 *
 * Multi-tenant: tenantId SIEMPRE viene de req.user (JWT), nunca de query/
 * body/params. siesaCiaId se resuelve del Tenant autenticado. Los conteos
 * de SolicitudCompra/PlanProduccion usan req.tenantPrisma (auto-scoped).
 */
export const obtenerCentroGerencial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const ahora = new Date();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });

  // Finanzas: siempre disponible (no depende de Siesa) — RicoSoft es la fuente de verdad de Factura/Pago.
  const obligaciones = (await obtenerObligacionesAbiertas(req, tenantId)).filter(
    (o) => o.saldo > 0,
  );
  const valorVencido = obligaciones
    .filter((o) => o.vence < ahora)
    .reduce((acc, o) => acc + o.saldo, 0);
  const limite30d = new Date(ahora.getTime() + 30 * DIA_MS);
  const valorProximoAVencer = obligaciones
    .filter((o) => o.vence >= ahora && o.vence <= limite30d)
    .reduce((acc, o) => acc + o.saldo, 0);
  const { concentracionTopProveedor, nombreTopProveedor } =
    calcularConcentracionTopProveedor(obligaciones);

  const finanzas: EntradaFinanzas = {
    totalCxP: obligaciones.reduce((acc, o) => acc + o.saldo, 0),
    valorVencido,
    valorProximoAVencer,
    concentracionTopProveedor,
    nombreTopProveedor,
  };

  // RicoSoft-native, siempre disponibles independientemente de Siesa.
  const [planesPorEstadoRaw, solicitudesPendientes, cotizacionesPendientes, patronesRecurrentes] =
    await Promise.all([
      req.tenantPrisma!.planProduccion.findMany({ select: { estado: true } }),
      req.tenantPrisma!.solicitudCompra.count({
        where: { estado: { in: ESTADOS_SOLICITUD_ACTIVOS }, eliminado: false },
      }),
      req.tenantPrisma!.solicitudCompra.count({
        where: { estado: "En Cotización", eliminado: false },
      }),
      calcularPatronesRecurrentesTenant(tenantId),
    ]);
  const planesPorEstado: Record<string, number> = {};
  for (const p of planesPorEstadoRaw)
    planesPorEstado[p.estado] = (planesPorEstado[p.estado] ?? 0) + 1;

  // Todo lo que depende de Siesa (ventas, inventario, producción recomendada,
  // compras sugeridas, riesgo de quiebre) queda en disponible:false si el
  // tenant no tiene siesaCiaId o la conexión falla — nunca se inventa.
  let ventas: EntradaVentas = {
    disponible: false,
    netoActual: 0,
    netoAnterior: 0,
    variacionNetaPct: null,
    documentos: 0,
    productosTendenciaFuerte: 0,
    productosPerdiendoRotacion: 0,
    mesesHistoriaDisponibles: 0,
  };
  let entradasSiesa: Pick<
    EntradasCentroGerencial,
    "inventario" | "produccion" | "compras" | "riesgos"
  > = {
    inventario: {
      disponible: false,
      totalValor: 0,
      totalValorVendible: 0,
      totalComprometidoValor: 0,
      valorExceso: 0,
      valorObsolescencia: 0,
    },
    produccion: {
      disponible: false,
      resumenProducir: { cantidad: 0, unidades: 0, impacto: 0 },
      resumenNoProducir: { cantidad: 0, unidades: 0, impacto: 0 },
      planesPorEstado,
    },
    compras: {
      disponible: false,
      resumenComprar: { cantidad: 0, unidades: 0, impacto: 0 },
      solicitudesPendientes,
      cotizacionesPendientes,
    },
    riesgos: {
      disponible: false,
      resumenLiquidar: { cantidad: 0, unidades: 0, impacto: 0 },
      resumenRiesgoQuiebre: { cantidad: 0, unidades: 0, impacto: 0 },
      facturasVencidasCantidad: obligaciones.filter((o) => o.vence < ahora).length,
      patronesRecurrentesCantidad: patronesRecurrentes.length,
    },
  };
  let motivoSiesaNoDisponible: string | null = null;

  if (!tenant?.siesaCiaId) {
    motivoSiesaNoDisponible =
      "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.";
  } else {
    try {
      const ahoraUtc = new Date();
      const desdeSerieMensual = new Date(
        Date.UTC(ahoraUtc.getUTCFullYear(), ahoraUtc.getUTCMonth() - 12, 1),
      );
      const inicioMesActual = new Date(
        Date.UTC(ahoraUtc.getUTCFullYear(), ahoraUtc.getUTCMonth(), 1),
      );
      const inicioMesSiguiente = new Date(
        Date.UTC(ahoraUtc.getUTCFullYear(), ahoraUtc.getUTCMonth() + 1, 1),
      );

      const [contexto, serieVentas, topClientesVenta] = await Promise.all([
        construirContextoPlaneacionSiesa(req, tenantId, tenant.siesaCiaId),
        leerVentasMensualesSiesa(tenant.siesaCiaId, desdeSerieMensual),
        leerTopClientesVentaSiesa(tenant.siesaCiaId, inicioMesActual, inicioMesSiguiente, 5),
      ]);

      const resumenVentas = calcularResumenVentas(serieVentas, topClientesVenta, ahoraUtc);
      const mesesHistoriaDisponibles = serieVentas.filter((m) => m.documentos > 0).length;

      ventas = {
        disponible: true,
        netoActual: resumenVentas.periodoActual.neto,
        netoAnterior: resumenVentas.periodoAnterior?.neto ?? 0,
        variacionNetaPct: resumenVentas.variacionNetaPct,
        documentos: resumenVentas.periodoActual.documentos,
        productosTendenciaFuerte: contexto.pronostico.tendenciaFuerte.length,
        productosPerdiendoRotacion: contexto.pronostico.perdiendoRotacion.length,
        mesesHistoriaDisponibles,
      };

      entradasSiesa = {
        inventario: {
          disponible: true,
          totalValor: contexto.resumenInventario.totalValor,
          totalValorVendible: contexto.resumenInventario.totalValorVendible,
          totalComprometidoValor: contexto.resumenInventario.totalComprometidoValor,
          valorExceso: contexto.resumenInventario.buckets.exceso.valor,
          valorObsolescencia: contexto.resumenInventario.buckets.obsolescencia.valor,
        },
        produccion: {
          disponible: true,
          resumenProducir: contexto.resumen.producir,
          resumenNoProducir: contexto.resumen.no_producir,
          planesPorEstado,
        },
        compras: {
          disponible: true,
          resumenComprar: contexto.resumen.comprar,
          solicitudesPendientes,
          cotizacionesPendientes,
        },
        riesgos: {
          disponible: true,
          resumenLiquidar: contexto.resumen.liquidar,
          resumenRiesgoQuiebre: contexto.resumen.riesgo_quiebre,
          facturasVencidasCantidad: obligaciones.filter((o) => o.vence < ahora).length,
          patronesRecurrentesCantidad: patronesRecurrentes.length,
        },
      };
    } catch (error) {
      console.error("Error al calcular el Centro Gerencial desde Siesa:", error);
      motivoSiesaNoDisponible =
        "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.";
    }
  }

  const entradas: EntradasCentroGerencial = { finanzas, ventas, ...entradasSiesa };
  const indicadores = construirIndicadoresGerenciales(entradas);
  const resumenPorCategoria = resumirPorCategoria(indicadores);

  return res.json({
    disponibleSiesa: motivoSiesaNoDisponible === null,
    motivoSiesaNoDisponible,
    indicadores,
    resumenPorCategoria,
  });
};
