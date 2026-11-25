import { listarEstadoJobs } from "../../lib/job-registry";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { type AuthenticatedRequest, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  aplicarPiloto,
  pilotoInicial,
} from "../../integrations/email/config";
import {
  detenerSchedulerIngestaCorreos,
  iniciarSchedulerIngestaCorreos,
} from "./importaciones-bandeja-ingesta.job";
import {
  detenerSchedulerProcesamientoCorreos,
  iniciarSchedulerProcesamientoCorreos,
} from "./importaciones-bandeja-procesamiento.job";
import type { BuzonImportaciones } from "@prisma/client";
import {
  activarBuzon,
  aprobarBuzon,
  cambiarResponsableBuzon,
  elegirEtiquetaBuzon,
  obtenerBuzonDelTenant,
  pausarBuzon,
  probarConexionBuzon,
  registrarBuzon,
  filtroResponsableBuzon,
  type ErrorBuzon,
} from "./buzones-importaciones.service";

const esquema = z.object({
  lectura: z.boolean(),
  procesamiento: z.boolean(),
  minutos: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
}).strict();

export function operadorBandeja(user: { id: string; tenantId: string }) {
  return (
    user.tenantId === process.env.IMPORTACIONES_SISTEMAS_TENANT_ID &&
    (process.env.IMPORTACIONES_SISTEMAS_USUARIOS ?? "")
      .split(",")
      .map((x) => x.trim())
      .includes(user.id)
  );
}

let ultimaProgramacion = "";
let cola = Promise.resolve();
export function actualizarProgramacionBandeja() {
  const actualizar = async () => {
    const fila = await prisma.configCorreoImportaciones.findUnique({ where: { id: 1 } });
    const ajustes = fila ?? (process.env.IMPORTACIONES_SISTEMAS_TENANT_ID ? pilotoInicial : null);
    aplicarPiloto(ajustes);
    const firma = JSON.stringify([ajustes?.lectura, ajustes?.procesamiento, ajustes?.minutos]);
    if (firma === ultimaProgramacion) return;
    detenerSchedulerIngestaCorreos();
    detenerSchedulerProcesamientoCorreos();
    iniciarSchedulerIngestaCorreos();
    iniciarSchedulerProcesamientoCorreos();
    ultimaProgramacion = firma;
  };
  cola = cola.catch(() => undefined).then(actualizar);
  return cola;
}

export const operacionBandeja = Router();
operacionBandeja.use(requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_CONFIGURAR));
operacionBandeja.use((req: AuthenticatedRequest, res, next) => {
  if (!req.user || !operadorBandeja(req.user)) {
    res.sendStatus(403);
    return;
  }
  next();
});
operacionBandeja.get("/", async (_req, res, next) => {
  try {
    const fila = await prisma.configCorreoImportaciones.findUnique({ where: { id: 1 } });
    res.json({
      procesos: listarEstadoJobs()
        .filter((j) => ["bandeja-ingesta", "bandeja-procesamiento"].includes(j.id))
        .map((j) => ({
          nombre: j.nombre,
          estado: j.estado,
          ultima: j.ultimaEjecucion,
          proxima: j.proximaEjecucion,
          error: j.mensajeUltimoError,
        })),
      ajustes: esquema.parse({
        lectura: fila?.lectura ?? pilotoInicial.lectura,
        procesamiento: fila?.procesamiento ?? pilotoInicial.procesamiento,
        minutos: fila?.minutos ?? pilotoInicial.minutos,
      }),
    });
  } catch (e) {
    next(e);
  }
});
operacionBandeja.put("/", async (req: AuthenticatedRequest, res, next) => {
  const datos = esquema.safeParse(req.body);
  if (!datos.success) {
    res.status(400).json({ message: "Revisa los interruptores y la frecuencia." });
    return;
  }
  const valor = datos.data;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.configCorreoImportaciones.upsert({
        where: { id: 1 },
        create: { id: 1, ...pilotoInicial, ...valor },
        update: valor,
      });
      await tx.auditoria.create({
        data: {
          tenantId: req.user!.tenantId,
          usuarioId: req.user!.id,
          accion: "CONFIG_CORREO_IMPORTACIONES",
          detalle: "Actualización de la programación de buzones",
          datosNuevos: JSON.stringify(valor),
        },
      });
    });
    await actualizarProgramacionBandeja();
    res.json({ ajustes: valor });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// Buzones múltiples (MEMORY.md 2026-11-25). Todas las rutas heredan el permiso
// y operadorBandeja; cada buzón se busca solo dentro del tenant del operador.
// ---------------------------------------------------------------------------

const idBuzon = z.string().uuid();
const crearBuzonEsquema = z
  .object({
    direccion: z.string().trim().max(320),
    responsableUsuarioId: z.string().uuid().nullable().optional(),
    correosPorCiclo: z.number().int().optional(),
    adjuntosPorCiclo: z.number().int().optional(),
    timeoutSegundos: z.number().int().optional(),
  })
  .strict();

const CODIGO_HTTP: Record<ErrorBuzon["codigo"], number> = {
  NO_ENCONTRADO: 404,
  VALIDACION: 400,
  CONFLICTO: 409,
  ESTADO_INVALIDO: 409,
  GMAIL_NO_DISPONIBLE: 502,
  ETIQUETA_INVALIDA: 400,
};

function responderErrorBuzon(res: import("express").Response, error: ErrorBuzon) {
  res.status(CODIGO_HTTP[error.codigo]).json({ message: error.mensaje });
}

function vistaBuzon(b: BuzonImportaciones) {
  return {
    id: b.id,
    direccion: b.direccion,
    estado: b.estado,
    etiquetaId: b.etiquetaId,
    etiquetaNombre: b.etiquetaNombre,
    responsableUsuarioId: b.responsableUsuarioId,
    correosPorCiclo: b.correosPorCiclo,
    adjuntosPorCiclo: b.adjuntosPorCiclo,
    timeoutSegundos: b.timeoutSegundos,
    ultimaEjecucion: b.ultimaEjecucion,
    ultimoError: b.ultimoError,
  };
}

/** Busca el buzón del tenant del operador; responde 404 si no existe o es de otro tenant. */
async function cargarBuzonDelOperador(
  req: AuthenticatedRequest,
  res: import("express").Response,
): Promise<BuzonImportaciones | null> {
  const id = idBuzon.safeParse(req.params.id);
  const buzon = id.success ? await obtenerBuzonDelTenant(id.data, req.user!.tenantId) : null;
  if (!buzon) {
    res.status(404).json({ message: "Buzón no encontrado." });
    return null;
  }
  return buzon;
}

operacionBandeja.get("/responsables", async (req: AuthenticatedRequest, res, next) => {
  try {
    const usuarios = await prisma.user.findMany({
      where: filtroResponsableBuzon(req.user!.tenantId),
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    res.json({ usuarios });
  } catch (error) {
    next(error);
  }
});

operacionBandeja.get("/buzones", async (req: AuthenticatedRequest, res, next) => {
  try {
    const buzones = await prisma.buzonImportaciones.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ buzones: buzones.map(vistaBuzon) });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.post("/buzones", async (req: AuthenticatedRequest, res, next) => {
  const datos = crearBuzonEsquema.safeParse(req.body);
  if (!datos.success) {
    res.status(400).json({ message: "Revisa la dirección, el responsable y los límites del buzón." });
    return;
  }
  try {
    const resultado = await registrarBuzon(
      { id: req.user!.id, tenantId: req.user!.tenantId },
      datos.data,
    );
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.status(201).json({ buzon: vistaBuzon(resultado.buzon) });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.post("/buzones/:id/aprobar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const buzon = await cargarBuzonDelOperador(req, res);
    if (!buzon) return;
    const resultado = await aprobarBuzon(buzon, { id: req.user!.id, tenantId: req.user!.tenantId });
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.json({ buzon: vistaBuzon(resultado.buzon) });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.post("/buzones/:id/conexion", async (req: AuthenticatedRequest, res, next) => {
  try {
    const buzon = await cargarBuzonDelOperador(req, res);
    if (!buzon) return;
    const resultado = await probarConexionBuzon(buzon);
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.json({ etiquetas: resultado.etiquetas });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.put("/buzones/:id/etiqueta", async (req: AuthenticatedRequest, res, next) => {
  const cuerpo = z.object({ etiquetaId: z.string().trim().min(1).max(128) }).strict().safeParse(req.body);
  if (!cuerpo.success) {
    res.status(400).json({ message: "Selecciona una etiqueta." });
    return;
  }
  try {
    const buzon = await cargarBuzonDelOperador(req, res);
    if (!buzon) return;
    const resultado = await elegirEtiquetaBuzon(buzon, { id: req.user!.id, tenantId: req.user!.tenantId }, cuerpo.data.etiquetaId);
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.json({ buzon: vistaBuzon(resultado.buzon) });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.post("/buzones/:id/activar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const buzon = await cargarBuzonDelOperador(req, res);
    if (!buzon) return;
    const resultado = await activarBuzon(buzon, { id: req.user!.id, tenantId: req.user!.tenantId });
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.json({ buzon: vistaBuzon(resultado.buzon) });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.post("/buzones/:id/pausar", async (req: AuthenticatedRequest, res, next) => {
  try {
    const buzon = await cargarBuzonDelOperador(req, res);
    if (!buzon) return;
    const resultado = await pausarBuzon(buzon, { id: req.user!.id, tenantId: req.user!.tenantId });
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.json({ buzon: vistaBuzon(resultado.buzon) });
  } catch (e) {
    next(e);
  }
});

operacionBandeja.put("/buzones/:id/responsable", async (req: AuthenticatedRequest, res, next) => {
  const cuerpo = z
    .object({ responsableUsuarioId: z.string().uuid().nullable() })
    .strict()
    .safeParse(req.body);
  if (!cuerpo.success) {
    res.status(400).json({ message: "Indica un responsable válido o nulo." });
    return;
  }
  try {
    const buzon = await cargarBuzonDelOperador(req, res);
    if (!buzon) return;
    const resultado = await cambiarResponsableBuzon(
      buzon,
      { id: req.user!.id, tenantId: req.user!.tenantId },
      cuerpo.data.responsableUsuarioId,
    );
    if (!resultado.ok) return responderErrorBuzon(res, resultado.error);
    res.json({ buzon: vistaBuzon(resultado.buzon) });
  } catch (e) {
    next(e);
  }
});
