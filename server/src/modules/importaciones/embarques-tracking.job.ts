import { schedule, type ScheduledTask } from "node-cron";
import { prisma } from "../../config/prisma";
import { getTenantPrisma } from "../../lib/tenant-prisma";
import { resolverDestinatarios } from "../../lib/motor-destinatarios";
import { crearNotificacion } from "../../lib/notificaciones";
import { crearItemDeTrabajo } from "../../lib/inbox";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { leerConfigTrackingMaritimo } from "../../integrations/maritime-tracking/config";
import { MockMaritimeTrackingProvider } from "../../integrations/maritime-tracking/mock-maritime-tracking-provider";
import type { MaritimeTrackingProvider } from "../../integrations/maritime-tracking/maritime-tracking-provider";

/**
 * Tracking Marítimo V1 — job de sincronización periódica (§8 de la
 * especificación). Separado de cualquier acción humana a propósito, mismo
 * principio que la Bandeja Inteligente: la automatización LEE/INTERPRETA/
 * PROPONE (posición, ETA, eventos, alertas), nunca decide nada financiero ni
 * crítico — jamás toca valor de la compra, FOB, proveedor, condiciones
 * comerciales, aprobación, contabilidad ni Siesa (§9).
 *
 * Solo sincroniza lotes "en camino" (En tránsito/En puerto/En inspección) —
 * uno ya nacionalizado o liberado no necesita tracking marítimo. Un error en
 * un lote concreto se guarda en `ultimoErrorTracking` y ese lote pasa a
 * estadoTracking "ERROR"; nunca detiene el resto de la corrida.
 */

const LIMITE_LOTES_POR_CORRIDA = 20;
const ESTADOS_LOTE_EN_CAMINO = ["En tránsito", "En puerto", "En inspección"];
const EVENTO_ALERTA_EMBARQUE = "IMPORTACION_EMBARQUE_ALERTA";

let provider: MaritimeTrackingProvider = new MockMaritimeTrackingProvider();

/** Solo para tests. */
export function _establecerProviderParaTests(p: MaritimeTrackingProvider): void {
  provider = p;
}

function diferenciaEnDias(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

/** Notificación + Inbox de una alerta operativa de un lote — nunca falla la
 * corrida (mismo principio que crearNotificacion/crearItemDeTrabajo). El
 * `asignadoPermiso` garantiza que llegue a alguien aunque el tenant no haya
 * configurado todavía una ReglaDestinatarios para este evento. */
async function notificarAlertaEmbarque(
  tenantId: string,
  loteId: string,
  ordenCompraId: string,
  titulo: string,
  mensaje: string,
): Promise<void> {
  const tenantPrisma = getTenantPrisma(tenantId);
  await crearItemDeTrabajo(tenantPrisma, {
    tenantId,
    tipo: EVENTO_ALERTA_EMBARQUE,
    categoria: "ALERTA",
    sourceModule: "importaciones-tracking",
    sourceEntityTipo: "LoteImportacion",
    sourceEntityId: loteId,
    titulo,
    descripcion: mensaje,
    prioridad: "MEDIA",
    asignadoPermiso: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
    enlace: `/importaciones/${ordenCompraId}`,
  });

  const destinatarios = await resolverDestinatarios(
    tenantPrisma,
    tenantId,
    EVENTO_ALERTA_EMBARQUE,
    {
      responsableId: null,
    },
  );
  for (const usuarioId of destinatarios) {
    await crearNotificacion({
      tenantId,
      usuarioId,
      tipo: EVENTO_ALERTA_EMBARQUE,
      titulo,
      mensaje,
      enlace: `/importaciones/${ordenCompraId}`,
      entidadTipo: "LoteImportacion",
      entidadId: loteId,
    });
  }
}

async function registrarHistorial(
  tenantId: string,
  ordenCompraId: string,
  accion: string,
  detalle: string,
): Promise<void> {
  await prisma.importacionHistorial.create({
    data: {
      ordenCompraId,
      actor: "Sistema",
      accion,
      detalle,
      origen: "Sistema",
      responsable: "Tracking Marítimo",
      etapa: "Tránsito",
    },
  });
  void tenantId;
}

/** Crea (si no existe) o resuelve (si la condición ya no aplica) una novedad
 * automática — MISMO patrón idempotente que sincronizarNovedadesAutomaticas
 * en importaciones.controller.ts (índice único ordenCompraId+reglaOrigen). */
async function sincronizarNovedadAutomatica(
  tenantId: string,
  ordenCompraId: string,
  reglaOrigen: string,
  condicionVigente: boolean,
  datos: { tipo: string; descripcion: string; prioridad?: string },
): Promise<void> {
  const existente = await prisma.importacionNovedad.findUnique({
    where: { ordenCompraId_reglaOrigen: { ordenCompraId, reglaOrigen } },
  });

  if (condicionVigente) {
    if (existente) {
      if (existente.estado === "Resuelta") {
        await prisma.importacionNovedad.update({
          where: { id: existente.id },
          data: {
            estado: "Abierta",
            descripcion: datos.descripcion,
            fechaResolucion: null,
            responsableResolucionNombre: null,
          },
        });
      }
      // Ya abierta: no se duplica, la descripción original queda como está
      // (el detalle actualizado vive en el historial/notificación puntual).
      return;
    }
    await prisma.importacionNovedad.create({
      data: {
        tenantId,
        ordenCompraId,
        tipo: datos.tipo,
        descripcion: datos.descripcion,
        origen: "Externo",
        responsable: "Naviera",
        prioridad: datos.prioridad || "Media",
        automatica: true,
        reglaOrigen,
        creadoPorNombre: "Sistema",
      },
    });
  } else if (existente && existente.estado !== "Resuelta") {
    await prisma.importacionNovedad.update({
      where: { id: existente.id },
      data: {
        estado: "Resuelta",
        fechaResolucion: new Date(),
        responsableResolucionNombre: "Sistema (condición resuelta)",
      },
    });
  }
}

async function sincronizarBuqueDelLote(lote: {
  id: string;
  tenantId: string;
  ordenCompraId: string;
  buqueNombre: string | null;
  buqueImo: string | null;
  buqueMmsi: string | null;
  fechaLlegadaEstimada: Date | null;
}): Promise<void> {
  if (!lote.buqueImo && !lote.buqueMmsi && !lote.buqueNombre) return;

  try {
    const info = await provider.buscarBuque({
      imo: lote.buqueImo,
      mmsi: lote.buqueMmsi,
      nombre: lote.buqueNombre,
    });

    if (!info) {
      await prisma.loteImportacion.update({
        where: { id: lote.id },
        data: {
          estadoTracking: "SIN_DATOS",
          proveedorTracking: provider.nombre,
          ultimaSincronizacionTracking: new Date(),
          ultimoErrorTracking: null,
        },
      });
      return;
    }

    const etaAnterior = lote.fechaLlegadaEstimada;
    await prisma.loteImportacion.update({
      where: { id: lote.id },
      data: {
        ultimaPosicionLat: info.latitud,
        ultimaPosicionLon: info.longitud,
        ultimaPosicionFecha: info.ultimaActualizacion,
        velocidadNudos: info.velocidadNudos,
        rumboGrados: info.rumboGrados,
        etaTrackingActual: info.etaEstimada,
        estadoTracking: "ACTIVO",
        proveedorTracking: provider.nombre,
        ultimaSincronizacionTracking: new Date(),
        ultimoErrorTracking: null,
      },
    });

    if (etaAnterior && info.etaEstimada) {
      const config = leerConfigTrackingMaritimo();
      const variacionDias = diferenciaEnDias(info.etaEstimada, etaAnterior);
      const hayRetraso = variacionDias >= config.umbralVariacionEtaDias;

      await sincronizarNovedadAutomatica(
        lote.tenantId,
        lote.ordenCompraId,
        `embarque:${lote.id}:eta-variacion`,
        hayRetraso,
        {
          tipo: "Retraso",
          descripcion: `El tracking marítimo estima una variación de ${variacionDias} día(s) frente al ETA informado por el proveedor (lote ${lote.id.slice(0, 8)}).`,
          prioridad: variacionDias >= config.umbralVariacionEtaDias * 3 ? "Alta" : "Media",
        },
      );

      if (hayRetraso) {
        await registrarHistorial(
          lote.tenantId,
          lote.ordenCompraId,
          "ETA actualizada por tracking",
          `ETA proveedor ${etaAnterior.toISOString().slice(0, 10)} → ETA tracking ${info.etaEstimada.toISOString().slice(0, 10)} (variación de ${variacionDias} día(s)).`,
        );
        await notificarAlertaEmbarque(
          lote.tenantId,
          lote.id,
          lote.ordenCompraId,
          "Variación de ETA detectada",
          `El embarque presenta una variación de ETA de ${variacionDias} día(s) frente a lo informado por el proveedor.`,
        );
      }
    }
  } catch (error) {
    await prisma.loteImportacion.update({
      where: { id: lote.id },
      data: {
        estadoTracking: "ERROR",
        ultimoErrorTracking: error instanceof Error ? error.message : "Error desconocido.",
      },
    });
  }
}

async function sincronizarContenedoresDelLote(lote: {
  id: string;
  tenantId: string;
  ordenCompraId: string;
  blAwb: string;
  booking: string | null;
  naviera: string | null;
}): Promise<void> {
  const contenedores = await prisma.contenedorLote.findMany({ where: { loteId: lote.id } });

  for (const contenedor of contenedores) {
    try {
      const info = await provider.buscarContenedor({
        numero: contenedor.numero,
        blAwb: lote.blAwb,
        booking: lote.booking,
        naviera: lote.naviera,
      });
      if (!info || info.eventos.length === 0) continue;

      const eventosOrdenados = [...info.eventos].sort(
        (a, b) => a.fecha.getTime() - b.fecha.getTime(),
      );
      const ultimo = eventosOrdenados[eventosOrdenados.length - 1];
      const eraNuevoEvento = contenedor.ultimoEvento !== ultimo.tipo;

      await prisma.contenedorLote.update({
        where: { id: contenedor.id },
        data: {
          ultimoEvento: ultimo.tipo,
          ultimoEventoFecha: ultimo.fecha,
          eventosJson: JSON.stringify(eventosOrdenados),
        },
      });

      if (eraNuevoEvento && (ultimo.tipo === "DEPARTED" || ultimo.tipo === "ARRIVED_PORT")) {
        const esZarpe = ultimo.tipo === "DEPARTED";
        await registrarHistorial(
          lote.tenantId,
          lote.ordenCompraId,
          esZarpe ? "Buque zarpó" : "Buque arribó a puerto",
          `Contenedor ${contenedor.numero}: ${ultimo.tipo}.`,
        );
        await notificarAlertaEmbarque(
          lote.tenantId,
          lote.id,
          lote.ordenCompraId,
          esZarpe ? "El embarque zarpó" : "El embarque arribó a puerto",
          `Contenedor ${contenedor.numero} — evento ${ultimo.tipo} confirmado por la naviera.`,
        );
      }
    } catch {
      // Un contenedor sin datos disponibles no es un error de la corrida —
      // el próximo ciclo lo vuelve a intentar.
      continue;
    }
  }
}

async function verificarAusenciaDeActualizacion(lote: {
  id: string;
  tenantId: string;
  ordenCompraId: string;
  estadoTracking: string;
  ultimaSincronizacionTracking: Date | null;
  buqueImo: string | null;
  buqueMmsi: string | null;
}): Promise<void> {
  const tieneIdentificadorTracking = !!(lote.buqueImo || lote.buqueMmsi);
  if (!tieneIdentificadorTracking) return;

  const config = leerConfigTrackingMaritimo();
  const limite = Date.now() - config.diasSinActualizacionAlerta * 24 * 60 * 60 * 1000;
  const sinActualizar =
    lote.estadoTracking !== "PENDIENTE" &&
    (!lote.ultimaSincronizacionTracking || lote.ultimaSincronizacionTracking.getTime() < limite);

  await sincronizarNovedadAutomatica(
    lote.tenantId,
    lote.ordenCompraId,
    `embarque:${lote.id}:sin-actualizacion`,
    sinActualizar,
    {
      tipo: "ProblemaTransporte",
      descripcion: `El tracking marítimo no logra actualizar este embarque desde hace más de ${config.diasSinActualizacionAlerta} día(s).`,
      prioridad: "Media",
    },
  );
}

/** Sincroniza UN lote concreto — usado tanto por el job periódico como por
 * el disparo manual ("Sincronizar ahora" en la UI, sincronizarTrackingLote
 * en importaciones.controller.ts). No revisa `config.habilitado`: ese flag
 * solo apaga el CICLO PERIÓDICO, nunca una acción puntual que el usuario
 * pidió explícitamente. */
export async function sincronizarUnLote(loteId: string): Promise<void> {
  const lote = await prisma.loteImportacion.findUnique({ where: { id: loteId } });
  if (!lote) return;

  await sincronizarBuqueDelLote(lote);
  await sincronizarContenedoresDelLote(lote);
  const loteActualizado = await prisma.loteImportacion.findUnique({ where: { id: loteId } });
  if (loteActualizado) await verificarAusenciaDeActualizacion(loteActualizado);
}

export async function ejecutarCicloSincronizacionEmbarques(): Promise<void> {
  const config = leerConfigTrackingMaritimo();
  if (!config.habilitado) return;

  const lotes = await prisma.loteImportacion.findMany({
    where: {
      estado: { in: ESTADOS_LOTE_EN_CAMINO },
      OR: [
        { buqueImo: { not: null } },
        { buqueMmsi: { not: null } },
        { contenedores: { some: {} } },
      ],
    },
    take: LIMITE_LOTES_POR_CORRIDA,
    orderBy: { ultimaSincronizacionTracking: "asc" },
  });

  for (const lote of lotes) {
    await sincronizarUnLote(lote.id);
  }
}

let tareaProgramada: ScheduledTask | null = null;

export function iniciarSchedulerTrackingEmbarques(): ScheduledTask | null {
  const config = leerConfigTrackingMaritimo();
  if (!config.habilitado) {
    console.log(
      "[tracking-maritimo] Scheduler deshabilitado (TRACKING_MARITIMO_SYNC_ENABLED distinto de 'true').",
    );
    return null;
  }
  if (tareaProgramada) return tareaProgramada;

  tareaProgramada = schedule(
    config.cronSincronizacion,
    () => {
      ejecutarCicloSincronizacionEmbarques().catch((error) => {
        console.error("[tracking-maritimo] Error inesperado en el ciclo de sincronización:", error);
      });
    },
    { noOverlap: true, name: "tracking-maritimo-embarques" },
  );
  console.log(
    `[tracking-maritimo] Scheduler iniciado (expresión cron: "${config.cronSincronizacion}").`,
  );
  return tareaProgramada;
}

export function detenerSchedulerTrackingEmbarques(): void {
  if (tareaProgramada) {
    tareaProgramada.stop();
    tareaProgramada = null;
  }
}
