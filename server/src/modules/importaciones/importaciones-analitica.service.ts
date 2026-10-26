/**
 * Analítica de Importaciones — servicio de agregación de KPIs y alertas.
 * Reutiliza estrictamente los campos de fecha REALES del schema (nunca
 * updatedAt como sustituto) y NUNCA reimplementa la fórmula de Landed Cost —
 * solo lee lo que liquidarCosteoImportacion ya calculó en
 * CosteoImportacionDetalle.
 *
 * Cada indicador declara su DEFINICIÓN, su fuente de inicio y de fin, el
 * periodo y cuántos registros se excluyeron y por qué (ver `metadatos`). Un
 * dato faltante nunca se reemplaza por otro "parecido" (proxy).
 *
 * Mapeo de fechas usado:
 *  - Lead time = fechaOrden (OrdenCompraIntl.fechaOrden) → RECEPCIÓN FÍSICA EN
 *    PLANTA del primer lote recibido: hito RECEPCION_PLANTA o, en lotes
 *    anteriores a esa tabla, LoteImportacion.fechaLlegadaReal (que solo la
 *    escribe recibirPreCompraPlanta). NO es "liberación para inventario
 *    disponible": ese evento no existe en el modelo (no hay inventario por lote
 *    ni regla de Calidad).
 *  - Tiempo de desaduanamiento = hito LLEGADA_PUERTO (registrado por una
 *    persona) → ExpedienteAduanero.fechaLevante, del primer lote con llegada a
 *    puerto. Si falta el hito de llegada a puerto o el levante, la operación se
 *    EXCLUYE: antes se usaba la fecha de recepción en planta como si fuera la de
 *    puerto, lo cual falseaba el KPI.
 *  - Factor de incremento logístico = (landed definitivo − FOB convertido con la
 *    TRM de liquidación) / FOB convertido.
 *  - Variación de TRM = (TRM de liquidación − TRM pactada) / TRM pactada, con la
 *    TRM de liquidación ponderada por el FOB USD de cada lote liquidado.
 */
import { prisma } from "../../config/prisma";
import {
  calcularActividadesVencidas,
  type ActividadSeguimiento,
} from "../../domain/importaciones/motor-seguimiento";
import { ETIQUETA_BL_AWB, ETIQUETA_COA } from "../../domain/importaciones/documentos-lote";
import {
  agregarDias,
  calcularTendencia,
  contarMotivos,
  evaluarDiferenciaDias,
  factorIncrementoLogistico,
  variacionTrmPct,
  type AgregadoDias,
  type Tendencia,
} from "./importaciones-analitica.calculos";

const numero = (valor: unknown): number => Number(valor ?? 0);

const DIA_MS = 24 * 60 * 60 * 1000;

export interface FiltrosAnaliticaImportaciones {
  desde?: Date;
  hasta?: Date;
  proveedorId?: string;
  paisOrigen?: string;
  puerto?: string;
}

export interface OperacionAnalitica {
  ordenCompraId: string;
  numeroOrden: string;
  codigo: string | null;
  proveedorNombre: string;
  paisOrigen: string;
  puertoDestino: string | null;
  fechaOrden: Date;
  fechaRecepcionPlanta: Date | null;
  fechaRecepcionPlantaOrigen: string | null;
  fechaLlegadaPuerto: Date | null;
  fechaLlegadaPuertoOrigen: string | null;
  fechaLevante: Date | null;
  fechaLevanteOrigen: string | null;
  leadTimeDias: number | null;
  tiempoDesaduanamientoDias: number | null;
  valorFobTotalCop: number | null;
  costoLandedFinalCop: number | null;
  factorIncrementoLogisticoPct: number | null;
  trmPactada: number;
  trmLiquidacion: number | null;
  variacionTrmPct: number | null;
  excluidoLeadTime: boolean;
  excluidoDesaduanamiento: boolean;
  excluidoFactorLogistico: boolean;
  excluidoVariacionTrm: boolean;
  motivoExclusionLeadTime: string | null;
  motivoExclusionDesaduanamiento: string | null;
  motivoExclusionFactorLogistico: string | null;
  motivoExclusionVariacionTrm: string | null;
}

function filtroOrdenes(tenantId: string, filtros: FiltrosAnaliticaImportaciones) {
  return {
    tenantId,
    eliminado: false,
    ...(filtros.proveedorId ? { proveedorId: filtros.proveedorId } : {}),
    ...(filtros.paisOrigen ? { paisOrigen: filtros.paisOrigen } : {}),
    ...(filtros.puerto ? { lotes: { some: { puertoDestino: { contains: filtros.puerto } } } } : {}),
  };
}

async function obtenerOperaciones(
  tenantId: string,
  filtros: FiltrosAnaliticaImportaciones,
): Promise<OperacionAnalitica[]> {
  const ordenes = await prisma.ordenCompraIntl.findMany({
    where: {
      ...filtroOrdenes(tenantId, filtros),
      estado: { in: ["Confirmada", "Cerrada"] },
      ...(filtros.desde || filtros.hasta
        ? {
            fechaOrden: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lte: filtros.hasta } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      numeroOrden: true,
      codigo: true,
      paisOrigen: true,
      fechaOrden: true,
      trmPactada: true,
      proveedor: { select: { nombre: true } },
      proveedorExtranjero: true,
      items: { select: { id: true, cantidad: true, valorUnitarioFob: true } },
      lotes: {
        select: {
          id: true,
          puertoDestino: true,
          fechaLlegadaReal: true,
          hitos: { select: { tipo: true, fecha: true } },
          expediente: { select: { fechaLevante: true } },
          costeos: {
            where: { esProvisional: false },
            select: {
              itemId: true,
              costoTotalCop: true,
              trmLiquidacion: true,
              fechaLiquidacion: true,
            },
          },
        },
      },
    },
  });

  return ordenes.map((orden) => {
    const hitoDe = (lote: (typeof orden.lotes)[number], tipo: string): Date | null =>
      lote.hitos.find((h) => h.tipo === tipo)?.fecha ?? null;

    // Recepción física en planta por lote: hito, o fechaLlegadaReal en lotes
    // anteriores a la tabla de hitos (solo la escribe recibirPreCompraPlanta).
    const recepcionDe = (lote: (typeof orden.lotes)[number]) => {
      const hito = hitoDe(lote, "RECEPCION_PLANTA");
      if (hito) return { fecha: hito, origen: "LoteImportacionHito.RECEPCION_PLANTA" };
      if (lote.fechaLlegadaReal) {
        return { fecha: lote.fechaLlegadaReal, origen: "LoteImportacion.fechaLlegadaReal" };
      }
      return null;
    };

    const recepciones = orden.lotes
      .map((l) => recepcionDe(l))
      .filter((r): r is { fecha: Date; origen: string } => r !== null)
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const recepcionPrimaria = recepciones[0] ?? null;

    const lotesConPuerto = orden.lotes
      .map((l) => ({ lote: l, fecha: hitoDe(l, "LLEGADA_PUERTO") }))
      .filter((x): x is { lote: (typeof orden.lotes)[number]; fecha: Date } => x.fecha !== null)
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    const lotePuerto = lotesConPuerto[0] ?? null;

    const fechaLlegadaPuerto = lotePuerto?.fecha ?? null;
    const fechaLevante = lotePuerto?.lote.expediente?.fechaLevante ?? null;

    const leadTime = evaluarDiferenciaDias(orden.fechaOrden, recepcionPrimaria?.fecha ?? null);
    const desaduanamiento = evaluarDiferenciaDias(fechaLlegadaPuerto, fechaLevante);

    // Factor logístico y variación de TRM: sobre TODOS los lotes con costeo
    // definitivo de la orden, no solo el primario.
    let costoLandedFinalCop: number | null = null;
    let valorFobTotalCop: number | null = null;
    let fobUsdLiquidado = 0;
    let fobUsdPorTrm = 0;
    const itemsPorId = new Map(orden.items.map((i) => [i.id, i]));
    for (const lote of orden.lotes) {
      if (lote.costeos.length === 0) continue;
      const trmLiq = numero(lote.costeos[0].trmLiquidacion);
      let costoLote = 0;
      let fobLoteUsd = 0;
      for (const costeo of lote.costeos) {
        costoLote += numero(costeo.costoTotalCop);
        const item = itemsPorId.get(costeo.itemId);
        if (item) fobLoteUsd += numero(item.cantidad) * numero(item.valorUnitarioFob);
      }
      costoLandedFinalCop = (costoLandedFinalCop ?? 0) + costoLote;
      valorFobTotalCop = (valorFobTotalCop ?? 0) + fobLoteUsd * trmLiq;
      fobUsdLiquidado += fobLoteUsd;
      fobUsdPorTrm += fobLoteUsd * trmLiq;
    }

    const factorIncrementoLogisticoPct = factorIncrementoLogistico(
      costoLandedFinalCop,
      valorFobTotalCop,
    );
    const trmPactada = numero(orden.trmPactada);
    const trmLiquidacion = fobUsdLiquidado > 0 ? fobUsdPorTrm / fobUsdLiquidado : null;
    const variacionTrm = variacionTrmPct(trmPactada, trmLiquidacion);

    const hayCosteoDefinitivo = costoLandedFinalCop !== null;
    const motivoFactor =
      factorIncrementoLogisticoPct !== null
        ? null
        : hayCosteoDefinitivo
          ? "FOB_NO_POSITIVO"
          : "SIN_COSTEO_DEFINITIVO";
    const motivoTrm = variacionTrm !== null ? null : "SIN_COSTEO_DEFINITIVO";

    const motivoLeadTime =
      leadTime.motivo === "SIN_FIN"
        ? "SIN_RECEPCION_PLANTA"
        : leadTime.motivo === null
          ? null
          : leadTime.motivo;
    const motivoDesaduanamiento = !fechaLlegadaPuerto
      ? "SIN_HITO_LLEGADA_PUERTO"
      : desaduanamiento.motivo === "SIN_FIN"
        ? "SIN_LEVANTE"
        : desaduanamiento.motivo;

    return {
      ordenCompraId: orden.id,
      numeroOrden: orden.numeroOrden,
      codigo: orden.codigo,
      proveedorNombre: orden.proveedor?.nombre ?? orden.proveedorExtranjero,
      paisOrigen: orden.paisOrigen,
      puertoDestino: (lotePuerto?.lote ?? orden.lotes[0])?.puertoDestino ?? null,
      fechaOrden: orden.fechaOrden,
      fechaRecepcionPlanta: recepcionPrimaria?.fecha ?? null,
      fechaRecepcionPlantaOrigen: recepcionPrimaria?.origen ?? null,
      fechaLlegadaPuerto,
      fechaLlegadaPuertoOrigen: fechaLlegadaPuerto ? "LoteImportacionHito.LLEGADA_PUERTO" : null,
      fechaLevante,
      fechaLevanteOrigen: fechaLevante ? "ExpedienteAduanero.fechaLevante" : null,
      leadTimeDias: leadTime.dias,
      tiempoDesaduanamientoDias: desaduanamiento.dias,
      valorFobTotalCop,
      costoLandedFinalCop,
      factorIncrementoLogisticoPct,
      trmPactada,
      trmLiquidacion,
      variacionTrmPct: variacionTrm,
      excluidoLeadTime: leadTime.dias === null,
      excluidoDesaduanamiento: desaduanamiento.dias === null,
      excluidoFactorLogistico: factorIncrementoLogisticoPct === null,
      excluidoVariacionTrm: variacionTrm === null,
      motivoExclusionLeadTime: motivoLeadTime,
      motivoExclusionDesaduanamiento: motivoDesaduanamiento,
      motivoExclusionFactorLogistico: motivoFactor,
      motivoExclusionVariacionTrm: motivoTrm,
    };
  });
}

export interface DesglosePorClave {
  clave: string;
  agregado: AgregadoDias;
}

function desglosarPor(
  operaciones: OperacionAnalitica[],
  clave: (op: OperacionAnalitica) => string,
  valor: (op: OperacionAnalitica) => number | null,
): DesglosePorClave[] {
  const grupos = new Map<string, Array<number | null>>();
  for (const op of operaciones) {
    const k = clave(op);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(valor(op));
  }
  return Array.from(grupos.entries()).map(([clave, valores]) => ({
    clave,
    agregado: agregarDias(valores),
  }));
}

export interface DefinicionIndicador {
  definicion: string;
  fechaInicio: string;
  fechaFin: string;
  unidad: "días" | "%";
  /** Motivo → cantidad de operaciones del periodo excluidas por ese motivo. */
  exclusiones: Record<string, number>;
}

export interface AlertaLoteRetrasado {
  ordenCompraId: string;
  codigo: string | null;
  numeroOrden: string;
  loteId: string;
  blAwb: string;
  fechaLlegadaEstimadaProveedor: Date;
  etaTrackingActual: Date | null;
  diasVencida: number;
}

export interface AlertaDocumentosLote {
  ordenCompraId: string;
  codigo: string | null;
  numeroOrden: string;
  loteId: string;
  blAwb: string;
  estado: string;
  adjuntos: Record<string, boolean>;
}

export interface AlertasImportaciones {
  generadoEn: Date;
  etaProveedorVencida: {
    definicion: string;
    cantidad: number;
    lotes: AlertaLoteRetrasado[];
  };
  actividadesVencidas: {
    definicion: string;
    cantidad: number;
  };
  documentosAdjuntos: {
    definicion: string;
    cantidadLotes: number;
    sinAdjuntar: Record<string, number>;
    lotes: AlertaDocumentosLote[];
  };
}

export interface ResumenAnaliticaImportaciones {
  leadTime: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorProveedor: DesglosePorClave[];
    desglosePorOrigen: DesglosePorClave[];
  };
  tiempoDesaduanamiento: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorPuerto: DesglosePorClave[];
  };
  factorIncrementoLogistico: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorProveedor: DesglosePorClave[];
  };
  variacionTrm: {
    agregado: AgregadoDias;
    tendencia: Tendencia;
    desglosePorProveedor: DesglosePorClave[];
  };
  totalOperacionesConsideradas: number;
  metadatos: {
    periodo: {
      desde: Date | null;
      hasta: Date | null;
      baseFecha: string;
      estadosIncluidos: string[];
      generadoEn: Date;
    };
    indicadores: {
      leadTime: DefinicionIndicador;
      tiempoDesaduanamiento: DefinicionIndicador;
      factorIncrementoLogistico: DefinicionIndicador;
      variacionTrm: DefinicionIndicador;
    };
  };
  alertas: AlertasImportaciones;
}

/** Ventana de referencia: los N días anteriores al `desde` provisto,
 * mismo tamaño de ventana que el período actual (desde..hasta) — criterio
 * simple y explicable, sin inventar un período "histórico" arbitrario. Si
 * no hay filtro de fecha, la referencia es "las operaciones más antiguas
 * que la mitad de la lista ordenada por fecha de orden" (partición simple
 * por mediana de fecha) para poder mostrar una tendencia siempre que haya
 * al menos 2 operaciones. */
function partirEnPeriodos<T extends { fechaOrden: Date }>(
  operaciones: T[],
): {
  actual: T[];
  referencia: T[];
} {
  const ordenadas = [...operaciones].sort(
    (a, b) => a.fechaOrden.getTime() - b.fechaOrden.getTime(),
  );
  const corte = Math.floor(ordenadas.length / 2);
  return { actual: ordenadas.slice(corte), referencia: ordenadas.slice(0, corte) };
}

/**
 * Alertas del estado ACTUAL (no dependen del periodo): órdenes Confirmadas con
 * lotes sin nacionalizar. No fijan umbrales de negocio (días libres en puerto,
 * % máximo de desviación de costos): esos valores no están parametrizados.
 */
export async function alertasImportaciones(
  tenantId: string,
  filtros: FiltrosAnaliticaImportaciones,
  ahora: Date = new Date(),
): Promise<AlertasImportaciones> {
  const ordenes = await prisma.ordenCompraIntl.findMany({
    where: { ...filtroOrdenes(tenantId, filtros), estado: "Confirmada" },
    select: {
      id: true,
      numeroOrden: true,
      codigo: true,
      actividades: {
        select: {
          id: true,
          ordenCompraId: true,
          nombre: true,
          etapa: true,
          responsableTipo: true,
          responsableNombre: true,
          fechaLimite: true,
          fechaReal: true,
          estado: true,
          dependeDeId: true,
        },
      },
      lotes: {
        where: { estado: { not: "Nacionalizado" } },
        select: {
          id: true,
          blAwb: true,
          estado: true,
          fechaLlegadaEstimada: true,
          etaTrackingActual: true,
          hitos: { select: { tipo: true } },
          documentos: { select: { tipo: true } },
          expediente: {
            select: { dimRuta: true, facturaComercialRuta: true, certificadoOrigenRuta: true },
          },
        },
      },
    },
  });

  const lotesRetrasados: AlertaLoteRetrasado[] = [];
  const lotesDocumentos: AlertaDocumentosLote[] = [];
  const sinAdjuntar: Record<string, number> = {};
  let actividadesVencidas = 0;

  for (const orden of ordenes) {
    actividadesVencidas += calcularActividadesVencidas(
      orden.actividades as ActividadSeguimiento[],
      ahora,
    ).length;

    for (const lote of orden.lotes) {
      const tieneLlegadaPuerto = lote.hitos.some((h) => h.tipo === "LLEGADA_PUERTO");
      if (
        lote.estado === "En tránsito" &&
        !tieneLlegadaPuerto &&
        lote.fechaLlegadaEstimada &&
        lote.fechaLlegadaEstimada.getTime() < ahora.getTime()
      ) {
        lotesRetrasados.push({
          ordenCompraId: orden.id,
          codigo: orden.codigo,
          numeroOrden: orden.numeroOrden,
          loteId: lote.id,
          blAwb: lote.blAwb,
          fechaLlegadaEstimadaProveedor: lote.fechaLlegadaEstimada,
          etaTrackingActual: lote.etaTrackingActual,
          diasVencida: Math.floor((ahora.getTime() - lote.fechaLlegadaEstimada.getTime()) / DIA_MS),
        });
      }

      const tiposLote = new Set(lote.documentos.map((d) => d.tipo));
      const adjuntos: Record<string, boolean> = {
        "B/L o AWB": tiposLote.has(ETIQUETA_BL_AWB),
        "Factura comercial": !!lote.expediente?.facturaComercialRuta,
        DIM: !!lote.expediente?.dimRuta,
        "Certificado de origen": !!lote.expediente?.certificadoOrigenRuta,
        "Certificado de análisis (COA)": tiposLote.has(ETIQUETA_COA),
      };
      for (const [nombre, adjunto] of Object.entries(adjuntos)) {
        if (!adjunto) sinAdjuntar[nombre] = (sinAdjuntar[nombre] ?? 0) + 1;
      }
      lotesDocumentos.push({
        ordenCompraId: orden.id,
        codigo: orden.codigo,
        numeroOrden: orden.numeroOrden,
        loteId: lote.id,
        blAwb: lote.blAwb,
        estado: lote.estado,
        adjuntos,
      });
    }
  }

  return {
    generadoEn: ahora,
    etaProveedorVencida: {
      definicion:
        'Lotes "En tránsito" cuya fecha de llegada estimada por el proveedor ya pasó y que no tienen hito de llegada a puerto registrado. Usa la ETA del proveedor (no la del tracking); la ETA del tracking se muestra aparte.',
      cantidad: lotesRetrasados.length,
      lotes: lotesRetrasados,
    },
    actividadesVencidas: {
      definicion:
        "Actividades Pendientes o En curso de órdenes Confirmadas cuya fecha límite ya pasó (regla del motor de seguimiento).",
      cantidad: actividadesVencidas,
    },
    documentosAdjuntos: {
      definicion:
        "Inventario de documentos adjuntos por lote sin nacionalizar. NO indica obligatoriedad: la regla de qué documento se exige (por material, proveedor, país o etapa) no está definida.",
      cantidadLotes: lotesDocumentos.length,
      sinAdjuntar,
      lotes: lotesDocumentos,
    },
  };
}

export async function resumenAnaliticaImportaciones(
  tenantId: string,
  filtros: FiltrosAnaliticaImportaciones,
): Promise<ResumenAnaliticaImportaciones> {
  const operaciones = await obtenerOperaciones(tenantId, filtros);

  let actual = operaciones;
  let referencia: OperacionAnalitica[] = [];
  if (filtros.desde && filtros.hasta) {
    const ventanaMs = filtros.hasta.getTime() - filtros.desde.getTime();
    const inicioReferencia = new Date(filtros.desde.getTime() - ventanaMs);
    const finReferencia = new Date(filtros.desde.getTime() - 1);
    referencia = await obtenerOperaciones(tenantId, {
      ...filtros,
      desde: inicioReferencia,
      hasta: finReferencia,
    });
  } else {
    const partido = partirEnPeriodos(operaciones);
    actual = partido.actual;
    referencia = partido.referencia;
  }

  const leadTimeAgregadoActual = agregarDias(actual.map((o) => o.leadTimeDias));
  const leadTimeAgregadoReferencia = agregarDias(referencia.map((o) => o.leadTimeDias));

  const desaduanamientoAgregadoActual = agregarDias(actual.map((o) => o.tiempoDesaduanamientoDias));
  const desaduanamientoAgregadoReferencia = agregarDias(
    referencia.map((o) => o.tiempoDesaduanamientoDias),
  );

  const factorAgregadoActual = agregarDias(actual.map((o) => o.factorIncrementoLogisticoPct));
  const factorAgregadoReferencia = agregarDias(
    referencia.map((o) => o.factorIncrementoLogisticoPct),
  );

  const trmAgregadoActual = agregarDias(actual.map((o) => o.variacionTrmPct));
  const trmAgregadoReferencia = agregarDias(referencia.map((o) => o.variacionTrmPct));

  const generadoEn = new Date();

  return {
    leadTime: {
      agregado: leadTimeAgregadoActual,
      tendencia: calcularTendencia(
        leadTimeAgregadoActual.promedio,
        leadTimeAgregadoReferencia.promedio,
      ),
      desglosePorProveedor: desglosarPor(
        actual,
        (o) => o.proveedorNombre,
        (o) => o.leadTimeDias,
      ),
      desglosePorOrigen: desglosarPor(
        actual,
        (o) => o.paisOrigen,
        (o) => o.leadTimeDias,
      ),
    },
    tiempoDesaduanamiento: {
      agregado: desaduanamientoAgregadoActual,
      tendencia: calcularTendencia(
        desaduanamientoAgregadoActual.promedio,
        desaduanamientoAgregadoReferencia.promedio,
      ),
      desglosePorPuerto: desglosarPor(
        actual,
        (o) => o.puertoDestino ?? "Sin puerto",
        (o) => o.tiempoDesaduanamientoDias,
      ),
    },
    factorIncrementoLogistico: {
      agregado: factorAgregadoActual,
      tendencia: calcularTendencia(
        factorAgregadoActual.promedio,
        factorAgregadoReferencia.promedio,
      ),
      desglosePorProveedor: desglosarPor(
        actual,
        (o) => o.proveedorNombre,
        (o) => o.factorIncrementoLogisticoPct,
      ),
    },
    variacionTrm: {
      agregado: trmAgregadoActual,
      tendencia: calcularTendencia(trmAgregadoActual.promedio, trmAgregadoReferencia.promedio),
      desglosePorProveedor: desglosarPor(
        actual,
        (o) => o.proveedorNombre,
        (o) => o.variacionTrmPct,
      ),
    },
    totalOperacionesConsideradas: actual.length,
    metadatos: {
      periodo: {
        desde: filtros.desde ?? null,
        hasta: filtros.hasta ?? null,
        baseFecha: "OrdenCompraIntl.fechaOrden",
        estadosIncluidos: ["Confirmada", "Cerrada"],
        generadoEn,
      },
      indicadores: {
        leadTime: {
          definicion:
            "Días entre la fecha de la orden y la recepción física del primer lote en planta. No es la liberación para inventario disponible (ese evento no existe en el sistema).",
          fechaInicio: "OrdenCompraIntl.fechaOrden",
          fechaFin:
            "Hito RECEPCION_PLANTA del primer lote (o LoteImportacion.fechaLlegadaReal en lotes anteriores a los hitos)",
          unidad: "días",
          exclusiones: contarMotivos(actual.map((o) => o.motivoExclusionLeadTime)),
        },
        tiempoDesaduanamiento: {
          definicion:
            "Días entre la llegada real a puerto (hito registrado por una persona) y el levante aduanero del primer lote con llegada a puerto. Sin hito de llegada a puerto o sin levante, la operación se excluye: no se usa la recepción en planta como sustituto.",
          fechaInicio: "Hito LLEGADA_PUERTO",
          fechaFin: "ExpedienteAduanero.fechaLevante",
          unidad: "días",
          exclusiones: contarMotivos(actual.map((o) => o.motivoExclusionDesaduanamiento)),
        },
        factorIncrementoLogistico: {
          definicion:
            "(Costo landed definitivo − FOB convertido a COP con la TRM de liquidación) / FOB convertido × 100, sobre los lotes con costeo definitivo.",
          fechaInicio: "CosteoImportacionDetalle (esProvisional = false)",
          fechaFin: "CosteoImportacionDetalle.fechaLiquidacion",
          unidad: "%",
          exclusiones: contarMotivos(actual.map((o) => o.motivoExclusionFactorLogistico)),
        },
        variacionTrm: {
          definicion:
            "(TRM de liquidación − TRM pactada) / TRM pactada × 100. La TRM de liquidación se pondera por el FOB USD de cada lote liquidado. Positivo: el dólar liquidado fue mayor al pactado.",
          fechaInicio: "OrdenCompraIntl.trmPactada",
          fechaFin: "CosteoImportacionDetalle.trmLiquidacion (definitivo)",
          unidad: "%",
          exclusiones: contarMotivos(actual.map((o) => o.motivoExclusionVariacionTrm)),
        },
      },
    },
    alertas: await alertasImportaciones(tenantId, filtros, generadoEn),
  };
}

export async function operacionesAnaliticaImportaciones(
  tenantId: string,
  filtros: FiltrosAnaliticaImportaciones,
): Promise<OperacionAnalitica[]> {
  return obtenerOperaciones(tenantId, filtros);
}
