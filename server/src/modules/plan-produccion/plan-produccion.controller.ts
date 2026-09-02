import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { esTransicionValida, type EstadoPlanProduccion } from "../../lib/plan-produccion";
import { crearPlanProduccionSchema, actualizarEstadoPlanProduccionSchema } from "./plan-produccion.schemas";

/** Lista los planes de producción del tenant, más recientes primero. */
export const listarPlanesProduccion = async (req: AuthenticatedRequest, res: Response) => {
  const planes = await req.tenantPrisma!.planProduccion.findMany({
    orderBy: { createdAt: "desc" },
  });
  return res.json(planes);
};

/**
 * Crea un plan de producción, en estado inicial "Planificada". Puede
 * originarse a mano o a partir de una recomendación de producción (Bloque
 * 4) — en ambos casos itemRowId/descripcion/cantidad los decide quien crea
 * el plan, este endpoint no vuelve a consultar Siesa.
 */
export const crearPlanProduccion = async (req: AuthenticatedRequest, res: Response) => {
  const parseo = crearPlanProduccionSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const plan = await req.tenantPrisma!.planProduccion.create({
    data: {
      tenantId: req.user!.tenantId,
      itemRowId: parseo.data.itemRowId,
      descripcion: parseo.data.descripcion ?? null,
      referencia: parseo.data.referencia ?? null,
      unidadMedida: parseo.data.unidadMedida ?? null,
      cantidadPlaneada: parseo.data.cantidadPlaneada,
      fechaPlaneada: parseo.data.fechaPlaneada,
      notas: parseo.data.notas ?? null,
      responsableId: req.user!.id,
      responsable: req.user!.nombre,
    },
  });

  // R-C-02 (auditoría de Comercial, 2026-09-02): crear/avanzar un plan de
  // producción es una decisión operativa real — mismo patrón ya usado en
  // Despachos, hasta ahora ausente en este módulo.
  await req.tenantPrisma!.auditoria.create({
    data: {
      tenantId: req.user!.tenantId,
      usuarioId: req.user!.id,
      accion: "PLAN_PRODUCCION_CREADO",
      detalle: `${req.user!.nombre} creó un plan de producción para "${parseo.data.descripcion ?? plan.itemRowId}" (${plan.cantidadPlaneada} planeadas).`,
      entidadTipo: "PlanProduccion",
      entidadId: plan.id,
      datosNuevos: JSON.stringify({ estado: plan.estado, cantidadPlaneada: Number(plan.cantidadPlaneada) }),
    },
  });

  return res.status(201).json(plan);
};

/**
 * Avanza el estado de un plan — valida la transición contra la máquina de
 * estados (lib/plan-produccion.ts) antes de escribir: Planificada ->
 * Aprobada -> En producción -> Parcial -> Terminada, con Cancelada
 * alcanzable desde cualquier estado no terminal.
 */
export const actualizarEstadoPlanProduccion = async (req: AuthenticatedRequest, res: Response) => {
  const parseo = actualizarEstadoPlanProduccionSchema.safeParse(req.body);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const plan = await req.tenantPrisma!.planProduccion.findUnique({ where: { id: req.params.id } });
  if (!plan) return res.status(404).json({ message: "Plan de producción no encontrado." });

  const actual = plan.estado as EstadoPlanProduccion;
  const siguiente = parseo.data.estado;
  if (!esTransicionValida(actual, siguiente)) {
    return res.status(400).json({ message: `No se puede pasar de "${actual}" a "${siguiente}".` });
  }

  const [actualizado] = await req.tenantPrisma!.$transaction([
    req.tenantPrisma!.planProduccion.update({
      where: { id: plan.id },
      data: { estado: siguiente },
    }),
    req.tenantPrisma!.auditoria.create({
      data: {
        tenantId: req.user!.tenantId,
        usuarioId: req.user!.id,
        accion: `PLAN_PRODUCCION_${siguiente.toUpperCase().replace(/ /g, "_")}`,
        detalle: `${req.user!.nombre} cambió el plan de producción de "${actual}" a "${siguiente}".`,
        entidadTipo: "PlanProduccion",
        entidadId: plan.id,
        datosAnteriores: JSON.stringify({ estado: actual }),
        datosNuevos: JSON.stringify({ estado: siguiente }),
      },
    }),
  ]);

  return res.json(actualizado);
};
