import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  ConsecutivoInferiorError,
  anioActualImportaciones,
  esConflictoReintentableConsecutivo,
  fijarConsecutivo,
  formatearCodigoImportacion,
  leerEstadoConsecutivo,
  type EstadoConsecutivo,
} from "./importaciones-consecutivo";

/** Forma pública del consecutivo: siempre el del AÑO ACTUAL y el tenant de la
 * sesión (nunca se acepta tenantId ni año del cliente). */
function serializarConsecutivo(estado: EstadoConsecutivo) {
  return {
    anio: estado.anio,
    siguiente: estado.siguiente,
    codigoSiguiente: formatearCodigoImportacion(estado.anio, estado.siguiente),
    // Un valor por debajo de `siguiente` se rechaza: incluye los números de
    // órdenes anuladas y los códigos existentes del año.
    minimo: estado.siguiente,
  };
}

/** GET /importaciones/consecutivo — siguiente número ESTIMADO del año actual
 * (informativo: no reserva nada; el número real se asigna al guardar la orden). */
export const obtenerConsecutivoImportaciones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const estado = await leerEstadoConsecutivo(
      prisma,
      req.user!.tenantId,
      anioActualImportaciones(),
    );
    return res.json(serializarConsecutivo(estado));
  } catch (error) {
    console.error("Error al consultar el consecutivo de importaciones:", error);
    return res.status(500).json({ message: "No fue posible consultar el consecutivo." });
  }
};

/** PUT /importaciones/consecutivo — fija el siguiente consecutivo del año
 * actual para el tenant activo. Solo hacia arriba. Actualización + auditoría
 * (valor anterior y nuevo) en UNA transacción. */
export const fijarConsecutivoImportaciones = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const solicitado = req.body.siguiente as number;
  const anio = anioActualImportaciones();

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const { antes, despues } = await fijarConsecutivo(tx, tenantId, anio, solicitado);
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "CONSECUTIVO_IMPORTACION_ACTUALIZADO",
          detalle: `${req.user!.nombre} fijó el siguiente consecutivo de importaciones ${anio}: ${formatearCodigoImportacion(anio, antes.siguiente)} → ${formatearCodigoImportacion(anio, despues.siguiente)}.`,
          entidadTipo: "ConsecutivoImportacion",
          entidadId: despues.filaId ?? undefined,
          datosAnteriores: JSON.stringify(serializarConsecutivo(antes)),
          datosNuevos: JSON.stringify(serializarConsecutivo(despues)),
        },
      });
      return despues;
    });
    return res.json(serializarConsecutivo(resultado));
  } catch (error) {
    if (error instanceof ConsecutivoInferiorError) {
      return res.status(400).json({ message: error.message, minimo: error.minimo });
    }
    if (esConflictoReintentableConsecutivo(error)) {
      return res.status(409).json({
        message:
          "El consecutivo se estaba actualizando a la vez. Revisa el valor e intenta de nuevo.",
      });
    }
    console.error("Error al fijar el consecutivo de importaciones:", error);
    return res.status(500).json({ message: "No fue posible actualizar el consecutivo." });
  }
};
