import fs from "fs";
import path from "path";
import { schedule, type ScheduledTask } from "node-cron";
import { ejecutarRegistrado, quitarScheduler, registrarScheduler } from "../../lib/job-registry";
import { prisma } from "../../config/prisma";
import { getTenantPrisma } from "../../lib/tenant-prisma";
import { resolverDestinatarios } from "../../lib/motor-destinatarios";
import { crearNotificacion } from "../../lib/notificaciones";
import { crearItemDeTrabajo } from "../../lib/inbox";
import { leerConfigProcesamientoImportaciones } from "../../integrations/email/config";
import { RegexDocumentExtractionProvider } from "../../integrations/document-extraction/regex-extraction-provider";
import type { DocumentExtractionProvider } from "../../integrations/document-extraction/extraction-provider";
import { clasificarCorreo } from "./importaciones-bandeja-clasificacion.service";
import { identificarProveedor, identificarOrden } from "./importaciones-bandeja-matching.service";
import {
  evaluarRequisitosDeOrden,
  requisitosFaltantes,
} from "./importaciones-bandeja-requisitos.service";

/**
 * Job de PROCESAMIENTO (§3) — separado de la ingesta a propósito. Recorre
 * los ImportacionCorreo en PENDIENTE, uno por uno, con límite por corrida
 * (evita que un correo con cientos de adjuntos bloquee el servidor — §3).
 * Un error en un correo concreto se persiste en `ultimoError` y ese correo
 * pasa a ERROR; nunca detiene el resto del lote.
 */

const LIMITE_CORREOS_POR_CORRIDA = 10;
const EVENTO_REVISION = "IMPORTACION_CORREO_REQUIERE_REVISION";

let extractionProvider: DocumentExtractionProvider = new RegexDocumentExtractionProvider();

/** Solo para tests. */
export function _establecerExtractionProviderParaTests(p: DocumentExtractionProvider): void {
  extractionProvider = p;
}

export async function ejecutarCicloProcesamientoCorreos(): Promise<void> {
  const config = leerConfigProcesamientoImportaciones();
  if (!config.habilitado) return;

  const pendientes = await prisma.importacionCorreo.findMany({
    where: { estadoProcesamiento: "PENDIENTE" },
    include: { adjuntos: true },
    orderBy: { fechaRecibido: "asc" },
    take: LIMITE_CORREOS_POR_CORRIDA,
  });

  for (const correo of pendientes) {
    try {
      await procesarUnCorreo(correo);
    } catch (error) {
      console.error(`[bandeja-procesamiento] Error procesando correo ${correo.id}:`, error);
      await prisma.importacionCorreo.update({
        where: { id: correo.id },
        data: {
          estadoProcesamiento: "ERROR",
          ultimoError: error instanceof Error ? error.message : "Error desconocido.",
        },
      });
    }
  }
}

interface CorreoConAdjuntos {
  id: string;
  remitente: string;
  asunto: string;
  tenantId: string | null;
  proveedorId: string | null;
  ordenCompraId: string | null;
  adjuntos: { id: string; nombreOriginal: string; mimeType: string; ruta: string }[];
}

async function procesarUnCorreo(correo: CorreoConAdjuntos): Promise<void> {
  // 0. Reprocesar es idempotente: lo derivado en una corrida anterior
  // (extracciones y excepciones aún abiertas) se reemplaza por el resultado
  // de esta. Las excepciones ya resueltas/descartadas por una persona se
  // conservan como historial; el proveedor u orden fijados (a mano o por una
  // corrida previa) se respetan más abajo.
  await prisma.importacionExtraccion.deleteMany({ where: { adjunto: { correoId: correo.id } } });
  await prisma.importacionCorreoAdjunto.updateMany({
    where: { correoId: correo.id },
    data: { estadoExtraccion: "PENDIENTE" },
  });
  await prisma.importacionExcepcion.updateMany({
    where: { correoId: correo.id, estado: "ABIERTA" },
    data: { estado: "DESCARTADA", resueltoEn: new Date() },
  });

  // 1. Clasificación (§4) — determinística, siempre disponible.
  const clasificacion = clasificarCorreo({
    asunto: correo.asunto,
    remitente: correo.remitente,
    nombresAdjuntos: correo.adjuntos.map((a) => a.nombreOriginal),
  });
  await prisma.importacionCorreo.update({
    where: { id: correo.id },
    data: { clasificacion, estadoProcesamiento: "CLASIFICADO" },
  });

  // 2. Extracción (§5) — solo el escalón determinístico en V1 (ver
  // extraction-provider.ts). Recorre cada adjunto que el proveedor de
  // extracción declare que puede procesar; los demás quedan con
  // estadoExtraccion=PENDIENTE (visible en el detalle como "sin procesar",
  // nunca oculto).
  const camposExtraidosPorCampo = new Map<string, { valor: string; pagina?: number }>();
  const adjuntosConErrorDeExtraccion: string[] = [];
  for (const adjunto of correo.adjuntos) {
    if (!extractionProvider.puedeProcesar(adjunto.mimeType)) continue;
    try {
      const rutaAbsoluta = path.join(
        __dirname,
        "..",
        "..",
        "..",
        "uploads",
        "importaciones-correos",
        adjunto.ruta,
      );
      const contenido = fs.readFileSync(rutaAbsoluta);
      const resultado = await extractionProvider.extraer(contenido, adjunto.mimeType);

      await prisma.importacionCorreoAdjunto.update({
        where: { id: adjunto.id },
        data: { estadoExtraccion: "EXTRAIDO" },
      });

      if (resultado.campos.length > 0) {
        await prisma.importacionExtraccion.createMany({
          data: resultado.campos.map((c) => ({
            adjuntoId: adjunto.id,
            campo: c.campo,
            valorExtraido: c.valor,
            pagina: c.pagina ?? null,
            motorUsado: resultado.motorUsado,
            confianza: c.confianza,
            evidencia: c.evidencia,
          })),
        });
        for (const c of resultado.campos) {
          if (!camposExtraidosPorCampo.has(c.campo)) {
            camposExtraidosPorCampo.set(c.campo, { valor: c.valor, pagina: c.pagina });
          }
        }
      }
    } catch (error) {
      console.error(`[bandeja-procesamiento] Error extrayendo adjunto ${adjunto.id}:`, error);
      await prisma.importacionCorreoAdjunto.update({
        where: { id: adjunto.id },
        data: { estadoExtraccion: "ERROR" },
      });
      adjuntosConErrorDeExtraccion.push(adjunto.nombreOriginal);
    }
  }
  await prisma.importacionCorreo.update({
    where: { id: correo.id },
    data: { estadoProcesamiento: "EXTRAIDO" },
  });

  // 3. Identificar proveedor (§8) — búsqueda GLOBAL (tenantId=null a
  // propósito, ver matching.service.ts): el remitente puede ser de
  // cualquier tenant, todavía no lo sabemos.
  // Si una persona ya asignó el proveedor (triage o resolución de excepción),
  // se respeta: nunca se vuelve a inferir por encima de esa decisión.
  let proveedor: { id: string; tenantId: string; nombre: string; nit: string } | null = null;
  if (correo.proveedorId && correo.tenantId) {
    proveedor = await prisma.proveedor.findFirst({
      where: { id: correo.proveedorId, tenantId: correo.tenantId },
      select: { id: true, tenantId: true, nombre: true, nit: true },
    });
  }
  if (!proveedor) {
    const resultadoProveedor = await identificarProveedor(null, {
      remitenteEmail: correo.remitente,
    });

    if (resultadoProveedor.tipo !== "UNICO") {
      await crearExcepcionProveedorNoIdentificado(correo.id, resultadoProveedor);
      return;
    }
    proveedor = resultadoProveedor.valor;
  }

  const tenantId = proveedor.tenantId;
  const tenantPrisma = getTenantPrisma(tenantId);

  await prisma.importacionCorreo.update({
    where: { id: correo.id },
    data: { tenantId, proveedorId: proveedor.id },
  });

  // Un adjunto que no se pudo leer nunca queda oculto: se reporta como
  // excepción para que una persona revise ese documento.
  if (adjuntosConErrorDeExtraccion.length > 0) {
    await crearExcepcion(tenantId, correo.id, {
      tipo: "OTRO",
      descripcion: `No se pudo extraer el contenido de ${adjuntosConErrorDeExtraccion.length} adjunto(s): ${adjuntosConErrorDeExtraccion.join(", ")}. Revisar manualmente.`,
    });
  }

  // 4. Identificar orden (§9). Una orden ya fijada por una persona se respeta,
  // siempre que siga siendo del mismo tenant y proveedor.
  const numeroOrdenExtraido = camposExtraidosPorCampo.get("numeroOrdenProveedor")?.valor;
  const ordenFijada = correo.ordenCompraId
    ? await prisma.ordenCompraIntl.findFirst({
        where: {
          id: correo.ordenCompraId,
          tenantId,
          proveedorId: proveedor.id,
          eliminado: false,
        },
        select: { id: true, numeroOrden: true, estado: true },
      })
    : null;
  const resultadoOrden = ordenFijada
    ? ({ tipo: "UNICO", valor: ordenFijada } as const)
    : await identificarOrden(tenantId, proveedor.id, numeroOrdenExtraido);

  if (resultadoOrden.tipo !== "UNICO") {
    await crearExcepcion(tenantId, correo.id, {
      tipo: resultadoOrden.tipo === "AMBIGUO" ? "ORDEN_NO_IDENTIFICADA" : "ORDEN_NO_IDENTIFICADA",
      descripcion:
        resultadoOrden.tipo === "AMBIGUO"
          ? `Varias órdenes de "${proveedor.nombre}" podrían corresponder a este correo.`
          : `No se encontró ninguna orden abierta de "${proveedor.nombre}" para este correo.`,
      candidatos: resultadoOrden.tipo === "AMBIGUO" ? resultadoOrden.candidatos : [],
    });
    await marcarRequiereRevision(tenantId, correo.id, proveedor.id);
    return;
  }

  await prisma.importacionCorreo.update({
    where: { id: correo.id },
    data: { ordenCompraId: resultadoOrden.valor.id, estadoProcesamiento: "MATCHEADO" },
  });

  // 5. Producto (§10): sin matching. Antes se buscaba en Siesa con el número de
  // orden del proveedor como si fuera referencia/descripción de producto, lo
  // que generaba PRODUCTO_NO_IDENTIFICADO espurias. No hay en los datos
  // extraídos un campo de producto que lo respalde, así que no se consulta Siesa.

  // 6. Requisitos del proveedor (§11) — reutiliza RequisitoProveedorImportacion tal cual.
  const estadosRequisitos = await evaluarRequisitosDeOrden(
    tenantId,
    proveedor.id,
    resultadoOrden.valor.id,
  );
  const faltantes = requisitosFaltantes(estadosRequisitos);
  if (faltantes.length > 0) {
    await crearExcepcion(tenantId, correo.id, {
      tipo: "REQUISITO_FALTANTE",
      descripcion: `Requisitos obligatorios pendientes de "${proveedor.nombre}": ${faltantes.map((f) => f.nombre).join(", ")}.`,
    });
  }

  const huboExcepciones = await prisma.importacionExcepcion.count({
    where: { correoId: correo.id, estado: "ABIERTA" },
  });

  if (huboExcepciones > 0) {
    await marcarRequiereRevision(tenantId, correo.id, proveedor.id);
  } else {
    await prisma.importacionCorreo.update({
      where: { id: correo.id },
      data: { estadoProcesamiento: "RESUELTO" },
    });
    // Notificar al responsable — automatización operativa segura (§12):
    // solo informa que un correo se procesó sin novedades, no toca datos
    // críticos.
    const destinatarios = await resolverDestinatarios(tenantPrisma, tenantId, EVENTO_REVISION, {
      responsableId: null,
    });
    for (const usuarioId of destinatarios) {
      await crearNotificacion({
        tenantId,
        usuarioId,
        tipo: EVENTO_REVISION,
        titulo: `Correo de ${proveedor.nombre} procesado`,
        mensaje: `"${correo.asunto}" se relacionó automáticamente sin inconsistencias.`,
        enlace: `/importaciones/bandeja/${correo.id}`,
        entidadTipo: "ImportacionCorreo",
        entidadId: correo.id,
      });
    }
  }
}

async function crearExcepcionProveedorNoIdentificado(
  correoId: string,
  resultado: { tipo: "AMBIGUO"; candidatos: unknown[] } | { tipo: "NINGUNO" },
): Promise<void> {
  await prisma.importacionExcepcion.create({
    data: {
      tenantId: null,
      correoId,
      tipo: "PROVEEDOR_NO_IDENTIFICADO",
      descripcion:
        resultado.tipo === "AMBIGUO"
          ? "Varios proveedores podrían corresponder al remitente de este correo."
          : "No se pudo identificar ningún proveedor a partir del remitente de este correo.",
      candidatos: resultado.tipo === "AMBIGUO" ? JSON.stringify(resultado.candidatos) : null,
    },
  });
  await prisma.importacionCorreo.update({
    where: { id: correoId },
    data: { estadoProcesamiento: "REQUIERE_REVISION" },
  });
}

async function crearExcepcion(
  tenantId: string,
  correoId: string,
  datos: { tipo: string; descripcion: string; candidatos?: unknown[] },
): Promise<void> {
  await prisma.importacionExcepcion.create({
    data: {
      tenantId,
      correoId,
      tipo: datos.tipo,
      descripcion: datos.descripcion,
      candidatos: datos.candidatos ? JSON.stringify(datos.candidatos) : null,
    },
  });
}

async function marcarRequiereRevision(
  tenantId: string,
  correoId: string,
  proveedorId: string,
): Promise<void> {
  await prisma.importacionCorreo.update({
    where: { id: correoId },
    data: { estadoProcesamiento: "REQUIERE_REVISION" },
  });

  const tenantPrisma = getTenantPrisma(tenantId);
  await crearItemDeTrabajo(tenantPrisma, {
    tenantId,
    tipo: EVENTO_REVISION,
    categoria: "REVISION",
    sourceModule: "importaciones-bandeja",
    sourceEntityTipo: "ImportacionCorreo",
    sourceEntityId: correoId,
    titulo: "Correo de importación requiere revisión",
    descripcion: "Se detectó una ambigüedad o inconsistencia que necesita confirmación manual.",
    prioridad: "ALTA",
    enlace: `/importaciones/bandeja/${correoId}`,
  });

  const destinatarios = await resolverDestinatarios(tenantPrisma, tenantId, EVENTO_REVISION, {
    responsableId: null,
  });
  for (const usuarioId of destinatarios) {
    await crearNotificacion({
      tenantId,
      usuarioId,
      tipo: EVENTO_REVISION,
      titulo: "Un correo de importación requiere revisión",
      mensaje: "Hay una ambigüedad o inconsistencia que necesita tu confirmación.",
      enlace: `/importaciones/bandeja/${correoId}`,
      entidadTipo: "ImportacionCorreo",
      entidadId: correoId,
    });
  }
  void proveedorId;
}

let tareaProgramada: ScheduledTask | null = null;

export function iniciarSchedulerProcesamientoCorreos(): ScheduledTask | null {
  const config = leerConfigProcesamientoImportaciones();
  if (!config.habilitado) {
    console.log(
      "[bandeja-procesamiento] Scheduler deshabilitado (IMPORTACIONES_PROCESSING_ENABLED distinto de 'true').",
    );
    return null;
  }
  if (tareaProgramada) return tareaProgramada;

  tareaProgramada = schedule(
    config.cronProcesamiento,
    () => {
      ejecutarRegistrado("bandeja-procesamiento", () => ejecutarCicloProcesamientoCorreos()).catch(
        (error) => {
          console.error(
            "[bandeja-procesamiento] Error inesperado en el ciclo de procesamiento:",
            error,
          );
        },
      );
    },
    { noOverlap: true, name: "bandeja-procesamiento-correos" },
  );
  registrarScheduler("bandeja-procesamiento", config.cronProcesamiento, tareaProgramada);
  console.log(
    `[bandeja-procesamiento] Scheduler iniciado (expresión cron: "${config.cronProcesamiento}").`,
  );
  return tareaProgramada;
}

export function detenerSchedulerProcesamientoCorreos(): void {
  tareaProgramada?.stop();
  tareaProgramada = null;
  quitarScheduler("bandeja-procesamiento");
}
