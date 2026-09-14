/**
 * Analítica de Importaciones V1 — servicio de agregación de los 3 KPIs
 * pedidos (Lead Time, Tiempo de desaduanamiento, Factor de incremento
 * logístico). Reutiliza estrictamente los campos de fecha REALES ya
 * existentes en el schema (nunca updatedAt como sustituto) y NUNCA
 * reimplementa la fórmula de Landed Cost — solo lee lo que
 * liquidarCosteoImportacion ya calculó en CosteoImportacionDetalle.
 *
 * Mapeo de fechas reales usado (documentado también en el informe de la
 * tarea):
 *  - fechaOrden           → OrdenCompraIntl.fechaOrden (fecha de negocio real
 *                           de la orden, no createdAt).
 *  - fechaDisponibleBodega→ LoteImportacion.fechaLlegadaReal del PRIMER lote
 *                           recibido de la orden. Se escribe exactamente al
 *                           ejecutar recibirPreCompraPlanta ("ingreso físico
 *                           a planta"), que es el evento real más cercano a
 *                           "mercancía disponible" que existe en el modelo —
 *                           no existe un campo separado "fechaLlegadaPuerto"
 *                           distinto de éste (ver informe: la única fecha de
 *                           tránsito portuario es un estado manual sin
 *                           columna de fecha propia).
 *  - fechaLlegadaPuerto   → mismo LoteImportacion.fechaLlegadaReal (por lote,
 *                           ver limitación arriba), usado como punto de
 *                           partida real más cercano disponible para medir
 *                           el tiempo de desaduanamiento de ESE lote.
 *  - fechaNacionalizado   → ExpedienteAduanero.fechaLevante si existe
 *                           (fecha real de levante DIAN), y si no, la fecha
 *                           mínima de CosteoImportacionDetalle.fechaLiquidacion
 *                           entre las filas definitivas (esProvisional=false)
 *                           de ese lote — es el mismo instante en que
 *                           liquidarCosteoImportacion pone el lote en estado
 *                           "Nacionalizado" (misma transacción).
 *  - costoLandedFinal     → SUM(CosteoImportacionDetalle.costoTotalCop) de
 *                           las filas definitivas del lote (Landed Cost ya
 *                           calculado por liquidarCosteoImportacion, jamás
 *                           recalculado aquí).
 *  - valorFobTotal        → SUM(item.cantidad * item.valorUnitarioFob) de los
 *                           ítems con costeo definitivo en ese lote,
 *                           convertido a COP con la MISMA trmLiquidacion que
 *                           usó esa liquidación (para no mezclar el efecto
 *                           logístico con el efecto de tasa de cambio, que
 *                           ya se aísla aparte como diferenciaCambioCop).
 */
import { prisma } from "../../config/prisma";
import {
  agregarDias,
  calcularTendencia,
  diferenciaDias,
  factorIncrementoLogistico,
  type AgregadoDias,
  type Tendencia,
} from "./importaciones-analitica.calculos";

const numero = (valor: unknown): number => Number(valor ?? 0);

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
  fechaDisponibleBodega: Date | null;
  fechaDisponibleBodegaOrigen: string | null;
  fechaLlegadaPuerto: Date | null;
  fechaLlegadaPuertoOrigen: string | null;
  fechaNacionalizado: Date | null;
  fechaNacionalizadoOrigen: string | null;
  leadTimeDias: number | null;
  tiempoDesaduanamientoDias: number | null;
  valorFobTotalCop: number | null;
  costoLandedFinalCop: number | null;
  factorIncrementoLogisticoPct: number | null;
  excluidoLeadTime: boolean;
  excluidoDesaduanamiento: boolean;
  excluidoFactorLogistico: boolean;
}

async function obtenerOperaciones(
  tenantId: string,
  filtros: FiltrosAnaliticaImportaciones,
): Promise<OperacionAnalitica[]> {
  const ordenes = await prisma.ordenCompraIntl.findMany({
    where: {
      tenantId,
      eliminado: false,
      estado: { in: ["Confirmada", "Cerrada"] },
      ...(filtros.desde || filtros.hasta
        ? {
            fechaOrden: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lte: filtros.hasta } : {}),
            },
          }
        : {}),
      ...(filtros.proveedorId ? { proveedorId: filtros.proveedorId } : {}),
      ...(filtros.paisOrigen ? { paisOrigen: filtros.paisOrigen } : {}),
      ...(filtros.puerto
        ? { lotes: { some: { puertoDestino: { contains: filtros.puerto } } } }
        : {}),
    },
    select: {
      id: true,
      numeroOrden: true,
      codigo: true,
      paisOrigen: true,
      fechaOrden: true,
      proveedor: { select: { nombre: true } },
      proveedorExtranjero: true,
      items: { select: { id: true, cantidad: true, valorUnitarioFob: true } },
      lotes: {
        select: {
          id: true,
          puertoDestino: true,
          fechaLlegadaReal: true,
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
    // Lote "primario" para efectos de fechaDisponibleBodega/puerto/
    // desaduanamiento: el primero con fechaLlegadaReal registrada (primer
    // embarque recibido físicamente). Si ninguno la tiene, no hay dato.
    const lotesConLlegada = orden.lotes
      .filter((l) => l.fechaLlegadaReal)
      .sort((a, b) => a.fechaLlegadaReal!.getTime() - b.fechaLlegadaReal!.getTime());
    const lotePrimario = lotesConLlegada[0] ?? orden.lotes[0] ?? null;

    const fechaDisponibleBodega = lotePrimario?.fechaLlegadaReal ?? null;
    const fechaLlegadaPuerto = lotePrimario?.fechaLlegadaReal ?? null;

    let fechaNacionalizado: Date | null = null;
    let fechaNacionalizadoOrigen: string | null = null;
    if (lotePrimario) {
      if (lotePrimario.expediente?.fechaLevante) {
        fechaNacionalizado = lotePrimario.expediente.fechaLevante;
        fechaNacionalizadoOrigen = "ExpedienteAduanero.fechaLevante";
      } else if (lotePrimario.costeos.length > 0) {
        const fechas = lotePrimario.costeos.map((c) => c.fechaLiquidacion.getTime());
        fechaNacionalizado = new Date(Math.min(...fechas));
        fechaNacionalizadoOrigen = "CosteoImportacionDetalle.fechaLiquidacion (definitivo)";
      }
    }

    const leadTimeDias = diferenciaDias(orden.fechaOrden, fechaDisponibleBodega);
    const tiempoDesaduanamientoDias = diferenciaDias(fechaLlegadaPuerto, fechaNacionalizado);

    // Factor de incremento logístico: se calcula sobre TODOS los lotes con
    // costeo definitivo de la orden (no solo el primario), sumando landed
    // cost real y el FOB convertido con la trmLiquidacion de cada lote.
    let costoLandedFinalCop: number | null = null;
    let valorFobTotalCop: number | null = null;
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
    }

    const factorIncrementoLogisticoPct = factorIncrementoLogistico(
      costoLandedFinalCop,
      valorFobTotalCop,
    );

    return {
      ordenCompraId: orden.id,
      numeroOrden: orden.numeroOrden,
      codigo: orden.codigo,
      proveedorNombre: orden.proveedor?.nombre ?? orden.proveedorExtranjero,
      paisOrigen: orden.paisOrigen,
      puertoDestino: lotePrimario?.puertoDestino ?? null,
      fechaOrden: orden.fechaOrden,
      fechaDisponibleBodega,
      fechaDisponibleBodegaOrigen: fechaDisponibleBodega
        ? "LoteImportacion.fechaLlegadaReal"
        : null,
      fechaLlegadaPuerto,
      fechaLlegadaPuertoOrigen: fechaLlegadaPuerto ? "LoteImportacion.fechaLlegadaReal" : null,
      fechaNacionalizado,
      fechaNacionalizadoOrigen,
      leadTimeDias,
      tiempoDesaduanamientoDias,
      valorFobTotalCop,
      costoLandedFinalCop,
      factorIncrementoLogisticoPct,
      excluidoLeadTime: leadTimeDias === null,
      excluidoDesaduanamiento: tiempoDesaduanamientoDias === null,
      excluidoFactorLogistico: factorIncrementoLogisticoPct === null,
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
  totalOperacionesConsideradas: number;
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
    totalOperacionesConsideradas: actual.length,
  };
}

export async function operacionesAnaliticaImportaciones(
  tenantId: string,
  filtros: FiltrosAnaliticaImportaciones,
): Promise<OperacionAnalitica[]> {
  return obtenerOperaciones(tenantId, filtros);
}
