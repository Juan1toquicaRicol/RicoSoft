import fs from "fs";
import path from "path";
import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { getTenantPrisma } from "../../lib/tenant-prisma";
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
 * (PROVEEDOR_NO_IDENTIFICADO) están al final y exigen requireSuperadmin —
 * ver justificación en schema.prisma.
 */

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
        excepciones: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!correo) return res.status(404).json({ message: "Correo no encontrado." });

    return res.json(correo);
  } catch (error) {
    console.error("Error al obtener el correo de la Bandeja:", error);
    return res.status(500).json({ message: "Error al obtener el correo." });
  }
};

/** Sirve el contenido del adjunto — NUNCA una URL pública/estática: valida
 * tenant del correo dueño del adjunto antes de leer el archivo del disco,
 * mismo patrón que obtenerDocumentoExpedienteAduanero. */
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

    const dataCorreo: { proveedorId?: string; ordenCompraId?: string } = {};

    if (accion === "SELECCIONAR_PROVEEDOR") {
      if (!proveedorId) return res.status(400).json({ message: "Falta proveedorId." });
      const proveedor = await prisma.proveedor.findFirst({ where: { id: proveedorId, tenantId } });
      if (!proveedor) return res.status(404).json({ message: "Proveedor no encontrado." });
      dataCorreo.proveedorId = proveedorId;
    } else if (accion === "SELECCIONAR_ORDEN") {
      if (!ordenCompraId) return res.status(400).json({ message: "Falta ordenCompraId." });
      const orden = await prisma.ordenCompraIntl.findFirst({
        where: { id: ordenCompraId, tenantId, eliminado: false },
      });
      if (!orden) return res.status(404).json({ message: "Orden no encontrada." });
      dataCorreo.ordenCompraId = ordenCompraId;
    }
    // DESCARTAR no toca el correo, solo cierra la excepción.

    await prisma.$transaction([
      prisma.importacionExcepcion.update({
        where: { id: excepcion.id },
        data: {
          estado: accion === "DESCARTAR" ? "DESCARTADA" : "RESUELTA",
          resueltoPorId: usuarioId,
          resueltoEn: new Date(),
        },
      }),
      ...(Object.keys(dataCorreo).length > 0
        ? [prisma.importacionCorreo.update({ where: { id: correo.id }, data: dataCorreo })]
        : []),
      prisma.auditoria.create({
        data: {
          tenantId,
          usuarioId,
          accion: "IMPORTACION_EXCEPCION_RESUELTA",
          detalle: `${req.user!.nombre} resolvió la excepción "${excepcion.tipo}" del correo "${correo.asunto}" (${accion}).`,
          entidadTipo: "ImportacionExcepcion",
          entidadId: excepcion.id,
          datosAnteriores: JSON.stringify({ estado: excepcion.estado }),
          datosNuevos: JSON.stringify({
            estado: accion === "DESCARTAR" ? "DESCARTADA" : "RESUELTA",
            accion,
          }),
        },
      }),
    ]);

    // Si ya no quedan excepciones abiertas para este correo, se resuelve el
    // InboxItem asociado — mismo patrón idempotente que Solicitudes de
    // Compra (resolverItemDeTrabajo nunca lanza).
    const abiertasRestantes = await prisma.importacionExcepcion.count({
      where: { correoId: correo.id, estado: "ABIERTA" },
    });
    if (abiertasRestantes === 0) {
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
    buzon: configEmail.mailboxEmail ? enmascararEmail(configEmail.mailboxEmail) : null,
    maxEmailsPerRun: configEmail.maxEmailsPerRun,
    maxAttachmentsPerRun: configEmail.maxAttachmentsPerRun,
    cronIngesta: configProcesamiento.cronIngesta,
    cronProcesamiento: configProcesamiento.cronProcesamiento,
  });
};

function enmascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (!dominio) return "***";
  return `${usuario.slice(0, 2)}***@${dominio}`;
}

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

    await prisma.importacionCorreo.update({
      where: { id: correo.id },
      data: { estadoProcesamiento: "PENDIENTE", ultimoError: null },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "IMPORTACION_CORREO_REPROCESADO",
        detalle: `${req.user!.nombre} reencoló el correo "${correo.asunto}" para reprocesamiento.`,
        entidadTipo: "ImportacionCorreo",
        entidadId: correo.id,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al reencolar el correo para reprocesamiento:", error);
    return res.status(500).json({ message: "Error al reencolar el correo." });
  }
};

// --- Triage de correos SIN tenant resuelto (PROVEEDOR_NO_IDENTIFICADO) ---
// Solo un superadmin puede verlos/asignarlos — nunca un usuario de tenant,
// porque por definición todavía no se sabe a qué tenant pertenecen. Ver
// requireSuperadmin en importaciones-bandeja.routes.ts.

export const listarCorreosSinAsignar = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const correos = await prisma.importacionCorreo.findMany({
      where: { tenantId: null },
      select: {
        id: true,
        remitente: true,
        asunto: true,
        fechaRecibido: true,
        estadoProcesamiento: true,
        excepciones: {
          where: { estado: "ABIERTA" },
          select: { id: true, tipo: true, descripcion: true, candidatos: true },
        },
      },
      orderBy: { fechaRecibido: "desc" },
    });
    return res.json(correos);
  } catch (error) {
    console.error("Error al listar correos sin asignar:", error);
    return res.status(500).json({ message: "Error al obtener los correos sin asignar." });
  }
};

export const asignarProveedorACorreoSinTenant = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const { proveedorId } = req.body;

    const correo = await prisma.importacionCorreo.findFirst({ where: { id, tenantId: null } });
    if (!correo) {
      return res
        .status(404)
        .json({ message: "Correo no encontrado o ya tiene un tenant asignado." });
    }

    const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
    if (!proveedor) return res.status(404).json({ message: "Proveedor no encontrado." });

    await prisma.$transaction([
      prisma.importacionCorreo.update({
        where: { id: correo.id },
        data: {
          tenantId: proveedor.tenantId,
          proveedorId: proveedor.id,
          estadoProcesamiento: "MATCHEADO",
        },
      }),
      prisma.importacionExcepcion.updateMany({
        where: { correoId: correo.id, tipo: "PROVEEDOR_NO_IDENTIFICADO", estado: "ABIERTA" },
        data: { estado: "RESUELTA", resueltoPorId: req.user!.id, resueltoEn: new Date() },
      }),
      prisma.auditoria.create({
        data: {
          tenantId: proveedor.tenantId,
          usuarioId: req.user!.id,
          accion: "IMPORTACION_CORREO_ASIGNADO_MANUALMENTE",
          detalle: `${req.user!.nombre} (superadmin) asignó el correo "${correo.asunto}" al proveedor "${proveedor.nombre}".`,
          entidadTipo: "ImportacionCorreo",
          entidadId: correo.id,
        },
      }),
    ]);

    return res.status(200).json({ message: "Correo asignado correctamente." });
  } catch (error) {
    console.error("Error al asignar proveedor a correo sin tenant:", error);
    return res.status(500).json({ message: "Error al asignar el correo." });
  }
};
