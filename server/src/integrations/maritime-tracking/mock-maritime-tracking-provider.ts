import {
  EVENTOS_CONTENEDOR_VALIDOS,
  type ConsultaBuque,
  type ConsultaContenedor,
  type EventoContenedor,
  type InfoBuque,
  type InfoContenedor,
  type MaritimeTrackingProvider,
} from "./maritime-tracking-provider";

/**
 * Adapter simulado — devuelve datos determinísticos (nunca aleatorios: la
 * misma consulta siempre da el mismo resultado, para que los tests sean
 * reproducibles) derivados de un hash simple del identificador. NO llama a
 * ningún servicio externo. Existe para que todo el resto del pipeline
 * (comparación de ETA, detección de eventos, notificaciones, UI) se pueda
 * construir y probar de punta a punta antes de tener una cuenta real de
 * VesselFinder/MarineTraffic — ver comentario en maritime-tracking-provider.ts.
 *
 * Un IMO/contenedor que contenga la palabra "SINDATOS" (sin distinguir
 * mayúsculas) simula intencionalmente "el proveedor no encontró nada" — útil
 * para probar ese camino sin depender de azar.
 */
function hashDeterministico(texto: string): number {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export class MockMaritimeTrackingProvider implements MaritimeTrackingProvider {
  readonly nombre = "mock";

  async buscarBuque(consulta: ConsultaBuque): Promise<InfoBuque | null> {
    const identificador = consulta.imo || consulta.mmsi || consulta.nombre;
    if (!identificador) return null;
    if (identificador.toUpperCase().includes("SINDATOS")) return null;

    const hash = hashDeterministico(identificador);
    // Latitud/longitud dentro de rangos navegables plausibles (no en tierra
    // firme ni en los polos), solo para que se vea razonable en pantalla.
    const latitud = (hash % 1800) / 10 - 90;
    const longitud = ((hash >> 8) % 3600) / 10 - 180;
    const velocidadNudos = 8 + (hash % 150) / 10; // 8.0 - 22.9 nudos
    const rumboGrados = hash % 360;
    const diasHastaEta = 1 + (hash % 20); // 1 a 20 días desde ahora

    return {
      nombre: consulta.nombre ?? null,
      imo: consulta.imo ?? null,
      mmsi: consulta.mmsi ?? null,
      latitud,
      longitud,
      velocidadNudos,
      rumboGrados,
      destino: null,
      etaEstimada: new Date(Date.now() + diasHastaEta * 24 * 60 * 60 * 1000),
      ultimaActualizacion: new Date(),
    };
  }

  async buscarContenedor(consulta: ConsultaContenedor): Promise<InfoContenedor | null> {
    if (consulta.numero.toUpperCase().includes("SINDATOS")) return null;

    const hash = hashDeterministico(consulta.numero);
    // Cuántos eventos de la secuencia ya "ocurrieron" — determinístico según
    // el hash, para simular contenedores en distintas etapas del viaje.
    const cantidadEventos = 1 + (hash % EVENTOS_CONTENEDOR_VALIDOS.length);
    const ahora = Date.now();
    const eventos: EventoContenedor[] = EVENTOS_CONTENEDOR_VALIDOS.slice(0, cantidadEventos).map(
      (tipo, idx) => ({
        tipo,
        // Eventos más antiguos primero: el último (más reciente) es "ahora".
        fecha: new Date(ahora - (cantidadEventos - 1 - idx) * 2 * 24 * 60 * 60 * 1000),
        ubicacion: null,
      }),
    );

    return { numero: consulta.numero, eventos };
  }
}
