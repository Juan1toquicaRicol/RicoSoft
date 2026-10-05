/**
 * Motor de seguimiento de Importaciones — funciones puras, sin I/O. Reciben
 * datos ya consultados (actividades, novedades existentes) y determinan:
 * qué actividad está vencida, qué actividad está bloqueada por una
 * dependencia sin completar, qué novedades automáticas deberían existir, y
 * cuál es la "situación actual" del expediente en lenguaje de negocio.
 *
 * Principio explícito del encargo: NUNCA se asume responsabilidad
 * ("culpa") sin evidencia suficiente. Toda novedad automática nace con origen
 * "PorDeterminar": que una actividad esté vencida o bloqueada, y quién tenga
 * asignada la actividad (responsableTipo/responsableNombre), solo es contexto
 * operativo para gestionarla; la causa la determina y valida una persona.
 */

export interface ActividadSeguimiento {
  id: string;
  ordenCompraId: string;
  nombre: string;
  etapa: string;
  responsableTipo: string;
  responsableNombre: string | null;
  fechaLimite: Date | null;
  fechaReal: Date | null;
  estado: string;
  dependeDeId: string | null;
}

export interface NovedadExistente {
  id: string;
  reglaOrigen: string | null;
  estado: string;
}

const ESTADOS_PENDIENTES = new Set(["Pendiente", "EnCurso"]);

/**
 * Actividades vencidas: fechaLimite ya pasó y la actividad sigue
 * Pendiente/EnCurso (nunca se marca vencida una ya Completada/Omitida).
 */
export function calcularActividadesVencidas(
  actividades: ActividadSeguimiento[],
  ahora: Date,
): ActividadSeguimiento[] {
  return actividades.filter(
    (a) =>
      a.fechaLimite !== null &&
      a.fechaLimite.getTime() < ahora.getTime() &&
      ESTADOS_PENDIENTES.has(a.estado),
  );
}

export interface ActividadBloqueada {
  actividad: ActividadSeguimiento;
  bloqueadaPor: ActividadSeguimiento;
}

/**
 * Actividades bloqueadas: dependen de otra actividad que todavía no está
 * Completada (ni Omitida — omitir no libera la dependencia automáticamente,
 * requiere criterio humano explícito sobre esa dependencia puntual).
 */
export function calcularActividadesBloqueadas(
  actividades: ActividadSeguimiento[],
): ActividadBloqueada[] {
  const porId = new Map(actividades.map((a) => [a.id, a]));
  const bloqueadas: ActividadBloqueada[] = [];
  for (const a of actividades) {
    if (!a.dependeDeId || !ESTADOS_PENDIENTES.has(a.estado)) continue;
    const dependencia = porId.get(a.dependeDeId);
    if (dependencia && dependencia.estado !== "Completada") {
      bloqueadas.push({ actividad: a, bloqueadaPor: dependencia });
    }
  }
  return bloqueadas;
}

export interface NovedadSugerida {
  tipo: string;
  descripcion: string;
  origen: "Interno" | "Externo" | "PorDeterminar";
  responsable: string | null;
  prioridad: "Alta" | "Media" | "Baja";
  fechaLimite: Date | null;
  accionRequerida: string;
  reglaOrigen: string;
}

/**
 * Novedades automáticas sugeridas por el estado actual de las actividades
 * — el llamador (controller) hace upsert por reglaOrigen contra
 * ImportacionNovedad (idempotente: no duplica si ya existe una abierta con
 * la misma regla, y si la condición ya no aplica, la resuelve automáticamente
 * — ver sincronizarNovedadesAutomaticas en el controller).
 *
 * Reglas implementadas en esta versión: actividad vencida, dependencia
 * bloqueada. "Documento faltante" e "Inconsistencia" (factura vs. packing
 * list) requieren datos que hoy no se capturan de forma estructurada
 * (cantidades declaradas por documento) — se dejan para cuando esa captura
 * exista, no se inventa la comparación.
 */
export function generarNovedadesSugeridas(
  actividades: ActividadSeguimiento[],
  ahora: Date,
): NovedadSugerida[] {
  const sugeridas: NovedadSugerida[] = [];

  for (const a of calcularActividadesVencidas(actividades, ahora)) {
    const diasRetraso = Math.floor(
      (ahora.getTime() - a.fechaLimite!.getTime()) / (24 * 60 * 60 * 1000),
    );
    sugeridas.push({
      tipo: "Retraso",
      descripcion: `"${a.nombre}" (${a.etapa}) lleva ${diasRetraso} día(s) vencida.`,
      // Una alerta no atribuye causa: el responsable de la actividad es
      // contexto operativo, no la parte que causó el retraso.
      origen: "PorDeterminar",
      responsable: a.responsableNombre ?? a.responsableTipo,
      prioridad: diasRetraso >= 5 ? "Alta" : "Media",
      fechaLimite: a.fechaLimite,
      accionRequerida: `Dar seguimiento a "${a.nombre}"`,
      reglaOrigen: `actividad-vencida:${a.id}`,
    });
  }

  for (const { actividad, bloqueadaPor } of calcularActividadesBloqueadas(actividades)) {
    sugeridas.push({
      tipo: "Bloqueo",
      descripcion: `"${actividad.nombre}" no puede avanzar: depende de "${bloqueadaPor.nombre}", que todavía no está completada.`,
      origen: "PorDeterminar",
      responsable: bloqueadaPor.responsableNombre ?? bloqueadaPor.responsableTipo,
      prioridad: "Media",
      fechaLimite: null,
      accionRequerida: `Completar "${bloqueadaPor.nombre}" para desbloquear`,
      reglaOrigen: `dependencia-bloqueada:${actividad.id}`,
    });
  }

  return sugeridas;
}

export interface SituacionActual {
  etapaActual: string;
  atencion: string | null;
  responsable: string | null;
  diasRetraso: number | null;
  proximaAccion: string | null;
}

/**
 * "Situación actual" en lenguaje de negocio — lo que se muestra en el
 * resumen del expediente sin que el usuario tenga que interpretar nada
 * técnico. Prioriza: 1) la actividad vencida más antigua (lo más urgente),
 * 2) si no hay vencidas, la próxima actividad pendiente por fecha límite,
 * 3) si no hay ninguna actividad pendiente, "Sin actividades pendientes".
 */
export function calcularSituacionActual(
  actividades: ActividadSeguimiento[],
  ahora: Date,
): SituacionActual {
  const vencidas = calcularActividadesVencidas(actividades, ahora).sort(
    (a, b) => a.fechaLimite!.getTime() - b.fechaLimite!.getTime(),
  );

  if (vencidas.length > 0) {
    const mas_urgente = vencidas[0];
    const diasRetraso = Math.floor(
      (ahora.getTime() - mas_urgente.fechaLimite!.getTime()) / (24 * 60 * 60 * 1000),
    );
    return {
      etapaActual: mas_urgente.etapa,
      atencion: mas_urgente.nombre,
      responsable: mas_urgente.responsableNombre ?? mas_urgente.responsableTipo,
      diasRetraso,
      proximaAccion: `Dar seguimiento a "${mas_urgente.nombre}"`,
    };
  }

  const pendientes = actividades
    .filter((a) => ESTADOS_PENDIENTES.has(a.estado))
    .sort((a, b) => {
      const fa = a.fechaLimite?.getTime() ?? Infinity;
      const fb = b.fechaLimite?.getTime() ?? Infinity;
      return fa - fb;
    });

  if (pendientes.length > 0) {
    const siguiente = pendientes[0];
    return {
      etapaActual: siguiente.etapa,
      atencion: null,
      responsable: siguiente.responsableNombre ?? siguiente.responsableTipo,
      diasRetraso: null,
      proximaAccion: siguiente.nombre,
    };
  }

  return {
    etapaActual: "Sin actividades registradas",
    atencion: null,
    responsable: null,
    diasRetraso: null,
    proximaAccion: null,
  };
}
