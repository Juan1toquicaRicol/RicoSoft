import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { esTransicionValidaLiquidacion, type EstadoGestionLiquidacion } from "../../lib/gestion-liquidacion";
import {
  crearGestionLiquidacionSchema,
  actualizarEstadoGestionLiquidacionSchema,
} from "./gestion-liquidacion.schemas";

/** Lista las gestiones de liquidación del tenant, más recientes primero. */
export const listarGestionesLiquidacion = async (req: AuthenticatedRequest, res: Response) => {
  const gestiones = await req.tenantPrisma!.gestionLiquidacion.findMany({
    orderBy: { createdAt: "desc" },
  });
  return res.json(gestiones);
};

/**
 * Crea una gestión de liquidación a partir de una decisión "liquidar" del
 * Centro de Decisiones. Recibe el snapshot (score/categoría/motivo/valor)
 * que YA calculó domain/planeacion/liquidacion.ts — no vuelve a calcular
 * nada aquí, solo lo persiste con estado inicial "PENDIENTE". No toca
 * Siesa: es únicamente el registro de la decisión empresarial.
 */
export const crearGestionLiquidacion = async (req: AuthenticatedRequest, res: Response) => {
  const parseo = crearGestionLiquidacionSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const gestion = await req.tenantPrisma!.gestionLiquidacion.create({
    data: {
      tenantId: req.user!.tenantId,
      itemRowId: parseo.data.itemRowId,
      descripcion: parseo.data.descripcion ?? null,
      referencia: parseo.data.referencia ?? null,
      cantidadExistente: parseo.data.cantidadExistente,
      valorTotal: parseo.data.valorTotal,
      score: parseo.data.score,
      categoria: parseo.data.categoria,
      motivo: parseo.data.motivo,
      responsableId: req.user!.id,
      responsable: req.user!.nombre,
    },
  });

  // R-C-02 (auditoría de Comercial, 2026-09-02): registrar y ejecutar una
  // decisión de liquidación de inventario es una decisión operativa/
  // financiera real — mismo patrón ya usado en Despachos, hasta ahora
  // ausente en este módulo.
  await req.tenantPrisma!.auditoria.create({
    data: {
      tenantId: req.user!.tenantId,
      usuarioId: req.user!.id,
      accion: "GESTION_LIQUIDACION_CREADA",
      detalle: `${req.user!.nombre} registró una gestión de liquidación para "${parseo.data.descripcion ?? gestion.itemRowId}" (categoría ${gestion.categoria}, valor $${Number(gestion.valorTotal).toLocaleString("es-CO")}).`,
      entidadTipo: "GestionLiquidacion",
      entidadId: gestion.id,
      datosNuevos: JSON.stringify({ estado: gestion.estado, categoria: gestion.categoria, valorTotal: Number(gestion.valorTotal) }),
    },
  });

  return res.status(201).json(gestion);
};

/**
 * Avanza el estado de la gestión — valida contra la máquina de estados
 * (lib/gestion-liquidacion.ts): PENDIENTE -> EN_REVISION -> APROBADA ->
 * EJECUTADA, con RECHAZADA alcanzable hasta antes de EJECUTADA. Nunca
 * ejecuta nada contra Siesa — "EJECUTADA" es solo un registro de que la
 * empresa ya actuó por su cuenta.
 */
export const actualizarEstadoGestionLiquidacion = async (req: AuthenticatedRequest, res: Response) => {
  const parseo = actualizarEstadoGestionLiquidacionSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const gestion = await req.tenantPrisma!.gestionLiquidacion.findUnique({ where: { id: req.params.id } });
  if (!gestion) return res.status(404).json({ message: "Gestión de liquidación no encontrada." });

  const actual = gestion.estado as EstadoGestionLiquidacion;
  const siguiente = parseo.data.estado;
  if (!esTransicionValidaLiquidacion(actual, siguiente)) {
    return res.status(400).json({ message: `No se puede pasar de "${actual}" a "${siguiente}".` });
  }

  const [actualizada] = await req.tenantPrisma!.$transaction([
    req.tenantPrisma!.gestionLiquidacion.update({
      where: { id: gestion.id },
      data: { estado: siguiente },
    }),
    req.tenantPrisma!.auditoria.create({
      data: {
        tenantId: req.user!.tenantId,
        usuarioId: req.user!.id,
        accion: `GESTION_LIQUIDACION_${siguiente.toUpperCase().replace(/ /g, "_")}`,
        detalle: `${req.user!.nombre} cambió la gestión de liquidación de "${actual}" a "${siguiente}".`,
        entidadTipo: "GestionLiquidacion",
        entidadId: gestion.id,
        datosAnteriores: JSON.stringify({ estado: actual }),
        datosNuevos: JSON.stringify({ estado: siguiente }),
      },
    }),
  ]);

  return res.json(actualizada);
};
