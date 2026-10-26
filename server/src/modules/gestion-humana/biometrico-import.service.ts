import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import {
  obtenerMarcacionesDesde,
  mapearTipoMarcacion,
  normalizarBit,
  parsearCheckTime,
  soloFecha,
} from "../../integrations/crosschex";

/**
 * Importación histórica desde CrossChex hacia MarcacionBiometrica (Fase 4).
 * No hace scheduler ni sincronización incremental (Fase 5) ni asociación
 * masiva de empleados (fuera de alcance de todo el proyecto): asume que
 * FuenteBiometrica y las asociaciones EmpleadoBiometrico que ya existan
 * fueron creadas de antemano (a mano, vía Prisma Studio o script de setup,
 * hasta que exista la Fase 6 con endpoints administrativos).
 *
 * Reutiliza exactamente la misma consulta paginada (obtenerMarcacionesDesde)
 * y la misma tabla de cursor/lock (FuenteBiometrica.lastProcessedLogId,
 * SincronizacionBiometricoLog) que usará la Fase 5 — la importación
 * histórica es, en los hechos, la primera corrida de esa misma máquina.
 */

const TAMANO_LOTE_DEFAULT = 1000;

export class SincronizacionEnCursoError extends Error {
  constructor(fuenteNombre: string) {
    super(
      `Ya existe una sincronización EN_CURSO para la fuente "${fuenteNombre}". Espera a que termine (o revisa si quedó huérfana por un proceso caído) antes de iniciar otra.`,
    );
    this.name = "SincronizacionEnCursoError";
  }
}

export class FuenteBiometricaNoEncontradaError extends Error {
  constructor(fuenteNombre: string) {
    super(
      `No existe una FuenteBiometrica con nombre "${fuenteNombre}". Créala primero (tenantId, proveedor, nombre) antes de importar.`,
    );
    this.name = "FuenteBiometricaNoEncontradaError";
  }
}

async function obtenerFuenteOrThrow(fuenteNombre: string) {
  const fuente = await prisma.fuenteBiometrica.findUnique({ where: { nombre: fuenteNombre } });
  if (!fuente) throw new FuenteBiometricaNoEncontradaError(fuenteNombre);
  return fuente;
}

export interface ReporteDryRunBiometrico {
  fuenteNombre: string;
  totalMarcacionesEncontradas: number;
  marcacionesConUsuarioConocido: number;
  marcacionesSinUsuarioConocido: number;
  usuariosUnicosConocidos: number;
  /** externalUserId sin asociación, para revisión administrativa (rule 31/11). */
  usuariosUnicosDesconocidos: string[];
  porTipo: Record<string, number>;
  primerLogid: number | null;
  ultimoLogid: number | null;
}

/**
 * Recorre CrossChex por lotes SIN escribir nada, para dimensionar la
 * importación antes de comprometerse (rule 31). Memoria acotada: solo se
 * acumulan contadores y sets de externalUserId, nunca las 239k filas.
 */
export async function dryRunImportacionHistorica(
  fuenteNombre: string,
  tamanoLote = TAMANO_LOTE_DEFAULT,
): Promise<ReporteDryRunBiometrico> {
  const fuente = await obtenerFuenteOrThrow(fuenteNombre);

  let cursor = fuente.lastProcessedLogId;
  let totalMarcacionesEncontradas = 0;
  let marcacionesConUsuarioConocido = 0;
  let marcacionesSinUsuarioConocido = 0;
  let primerLogid: number | null = null;
  let ultimoLogid: number | null = null;
  const porTipo: Record<string, number> = {};
  const conocidos = new Set<string>();
  const desconocidos = new Set<string>();

  for (;;) {
    const lote = await obtenerMarcacionesDesde(cursor, tamanoLote);
    if (lote.length === 0) break;

    totalMarcacionesEncontradas += lote.length;
    if (primerLogid === null) primerLogid = lote[0].Logid;
    ultimoLogid = lote[lote.length - 1].Logid;

    const idsUnicos = [...new Set(lote.map((fila) => fila.userid))];
    const vinculados = await prisma.empleadoBiometrico.findMany({
      where: {
        tenantId: fuente.tenantId,
        proveedor: fuente.proveedor,
        externalUserId: { in: idsUnicos },
      },
      select: { externalUserId: true },
    });
    const idsConocidosLote = new Set(vinculados.map((v) => v.externalUserId));

    for (const fila of lote) {
      const tipo = mapearTipoMarcacion(fila.CheckType);
      porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
      if (idsConocidosLote.has(fila.userid)) marcacionesConUsuarioConocido++;
      else marcacionesSinUsuarioConocido++;
    }
    for (const id of idsUnicos) {
      if (idsConocidosLote.has(id)) conocidos.add(id);
      else desconocidos.add(id);
    }

    cursor = ultimoLogid;
    if (lote.length < tamanoLote) break;
  }

  return {
    fuenteNombre,
    totalMarcacionesEncontradas,
    marcacionesConUsuarioConocido,
    marcacionesSinUsuarioConocido,
    usuariosUnicosConocidos: conocidos.size,
    usuariosUnicosDesconocidos: [...desconocidos],
    porTipo,
    primerLogid,
    ultimoLogid,
  };
}

export interface ProgresoImportacionBiometrica {
  procesados: number;
}

export interface ReporteImportacionBiometrica {
  fuenteNombre: string;
  logIdDesde: number;
  logIdHasta: number | null;
  leidos: number;
  insertados: number;
  duplicados: number;
  sinEmpleado: number;
  erroresCount: number;
  estado: "COMPLETADO" | "FALLIDO";
  mensajeError?: string;
}

/**
 * Importa/sincroniza por lotes desde `FuenteBiometrica.lastProcessedLogId`
 * en adelante. Cada lote se procesa en una única transacción Prisma que
 * inserta las marcaciones (idempotente vía filtrar ya-existentes + el unique
 * [fuenteId, externalLogId] como red final) Y avanza el cursor — nunca se
 * avanza el cursor si el insert no se confirmó (rule 19). El lock contra
 * corridas concurrentes de la misma fuente lo da el índice único filtrado
 * SincronizacionBiometricoLog_fuenteId_en_curso_uq (Fase 2.1): si ya hay una
 * fila EN_CURSO, este create falla con P2002 y se aborta temprano.
 *
 * Es la MISMA función para la importación histórica (Fase 4, invocada una
 * vez desde el CLI) y para la sincronización incremental automática (Fase
 * 5, invocada cada minuto por el scheduler): la importación histórica no es
 * más que la primera corrida de esta máquina, arrancando desde
 * lastProcessedLogId = 0. `ejecutarImportacionHistorica` se mantiene como
 * alias por compatibilidad con el script de la Fase 4.
 */
export async function sincronizarFuenteBiometrica(
  fuenteNombre: string,
  opciones: {
    tamanoLote?: number;
    onProgreso?: (progreso: ProgresoImportacionBiometrica) => void;
  } = {},
): Promise<ReporteImportacionBiometrica> {
  const tamanoLote = opciones.tamanoLote ?? TAMANO_LOTE_DEFAULT;
  const fuente = await obtenerFuenteOrThrow(fuenteNombre);

  let log;
  try {
    log = await prisma.sincronizacionBiometricoLog.create({
      data: {
        tenantId: fuente.tenantId,
        fuenteId: fuente.id,
        estado: "EN_CURSO",
        logIdDesde: fuente.lastProcessedLogId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SincronizacionEnCursoError(fuenteNombre);
    }
    throw error;
  }

  let cursor = fuente.lastProcessedLogId;
  let leidos = 0;
  let insertados = 0;
  let duplicados = 0;
  let sinEmpleado = 0;
  let ultimoLogid: number | null = null;

  try {
    for (;;) {
      const lote = await obtenerMarcacionesDesde(cursor, tamanoLote);
      if (lote.length === 0) break;

      const idsUnicos = [...new Set(lote.map((fila) => fila.userid))];
      const vinculos = await prisma.empleadoBiometrico.findMany({
        where: {
          tenantId: fuente.tenantId,
          proveedor: fuente.proveedor,
          externalUserId: { in: idsUnicos },
          activo: true,
        },
        select: {
          externalUserId: true,
          empleadoId: true,
          empleado: { select: { empresaId: true } },
        },
      });
      const mapaEmpleado = new Map(vinculos.map((v) => [v.externalUserId, v]));

      let sinEmpleadoLote = 0;
      const dataLote: Prisma.MarcacionBiometricaCreateManyInput[] = lote.map((fila) => {
        const vinculo = mapaEmpleado.get(fila.userid);
        if (!vinculo) sinEmpleadoLote++;
        return {
          tenantId: fuente.tenantId,
          fuenteId: fuente.id,
          empleadoId: vinculo?.empleadoId ?? null,
          empresaId: vinculo?.empleado.empresaId ?? null,
          externalLogId: String(fila.Logid),
          externalUserId: fila.userid,
          horaMarcacion: parsearCheckTime(fila.CheckTime),
          fecha: soloFecha(fila.CheckTime),
          checkType: fila.CheckType,
          tipoMarcacion: mapearTipoMarcacion(fila.CheckType),
          dispositivoId:
            fila.Sensorid !== null && fila.Sensorid !== undefined ? String(fila.Sensorid) : null,
          workType: fila.WorkType,
          attFlag: fila.AttFlag,
          checked: normalizarBit(fila.Checked),
          exported: normalizarBit(fila.Exported),
          openDoorFlag: normalizarBit(fila.OpenDoorFlag),
        };
      });

      const loteMaxLogid = lote[lote.length - 1].Logid;

      // SQL Server no soporta `skipDuplicates` en createMany (a diferencia de
      // Postgres/SQLite) — Prisma ni siquiera expone la opción para este
      // provider. La idempotencia real la sigue garantizando el índice único
      // [fuenteId, externalLogId] a nivel de BD; esta consulta previa es solo
      // para no reintentar duplicados a propósito en cada re-corrida (más
      // rápido que dejar que el motor rechace uno por uno).
      await prisma.$transaction(async (tx) => {
        const yaExistentes = await tx.marcacionBiometrica.findMany({
          where: {
            fuenteId: fuente.id,
            externalLogId: { in: dataLote.map((d) => d.externalLogId) },
          },
          select: { externalLogId: true },
        });
        const idsExistentes = new Set(yaExistentes.map((m) => m.externalLogId));
        const dataNueva = dataLote.filter((d) => !idsExistentes.has(d.externalLogId));

        if (dataNueva.length > 0) {
          await tx.marcacionBiometrica.createMany({ data: dataNueva });
        }
        insertados += dataNueva.length;
        duplicados += dataLote.length - dataNueva.length;

        await tx.fuenteBiometrica.update({
          where: { id: fuente.id },
          data: { lastProcessedLogId: loteMaxLogid },
        });
      });

      sinEmpleado += sinEmpleadoLote;
      leidos += lote.length;
      cursor = loteMaxLogid;
      ultimoLogid = loteMaxLogid;
      opciones.onProgreso?.({ procesados: leidos });

      if (lote.length < tamanoLote) break;
    }

    await prisma.sincronizacionBiometricoLog.update({
      where: { id: log.id },
      data: {
        estado: "COMPLETADO",
        finalizadoEn: new Date(),
        logIdHasta: ultimoLogid,
        leidos,
        insertados,
        duplicados,
        sinEmpleado,
      },
    });

    return {
      fuenteNombre,
      logIdDesde: log.logIdDesde,
      logIdHasta: ultimoLogid,
      leidos,
      insertados,
      duplicados,
      sinEmpleado,
      erroresCount: 0,
      estado: "COMPLETADO",
    };
  } catch (error) {
    const mensajeError = (error as Error)?.message ?? "Error desconocido";
    await prisma.sincronizacionBiometricoLog.update({
      where: { id: log.id },
      data: {
        estado: "FALLIDO",
        finalizadoEn: new Date(),
        logIdHasta: ultimoLogid,
        leidos,
        insertados,
        duplicados,
        sinEmpleado,
        erroresCount: 1,
        mensajeError: mensajeError.slice(0, 4000),
      },
    });

    return {
      fuenteNombre,
      logIdDesde: log.logIdDesde,
      logIdHasta: ultimoLogid,
      leidos,
      insertados,
      duplicados,
      sinEmpleado,
      erroresCount: 1,
      estado: "FALLIDO",
      mensajeError,
    };
  }
}

/** Alias histórico (Fase 4): el script `importar-historico-crosschex.ts` y
 * sus tests siguen llamando este nombre. Misma función, ver docstring de
 * `sincronizarFuenteBiometrica`. */
export const ejecutarImportacionHistorica = sincronizarFuenteBiometrica;
