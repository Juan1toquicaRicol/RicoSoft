/**
 * Registro en memoria del estado de los procesos en background (schedulers
 * node-cron del propio proceso API). No hay cola ni worker externo: cada job
 * es un cron in-process, así que este registro vive en el mismo proceso que los
 * ejecuta y refleja lo que ESE proceso ha hecho desde que arrancó — si el
 * proceso se reinicia, el historial de ejecuciones empieza de cero (lo que sí
 * persiste, como SincronizacionSiesaLog, se consulta aparte).
 *
 * No inventa jobs: solo aparecen los declarados en JOBS_CONOCIDOS, y uno cuyo
 * scheduler no se registró (deshabilitado por configuración) figura como
 * NO_CONFIGURADO en vez de simular actividad.
 */

export interface DefinicionJob {
  id: string;
  nombre: string;
  descripcion: string;
  /** Variable de entorno que lo habilita (solo el NOMBRE, nunca su valor). */
  variableHabilitar: string;
}

export const JOBS_CONOCIDOS: DefinicionJob[] = [
  {
    id: "crosschex-sync",
    nombre: "Sincronización biométrica (CrossChex)",
    descripcion: "Trae las marcaciones de las fuentes biométricas activas.",
    variableHabilitar: "CROSSCHEX_SYNC_ENABLED",
  },
  {
    id: "servicios-renovacion",
    nombre: "Renovación de servicios",
    descripcion: "Revisa vencimientos de servicios/suscripciones y genera avisos.",
    variableHabilitar: "SERVICIOS_RENOVACION_SYNC_ENABLED",
  },
  {
    id: "tracking-maritimo",
    nombre: "Tracking marítimo de embarques",
    descripcion: "Sincroniza el estado de buques y contenedores de las importaciones en camino.",
    variableHabilitar: "TRACKING_MARITIMO_SYNC_ENABLED",
  },
  {
    id: "bandeja-ingesta",
    nombre: "Ingesta de correos de importaciones",
    descripcion: "Lee la bandeja de correo de importaciones y guarda los mensajes nuevos.",
    variableHabilitar: "IMPORTACIONES_EMAIL_SYNC_ENABLED",
  },
  {
    id: "bandeja-procesamiento",
    nombre: "Procesamiento de correos de importaciones",
    descripcion: "Clasifica y extrae datos de los documentos adjuntos de los correos ingeridos.",
    variableHabilitar: "IMPORTACIONES_PROCESSING_ENABLED",
  },
];

export type EstadoJob = "NO_CONFIGURADO" | "PROGRAMADO" | "EN_EJECUCION" | "OK" | "FALLIDO";

interface Ejecucion {
  inicio: Date;
  fin: Date;
  duracionMs: number;
  mensaje: string | null;
}

interface TareaConProximaEjecucion {
  getNextRun?: () => Date | null;
}

interface Interno {
  cron: string;
  tarea: TareaConProximaEjecucion | null;
  enEjecucionDesde: Date | null;
  /** Fallo que el propio ciclo reportó sin lanzar excepción (ver reportarFalloEnCorrida). */
  falloReportado: string | null;
  ultima: (Ejecucion & { exito: boolean }) | null;
  ultimaExitosa: Ejecucion | null;
  ultimaFallida: Ejecucion | null;
}

const registro = new Map<string, Interno>();

export function registrarScheduler(
  id: string,
  cron: string,
  tarea: TareaConProximaEjecucion | null,
): void {
  const previo = registro.get(id);
  registro.set(id, {
    cron,
    tarea,
    enEjecucionDesde: null,
    falloReportado: null,
    ultima: previo?.ultima ?? null,
    ultimaExitosa: previo?.ultimaExitosa ?? null,
    ultimaFallida: previo?.ultimaFallida ?? null,
  });
}

/** El scheduler se detuvo (shutdown/tests): vuelve a figurar como no configurado. */
export function quitarScheduler(id: string): void {
  registro.delete(id);
}

/**
 * Mensaje de error apto para mostrar: una sola línea y acotado. Nunca el stack
 * ni el objeto completo (podrían traer rutas internas o fragmentos de
 * conexión).
 */
export function resumirError(error: unknown, maxLongitud = 200): string {
  const texto = error instanceof Error ? error.message : String(error);
  const primeraLinea = texto.split(/\r?\n/)[0].trim();
  return primeraLinea.length > maxLongitud
    ? `${primeraLinea.slice(0, maxLongitud - 1)}…`
    : primeraLinea || "Error desconocido";
}

/**
 * Para ciclos que atrapan sus propios errores por diseño (p. ej. uno por
 * fuente, para que una no detenga a las demás) y por eso terminan "bien": les
 * permite dejar constancia de que la corrida en curso tuvo un fallo, sin
 * cambiar su contrato de no lanzar. Sin corrida en curso, no hace nada.
 */
export function reportarFalloEnCorrida(id: string, mensaje: string): void {
  const interno = registro.get(id);
  if (interno?.enEjecucionDesde) interno.falloReportado = resumirError(mensaje);
}

/**
 * Ejecuta una corrida del job registrando inicio, fin, duración y resultado.
 * Relanza el error para que el llamador conserve su propio manejo/log: el
 * registro observa, no traga excepciones.
 */
export async function ejecutarRegistrado<T>(id: string, corrida: () => Promise<T>): Promise<T> {
  const interno = registro.get(id);
  const inicio = new Date();
  if (interno) {
    interno.enEjecucionDesde = inicio;
    interno.falloReportado = null;
  }

  const cerrar = (mensaje: string | null) => {
    const actual = registro.get(id);
    if (!actual) return;
    const fin = new Date();
    const mensajeFinal = mensaje ?? actual.falloReportado;
    const ejecucion: Ejecucion = {
      inicio,
      fin,
      duracionMs: fin.getTime() - inicio.getTime(),
      mensaje: mensajeFinal,
    };
    actual.enEjecucionDesde = null;
    actual.falloReportado = null;
    actual.ultima = { ...ejecucion, exito: mensajeFinal === null };
    if (mensajeFinal === null) actual.ultimaExitosa = ejecucion;
    else actual.ultimaFallida = ejecucion;
  };

  try {
    const resultado = await corrida();
    cerrar(null);
    return resultado;
  } catch (error) {
    cerrar(resumirError(error));
    throw error;
  }
}

export interface JobEstado {
  id: string;
  nombre: string;
  descripcion: string;
  estado: EstadoJob;
  /** Solo para NO_CONFIGURADO: cómo habilitarlo. */
  motivo: string | null;
  cron: string | null;
  ultimaEjecucion: string | null;
  ultimaEjecucionExitosa: string | null;
  ultimaEjecucionFallida: string | null;
  duracionUltimaMs: number | null;
  /** Mensaje/error resumido de la última corrida fallida (null si la última fue OK). */
  mensajeUltimoError: string | null;
  proximaEjecucion: string | null;
}

const iso = (fecha: Date | null | undefined) => (fecha ? fecha.toISOString() : null);

export function listarEstadoJobs(): JobEstado[] {
  return JOBS_CONOCIDOS.map((def): JobEstado => {
    const base = {
      id: def.id,
      nombre: def.nombre,
      descripcion: def.descripcion,
    };
    const interno = registro.get(def.id);
    if (!interno) {
      return {
        ...base,
        estado: "NO_CONFIGURADO",
        motivo: `Deshabilitado en este servidor (${def.variableHabilitar} distinto de 'true').`,
        cron: null,
        ultimaEjecucion: null,
        ultimaEjecucionExitosa: null,
        ultimaEjecucionFallida: null,
        duracionUltimaMs: null,
        mensajeUltimoError: null,
        proximaEjecucion: null,
      };
    }

    let estado: EstadoJob = "PROGRAMADO";
    if (interno.enEjecucionDesde) estado = "EN_EJECUCION";
    else if (interno.ultima) estado = interno.ultima.exito ? "OK" : "FALLIDO";

    let proxima: Date | null = null;
    try {
      proxima = interno.tarea?.getNextRun?.() ?? null;
    } catch {
      proxima = null;
    }

    return {
      ...base,
      estado,
      motivo: null,
      cron: interno.cron,
      ultimaEjecucion: iso(interno.ultima?.inicio),
      ultimaEjecucionExitosa: iso(interno.ultimaExitosa?.inicio),
      ultimaEjecucionFallida: iso(interno.ultimaFallida?.inicio),
      duracionUltimaMs: interno.ultima?.duracionMs ?? null,
      mensajeUltimoError: interno.ultima && !interno.ultima.exito ? interno.ultima.mensaje : null,
      proximaEjecucion: iso(proxima),
    };
  });
}

/** Solo para tests. */
export function reiniciarRegistroJobs(): void {
  registro.clear();
}
