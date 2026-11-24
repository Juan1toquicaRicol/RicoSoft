import type { Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { permisosRequeridos } from "../../lib/catalogo-permisos";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { listarItemsMaestroSiesa } from "../integraciones-siesa/siesa-inventario.service";
import { prisma } from "../../config/prisma";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { bloquearOrdenVigente } from "./importaciones-bandeja-vinculo";

const cantidad = z.number().finite().nonnegative().lt(100000000000000)
  .refine((n) => new Prisma.Decimal(n).decimalPlaces() <= 4, "Usa hasta cuatro decimales.");

export const asignacionEmbarqueSchema = z.object({
  cantidad,
  recibida: cantidad,
  conciliada: cantidad,
  documentoSiesa: z.string().trim().max(255).nullable(),
  fechaDisponibilidad: z.string().date().nullable(),
  evidenciaFecha: z.string().trim().max(255).nullable(),
  actualizadoEn: z.string().datetime().nullable(),
}).superRefine((fila, ctx) => {
  if (fila.conciliada > fila.recibida || fila.recibida > fila.cantidad) {
    ctx.addIssue({ code: "custom", message: "La cantidad conciliada debe ser menor o igual a la recibida, y la recibida menor o igual a la asignada." });
  }
  if (fila.conciliada > 0 && !fila.documentoSiesa) {
    ctx.addIssue({ code: "custom", message: "Indica el documento de ingreso en Siesa." });
  }
  if (Boolean(fila.fechaDisponibilidad) !== Boolean(fila.evidenciaFecha)) {
    ctx.addIssue({ code: "custom", message: "Registra la fecha de disponibilidad y su fuente juntas." });
  }
});

const parametros = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

export const guardarAsignacionEmbarque = async (req: AuthenticatedRequest, res: Response) => {
  const params = parametros.safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: "Embarque o ítem inválido." });
  const { id: loteId, itemId } = params.data;
  const { tenantId, id: usuarioId } = req.user!;
  const { actualizadoEn, ...datos } = req.body as z.infer<typeof asignacionEmbarqueSchema>;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const lote = await tx.loteImportacion.findFirst({
        where: { id: loteId, tenantId, ordenCompra: { tenantId } },
        select: { ordenCompraId: true },
      });
      if (!lote) return { status: 404, message: "Embarque no encontrado." };
      if (!(await bloquearOrdenVigente(tx, tenantId, lote.ordenCompraId))) {
        return { status: 409, message: "La orden ya no está vigente." };
      }
      const item = await tx.itemOrdenCompraIntl.findFirst({
        where: { id: itemId, ordenCompraId: lote.ordenCompraId },
        select: { cantidad: true, itemRowId: true, siesaCiaId: true },
      });
      if (!item) return { status: 404, message: "El ítem no pertenece a la orden del embarque." };
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { siesaCiaId: true } });
      if (!item.itemRowId || !item.siesaCiaId || item.siesaCiaId !== tenant.siesaCiaId) {
        return { status: 409, message: "El ítem debe estar vinculado a la compañía actual de Siesa." };
      }

      const clave = { loteId_itemId: { loteId, itemId } };
      const anterior = await tx.importacionAsignacionEmbarque.findUnique({ where: clave });
      if ((anterior?.actualizadoEn.toISOString() ?? null) !== actualizadoEn) {
        return { status: 409, message: "La asignación cambió. Actualiza la orden e intenta de nuevo." };
      }
      const cambiaRecepcion = !new Prisma.Decimal(datos.recibida).eq(anterior?.recibida ?? 0)
        || !new Prisma.Decimal(datos.conciliada).eq(anterior?.conciliada ?? 0)
        || datos.documentoSiesa !== (anterior?.documentoSiesa ?? null);
      if (cambiaRecepcion && !req.user!.isSuperadmin
        && !permisosRequeridos(PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR).every((p) => req.user!.permisos.includes(p))) {
        return { status: 403, message: "La recepción y conciliación requieren el permiso de recibir importaciones." };
      }
      const acumulado = await tx.importacionAsignacionEmbarque.aggregate({
        where: { itemId, loteId: { not: loteId }, lote: { tenantId, ordenCompraId: lote.ordenCompraId } },
        _sum: { cantidad: true },
      });
      if ((acumulado._sum.cantidad ?? new Prisma.Decimal(0)).plus(datos.cantidad).gt(item.cantidad)) {
        return { status: 409, message: "La suma asignada a los embarques supera lo comprado en esta línea." };
      }
      await tx.importacionAsignacionEmbarque.upsert({
        where: clave,
        create: { loteId, itemId, ...datos },
        update: datos,
      });
      await tx.auditoria.create({ data: {
        tenantId, usuarioId, accion: "IMPORTACION_ASIGNACION_EMBARQUE_ACTUALIZADA",
        entidadTipo: "LoteImportacion", entidadId: loteId,
        detalle: "Actualización de cantidades y disponibilidad de un ítem en el embarque.",
        datosAnteriores: anterior ? JSON.stringify(anterior) : null,
        datosNuevos: JSON.stringify({ itemId, ...datos }),
      } });
      return { status: 204 };
    });
    return resultado.status === 204
      ? res.status(204).send()
      : res.status(resultado.status).json({ message: resultado.message });
  } catch (error) {
    console.error("Error al guardar asignación de embarque:", error);
    return res.status(500).json({ message: "No se pudo guardar la asignación del embarque." });
  }
};

export const vinculoItemSiesaSchema = z.object({ itemRowId: z.number().int().positive().max(2147483647) });

export const vincularItemHistorico = async (req: AuthenticatedRequest, res: Response) => {
  const params = z.object({ itemId: z.string().uuid() }).safeParse(req.params);
  if (!params.success) return res.status(400).json({ message: "Ítem de la orden inválido." });
  const { itemId } = params.data;
  const { tenantId, id: usuarioId } = req.user!;
  const { itemRowId } = req.body as z.infer<typeof vinculoItemSiesaSchema>;
  try {
    const item = await prisma.itemOrdenCompraIntl.findFirst({
      where: { id: itemId, ordenCompra: { tenantId, eliminado: false } },
    });
    if (!item) return res.status(404).json({ message: "Ítem de la orden no encontrado." });
    if (item.itemRowId) return res.status(409).json({ message: "El ítem ya está vinculado." });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { siesaCiaId: true } });
    if (!tenant.siesaCiaId) return res.status(409).json({ message: "Configura la compañía de Siesa." });
    const { items } = await listarItemsMaestroSiesa(tenant.siesaCiaId, {
      page: 1, pageSize: 1, itemRowIdsFiltro: { modo: "incluir", ids: [itemRowId] },
    });
    if (!items[0]?.unidadMedida || items[0].unidadMedida.toUpperCase() !== item.unidadMedida?.toUpperCase()) {
      return res.status(400).json({ message: "Selecciona un ítem de Siesa con la misma unidad de inventario de la línea." });
    }
    const vinculado = await prisma.$transaction(async (tx) => {
      if (!(await bloquearOrdenVigente(tx, tenantId, item.ordenCompraId))) return false;
      const cambio = await tx.itemOrdenCompraIntl.updateMany({
        where: { id: itemId, ordenCompraId: item.ordenCompraId, itemRowId: null },
        data: { itemRowId, siesaCiaId: tenant.siesaCiaId },
      });
      if (cambio.count !== 1) return false;
      await tx.auditoria.create({ data: {
        tenantId, usuarioId, accion: "IMPORTACION_ITEM_VINCULADO_SIESA",
        entidadTipo: "ItemOrdenCompraIntl", entidadId: itemId, detalle: "Vínculo con el maestro de ítems de Siesa.",
        datosNuevos: JSON.stringify({ itemRowId, siesaCiaId: tenant.siesaCiaId }),
      } });
      return true;
    });
    return vinculado ? res.status(204).send() : res.status(409).json({ message: "La orden o el ítem cambió. Actualiza el detalle." });
  } catch (error) {
    console.error("Error al vincular el ítem histórico:", error);
    return res.status(503).json({ message: "No se pudo verificar y vincular el ítem con Siesa." });
  }
};

export async function consultarIngresosImportacion(
  tenantId: string,
  siesaCiaId: number,
  itemRowId: number,
  unidadMedida: string | null,
) {
  if (!unidadMedida) return [];
  const filas = await prisma.importacionAsignacionEmbarque.findMany({
    where: {
      cantidad: { gt: 0 },
      item: { itemRowId, siesaCiaId, unidadMedida,
        ordenCompra: { tenantId, eliminado: false, estado: { in: ["Confirmada", "Cerrada"] } } },
      lote: { tenantId, ordenCompra: { tenantId, eliminado: false, estado: { in: ["Confirmada", "Cerrada"] } } },
    },
    orderBy: [{ fechaDisponibilidad: "asc" }, { actualizadoEn: "desc" }, { loteId: "asc" }],
    select: { loteId: true, itemId: true, cantidad: true, recibida: true, conciliada: true,
      fechaDisponibilidad: true, evidenciaFecha: true, actualizadoEn: true,
      lote: { select: { blAwb: true, ordenCompraId: true, fechaLlegadaEstimada: true,
        etaTrackingActual: true, proveedorTracking: true, ordenCompra: { select: { numeroOrden: true } } } },
      item: { select: { ordenCompraId: true } },
    },
  });
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return filas.flatMap((fila) => {
    const pendiente = fila.cantidad.minus(fila.conciliada);
    if (pendiente.lte(0) || fila.item.ordenCompraId !== fila.lote.ordenCompraId) return [];
    const etaSeguimiento = fila.lote.proveedorTracking && fila.lote.proveedorTracking !== "mock"
      ? fila.lote.etaTrackingActual : null;
    return [{
      loteId: fila.loteId,
      itemId: fila.itemId,
      embarque: fila.lote.blAwb,
      orden: fila.lote.ordenCompra.numeroOrden,
      porRecibir: Number(fila.cantidad.minus(fila.recibida)),
      recibidaSinConciliar: Number(fila.recibida.minus(fila.conciliada)),
      cantidadPendiente: Number(pendiente),
      fechaDisponibilidad: fila.fechaDisponibilidad && fila.fechaDisponibilidad >= hoy
        ? fila.fechaDisponibilidad : null,
      evidenciaFecha: fila.evidenciaFecha,
      etaPuerto: etaSeguimiento ?? fila.lote.fechaLlegadaEstimada,
      fuenteEta: etaSeguimiento ? fila.lote.proveedorTracking : fila.lote.fechaLlegadaEstimada ? "Proveedor" : null,
      actualizadoEn: fila.actualizadoEn,
    }];
  });
}
