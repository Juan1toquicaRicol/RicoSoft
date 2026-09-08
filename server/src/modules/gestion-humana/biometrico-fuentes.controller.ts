import { Response } from "express";
import { Prisma, FuenteBiometrica } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * API administrativa de FuenteBiometrica (Fase 6). Sigue exactamente el
 * patrón de siesa-sync.controller.ts: tenantId siempre desde req.user, nunca
 * del body; lookups de un recurso puntual usan findFirst({id, tenantId}) —
 * 404 (no 403) si existe pero es de otro tenant, para no filtrar su
 * existencia.
 *
 * Proveedores soportados: solo "anviz" por ahora (el único adaptador
 * implementado, ver server/src/integrations/crosschex). Rechazar cualquier
 * otro valor evita crear una fuente que ningún adaptador sabrá sincronizar.
 */
const PROVEEDORES_SOPORTADOS = ["anviz"] as const;

type FuenteConUltimaSincronizacion = FuenteBiometrica & {
  sincronizaciones: Array<{
    id: string;
    estado: string;
    iniciadoEn: Date;
    finalizadoEn: Date | null;
  }>;
};

function serializarFuente(fuente: FuenteConUltimaSincronizacion) {
  const ultima = fuente.sincronizaciones[0] ?? null;
  return {
    id: fuente.id,
    nombre: fuente.nombre,
    proveedor: fuente.proveedor,
    activa: fuente.activa,
    lastProcessedLogId: fuente.lastProcessedLogId,
    createdAt: fuente.createdAt,
    updatedAt: fuente.updatedAt,
    ultimaSincronizacion: ultima
      ? { id: ultima.id, estado: ultima.estado, iniciadoEn: ultima.iniciadoEn, finalizadoEn: ultima.finalizadoEn }
      : null,
  };
}

const INCLUDE_ULTIMA_SINCRONIZACION = {
  sincronizaciones: {
    orderBy: { iniciadoEn: "desc" as const },
    take: 1,
    select: { id: true, estado: true, iniciadoEn: true, finalizadoEn: true },
  },
};

/** Lista las fuentes del tenant actual, con el estado de su última
 * sincronización resuelto en la misma consulta (sin N+1). */
export async function listarFuentesBiometricas(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const fuentes = await prisma.fuenteBiometrica.findMany({
      where: { tenantId },
      include: INCLUDE_ULTIMA_SINCRONIZACION,
      orderBy: { nombre: "asc" },
    });
    return res.json(fuentes.map(serializarFuente));
  } catch (error) {
    console.error("Error al listar fuentes biométricas:", error);
    return res.status(500).json({ message: "Error al obtener las fuentes biométricas." });
  }
}

export async function obtenerFuenteBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const fuente = await prisma.fuenteBiometrica.findFirst({
      where: { id, tenantId },
      include: INCLUDE_ULTIMA_SINCRONIZACION,
    });
    if (!fuente) return res.status(404).json({ message: "Fuente biométrica no encontrada." });

    return res.json(serializarFuente(fuente));
  } catch (error) {
    console.error("Error al consultar fuente biométrica:", error);
    return res.status(500).json({ message: "Error al obtener la fuente biométrica." });
  }
}

/**
 * Crea una FuenteBiometrica. Deliberadamente NO acepta ninguna ruta de
 * archivo ni configuración de conexión: eso vive exclusivamente en
 * CROSSCHEX_MDB_PATH del servidor (crosschex.config.ts). El único vínculo
 * entre esta fila y el archivo real es `nombre`, resuelto server-side por
 * quien configure el entorno — la API nunca ve ni acepta una ruta.
 */
export async function crearFuenteBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { nombre, proveedor } = req.body ?? {};

    if (typeof nombre !== "string" || nombre.trim().length < 3 || nombre.trim().length > 50) {
      return res
        .status(400)
        .json({ message: "El nombre de la fuente es obligatorio (3 a 50 caracteres)." });
    }
    const proveedorFinal = proveedor === undefined ? "anviz" : proveedor;
    if (!PROVEEDORES_SOPORTADOS.includes(proveedorFinal)) {
      return res.status(400).json({
        message: `Proveedor no soportado. Valores permitidos: ${PROVEEDORES_SOPORTADOS.join(", ")}.`,
      });
    }

    const fuente = await prisma.fuenteBiometrica.create({
      data: { tenantId, nombre: nombre.trim(), proveedor: proveedorFinal },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "BIOMETRICO_FUENTE_CREADA",
        detalle: `${req.user!.nombre} creó la fuente biométrica "${fuente.nombre}" (${fuente.proveedor}).`,
        entidadTipo: "FuenteBiometrica",
        entidadId: fuente.id,
      },
    });

    return res.status(201).json(serializarFuente({ ...fuente, sincronizaciones: [] }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Ya existe una fuente biométrica con ese nombre." });
    }
    console.error("Error al crear fuente biométrica:", error);
    return res.status(500).json({ message: "Error al crear la fuente biométrica." });
  }
}

/**
 * Solo permite tocar `nombre` y `activa`. tenantId, proveedor y
 * lastProcessedLogId son inmutables desde la API — el cursor solo lo mueve
 * el propio servicio de sincronización, nunca un humano.
 */
export async function actualizarFuenteBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nombre, activa } = req.body ?? {};

    const fuente = await prisma.fuenteBiometrica.findFirst({ where: { id, tenantId } });
    if (!fuente) return res.status(404).json({ message: "Fuente biométrica no encontrada." });

    const data: Prisma.FuenteBiometricaUpdateInput = {};
    if (nombre !== undefined) {
      if (typeof nombre !== "string" || nombre.trim().length < 3 || nombre.trim().length > 50) {
        return res.status(400).json({ message: "El nombre debe tener entre 3 y 50 caracteres." });
      }
      data.nombre = nombre.trim();
    }
    if (activa !== undefined) {
      if (typeof activa !== "boolean") {
        return res.status(400).json({ message: "'activa' debe ser booleano." });
      }
      data.activa = activa;
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No se envió ningún campo válido para actualizar." });
    }

    const actualizada = await prisma.fuenteBiometrica.update({ where: { id }, data });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "BIOMETRICO_FUENTE_EDITADA",
        detalle: `${req.user!.nombre} editó la fuente biométrica "${fuente.nombre}".`,
        entidadTipo: "FuenteBiometrica",
        entidadId: fuente.id,
      },
    });

    return res.json(serializarFuente({ ...actualizada, sincronizaciones: [] }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Ya existe una fuente biométrica con ese nombre." });
    }
    console.error("Error al actualizar fuente biométrica:", error);
    return res.status(500).json({ message: "Error al actualizar la fuente biométrica." });
  }
}

/**
 * "Eliminar" es desactivar (activa=false), reutilizando el campo que YA
 * existe en el modelo — no se agrega un campo `eliminado` nuevo solo para
 * esto. Nunca se borra físicamente: MarcacionBiometrica, EmpleadoBiometrico
 * y SincronizacionBiometricoLog tienen FKs hacia esta tabla (varias con
 * onDelete NO ACTION), así que un DELETE físico fallaría igual si hay
 * historial, y aunque no lo hubiera, perder la fila pierde la identidad de
 * la fuente para logs futuros. Una fuente inactiva simplemente deja de
 * sincronizarse (el scheduler solo procesa `activa: true`).
 */
export async function desactivarFuenteBiometrica(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const fuente = await prisma.fuenteBiometrica.findFirst({ where: { id, tenantId } });
    if (!fuente) return res.status(404).json({ message: "Fuente biométrica no encontrada." });

    if (!fuente.activa) {
      return res.json(serializarFuente({ ...fuente, sincronizaciones: [] }));
    }

    const actualizada = await prisma.fuenteBiometrica.update({ where: { id }, data: { activa: false } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "BIOMETRICO_FUENTE_DESACTIVADA",
        detalle: `${req.user!.nombre} desactivó la fuente biométrica "${fuente.nombre}".`,
        entidadTipo: "FuenteBiometrica",
        entidadId: fuente.id,
      },
    });

    return res.json(serializarFuente({ ...actualizada, sincronizaciones: [] }));
  } catch (error) {
    console.error("Error al desactivar fuente biométrica:", error);
    return res.status(500).json({ message: "Error al desactivar la fuente biométrica." });
  }
}
