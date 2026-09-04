import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  leerVentasMensualesSiesa,
  leerTopClientesVentaSiesa,
  leerVentasDiariasPorVendedorSiesa,
  leerVentasDeHoyConHoraSiesa,
  leerHistoricoVentasSiesa,
  contarHistoricoVentasSiesa,
  leerTopProductosVentaKilosSiesa,
  leerTopClientesPorMargenSiesa,
  leerTopVendedoresPorMargenSiesa,
  leerVentasPorClienteConsolidadoSiesa,
  leerResumenVentaDiaSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import { leerSaldosAbiertosSiesa } from "../integraciones-siesa/siesa-financiero.service";
import {
  calcularResumenVentas,
  calcularVentasPorVendedor,
  calcularParetoClientes,
} from "../../lib/ventas-siesa";
import { calcularResumenFinancieroSiesa } from "../../lib/financiero-siesa";
import { getOrSetCache } from "../../lib/memo-cache";

// Estados de Factura que representan una obligación todavía por pagar
// (Rechazada no cuenta: nunca llega a deberse; Pagada tampoco: ya se saldó).
const ESTADOS_POR_PAGAR = ["Pendiente", "Aprobada"];

const DIA_MS = 24 * 60 * 60 * 1000;

// TTL de la caché en memoria para las consultas agregadas de ventas (ver
// lib/memo-cache.ts): protege el pool de Siesa (max: 5 conexiones) de que
// varios usuarios recargando /analitica en la misma ventana corta disparen
// la misma consulta pesada repetidas veces. 45s: suficientemente corto para
// que nadie perciba datos "viejos" de forma relevante, suficientemente largo
// para absorber recargas repetidas de un dashboard.
const CACHE_TTL_VENTAS_MS = 45_000;

const formatoCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function redondear1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface ObligacionAbierta {
  proveedorId: string | null;
  proveedor: string;
  vence: Date;
  saldo: number;
}

/**
 * Facturas del tenant en estado Pendiente/Aprobada (obligaciones que
 * todavía pueden deberse), con su saldo real (total - pagos confirmados).
 * Reutilizado por obtenerCuentasPorPagar y obtenerResumenGerencial para no
 * duplicar la consulta ni el cálculo de saldo (mismo criterio que ya usa
 * facturas.controller.ts / pagos.controller.ts). Devuelve TODAS las
 * facturas Pendiente/Aprobada, incluidas las que ya quedaron con saldo 0
 * (el llamador decide si las filtra) — así ambos endpoints conservan
 * exactamente el mismo universo de datos de partida.
 */
export async function obtenerObligacionesAbiertas(
  req: AuthenticatedRequest,
  tenantId: string,
): Promise<ObligacionAbierta[]> {
  const facturas = await req.tenantPrisma!.factura.findMany({
    where: { tenantId, eliminado: false, estado: { in: ESTADOS_POR_PAGAR } },
    select: {
      proveedorId: true,
      proveedor: true,
      vence: true,
      total: true,
      pagos: { where: { estado: "Confirmado" }, select: { valor: true } },
    },
  });
  return facturas.map((f) => ({
    proveedorId: f.proveedorId,
    proveedor: f.proveedor,
    vence: f.vence,
    saldo: Number(f.total) - f.pagos.reduce((acc, p) => acc + Number(p.valor), 0),
  }));
}

export interface CreditoAbierto {
  cliente: string;
  vence: Date;
  saldo: number;
}

/**
 * Créditos de cliente (cartera) del tenant con saldo pendiente. A
 * diferencia de Facturas/Pagos, CreditoCliente es un saldo ya consolidado
 * por cliente (no un histórico de documentos): cada fila representa el
 * saldo ACTUAL de ese cliente y su próxima fecha de vencimiento, mantenido
 * manualmente por el equipo comercial — no hay línea de factura por línea
 * de factura, así que el "envejecimiento" (aging) que se calcula abajo es
 * por cliente, no por documento individual.
 */
export async function obtenerCarteraAbierta(
  req: AuthenticatedRequest,
  tenantId: string,
): Promise<CreditoAbierto[]> {
  const creditos = await req.tenantPrisma!.creditoCliente.findMany({
    where: { tenantId, eliminado: false },
    select: { cliente: true, saldo: true, vence: true },
  });
  return creditos.map((c) => ({ cliente: c.cliente, vence: c.vence, saldo: Number(c.saldo) }));
}

export interface Buckets {
  vencido: number;
  dias0a30: number;
  dias31a60: number;
  dias61a90: number;
  mas90: number;
}

/**
 * Agrupa saldos por antigüedad frente a su fecha de vencimiento: ya vencido,
 * o cuántos días faltan para vencer (0-30 / 31-60 / 61-90 / más de 90).
 */
export function agruparPorAntiguedad(
  items: { vence: Date; saldo: number }[],
  ahora: Date,
): Buckets {
  const buckets: Buckets = { vencido: 0, dias0a30: 0, dias31a60: 0, dias61a90: 0, mas90: 0 };
  for (const item of items) {
    const dias = Math.floor((item.vence.getTime() - ahora.getTime()) / DIA_MS);
    if (dias < 0) buckets.vencido += item.saldo;
    else if (dias <= 30) buckets.dias0a30 += item.saldo;
    else if (dias <= 60) buckets.dias31a60 += item.saldo;
    else if (dias <= 90) buckets.dias61a90 += item.saldo;
    else buckets.mas90 += item.saldo;
  }
  return buckets;
}

const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export const obtenerResumenAnalitica = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const facturas = await req.tenantPrisma!.factura.findMany({
      where: { tenantId, eliminado: false },
      select: { fecha: true, total: true, estado: true, proveedor: true, nit: true, area: true },
    });

    // Serie mensual: últimos 7 meses calendario, calculada desde facturas reales.
    const ahora = new Date();
    const meses = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - (6 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: MESES_CORTOS[d.getMonth()] };
    });

    const serieMensual = meses.map((m) => {
      const delMes = facturas.filter((f) => {
        const fd = new Date(f.fecha);
        return fd.getFullYear() === m.year && fd.getMonth() === m.month;
      });
      const recibido = delMes.reduce((acc, f) => acc + Number(f.total), 0);
      const aprobado = delMes
        .filter((f) => f.estado === "Aprobada" || f.estado === "Pagada")
        .reduce((acc, f) => acc + Number(f.total), 0);
      const pagado = delMes
        .filter((f) => f.estado === "Pagada")
        .reduce((acc, f) => acc + Number(f.total), 0);
      return { mes: m.label, recibido, aprobado, pagado };
    });

    // Top proveedores por valor total facturado.
    const porProveedor = new Map<string, { nit: string; valor: number; facturas: number }>();
    facturas.forEach((f) => {
      const cur = porProveedor.get(f.proveedor) ?? { nit: f.nit, valor: 0, facturas: 0 };
      cur.valor += Number(f.total);
      cur.facturas += 1;
      porProveedor.set(f.proveedor, cur);
    });
    const topProveedores = [...porProveedor.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Comparativo por área (en millones COP, para mostrar compacto).
    const porAreaMap = new Map<string, number>();
    facturas.forEach((f) => {
      porAreaMap.set(f.area, (porAreaMap.get(f.area) ?? 0) + Number(f.total));
    });
    const porArea = [...porAreaMap.entries()]
      .map(([nombre, valor]) => ({ nombre, valor: Math.round(valor / 1_000_000) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Proyección: valores futuros ingresados manualmente por Finanzas.
    const proyecciones = await req.tenantPrisma!.proyeccionMensual.findMany({
      where: { tenantId },
      orderBy: [{ anio: "asc" }, { createdAt: "asc" }],
    });
    const proyeccion = proyecciones.map((p) => ({
      mes: p.mes,
      real: null,
      proyectado: Number(p.proyectado),
    }));

    return res.json({ serieMensual, topProveedores, porArea, proyeccion });
  } catch (error) {
    console.error("Error al calcular resumen analítico:", error);
    return res.status(500).json({ message: "Error al calcular el resumen analítico." });
  }
};

/**
 * Resumen ejecutivo para la portada (Dashboard). A diferencia de
 * obtenerResumenAnalitica (que exige "analitica.ver" para el módulo de
 * gráficas avanzadas), este endpoint solo exige sesión: cada sección
 * (facturas/solicitudes/créditos) se incluye únicamente si el usuario tiene
 * el permiso de "ver" de ese módulo, para que la portada nunca muestre datos
 * a los que ese usuario no tendría acceso desde su propio módulo.
 */
export const obtenerDashboardResumen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const permisos = req.user!.permisos;
    const puede = (permiso: string) => req.user!.isSuperadmin || permisos.includes(permiso);
    const ahora = new Date();

    const resultado: {
      facturas?: unknown;
      solicitudes?: unknown;
      creditos?: unknown;
      servicios?: unknown;
      importaciones?: unknown;
      contratos?: unknown;
      despachos?: unknown;
    } = {};

    if (puede("facturas.ver")) {
      const facturas = await req.tenantPrisma!.factura.findMany({
        where: { tenantId, eliminado: false },
        select: { total: true, estado: true, vence: true, proveedor: true },
      });

      const porEstado: Record<string, number> = {
        Pendiente: 0,
        Aprobada: 0,
        Rechazada: 0,
        Pagada: 0,
      };
      let valorPendiente = 0;
      let valorAprobado = 0;
      let valorPagado = 0;
      let vencidas = 0;

      for (const f of facturas) {
        const total = Number(f.total);
        porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
        if (f.estado === "Pendiente") valorPendiente += total;
        if (f.estado === "Aprobada") valorAprobado += total;
        if (f.estado === "Pagada") valorPagado += total;
        if ((f.estado === "Pendiente" || f.estado === "Aprobada") && f.vence < ahora) {
          vencidas += 1;
        }
      }

      const porProveedor = new Map<string, number>();
      facturas.forEach((f) => {
        porProveedor.set(f.proveedor, (porProveedor.get(f.proveedor) ?? 0) + Number(f.total));
      });
      const topProveedores = [...porProveedor.entries()]
        .map(([nombre, valor]) => ({ nombre, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);

      resultado.facturas = {
        total: facturas.length,
        porEstado,
        valorPendiente,
        valorAprobado,
        valorPagado,
        vencidas,
        topProveedores,
      };
    }

    if (puede("solicitudes.ver")) {
      const grupos = await req.tenantPrisma!.solicitudCompra.groupBy({
        by: ["estado"],
        where: { tenantId, eliminado: false },
        _count: { _all: true },
      });
      const porEstado: Record<string, number> = {};
      let total = 0;
      grupos.forEach((g) => {
        porEstado[g.estado] = g._count._all;
        total += g._count._all;
      });
      resultado.solicitudes = { total, porEstado };
    }

    if (puede("importaciones.ver")) {
      const [lotes, expedientesSinDim] = await Promise.all([
        req.tenantPrisma!.loteImportacion.findMany({
          where: { tenantId },
          select: { estado: true },
        }),
        req.tenantPrisma!.expedienteAduanero.count({ where: { tenantId, numeroDIM: null } }),
      ]);
      const ESTADOS_EN_TRANSITO = [
        "En tránsito",
        "En puerto",
        "En inspección",
        "Liberado pre-compra",
      ];
      resultado.importaciones = {
        totalLotes: lotes.length,
        enTransito: lotes.filter((l) => ESTADOS_EN_TRANSITO.includes(l.estado)).length,
        nacionalizados: lotes.filter((l) => l.estado === "Nacionalizado").length,
        pendientesDocumentacion: expedientesSinDim,
      };
    }

    if (puede("servicios.ver")) {
      const servicios = await req.tenantPrisma!.servicioSuscripcion.findMany({
        where: { tenantId, eliminado: false, estado: "Activo" },
        select: { costo: true, periodicidad: true, fechaRenovacion: true },
      });

      const costoRecurrenteMensual = servicios.reduce((acc, s) => {
        const costo = Number(s.costo);
        if (s.periodicidad === "Anual") return acc + costo / 12;
        if (s.periodicidad === "Trimestral") return acc + costo / 3;
        return acc + costo; // Mensual
      }, 0);

      const en30Dias = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
      const proximosVencimientos = servicios.filter(
        (s) => s.fechaRenovacion >= ahora && s.fechaRenovacion <= en30Dias,
      ).length;

      resultado.servicios = {
        activos: servicios.length,
        costoRecurrenteMensual,
        proximosVencimientos,
      };
    }

    if (puede("creditos.ver")) {
      const creditos = await req.tenantPrisma!.creditoCliente.findMany({
        where: { tenantId, eliminado: false },
        select: { cliente: true, saldo: true, estado: true },
      });
      const totalSaldo = creditos.reduce((acc, c) => acc + Number(c.saldo), 0);
      const pendientes = creditos.filter((c) => c.estado !== "Al día").length;
      const topDeudores = [...creditos]
        .sort((a, b) => Number(b.saldo) - Number(a.saldo))
        .slice(0, 5)
        .map((c) => ({ cliente: c.cliente, saldo: Number(c.saldo) }));
      resultado.creditos = { total: creditos.length, totalSaldo, pendientes, topDeudores };
    }

    if (puede("contratos.ver")) {
      const contratos = await req.tenantPrisma!.contrato.findMany({
        where: { tenantId, eliminado: false, estado: "Activo" },
        select: { valorContratado: true, fechaFin: true },
      });
      const en30Dias = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
      resultado.contratos = {
        activos: contratos.length,
        valorContratadoActivo: contratos.reduce((acc, c) => acc + Number(c.valorContratado), 0),
        proximosAVencer: contratos.filter((c) => c.fechaFin >= ahora && c.fechaFin <= en30Dias)
          .length,
      };
    }

    if (puede("despachos.ver")) {
      const ESTADOS_CERRADOS = ["ENTREGADO", "CANCELADO", "DEVUELTO"];
      const [despachos, novedadesAbiertas] = await Promise.all([
        req.tenantPrisma!.despacho.findMany({ where: { tenantId }, select: { estado: true } }),
        req.tenantPrisma!.despachoNovedad.count({
          where: { estado: "ABIERTA", despacho: { tenantId } },
        }),
      ]);
      resultado.despachos = {
        total: despachos.length,
        enProceso: despachos.filter((d) => !ESTADOS_CERRADOS.includes(d.estado)).length,
        entregados: despachos.filter((d) => d.estado === "ENTREGADO").length,
        novedadesAbiertas,
      };
    }

    return res.json(resultado);
  } catch (error) {
    console.error("Error al calcular el resumen del dashboard:", error);
    return res.status(500).json({ message: "Error al calcular el resumen del dashboard." });
  }
};

export const registrarProyeccion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { mes, anio, proyectado } = req.body;

    if (!mes || !Number.isFinite(Number(anio)) || !Number.isFinite(Number(proyectado))) {
      return res.status(400).json({ message: "Mes, año y valor proyectado son obligatorios." });
    }

    const registro = await req.tenantPrisma!.proyeccionMensual.upsert({
      where: { tenantId_mes_anio: { tenantId, mes, anio: Number(anio) } },
      update: { proyectado: Number(proyectado) },
      create: { tenantId, mes, anio: Number(anio), proyectado: Number(proyectado) },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PROYECCION_REGISTRADA",
        detalle: `${req.user!.nombre} registró la proyección de ${mes} ${anio}`,
      },
    });

    return res.status(201).json({ ...registro, proyectado: Number(registro.proyectado) });
  } catch (error) {
    console.error("Error al registrar proyección:", error);
    return res.status(500).json({ message: "Error al registrar la proyección." });
  }
};

/**
 * Cuentas por pagar: control financiero de las obligaciones abiertas
 * (Pendiente/Aprobada) del tenant — cuántas facturas, cuánto suman, cuáles
 * ya vencieron, cuáles vencen en los próximos 30 días, y el saldo (total -
 * pagos confirmados) agrupado por proveedor. Reutiliza exactamente el mismo
 * cálculo de saldo que ya usa facturas.controller.ts (total - suma de pagos
 * con estado "Confirmado"), sin duplicar la lógica de negocio de Pagos.
 */
export const obtenerCuentasPorPagar = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const ahora = new Date();
    const en30Dias = new Date(ahora.getTime() + 30 * DIA_MS);

    const obligaciones = await obtenerObligacionesAbiertas(req, tenantId);

    let totalPendiente = 0;
    let vencidas = 0;
    let valorVencido = 0;
    let proximasAVencer = 0;
    let valorProximoAVencer = 0;

    const porProveedor = new Map<
      string,
      { proveedorId: string | null; proveedor: string; saldo: number; facturas: number }
    >();

    for (const o of obligaciones) {
      if (o.saldo <= 0) continue; // ya cubierta por pagos parciales, aunque el estado no haya recalculado aún

      totalPendiente += o.saldo;
      if (o.vence < ahora) {
        vencidas += 1;
        valorVencido += o.saldo;
      } else if (o.vence <= en30Dias) {
        proximasAVencer += 1;
        valorProximoAVencer += o.saldo;
      }

      const clave = o.proveedorId ?? o.proveedor;
      const actual = porProveedor.get(clave) ?? {
        proveedorId: o.proveedorId,
        proveedor: o.proveedor,
        saldo: 0,
        facturas: 0,
      };
      actual.saldo += o.saldo;
      actual.facturas += 1;
      porProveedor.set(clave, actual);
    }

    const saldoPorProveedor = [...porProveedor.values()].sort((a, b) => b.saldo - a.saldo);

    return res.json({
      totalFacturas: obligaciones.length,
      totalPendiente,
      vencidas,
      valorVencido,
      proximasAVencer,
      valorProximoAVencer,
      saldoPorProveedor,
    });
  } catch (error) {
    console.error("Error al calcular cuentas por pagar:", error);
    return res.status(500).json({ message: "Error al calcular las cuentas por pagar." });
  }
};

/**
 * Centro Gerencial Financiero: consolida cartera (cuentas por cobrar),
 * cuentas por pagar, flujo proyectado y alertas accionables en una sola
 * llamada, reutilizando exactamente los mismos cálculos de saldo que ya
 * usan Facturas/Pagos/Créditos — no duplica lógica de negocio.
 *
 * "Ventas" se reporta explícitamente como NO DISPONIBLE: ni RicoSoft ni la
 * integración Siesa existente tienen hoy una fuente real de datos de
 * ventas/facturación a clientes (la integración Siesa solo lee proveedores/
 * terceros — un único SELECT en todo el código, verificado). No se simula
 * ni se inventa esa cifra.
 */
export const obtenerResumenGerencial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const ahora = new Date();

    const [obligacionesTodas, creditosTodos, tenant] = await Promise.all([
      obtenerObligacionesAbiertas(req, tenantId),
      obtenerCarteraAbierta(req, tenantId),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { siesaCiaId: true } }),
    ]);
    const obligaciones = obligacionesTodas.filter((o) => o.saldo > 0);
    const creditos = creditosTodos.filter((c) => c.saldo > 0);

    const totalCxP = obligaciones.reduce((acc, o) => acc + o.saldo, 0);
    const totalCartera = creditos.reduce((acc, c) => acc + c.saldo, 0);

    const bucketsCxP = agruparPorAntiguedad(obligaciones, ahora);
    const bucketsCartera = agruparPorAntiguedad(creditos, ahora);

    const porProveedorMap = new Map<
      string,
      { proveedorId: string | null; nombre: string; saldo: number }
    >();
    for (const o of obligaciones) {
      const clave = o.proveedorId ?? o.proveedor;
      const actual = porProveedorMap.get(clave) ?? {
        proveedorId: o.proveedorId,
        nombre: o.proveedor,
        saldo: 0,
      };
      actual.saldo += o.saldo;
      porProveedorMap.set(clave, actual);
    }
    const topProveedores = [...porProveedorMap.values()]
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 5)
      .map((p) => ({
        ...p,
        porcentaje: totalCxP > 0 ? redondear1((p.saldo / totalCxP) * 100) : null,
      }));
    const concentracionTopProveedor = topProveedores[0]?.porcentaje ?? null;

    const porClienteMap = new Map<string, number>();
    for (const c of creditos) {
      porClienteMap.set(c.cliente, (porClienteMap.get(c.cliente) ?? 0) + c.saldo);
    }
    const topClientes = [...porClienteMap.entries()]
      .map(([cliente, saldo]) => ({ cliente, saldo }))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 5)
      .map((c) => ({
        ...c,
        porcentaje: totalCartera > 0 ? redondear1((c.saldo / totalCartera) * 100) : null,
      }));
    const concentracionTopCliente = topClientes[0]?.porcentaje ?? null;

    // Flujo proyectado: dinero que se espera COBRAR (cartera con vencimiento
    // dentro del horizonte) vs dinero que se espera DESEMBOLSAR (CxP con
    // vencimiento dentro del horizonte). Deliberadamente excluye lo YA
    // vencido (eso ya está en bucketsCxP.vencido/bucketsCartera.vencido) —
    // el flujo proyectado responde "qué entra/sale de aquí en adelante", no
    // "qué debería haber entrado/salido ya".
    const horizontesDias = [7, 30, 60, 90] as const;
    const flujo: Record<
      string,
      { dias: number; ingresosEsperados: number; egresosEsperados: number; neto: number }
    > = {};
    for (const dias of horizontesDias) {
      const limite = new Date(ahora.getTime() + dias * DIA_MS);
      const ingresosEsperados = creditos
        .filter((c) => c.vence >= ahora && c.vence <= limite)
        .reduce((acc, c) => acc + c.saldo, 0);
      const egresosEsperados = obligaciones
        .filter((o) => o.vence >= ahora && o.vence <= limite)
        .reduce((acc, o) => acc + o.saldo, 0);
      flujo[`d${dias}`] = {
        dias,
        ingresosEsperados,
        egresosEsperados,
        neto: ingresosEsperados - egresosEsperados,
      };
    }

    const alertas: { tipo: string; severidad: "alta" | "media"; mensaje: string }[] = [];
    if (bucketsCxP.vencido > 0) {
      alertas.push({
        tipo: "cxp_vencida",
        severidad: "alta",
        mensaje: `Hay obligaciones vencidas por ${formatoCOP.format(bucketsCxP.vencido)}.`,
      });
    }
    if (totalCartera > 0 && bucketsCartera.vencido / totalCartera > 0.3) {
      alertas.push({
        tipo: "cartera_vencida_alta",
        severidad: "alta",
        mensaje: `El ${redondear1((bucketsCartera.vencido / totalCartera) * 100)}% de la cartera está vencida.`,
      });
    }
    if (concentracionTopCliente !== null && concentracionTopCliente > 40) {
      alertas.push({
        tipo: "concentracion_cliente",
        severidad: "media",
        mensaje: `"${topClientes[0].cliente}" concentra el ${concentracionTopCliente}% de la cartera.`,
      });
    }
    if (concentracionTopProveedor !== null && concentracionTopProveedor > 40) {
      alertas.push({
        tipo: "concentracion_proveedor",
        severidad: "media",
        mensaje: `"${topProveedores[0].nombre}" concentra el ${concentracionTopProveedor}% de las obligaciones.`,
      });
    }
    if (flujo.d30.neto < 0) {
      alertas.push({
        tipo: "flujo_negativo_30d",
        severidad: "alta",
        mensaje: `El flujo proyectado a 30 días es negativo: ${formatoCOP.format(flujo.d30.neto)}.`,
      });
    }

    // Cartera y CxP REALES leídas en vivo desde el módulo Financiero de
    // Siesa (t353_co_saldo_abierto — confirmado vivo hasta hoy, a
    // diferencia de t5353/t5354_saldos_cxc/cxp que quedaron congeladas en
    // 2018). Complementa, no reemplaza, la cartera/CxP nativa de RicoSoft
    // (CreditoCliente/Factura) calculada arriba. Igual que ventas: si el
    // tenant no tiene siesaCiaId o la conexión falla, responde
    // disponible:false con el motivo — nunca inventa la cifra.
    let financieroSiesa: {
      disponible: boolean;
      motivo?: string;
      cartera?: ReturnType<typeof calcularResumenFinancieroSiesa>["cartera"];
      cuentasPorPagar?: ReturnType<typeof calcularResumenFinancieroSiesa>["cuentasPorPagar"];
    };
    if (!tenant?.siesaCiaId) {
      financieroSiesa = {
        disponible: false,
        motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      };
    } else {
      try {
        const saldos = await leerSaldosAbiertosSiesa(tenant.siesaCiaId);
        const resumen = calcularResumenFinancieroSiesa(saldos, ahora);
        financieroSiesa = { disponible: true, ...resumen };
      } catch (error) {
        console.error("Error al leer saldos abiertos desde Siesa:", error);
        financieroSiesa = {
          disponible: false,
          motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
        };
      }
    }

    return res.json({
      // Nota: las ventas reales SÍ existen y se leen en vivo desde Siesa —
      // ver GET /analitica/ventas, /ventas/vendedores, /ventas/clientes y
      // /ventas/historico. Este endpoint (resumen-gerencial) es solo
      // financiero/cartera; antes tenía aquí un bloque `ventas:
      // {disponible:false}` heredado de una versión anterior a que esos
      // endpoints existieran — se retiró por ser código muerto y
      // contradictorio (P0 Comercial, 2026-09-03).
      financieroSiesa,
      cartera: {
        total: totalCartera,
        buckets: bucketsCartera,
        topClientes,
        concentracionTopCliente,
      },
      cuentasPorPagar: {
        total: totalCxP,
        buckets: bucketsCxP,
        topProveedores,
        concentracionTopProveedor,
      },
      flujo,
      alertas,
    });
  } catch (error) {
    console.error("Error al calcular el resumen gerencial:", error);
    return res.status(500).json({ message: "Error al calcular el resumen gerencial." });
  }
};

/**
 * Ventas reales, leídas EN VIVO desde Siesa/UnoEE (t461_cm_docto_factura_venta
 * — confirmado con datos reales: 85.661 documentos desde 2013, con
 * bruto/descuento/impuesto/neto ya calculados por Siesa). No se copia nada a
 * la base de RicoSoft: el volumen es perfectamente agregable en el momento
 * (GROUP BY en SQL Server), así que se consulta cada vez que se pide.
 *
 * `f461_id_cia` se resuelve SIEMPRE desde `Tenant.siesaCiaId` del tenant
 * autenticado (nunca del query/body) — mismo principio de autoridad que ya
 * usa sincronizarProveedores. Si el tenant no tiene compañía Siesa
 * configurada, o si la consulta a Siesa falla (p. ej. túnel VPN caído),
 * responde 200 con `disponible:false` y el motivo — nunca inventa cifras ni
 * tumba el endpoint con un 500 por una dependencia externa.
 */
// Filtro global de fecha compartido por /ventas, /ventas/vendedores y
// /ventas/clientes (P0 Comercial): `desde`/`hasta` (ISO date) opcionales en
// el query string, con el mismo default de siempre (mes actual) cuando no
// se pasan — así ningún consumidor existente del frontend se rompe por no
// mandarlos todavía.
function parseRangoVentasQuery(
  req: AuthenticatedRequest,
  ahora: Date,
): { desde: Date; hasta: Date } {
  const { desde: desdeQuery, hasta: hastaQuery } = req.query;
  const inicioMesActual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  const inicioMesSiguiente = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
  const desde =
    typeof desdeQuery === "string" && desdeQuery ? new Date(desdeQuery) : inicioMesActual;
  const hasta =
    typeof hastaQuery === "string" && hastaQuery ? new Date(hastaQuery) : inicioMesSiguiente;
  return { desde, hasta };
}

export const obtenerVentasGerencial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });

  if (!tenant?.siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
  }

  // Siesa guarda f461_id_fecha como "medianoche UTC" (sin zona horaria real:
  // es la fecha de calendario tal cual la registró el usuario en Siesa). Los
  // límites de rango se construyen con Date.UTC — nunca con el constructor
  // local de Date — para que no dependan de la zona horaria del servidor
  // donde corra RicoSoft (un desfase de zona horaria local vs UTC causaba
  // que el mes actual quedara fuera del rango consultado; verificado con
  // datos reales antes de este fix).
  const ahora = new Date();
  const desdeSerieMensual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 12, 1));
  // La serie mensual de 12 meses es siempre la tendencia completa (no se
  // filtra por desde/hasta: cortarla rompería el gráfico de evolución). Los
  // "top" sí respetan el filtro global de fecha si se manda uno explícito;
  // por defecto siguen siendo el mes actual, igual que antes de este filtro.
  const { desde: inicioMesActual, hasta: inicioMesSiguiente } = parseRangoVentasQuery(req, ahora);

  const claveCache = `ventas:${tenant.siesaCiaId}:${desdeSerieMensual.toISOString()}:${inicioMesActual.toISOString()}:${inicioMesSiguiente.toISOString()}`;
  try {
    const { serie, topClientes, topProductosKilos, topClientesPorMargen } = await getOrSetCache(
      claveCache,
      CACHE_TTL_VENTAS_MS,
      async () => {
        const [serie, topClientes, topProductosKilos, topClientesPorMargen] = await Promise.all([
          leerVentasMensualesSiesa(tenant.siesaCiaId!, desdeSerieMensual),
          leerTopClientesVentaSiesa(tenant.siesaCiaId!, inicioMesActual, inicioMesSiguiente, 5),
          leerTopProductosVentaKilosSiesa(
            tenant.siesaCiaId!,
            inicioMesActual,
            inicioMesSiguiente,
            10,
          ),
          leerTopClientesPorMargenSiesa(tenant.siesaCiaId!, inicioMesActual, inicioMesSiguiente, 5),
        ]);
        return { serie, topClientes, topProductosKilos, topClientesPorMargen };
      },
    );
    return res.json({
      ...calcularResumenVentas(serie, topClientes, ahora),
      topProductosKilos,
      topClientesPorMargen,
    });
  } catch (error) {
    console.error("Error al leer ventas desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Ventas diarias por vendedor (hoy / ayer / últimos 7 días / mes actual),
 * leídas en vivo desde Siesa igual que obtenerVentasGerencial. El vendedor
 * (f461_rowid_tercero_vendedor) es un tercero más, resuelto con el mismo
 * join a t200_mm_terceros que el cliente — verificado con datos reales
 * (nombres de vendedores reales de Ricol).
 */
export const obtenerVentasPorVendedorGerencial = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const tenantId = req.user!.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });

  if (!tenant?.siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      vendedores: [],
    });
  }

  const ahora = new Date();
  const inicioMesActual = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  const inicioMesSiguiente = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
  const hace7Dias = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - 6),
  );
  // El rango debe cubrir el mes completo (para "mesActual") Y los últimos 7
  // días (que pueden empezar en el mes anterior si hoy es de los primeros
  // días del mes) — se toma el más temprano de los dos.
  const desde = inicioMesActual < hace7Dias ? inicioMesActual : hace7Dias;
  const inicioHoy = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()),
  );
  const hasta = new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1),
  );

  const claveCache = `ventas-vendedores:${tenant.siesaCiaId}:${inicioHoy.toISOString()}`;
  try {
    const { filas, detalleHoy, topVendedoresPorMargen, resumenHoy } = await getOrSetCache(
      claveCache,
      CACHE_TTL_VENTAS_MS,
      async () => {
        const [filas, detalleHoy, topVendedoresPorMargen, resumenHoy] = await Promise.all([
          leerVentasDiariasPorVendedorSiesa(tenant.siesaCiaId!, desde, hasta),
          // Detalle de hoy con hora real (f461_ts) — ver leerVentasDeHoyConHoraSiesa.
          leerVentasDeHoyConHoraSiesa(tenant.siesaCiaId!, inicioHoy, hasta),
          leerTopVendedoresPorMargenSiesa(
            tenant.siesaCiaId!,
            inicioMesActual,
            inicioMesSiguiente,
            10,
          ),
          // Total del día — $ y kg — para los indicadores superiores de
          // Analítica ("Total ventas hoy"). Mismo rango [inicioHoy, hasta)
          // ya usado para detalleHoy, un solo total en vez de sumar en
          // frontend las filas de detalleHoy (que no traen kilos).
          leerResumenVentaDiaSiesa(tenant.siesaCiaId!, inicioHoy, hasta),
        ]);
        return { filas, detalleHoy, topVendedoresPorMargen, resumenHoy };
      },
    );
    return res.json({
      disponible: true,
      vendedores: calcularVentasPorVendedor(filas, ahora),
      detalleHoy,
      topVendedoresPorMargen,
      resumenHoy,
    });
  } catch (error) {
    console.error("Error al leer ventas por vendedor desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      vendedores: [],
      detalleHoy: [],
      topVendedoresPorMargen: [],
      resumenHoy: null,
    });
  }
};

/**
 * Venta + kilos + margen + Pareto por cliente, dentro de [desde, hasta) —
 * "Inteligencia > Clientes" del target de analítica comercial (P0). Mismo
 * principio de autoridad y de "nunca 500 por Siesa caído" que el resto de
 * /analitica/ventas*. El Pareto (% acumulado) se calcula en Node
 * (calcularParetoClientes, función pura) sobre el resultado ya agregado en
 * SQL Server — nunca sobre el detalle de documentos.
 */
export const obtenerClientesVentaGerencial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });

  if (!tenant?.siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      clientes: [],
    });
  }

  const ahora = new Date();
  const { desde, hasta } = parseRangoVentasQuery(req, ahora);
  const limite = Math.min(
    200,
    Math.max(1, Number.parseInt(String(req.query.limite ?? "50"), 10) || 50),
  );

  const claveCache = `ventas-clientes:${tenant.siesaCiaId}:${desde.toISOString()}:${hasta.toISOString()}:${limite}`;
  try {
    const consolidado = await getOrSetCache(claveCache, CACHE_TTL_VENTAS_MS, () =>
      leerVentasPorClienteConsolidadoSiesa(tenant.siesaCiaId!, desde, hasta, limite),
    );
    return res.json({
      disponible: true,
      clientes: calcularParetoClientes(consolidado),
    });
  } catch (error) {
    console.error("Error al leer ventas por cliente desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      clientes: [],
    });
  }
};

/**
 * Histórico paginado de documentos de venta, leído en vivo desde Siesa
 * (t461_cm_docto_factura_venta). A diferencia de los demás endpoints de
 * ventas (agregados), este devuelve filas de detalle — pero solo la página
 * pedida (OFFSET/FETCH en SQL Server, ver leerHistoricoVentasSiesa): nunca
 * se descargan los 85.661 documentos al navegador. Filtros opcionales:
 * `desde`/`hasta` (ISO date), `search` (cliente/NIT/vendedor), `page`,
 * `pageSize` (tope 100, igual que el resto de listados paginados del
 * sistema).
 */
export const obtenerHistoricoVentasGerencial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });

  if (!tenant?.siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    });
  }

  const ahora = new Date();
  const { desde: desdeQuery, hasta: hastaQuery, search } = req.query;
  // Por defecto, últimos 12 meses — el mismo criterio de "histórico
  // razonable" que el resto del dashboard, ajustable por el usuario.
  const desde =
    typeof desdeQuery === "string" && desdeQuery
      ? new Date(desdeQuery)
      : new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 12, 1));
  const hasta =
    typeof hastaQuery === "string" && hastaQuery
      ? new Date(hastaQuery)
      : new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));

  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
  );
  // Filtros globales de drill-down (KPI/gráfico -> cliente/vendedor/producto
  // -> documento Siesa): entidad exacta por rowid, no texto libre. Igual que
  // el resto de query params numéricos del sistema, se ignoran si no son un
  // entero válido en vez de fallar con 400 — un filtro mal formado se trata
  // como "sin filtrar", no como error.
  const vendedorRowId = Number.parseInt(String(req.query.vendedorRowId ?? ""), 10);
  const clienteRowId = Number.parseInt(String(req.query.clienteRowId ?? ""), 10);
  const itemRowId = Number.parseInt(String(req.query.itemRowId ?? ""), 10);
  const filtros = {
    ciaId: tenant.siesaCiaId,
    desde,
    hasta,
    search: typeof search === "string" && search.trim() ? search.trim() : undefined,
    vendedorRowId: Number.isFinite(vendedorRowId) ? vendedorRowId : undefined,
    clienteRowId: Number.isFinite(clienteRowId) ? clienteRowId : undefined,
    itemRowId: Number.isFinite(itemRowId) ? itemRowId : undefined,
  };

  try {
    const [items, total] = await Promise.all([
      leerHistoricoVentasSiesa(filtros, page, pageSize),
      contarHistoricoVentasSiesa(filtros),
    ]);
    return res.json({
      disponible: true,
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Error al leer el histórico de ventas desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
    });
  }
};
