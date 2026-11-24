import { listarEstadoJobs } from "../../lib/job-registry";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { type AuthenticatedRequest, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  aplicarPiloto,
  pilotoInicial,
  leerConfigEmailImportaciones,
} from "../../integrations/email/config";
import { GoogleWorkspaceEmailProvider } from "../../integrations/email/google-workspace-email-provider";
import {
  detenerSchedulerIngestaCorreos,
  iniciarSchedulerIngestaCorreos,
} from "./importaciones-bandeja-ingesta.job";
import {
  detenerSchedulerProcesamientoCorreos,
  iniciarSchedulerProcesamientoCorreos,
} from "./importaciones-bandeja-procesamiento.job";

const esquema = z
  .object({
    lectura: z.boolean(),
    procesamiento: z.boolean(),
    etiqueta: z.string().trim().max(128),
    minutos: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
    correos: z.number().int().min(1).max(100),
    adjuntos: z.number().int().min(1).max(200),
  })
  .strict()
  .refine((v) => (!v.lectura && !v.procesamiento) || Boolean(v.etiqueta));

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
      ajustes: fila
        ? esquema.parse({
            lectura: fila.lectura,
            procesamiento: fila.procesamiento,
            etiqueta: fila.etiqueta,
            minutos: fila.minutos,
            correos: fila.correos,
            adjuntos: fila.adjuntos,
          })
        : pilotoInicial,
      buzon: leerConfigEmailImportaciones().mailboxEmail,
    });
  } catch (e) {
    next(e);
  }
});
operacionBandeja.post("/conexion", async (_req, res) => {
  try {
    res.json({ etiquetas: await new GoogleWorkspaceEmailProvider().probarConexion() });
  } catch {
    res.status(502).json({
      message:
        "No se pudo verificar el buzón en Gmail. Revisa la credencial y la delegación de lectura.",
    });
  }
});
operacionBandeja.put("/", async (req: AuthenticatedRequest, res, next) => {
  const datos = esquema.safeParse(req.body);
  if (!datos.success) {
    res.status(400).json({ message: "Revisa la etiqueta, la frecuencia y los límites." });
    return;
  }
  const valor = datos.data;
  try {
    if (valor.lectura || valor.procesamiento) {
      let etiquetas;
      try {
        etiquetas = await new GoogleWorkspaceEmailProvider().probarConexion();
      } catch {
        res.status(502).json({ message: "No se pudo verificar el buzón en Gmail." });
        return;
      }
      if (!etiquetas.some((x) => x.id === valor.etiqueta)) {
        res.status(400).json({ message: "Selecciona una etiqueta existente del buzón." });
        return;
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.configCorreoImportaciones.upsert({
        where: { id: 1 },
        create: { id: 1, ...valor },
        update: valor,
      });
      await tx.auditoria.create({
        data: {
          tenantId: req.user!.tenantId,
          usuarioId: req.user!.id,
          accion: "CONFIG_CORREO_IMPORTACIONES",
          detalle: "Actualización de parámetros del buzón central",
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
