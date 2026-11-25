import { operadorBandeja } from "./bandeja-operacion";
import { responsableValido } from "./buzones-importaciones.service";
import { extraerIdentidadProveedor } from "../../integrations/document-extraction/regex-extraction-provider";
import fs from "fs";
import path from "path";
import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { getTenantPrisma } from "../../lib/tenant-prisma";
import { z } from "zod";
import { ConflictoVinculoCorreo, vincularOrdenCorreo } from "./importaciones-bandeja-vinculo";
import { sugerirProveedores } from "./importaciones-bandeja-matching.service";
import { resolverItemDeTrabajo } from "../../lib/inbox";
import {
  leerConfigEmailImportaciones,
  leerConfigProcesamientoImportaciones,
} from "../../integrations/email/config";

const UPLOADS_DIR_CORREOS = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "uploads",
  "importaciones-correos",
);
const EVENTO_REVISION = "IMPORTACION_CORREO_REQUIERE_REVISION";

/**
 * Endpoints de la Bandeja Inteligente de Importaciones — TODOS
 * tenant-scoped manualmente (mismo patrón que el resto de
 * importaciones.controller.ts: `prisma` directo + `where: { tenantId }`
 * explícito en cada consulta, nunca confiando en req.body/params.tenantId).
 * Los dos endpoints que operan sobre correos SIN tenant resuelto todavía
 * (PROVEEDOR_NO_IDENTIFICADO) quedan fuera de las rutas de cada empresa.
 */

function correoReprocesable(correo: { estadoProcesamiento: string; ingestaCompleta: boolean; reprocesoHistorico: boolean }, historico: boolean, tenantId: string) {
  if (!correo.ingestaCompleta || correo.reprocesoHistorico) return false;
  if (!historico) return ["ERROR", "REQUIERE_REVISION"].includes(correo.estadoProcesamiento);
  return tenantId === process.env.IMPORTACIONES_SISTEMAS_TENANT_ID
    && ["PENDIENTE", "ERROR", "REQUIERE_REVISION"].includes(correo.estadoProcesamiento);
}

export const listarCorreosBandeja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { estado, proveedorId, ordenCompraId, clasificacion, requiereRevision } = req.query;

    const correos = await prisma.importacionCorreo.findMany({
      where: {
        tenantId,
        ...(typeof estado === "string" ? { estadoProcesamiento: estado } : {}),
        ...(typeof proveedorId === "string" ? { proveedorId } : {}),
        ...(typeof ordenCompraId === "string" ? { ordenCompraId } : {}),
        ...(typeof clasificacion === "string" ? { clasificacion } : {}),
        ...(requiereRevision === "true" ? { estadoProcesamiento: "REQUIERE_REVISION" } : {}),
      },
      select: {
        id: true,
        remitente: true,
        asunto: true,
        fechaRecibido: true,
        estadoProcesamiento: true,
        clasificacion: true,
        proveedor: { select: { id: true, nombre: true } },
        ordenCompra: { select: { id: true, numeroOrden: true } },
        responsable: { select: { id: true, nombre: true } },
        origenes: { where: { buzon: { tenantId } }, select: { buzon: { select: { direccion: true } } },
          orderBy: { detectadoEn: "asc" } },
        _count: { select: { adjuntos: true, excepciones: true } },
      },
      orderBy: { fechaRecibido: "desc" },
    });

    return res.json(correos);
  } catch (error) {
    console.error("Error al listar correos de la Bandeja:", error);
    return res.status(500).json({ message: "Error al obtener los correos." });
  }
};

export const obtenerCorreoBandeja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const correo = await prisma.importacionCorreo.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        proveedor: { select: { id: true, nombre: true, nit: true } },
        ordenCompra: { select: { id: true, numeroOrden: true, estado: true } },
        responsable: { select: { id: true, nombre: true } },
        origenes: { where: { buzon: { tenantId } }, select: { buzon: { select: { direccion: true } } },
          orderBy: { detectadoEn: "asc" } },
        adjuntos: {
          select: {
            id: true,
            nombreOriginal: true,
            mimeType: true,
            tamano: true,
            estadoExtraccion: true,
            extracciones: {
              select: {
                id: true,
                campo: true,
                valorExtraido: true,
                pagina: true,
                motorUsado: true,
                confianza: true,
                evidencia: true,
              },
            },
          },
        },
        excepciones: { where: { tenantId }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!correo) return res.status(404).json({ message: "Correo no encontrado." });

    const sugerencias = correo.proveedorId
      ? []
      : await sugerirProveedores(tenantId, {
          remitenteEmail: correo.remitente,
          campos: [
            ...extraerIdentidadProveedor(correo.cuerpoTexto),
            ...correo.adjuntos.flatMap((a) =>
              a.extracciones.map((c) => ({ campo: c.campo, valor: c.valorExtraido })),
            ),
          ],
        });
    return res.json({
      ...correo,
      reprocesable: correoReprocesable(correo, !correo.origenes?.length, tenantId),
      sugerenciasProveedor: sugerencias.map(({ id, nombre, señales }) => ({ id, nombre, señales })),
    });
  } catch (error) {
    console.error("Error al obtener el correo de la Bandeja:", error);
    return res.status(500).json({ message: "Error al obtener el correo." });
  }
};

/** Sirve el contenido del adjunto — NUNCA una URL pública/estática: valida
 * tenant del correo dueño del adjunto antes de leer el archivo del disco,
 * mismo patrón que obtenerDocumentoExpedienteAduanero. */
export const buscarOrdenesVinculables = async (req: AuthenticatedRequest, res: Response) => {
  const parametros = z
    .object({ id: z.string().uuid(), q: z.string().trim().max(50).optional() })
    .safeParse({ id: req.params.id, q: req.query.q });
  if (!parametros.success) return res.status(400).json({ message: "Búsqueda inválida." });
  try {
    const tenantId = req.user!.tenantId;
    const correo = await prisma.importacionCorreo.findFirst({
      where: { id: parametros.data.id, tenantId },
      select: { proveedorId: true, ordenCompraId: true, estadoProcesamiento: true },
    });
    if (!correo) return res.status(404).json({ message: "Correo no encontrado." });
    if (
      !correo.proveedorId ||
      correo.ordenCompraId ||
      correo.estadoProcesamiento !== "REQUIERE_REVISION"
    ) {
      return res.json([]);
    }
    return res.json(
      await prisma.ordenCompraIntl.findMany({
        where: {
          tenantId,
          proveedorId: correo.proveedorId,
          eliminado: false,
          estado: { not: "Anulada" },
          ...(parametros.data.q ? { numeroOrden: { contains: parametros.data.q } } : {}),
        },
        select: { id: true, numeroOrden: true, estado: true },
        orderBy: { fechaOrden: "desc" },
        take: 25,
      }),
    );
  } catch (error) {
    console.error("Error al buscar órdenes vinculables:", error);
    return res.status(500).json({ message: "Error al buscar órdenes." });
  }
};

export const obtenerAdjuntoBandeja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, adjuntoId } = req.params;

    const correo = await prisma.importacionCorreo.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!correo) return res.status(404).json({ message: "Correo no encontrado." });

    const adjunto = await prisma.importacionCorreoAdjunto.findFirst({
      where: { id: adjuntoId, correoId: correo.id },
    });
    if (!adjunto) return res.status(404).json({ message: "Adjunto no encontrado." });

    const rutaAbsoluta = path.join(UPLOADS_DIR_CORREOS, adjunto.ruta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en disco." });
    }

    res.setHeader("Content-Type", adjunto.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(adjunto.nombreOriginal)}"`,
    );
    return fs.createReadStream(rutaAbsoluta).pipe(res);
  } catch (error) {
    console.error("Error al servir el adjunto de la Bandeja:", error);
    return res.status(500).json({ message: "Error al obtener el adjunto." });
  }
};

/**
 * Resolución humana (§18): el usuario decide entre los candidatos que la
 * automatización no pudo elegir sola, o descarta la excepción. Queda
 * auditado (Auditoria, con usuarioId real — a diferencia del resto del
 * pipeline, que es 100% automático y nunca usa Auditoria, ver §15 de la
 * especificación).
 */
const ACCIONES_EXCEPCION_VALIDAS = ["SELECCIONAR_PROVEEDOR", "SELECCIONAR_ORDEN", "DESCARTAR"];

/** Datos del evento IMPORTACION_EXCEPCION_RESUELTA: un único formato para
 * todas las acciones, del que dependen los reportes de auditoría. */
function auditoriaExcepcionResuelta(datos: {
  tenantId: string;
  usuarioId: string;
  nombreUsuario: string;
  excepcion: { id: string; tipo: string; estado: string };
  asuntoCorreo: string;
  accion: string;
}) {
  const estadoNuevo = datos.accion === "DESCARTAR" ? "DESCARTADA" : "RESUELTA";
  return {
    tenantId: datos.tenantId,
    usuarioId: datos.usuarioId,
    accion: "IMPORTACION_EXCEPCION_RESUELTA",
    detalle: `${datos.nombreUsuario} resolvió la excepción "${datos.excepcion.tipo}" del correo "${datos.asuntoCorreo}" (${datos.accion}).`,
    entidadTipo: "ImportacionExcepcion",
    entidadId: datos.excepcion.id,
    datosAnteriores: JSON.stringify({ estado: datos.excepcion.estado }),
    datosNuevos: JSON.stringify({ estado: estadoNuevo, accion: datos.accion }),
  };
}

export const resolverExcepcionBandeja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const usuarioId = req.user!.id;
    const { id, excepcionId } = req.params;
    const { accion, proveedorId, ordenCompraId } = req.body;

    const correo = await prisma.importacionCorreo.findFirst({ where: { id, tenantId } });
    if (!correo) return res.status(404).json({ message: "Correo no encontrado." });

    const excepcion = await prisma.importacionExcepcion.findFirst({
      where: { id: excepcionId, correoId: correo.id, tenantId },
    });
    if (!excepcion) return res.status(404).json({ message: "Excepción no encontrada." });
    if (excepcion.estado !== "ABIERTA") {
      return res.status(409).json({ message: "Esta excepción ya fue resuelta o descartada." });
    }

    if (!ACCIONES_EXCEPCION_VALIDAS.includes(accion)) {
      return res.status(400).json({ message: "Acción de resolución no válida." });
    }

    const datosAuditoria = auditoriaExcepcionResuelta({
      tenantId,
      usuarioId,
      nombreUsuario: req.user!.nombre,
      excepcion,
      asuntoCorreo: correo.asunto,
      accion,
    });
    const dataCorreo: { proveedorId?: string } = {};

    if (accion === "SELECCIONAR_PROVEEDOR") {
      if (excepcion.tipo !== "PROVEEDOR_NO_IDENTIFICADO") {
        return res.status(400).json({
          message: "Esta acción solo aplica a excepciones de proveedor no identificado.",
        });
      }
      if (typeof proveedorId !== "string" || !proveedorId) {
        return res.status(400).json({ message: "Falta proveedorId." });
      }
      const proveedor = await prisma.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedor) return res.status(404).json({ message: "Proveedor no encontrado." });
      dataCorreo.proveedorId = proveedorId;
    } else if (accion === "SELECCIONAR_ORDEN") {
      if (excepcion.tipo !== "ORDEN_NO_IDENTIFICADA") {
        return res.status(400).json({
          message: "Esta acción solo aplica a excepciones de orden no identificada.",
        });
      }
      if (typeof ordenCompraId !== "string" || !ordenCompraId) {
        return res.status(400).json({ message: "Falta ordenCompraId." });
      }
      if (!correo.proveedorId) {
        return res
          .status(409)
          .json({ message: "El correo no tiene un proveedor asociado; asígnalo primero." });
      }
      const orden = await prisma.ordenCompraIntl.findFirst({
        where: { id: ordenCompraId, tenantId, eliminado: false, estado: { not: "Anulada" } },
      });
      if (!orden) return res.status(404).json({ message: "Orden no encontrada." });
      if (orden.proveedorId !== correo.proveedorId) {
        return res
          .status(409)
          .json({ message: "La orden seleccionada no pertenece al proveedor de este correo." });
      }
      const proveedorConfirmado = correo.proveedorId;
      // Vínculo, resolución de la excepción y sus dos eventos de auditoría
      // (IMPORTACION_CORREO_ORDEN_VINCULADA e IMPORTACION_EXCEPCION_RESUELTA)
      // se confirman o se revierten juntos.
      await prisma.$transaction(async (tx) => {
        await vincularOrdenCorreo(tx, {
          correoId: correo.id,
          tenantId,
          proveedorId: proveedorConfirmado,
          ordenId: orden.id,
          usuarioId,
          excepcionId: excepcion.id,
        });
        await tx.auditoria.create({ data: datosAuditoria });
      });
      return res.status(204).send();
    }
    // DESCARTAR no toca el correo, solo cierra la excepción.
    const reanudaProcesamiento = Object.keys(dataCorreo).length > 0;

    await prisma.$transaction([
      prisma.importacionExcepcion.update({
        where: { id: excepcion.id },
        data: {
          estado: accion === "DESCARTAR" ? "DESCARTADA" : "RESUELTA",
          resueltoPorId: usuarioId,
          resueltoEn: new Date(),
        },
      }),
      // Elegir proveedor u orden no cierra el correo: lo reencola para que el
      // pipeline continúe (orden, requisitos) respetando la elección humana.
      ...(reanudaProcesamiento
        ? [
            prisma.importacionCorreo.update({
              where: { id: correo.id },
              data: { ...dataCorreo, estadoProcesamiento: "PENDIENTE", ultimoError: null,
                ...(tenantId === process.env.IMPORTACIONES_SISTEMAS_TENANT_ID ? { reprocesoHistorico: true } : {}) },
            }),
          ]
        : []),
      prisma.auditoria.create({ data: datosAuditoria }),
    ]);

    // Si ya no quedan excepciones abiertas para este correo, se resuelve el
    // InboxItem asociado — mismo patrón idempotente que Solicitudes de
    // Compra (resolverItemDeTrabajo nunca lanza).
    const abiertasRestantes = await prisma.importacionExcepcion.count({
      where: { correoId: correo.id, estado: "ABIERTA" },
    });
    if (abiertasRestantes === 0 && !reanudaProcesamiento) {
      const tenantPrisma = getTenantPrisma(tenantId);
      await resolverItemDeTrabajo(tenantPrisma, {
        tenantId,
        sourceModule: "importaciones-bandeja",
        sourceEntityId: correo.id,
        tipo: EVENTO_REVISION,
        resolvedByUsuarioId: usuarioId,
      });
      await prisma.importacionCorreo.update({
        where: { id: correo.id },
        data: { estadoProcesamiento: "RESUELTO" },
      });
    }

    return res.status(204).send();
  } catch (error) {
    if (error instanceof ConflictoVinculoCorreo)
      return res.status(409).json({ message: error.message });
    console.error("Error al resolver excepción de la Bandeja:", error);
    return res.status(500).json({ message: "Error al resolver la excepción." });
  }
};

/**
 * Estado de configuración de la Bandeja (§28: "cómo activar/desactivar
 * sincronización") — SOLO estado, nunca el secreto de la cuenta de
 * servicio ni el JSON completo. Útil para que un administrador confirme si
 * la ingesta/procesamiento están encendidos sin tener que mirar el .env del
 * servidor directamente.
 */
export const obtenerConfiguracionBandeja = async (_req: AuthenticatedRequest, res: Response) => {
  const configEmail = leerConfigEmailImportaciones();
  const configProcesamiento = leerConfigProcesamientoImportaciones();
  return res.json({
    ingestaHabilitada: configEmail.habilitado,
    procesamientoHabilitado: configProcesamiento.habilitado,
    cronIngesta: configProcesamiento.cronIngesta,
    cronProcesamiento: configProcesamiento.cronProcesamiento,
  });
};

/**
 * Reencola manualmente un correo en ERROR/REQUIERE_REVISION para que el
 * próximo tick del job de procesamiento lo reintente — sin esto, un correo
 * que falló por una causa ya corregida (ej. Siesa estaba caído) se quedaría
 * en ERROR para siempre, ya que el job de procesamiento solo mira
 * PENDIENTE.
 */
export const reprocesarCorreoBandeja = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const correo = await prisma.importacionCorreo.findFirst({
      where: { id: req.params.id, tenantId },
    });
    if (!correo) return res.status(404).json({ message: "Correo no encontrado." });
    const origen = await prisma.importacionCorreoOrigen.findFirst({
      where: { correoId: correo.id, buzon: { tenantId } }, select: { id: true },
    });
    const historico = !origen;
    if (!correoReprocesable(correo, historico, tenantId)) {
      return res.status(409).json({ message: "El correo no se puede reprocesar en su estado actual." });
    }
    const cambio = await prisma.$transaction(async (tx) => {
      const resultado = await tx.importacionCorreo.updateMany({
        where: { id: correo.id, tenantId, estadoProcesamiento: correo.estadoProcesamiento,
          reprocesoHistorico: correo.reprocesoHistorico },
        data: { estadoProcesamiento: "PENDIENTE", ultimoError: null, reprocesoHistorico: historico },
      });
      if (!resultado.count) return false;
      await tx.auditoria.create({ data: {
        tenantId, usuarioId: req.user!.id, accion: "IMPORTACION_CORREO_REPROCESADO",
        detalle: "Correo reencolado para reprocesamiento.", entidadTipo: "ImportacionCorreo",
        entidadId: correo.id,
      } });
      return true;
    });
    if (!cambio) return res.status(409).json({ message: "El estado del correo cambió." });
    return res.status(204).send();
  } catch (error) {
    console.error("Error al reencolar el correo para reprocesamiento:", error);
    return res.status(500).json({ message: "Error al reencolar el correo." });
  }
};

export const reasignarCorreoBandeja = async (req: AuthenticatedRequest, res: Response) => {
  const actor = req.user!;
  if (!operadorBandeja(actor)) return res.sendStatus(403);
  const entrada = z.object({ responsableUsuarioId: z.string().uuid().nullable() }).strict().safeParse(req.body);
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success || !entrada.success) return res.status(400).json({ message: "Responsable o correo inválido." });

  const { responsableUsuarioId } = entrada.data;
  try {
    if (responsableUsuarioId && !(await responsableValido(actor.tenantId, responsableUsuarioId))) {
      return res.status(400).json({ message: "El responsable debe estar activo en Ricol." });
    }
    const resultado = await prisma.$transaction(async (tx) => {
      const anterior = await tx.importacionCorreo.findFirst({
        where: { id: id.data, tenantId: actor.tenantId }, select: { responsableUsuarioId: true },
      });
      if (!anterior) return 404;
      if (anterior.responsableUsuarioId === responsableUsuarioId) return 204;
      const cambio = await tx.importacionCorreo.updateMany({
        where: { id: id.data, tenantId: actor.tenantId, responsableUsuarioId: anterior.responsableUsuarioId },
        data: { responsableUsuarioId },
      });
      if (!cambio.count) return 409;
      await tx.auditoria.create({ data: {
        tenantId: actor.tenantId, usuarioId: actor.id, accion: "IMPORTACION_CORREO_RESPONSABLE_CAMBIADO",
        entidadTipo: "ImportacionCorreo", entidadId: id.data, detalle: "Responsable del correo actualizado.",
        datosAnteriores: JSON.stringify(anterior), datosNuevos: JSON.stringify({ responsableUsuarioId }),
      } });
      return 204;
    });
    if (resultado === 204) return res.status(204).send();
    return res.status(resultado).json({ message: resultado === 404 ? "Correo no encontrado." : "El responsable cambió." });
  } catch (error) {
    console.error("Error al reasignar un correo de Importaciones:", error);
    return res.status(500).json({ message: "No se pudo reasignar el correo." });
  }
};

// --- Triage de correos SIN tenant resuelto (PROVEEDOR_NO_IDENTIFICADO) ---
// DENEGADO a propósito. Estos correos no tienen tenant, así que listarlos o
// asignarlos cruza el límite entre empresas. `isSuperadmin` de la sesión es
// un flag POR TENANT (usuario hogar o Membresia), no una identidad de
// plataforma: usarlo aquí permitiría que el superadmin de una empresa leyera
// correos de todas y los reasignara a un proveedor de cualquiera. Hasta que
// el responsable del proyecto apruebe una identidad de plataforma, ninguna
// ruta lista ni asigna estos correos (quedan en REQUIERE_REVISION con
// tenantId null). Ver MEMORY.md (2026-09-28, pendientes).
export const denegarTriageSinTenant = (_req: AuthenticatedRequest, res: Response) => {
  return res.status(403).json({
    message:
      "El triage de correos sin empresa asignada está deshabilitado: requiere una identidad de plataforma aún no aprobada.",
  });
};
