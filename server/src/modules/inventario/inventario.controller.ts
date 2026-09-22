import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  leerExistenciasSiesa,
  leerPedidosComprometidosSiesa,
} from "../integraciones-siesa/siesa-inventario.service";
import {
  leerVentasMensualesPorProductoSiesa,
  leerComprasPorClienteProductoSiesa,
  leerVentasPorProductoEnRangoSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import { leerListaMaterialesSiesa } from "../integraciones-siesa/siesa-manufactura.service";
import {
  calcularResumenInventarioSiesa,
  UMBRALES_INVENTARIO_DEFECTO,
} from "../../lib/inventario-siesa";
import { calcularPronosticoDemandaSiesa, UMBRALES_DEMANDA_DEFECTO } from "../../lib/demanda-siesa";
import { calcularProduccionRecomendadaSiesa } from "../../lib/produccion-siesa";
import { calcularOportunidadComercialSiesa } from "../../lib/oportunidad-comercial-siesa";
import {
  calcularResumenCoberturaSiesa,
  UMBRALES_COBERTURA_DEFECTO,
} from "../../lib/cobertura-siesa";
import { calcularNecesidadesAbastecimientoSiesa } from "../../lib/abastecimiento-siesa";
import { construirDecisionesPlaneacion } from "../../domain/planeacion/decisiones";
import { calcularVentanasDemanda } from "../../domain/planeacion/demanda";
import {
  calcularInventarioObjetivo,
  UMBRALES_INVENTARIO_OBJETIVO_DEFECTO,
} from "../../domain/planeacion/inventario-objetivo";
import { actualizarConfiguracionInventarioSchema } from "./inventario.schemas";
import { CAMPOS_PARAMETROS_NEGOCIO, extraerParametrosNegocio } from "../../lib/parametros-negocio";

/**
 * Umbrales configurables por tenant (Parte 16) — lee ConfiguracionInventario
 * vía req.tenantPrisma (tenant-scoped, defensa en profundidad con el filtro
 * explícito de tenantId). Si el tenant no ha configurado nada todavía
 * (fila inexistente), se usan los valores por defecto documentados en cada
 * módulo de cálculo — nunca se inventa un umbral distinto al ya
 * documentado.
 */
async function obtenerUmbralesInventario(req: AuthenticatedRequest, tenantId: string) {
  const config = await req.tenantPrisma!.configuracionInventario.findUnique({
    where: { tenantId },
  });
  return {
    inventario: config
      ? { diasVendible: config.diasVendible, diasExceso: config.diasExceso }
      : UMBRALES_INVENTARIO_DEFECTO,
    cobertura: config
      ? {
          diasRupturaCobertura: config.diasRupturaCobertura,
          diasSobreCobertura: config.diasSobreCobertura,
        }
      : UMBRALES_COBERTURA_DEFECTO,
    inventarioObjetivo: config
      ? {
          coberturaObjetivoDias: config.coberturaObjetivoDias,
          factorSeguridad: config.factorSeguridad,
        }
      : UMBRALES_INVENTARIO_OBJETIVO_DEFECTO,
    demanda: config
      ? {
          umbralVariabilidadAlta: config.umbralVariabilidadAltaDemanda,
          umbralPerdidaRotacion: config.umbralPerdidaRotacionDemanda,
          umbralTendenciaFuertePct: config.umbralTendenciaFuertePctDemanda,
        }
      : UMBRALES_DEMANDA_DEFECTO,
  };
}

/**
 * Inventario disponible — Bloque 1 del módulo Producción & Inventario,
 * leído EN VIVO desde Siesa/UnoEE (t400_cm_existencia — confirmado en vivo:
 * 8.175 ítems en Ricol, $7.098M en valor, con existencia/comprometido y
 * fecha de última venta reales). No se copia nada a la base de RicoSoft.
 *
 * `f400_id_cia` se resuelve SIEMPRE desde `Tenant.siesaCiaId` del tenant
 * autenticado — mismo principio de autoridad que ventas/financiero. Si el
 * tenant no tiene compañía Siesa configurada, o si la consulta falla,
 * responde 200 con `disponible:false` y el motivo.
 */
export const obtenerInventarioGerencial = async (req: AuthenticatedRequest, res: Response) => {
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

  try {
    const [existencias, umbrales] = await Promise.all([
      leerExistenciasSiesa(tenant.siesaCiaId),
      obtenerUmbralesInventario(req, tenantId),
    ]);
    return res.json({
      disponible: true,
      ...calcularResumenInventarioSiesa(existencias, new Date(), umbrales.inventario),
    });
  } catch (error) {
    console.error("Error al leer inventario desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Pronóstico de demanda — Bloque 2 del módulo Producción & Inventario,
 * calculado EN VIVO sobre ventas reales por producto (v470_ventas —
 * confirmado en vivo: ningún ítem se vende en más de una unidad de medida
 * distinta, así que sumar cantidades por ítem es seguro). Motor
 * determinístico, sin IA — ver lib/demanda-siesa.ts para las reglas
 * exactas de cada señal (venta promedio, tendencia, irregularidad, pérdida
 * de rotación).
 */
export const obtenerPronosticoDemandaGerencial = async (
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
    });
  }

  const ahora = new Date();
  // 13 meses hacia atrás: cubre los 12 meses completos que usa el pronóstico
  // (el mes actual, parcial, se descarta dentro de calcularPronosticoDemandaSiesa).
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 13, 1));

  try {
    const [ventasMensuales, umbrales] = await Promise.all([
      leerVentasMensualesPorProductoSiesa(tenant.siesaCiaId, desde),
      obtenerUmbralesInventario(req, tenantId),
    ]);
    // `todos` es de uso interno (ver produccion-siesa.ts) — no se expone en
    // este endpoint, que solo alimenta el dashboard de demanda.
    const { todos: _todos, ...pronostico } = calcularPronosticoDemandaSiesa(
      ventasMensuales,
      ahora,
      umbrales.demanda,
    );
    return res.json({ disponible: true, ...pronostico });
  } catch (error) {
    console.error("Error al calcular el pronóstico de demanda desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Producción recomendada — Bloque 4 del módulo Producción & Inventario,
 * calculada EN VIVO cruzando el pronóstico de demanda (Bloque 2) con el
 * inventario real (Bloque 1). Ver lib/produccion-siesa.ts para la fórmula
 * exacta y qué dos términos de la fórmula original (stock de seguridad,
 * producción en proceso) se excluyeron por no tener datos reales en Siesa
 * — confirmado en vivo, no supuesto.
 */
export const obtenerProduccionRecomendadaGerencial = async (
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
    });
  }

  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 13, 1));

  try {
    const [ventasMensuales, existencias, umbrales] = await Promise.all([
      leerVentasMensualesPorProductoSiesa(tenant.siesaCiaId, desde),
      leerExistenciasSiesa(tenant.siesaCiaId),
      obtenerUmbralesInventario(req, tenantId),
    ]);
    const pronostico = calcularPronosticoDemandaSiesa(ventasMensuales, ahora, umbrales.demanda);
    const recomendaciones = calcularProduccionRecomendadaSiesa(pronostico.todos, existencias);
    return res.json({ disponible: true, recomendaciones });
  } catch (error) {
    console.error("Error al calcular la producción recomendada desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Oportunidad comercial del inventario — Bloque 5 del módulo Producción &
 * Inventario: cruza qué le compra cada cliente (últimos 12 meses reales)
 * contra qué hay disponible hoy. Ver lib/oportunidad-comercial-siesa.ts
 * para la fórmula exacta (cantidad ofertable limitada a ~1 mes de ritmo
 * histórico de compra, nunca más).
 */
export const obtenerOportunidadComercialGerencial = async (
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
    });
  }

  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 12, 1));

  try {
    const [compras, existencias] = await Promise.all([
      leerComprasPorClienteProductoSiesa(tenant.siesaCiaId, desde),
      leerExistenciasSiesa(tenant.siesaCiaId),
    ]);
    return res.json({
      disponible: true,
      ...calcularOportunidadComercialSiesa(compras, existencias),
    });
  } catch (error) {
    console.error("Error al calcular la oportunidad comercial desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Cobertura de inventario — Parte 4 del módulo Producción & Planeación:
 * cruza el inventario real (Bloque 1) con la demanda ya calculada
 * (Bloque 2) para estimar cuántos días aguanta cada producto al ritmo de
 * venta actual. Ver lib/cobertura-siesa.ts para la fórmula exacta.
 */
export const obtenerCoberturaGerencial = async (req: AuthenticatedRequest, res: Response) => {
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

  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 13, 1));

  try {
    const [ventasMensuales, existencias, umbrales] = await Promise.all([
      leerVentasMensualesPorProductoSiesa(tenant.siesaCiaId, desde),
      leerExistenciasSiesa(tenant.siesaCiaId),
      obtenerUmbralesInventario(req, tenantId),
    ]);
    const pronostico = calcularPronosticoDemandaSiesa(ventasMensuales, ahora, umbrales.demanda);
    return res.json({
      disponible: true,
      ...calcularResumenCoberturaSiesa(existencias, pronostico.todos, umbrales.cobertura),
    });
  } catch (error) {
    console.error("Error al calcular la cobertura desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Necesidades de abastecimiento — Etapa K del módulo Producción &
 * Planeación: explota la receta real (BOM, t820_mf_lista_material —
 * confirmado en vivo: 13.172 líneas activas en Ricol) de cada producto con
 * producción recomendada (Bloque 4) para calcular qué materias primas/
 * insumos faltan comprar. Ver lib/abastecimiento-siesa.ts para la fórmula
 * exacta (incluye % de desperdicio real de la receta).
 */
export const obtenerAbastecimientoGerencial = async (req: AuthenticatedRequest, res: Response) => {
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

  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 13, 1));

  try {
    const [ventasMensuales, existencias, bom, umbrales] = await Promise.all([
      leerVentasMensualesPorProductoSiesa(tenant.siesaCiaId, desde),
      leerExistenciasSiesa(tenant.siesaCiaId),
      leerListaMaterialesSiesa(tenant.siesaCiaId),
      obtenerUmbralesInventario(req, tenantId),
    ]);
    const pronostico = calcularPronosticoDemandaSiesa(ventasMensuales, ahora, umbrales.demanda);
    const produccionRecomendada = calcularProduccionRecomendadaSiesa(pronostico.todos, existencias);
    const necesidades = calcularNecesidadesAbastecimientoSiesa(
      produccionRecomendada,
      bom,
      existencias,
    );
    return res.json({ disponible: true, necesidades });
  } catch (error) {
    console.error("Error al calcular las necesidades de abastecimiento desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

export interface ContextoPlaneacionSiesa {
  resumenInventario: ReturnType<typeof calcularResumenInventarioSiesa>;
  decisiones: ReturnType<typeof construirDecisionesPlaneacion>["decisiones"];
  resumen: ReturnType<typeof construirDecisionesPlaneacion>["resumen"];
  pronostico: ReturnType<typeof calcularPronosticoDemandaSiesa>;
}

/**
 * Construye el contexto completo de planeación (inventario + demanda +
 * producción + abastecimiento + cobertura + capacidad + liquidación →
 * decisiones) para una compañía Siesa ya resuelta. EXTRAÍDO como función
 * reutilizable (antes vivía inline en obtenerDecisionesPlaneacion) para que
 * el Centro Gerencial (server/src/modules/gerencial/) pueda componer el
 * mismo resultado sin repetir ni una sola fórmula — ambos llamadores
 * comparten esta única orquestación.
 */
export async function construirContextoPlaneacionSiesa(
  req: AuthenticatedRequest,
  tenantId: string,
  siesaCiaId: number,
): Promise<ContextoPlaneacionSiesa> {
  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 13, 1));
  const desde30d = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const desde90d = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000);
  const desde180d = new Date(ahora.getTime() - 180 * 24 * 60 * 60 * 1000);

  const [ventasMensuales, existencias, bom, umbrales, ventas30d, ventas90d, ventas180d] =
    await Promise.all([
      leerVentasMensualesPorProductoSiesa(siesaCiaId, desde),
      leerExistenciasSiesa(siesaCiaId),
      leerListaMaterialesSiesa(siesaCiaId),
      obtenerUmbralesInventario(req, tenantId),
      leerVentasPorProductoEnRangoSiesa(siesaCiaId, desde30d, ahora),
      leerVentasPorProductoEnRangoSiesa(siesaCiaId, desde90d, ahora),
      leerVentasPorProductoEnRangoSiesa(siesaCiaId, desde180d, ahora),
    ]);

  const resumenInventario = calcularResumenInventarioSiesa(existencias, ahora, umbrales.inventario);
  const pronostico = calcularPronosticoDemandaSiesa(ventasMensuales, ahora, umbrales.demanda);
  const produccionRecomendada = calcularProduccionRecomendadaSiesa(pronostico.todos, existencias);
  const necesidadesAbastecimiento = calcularNecesidadesAbastecimientoSiesa(
    produccionRecomendada,
    bom,
    existencias,
  );
  const { riesgoRuptura } = calcularResumenCoberturaSiesa(
    existencias,
    pronostico.todos,
    umbrales.cobertura,
  );

  // Fase 3/6 (Fase H): ventanas móviles de venta real (30/90/180 días) +
  // inventario objetivo derivado — enriquecen las decisiones con más
  // contexto, sin reemplazar el pronóstico mensual de 12 meses ya usado.
  const ventanasDemanda = calcularVentanasDemanda(
    ventas30d,
    ventas90d,
    ventas180d,
    pronostico.todos,
  );
  const stockPorItem = new Map(existencias.map((e) => [e.itemRowId, e.cantidadExistente]));
  const inventarioObjetivo = calcularInventarioObjetivo(
    ventanasDemanda,
    stockPorItem,
    umbrales.inventarioObjetivo,
  );

  const { decisiones, resumen } = construirDecisionesPlaneacion({
    resumenInventario,
    pronostico: pronostico.todos,
    produccionRecomendada,
    necesidadesAbastecimiento,
    riesgoRuptura,
    bom,
    existencias,
    ventanasDemanda,
    inventarioObjetivo,
  });

  return { resumenInventario, decisiones, resumen, pronostico };
}

/**
 * Centro de Decisiones — Fase F del Centro de Planeación: una sola llamada
 * que arma todo lo que ya calculan los demás endpoints de este módulo
 * (inventario, demanda, producción recomendada, abastecimiento, cobertura)
 * más la capacidad productiva real según materiales y el score de
 * liquidación (dominio nuevo, ver domain/planeacion/), y las combina en una
 * lista única de decisiones explicables (producir/comprar/liquidar/no
 * producir/riesgo de quiebre) para el dashboard ejecutivo de /inventario.
 */
export const obtenerDecisionesPlaneacion = async (req: AuthenticatedRequest, res: Response) => {
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

  try {
    const { resumenInventario, decisiones, resumen } = await construirContextoPlaneacionSiesa(
      req,
      tenantId,
      tenant.siesaCiaId,
    );

    return res.json({
      disponible: true,
      inventarioTotal: resumenInventario.totalValor,
      inventarioVendible: resumenInventario.buckets.vendible.valor,
      inventarioComprometido: resumenInventario.totalComprometidoValor,
      inventarioExceso: resumenInventario.buckets.exceso.valor,
      inventarioRiesgo: resumenInventario.buckets.obsolescencia.valor,
      decisiones,
      resumen,
    });
  } catch (error) {
    console.error("Error al calcular el Centro de Decisiones desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Configuración de umbrales — Parte 16 del plan: en vez de constantes fijas
 * en el código, cada tenant puede ajustar sus propios días de
 * vendible/exceso/ruptura/sobre-cobertura. GET devuelve la configuración
 * guardada o, si no existe fila (tenant que nunca la ha tocado), los
 * valores por defecto documentados en cada módulo de cálculo — nunca null,
 * para que la UI siempre tenga algo que mostrar/editar.
 */
export const obtenerConfiguracionInventario = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const config = await req.tenantPrisma!.configuracionInventario.findUnique({
    where: { tenantId },
  });

  // Los parámetros de negocio (DECIMAL) se exponen como number, con sus
  // defaults cuando el tenant nunca guardó configuración.
  return res.json(
    config
      ? { ...config, ...extraerParametrosNegocio(config) }
      : {
          ...UMBRALES_INVENTARIO_DEFECTO,
          ...UMBRALES_COBERTURA_DEFECTO,
          ...UMBRALES_INVENTARIO_OBJETIVO_DEFECTO,
          ...extraerParametrosNegocio(null),
        },
  );
};

/**
 * Actualiza (crea si no existía) la configuración de umbrales del tenant.
 * Requiere permiso dedicado (inventario.configurar) — a diferencia de los
 * endpoints de solo lectura de este módulo, que reutilizan analitica.ver:
 * cambiar estos umbrales afecta lo que Gerencia ve como "riesgo" en toda la
 * empresa, así que necesita su propio permiso de escritura.
 */
export const actualizarConfiguracionInventario = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const tenantId = req.user!.tenantId;
  const parseo = actualizarConfiguracionInventarioSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const anterior = await req.tenantPrisma!.configuracionInventario.findUnique({
    where: { tenantId },
  });
  const config = await req.tenantPrisma!.configuracionInventario.upsert({
    where: { tenantId },
    create: { tenantId, ...parseo.data },
    update: { ...parseo.data },
  });

  // Los parámetros de negocio gobiernan reglas con impacto económico: se deja
  // constancia de qué cambió (solo los campos que vinieron en el request).
  const enviados = CAMPOS_PARAMETROS_NEGOCIO.filter((campo) => parseo.data[campo] !== undefined);
  if (enviados.length > 0) {
    const antes = extraerParametrosNegocio(anterior);
    const despues = extraerParametrosNegocio(config);
    const cambiados = enviados.filter((campo) => antes[campo] !== despues[campo]);
    if (cambiados.length > 0) {
      await prisma.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "PARAMETROS_NEGOCIO_ACTUALIZADOS",
          detalle: `${req.user!.nombre} actualizó parámetros de negocio: ${cambiados.join(", ")}.`,
          entidadTipo: "ConfiguracionInventario",
          entidadId: config.id,
          datosAnteriores: JSON.stringify(Object.fromEntries(cambiados.map((c) => [c, antes[c]]))),
          datosNuevos: JSON.stringify(Object.fromEntries(cambiados.map((c) => [c, despues[c]]))),
        },
      });
    }
  }

  return res.json({ ...config, ...extraerParametrosNegocio(config) });
};

/**
 * Detalle de pedidos de venta que originan el "Comprometido (estimado)" de
 * un ítem (tarjeta del KPI en /inventario/resumen) — NO recalcula ni
 * reemplaza ese KPI, que sigue viniendo exclusivamente de
 * f400_cant_comprometida_1 (leerExistenciasSiesa/calcularResumenInventarioSiesa,
 * sin tocar). Este endpoint solo explica de dónde sale ese número, leyendo
 * en vivo t431_cm_pv_movto/t430_cm_pv_docto (ver
 * leerPedidosComprometidosSiesa). `itemRowId` viene del path, `ciaId`
 * SIEMPRE del tenant autenticado — nunca de query/body/path, mismo
 * principio de autoridad que el resto de este controller.
 */
export const obtenerPedidosComprometidosItem = async (req: AuthenticatedRequest, res: Response) => {
  const itemRowId = Number(req.params.itemRowId);
  if (!Number.isInteger(itemRowId) || itemRowId <= 0) {
    return res.status(400).json({ message: "itemRowId inválido." });
  }

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

  try {
    const pedidos = await leerPedidosComprometidosSiesa(tenant.siesaCiaId, itemRowId);
    const totalCantidadComprometida = pedidos.reduce((acc, p) => acc + p.cantidadComprometida, 0);
    return res.json({
      disponible: true,
      pedidos,
      totalCantidadComprometida,
      // El detalle puede venir vacío aunque el KPI principal (t400) tenga
      // comprometido>0 para este ítem — discrepancia real conocida (0,5%
      // de las unidades en la verificación en vivo), no un error. El
      // frontend usa este flag para distinguir "no hay compromiso" de "hay
      // compromiso pero no se identificó el documento de origen".
      sinDocumentoIdentificable: pedidos.length === 0,
    });
  } catch (error) {
    console.error("Error al leer pedidos comprometidos desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Mismo origen que `obtenerPedidosComprometidosItem`, sin filtrar por
 * ítem — la tarjeta "Comprometido (estimado)" es un agregado de TODO el
 * inventario, así que su detalle completo tampoco debe obligar a buscar un
 * producto primero. Sigue siendo una sola consulta a Siesa (sin loop);
 * `ciaId` sigue viniendo exclusivamente del tenant autenticado.
 */
export const obtenerPedidosComprometidosTodos = async (
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
    });
  }

  try {
    const pedidos = await leerPedidosComprometidosSiesa(tenant.siesaCiaId);
    const totalCantidadComprometida = pedidos.reduce((acc, p) => acc + p.cantidadComprometida, 0);
    return res.json({
      disponible: true,
      pedidos,
      totalCantidadComprometida,
    });
  } catch (error) {
    console.error("Error al leer pedidos comprometidos desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};
