/**
 * Tracking Marítimo V1 — abstracción de proveedor de tracking (AIS de
 * buques + eventos de contenedores de la naviera). Nunca acoplar el resto
 * del sistema (job de sincronización, comparación de ETA, notificaciones) a
 * un proveedor concreto (VesselFinder, MarineTraffic, etc.) — toda esa
 * lógica programa contra esta interfaz. V1 implementa un único adapter
 * simulado (MockMaritimeTrackingProvider) porque todavía no hay una cuenta
 * real de ningún proveedor de AIS; cuando exista, se agrega un adapter real
 * sin tocar el resto de Importaciones (mismo principio que EmailProvider en
 * la Bandeja Inteligente).
 */

export type EstadoTracking = "PENDIENTE" | "ACTIVO" | "SIN_DATOS" | "ERROR";

export interface InfoBuque {
  nombre: string | null;
  imo: string | null;
  mmsi: string | null;
  latitud: number | null;
  longitud: number | null;
  velocidadNudos: number | null;
  rumboGrados: number | null;
  destino: string | null;
  /** ETA calculada por el proveedor de tracking a partir de la posición y
   * velocidad actuales del buque — dato independiente del ETA que informó
   * el proveedor comercial (ver comentario en LoteImportacion.etaTrackingActual). */
  etaEstimada: Date | null;
  ultimaActualizacion: Date;
}

/** Catálogo cerrado de eventos de contenedor — mismos códigos que usa
 * cualquier naviera/forwarder en sus notificaciones EDI/tracking. */
export const EVENTOS_CONTENEDOR_VALIDOS = [
  "BOOKED",
  "GATE_IN",
  "LOADED",
  "DEPARTED",
  "TRANSSHIPMENT",
  "ARRIVED_PORT",
  "DISCHARGED",
  "DELIVERED",
] as const;
export type EventoContenedorTipo = (typeof EVENTOS_CONTENEDOR_VALIDOS)[number];

export interface EventoContenedor {
  tipo: EventoContenedorTipo;
  fecha: Date;
  ubicacion: string | null;
}

export interface InfoContenedor {
  numero: string;
  eventos: EventoContenedor[];
}

export interface ConsultaBuque {
  imo?: string | null;
  mmsi?: string | null;
  nombre?: string | null;
}

export interface ConsultaContenedor {
  numero: string;
  blAwb?: string | null;
  booking?: string | null;
  naviera?: string | null;
}

export interface MaritimeTrackingProvider {
  /** Nombre corto del adapter (ej. "mock", "vesselfinder") — se persiste en
   * LoteImportacion.proveedorTracking para trazabilidad de qué proveedor
   * originó cada dato. */
  readonly nombre: string;

  /** null si el proveedor no encuentra el buque (IMO/MMSI desconocido) —
   * nunca lanza por "no encontrado", solo por error real de comunicación
   * (ver MaritimeTrackingProviderError). */
  buscarBuque(consulta: ConsultaBuque): Promise<InfoBuque | null>;

  /** null si el proveedor no tiene información de ese contenedor todavía
   * (normal en las primeras horas tras el booking). */
  buscarContenedor(consulta: ConsultaContenedor): Promise<InfoContenedor | null>;
}

/** Error específico para que el llamador (el job de sincronización) trate
 * "el proveedor de tracking falló" (reintentable, se registra en
 * ultimoErrorTracking sin tumbar el resto de la corrida) distinto de un bug
 * propio. */
export class MaritimeTrackingProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MaritimeTrackingProviderError";
  }
}
