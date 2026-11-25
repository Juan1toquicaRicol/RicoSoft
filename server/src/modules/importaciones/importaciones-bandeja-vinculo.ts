import type { Prisma, PrismaClient } from "@prisma/client";
import { crearItemDeTrabajo } from "../../lib/inbox";
import { getTenantPrisma } from "../../lib/tenant-prisma";

export class ConflictoVinculoCorreo extends Error {}

const EVENTO_REVISION = "IMPORTACION_CORREO_REQUIERE_REVISION";

/** Una orden admite correos mientras siga vigente: no eliminada ni anulada. */
export async function bloquearOrdenVigente(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ordenId: string,
): Promise<boolean> {
  const filas = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM dbo.OrdenCompraIntl WITH (UPDLOCK, HOLDLOCK)
    WHERE id = CONVERT(uniqueidentifier, ${ordenId})
      AND tenantId = CONVERT(uniqueidentifier, ${tenantId})
      AND eliminado = 0 AND estado <> 'Anulada'
  `;
  return filas.length === 1;
}

export async function vincularOrdenCorreo(
  tx: Prisma.TransactionClient,
  datos: {
    correoId: string;
    tenantId: string;
    proveedorId: string;
    ordenId: string;
    usuarioId: string;
    excepcionId?: string;
  },
): Promise<void> {
  const { correoId, tenantId, proveedorId, ordenId, usuarioId, excepcionId } = datos;
  const ordenVigente = await bloquearOrdenVigente(tx, tenantId, ordenId)
    && await tx.ordenCompraIntl.count({ where: { id: ordenId, tenantId, proveedorId } });
  if (ordenVigente !== 1) {
    throw new ConflictoVinculoCorreo(
      "La orden ya no está disponible para vincular. Actualiza la Bandeja.",
    );
  }

  const vinculado = await tx.importacionCorreo.updateMany({
    where: {
      id: correoId,
      tenantId,
      proveedorId,
      ordenCompraId: null,
      estadoProcesamiento: "REQUIERE_REVISION",
      proveedor: { activo: true, tenantId },
    },
    data: { ordenCompraId: ordenId, estadoProcesamiento: "PENDIENTE", ultimoError: null,
      ...(tenantId === process.env.IMPORTACIONES_SISTEMAS_TENANT_ID ? { reprocesoHistorico: true } : {}) },
  });
  if (vinculado.count !== 1) {
    throw new ConflictoVinculoCorreo(
      "El correo ya fue vinculado o cambió de estado o proveedor. Actualiza la Bandeja.",
    );
  }

  const resueltas = await tx.importacionExcepcion.updateMany({
    where: {
      ...(excepcionId ? { id: excepcionId } : {}),
      correoId,
      tenantId,
      tipo: "ORDEN_NO_IDENTIFICADA",
      estado: "ABIERTA",
    },
    data: { estado: "RESUELTA", resueltoPorId: usuarioId, resueltoEn: new Date() },
  });
  if (excepcionId && resueltas.count !== 1) {
    throw new ConflictoVinculoCorreo("La excepción de orden ya cambió. Actualiza la Bandeja.");
  }
  await tx.auditoria.create({
    data: {
      tenantId,
      usuarioId,
      accion: "IMPORTACION_CORREO_ORDEN_VINCULADA",
      entidadTipo: "ImportacionCorreo",
      entidadId: correoId,
      detalle: "Correo vinculado a orden de importación.",
      datosNuevos: JSON.stringify({ ordenCompraId: ordenId, proveedorId, excepcionId }),
    },
  });
}

/** Excepciones abiertas que dependen de la orden anterior y pierden sentido. */
const EXCEPCIONES_DE_LA_ORDEN = ["ORDEN_NO_IDENTIFICADA", "REQUISITO_FALTANTE"];

/**
 * Desvincula de una orden que ya no es vigente los correos de la MISMA empresa
 * que todavía apuntan a ella. Cada correo vuelve a Requiere revisión con una
 * excepción de orden que cita la orden anterior, y el vínculo anterior queda
 * en Auditoria (IMPORTACION_CORREO_ORDEN_DESVINCULADA). Corre dentro de la
 * transacción del llamador: la anulación o la recuperación de históricos.
 * Devuelve los correos desvinculados.
 */
export async function desvincularCorreosDeOrden(
  tx: Prisma.TransactionClient,
  datos: {
    tenantId: string;
    ordenId: string;
    numeroOrden: string;
    usuarioId: string | null;
    motivo: "ORDEN_ANULADA";
  },
): Promise<string[]> {
  const { tenantId, ordenId, numeroOrden, usuarioId, motivo } = datos;
  const correos = await tx.importacionCorreo.findMany({
    where: { tenantId, ordenCompraId: ordenId },
    select: { id: true, estadoProcesamiento: true },
  });
  const desvinculados: string[] = [];
  const ahora = new Date();
  for (const correo of correos) {
    const { count } = await tx.importacionCorreo.updateMany({
      where: { id: correo.id, tenantId, ordenCompraId: ordenId },
      data: { ordenCompraId: null, estadoProcesamiento: "REQUIERE_REVISION", ultimoError: null },
    });
    if (count !== 1) continue;
    await tx.importacionExcepcion.updateMany({
      where: {
        correoId: correo.id,
        tenantId,
        estado: "ABIERTA",
        tipo: { in: EXCEPCIONES_DE_LA_ORDEN },
      },
      data: { estado: "DESCARTADA", resueltoPorId: usuarioId, resueltoEn: ahora },
    });
    await tx.importacionExcepcion.create({
      data: {
        tenantId,
        correoId: correo.id,
        tipo: "ORDEN_NO_IDENTIFICADA",
        descripcion: `La orden ${numeroOrden}, vinculada antes a este correo, fue anulada. Selecciona otra orden vigente o crea una nueva.`,
        candidatos: null,
      },
    });
    await tx.auditoria.create({
      data: {
        tenantId,
        usuarioId,
        accion: "IMPORTACION_CORREO_ORDEN_DESVINCULADA",
        entidadTipo: "ImportacionCorreo",
        entidadId: correo.id,
        detalle: `Correo desvinculado de la orden ${numeroOrden} porque la orden fue anulada.`,
        datosAnteriores: JSON.stringify({
          ordenCompraId: ordenId,
          numeroOrden,
          estadoProcesamiento: correo.estadoProcesamiento,
        }),
        datosNuevos: JSON.stringify({
          ordenCompraId: null,
          estadoProcesamiento: "REQUIERE_REVISION",
          motivo,
        }),
      },
    });
    desvinculados.push(correo.id);
  }
  return desvinculados;
}

/** Después de confirmar la transacción: reabre el pendiente en el Inbox de la
 * empresa para cada correo desvinculado (crearItemDeTrabajo nunca lanza). */
export async function avisarCorreosDesvinculados(
  tenantId: string,
  correoIds: string[],
): Promise<void> {
  if (!correoIds.length) return;
  const tenantPrisma = getTenantPrisma(tenantId);
  for (const correoId of correoIds) {
    await crearItemDeTrabajo(tenantPrisma, {
      tenantId,
      tipo: EVENTO_REVISION,
      categoria: "REVISION",
      sourceModule: "importaciones-bandeja",
      sourceEntityTipo: "ImportacionCorreo",
      sourceEntityId: correoId,
      titulo: "Correo de importación requiere revisión",
      descripcion: "La orden vinculada fue anulada. Selecciona otra orden para el correo.",
      prioridad: "ALTA",
      enlace: `/importaciones/bandeja/${correoId}`,
    });
  }
}

/**
 * Recuperación de históricos: correos de la empresa que siguen apuntando a una
 * orden ya anulada o eliminada (anuladas antes de existir la desvinculación).
 * Aplica la misma desvinculación, orden por orden, cada una en su transacción.
 */
export async function recuperarCorreosConOrdenAnulada(
  db: PrismaClient,
  tenantId: string,
  opciones: { aplicar: boolean },
): Promise<{ ordenId: string; numeroOrden: string; correoIds: string[] }[]> {
  const ordenes = await db.ordenCompraIntl.findMany({
    where: {
      tenantId,
      OR: [{ eliminado: true }, { estado: "Anulada" }],
      correosBandeja: { some: { tenantId } },
    },
    select: { id: true, numeroOrden: true, codigo: true },
  });
  const resultado: { ordenId: string; numeroOrden: string; correoIds: string[] }[] = [];
  for (const orden of ordenes) {
    const numeroOrden = orden.codigo ?? orden.numeroOrden;
    if (!opciones.aplicar) {
      const correos = await db.importacionCorreo.findMany({
        where: { tenantId, ordenCompraId: orden.id },
        select: { id: true },
      });
      resultado.push({ ordenId: orden.id, numeroOrden, correoIds: correos.map((c) => c.id) });
      continue;
    }
    const correoIds = await db.$transaction((tx) =>
      desvincularCorreosDeOrden(tx, {
        tenantId,
        ordenId: orden.id,
        numeroOrden,
        usuarioId: null,
        motivo: "ORDEN_ANULADA",
      }),
    );
    await avisarCorreosDesvinculados(tenantId, correoIds);
    resultado.push({ ordenId: orden.id, numeroOrden, correoIds });
  }
  return resultado;
}
