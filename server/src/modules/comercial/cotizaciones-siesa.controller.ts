import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { sincronizarCotizacionesSiesaSchema } from "./comercial.schemas";
import {
  SiesaCiaNoConfiguradaError,
  sincronizarCotizacionesSiesa,
} from "./cotizaciones-siesa.service";

/**
 * POST /comercial/cotizaciones/siesa/sincronizar — ingesta de Cotizaciones
 * desde Siesa. Body: { desde?, limite?, guardar? }. Sin `guardar` (default) solo
 * SIMULA; con guardar=true crea/actualiza cotizaciones en BORRADOR. Se registra
 * con asyncHandler + requirePermission(COTIZACIONES_GESTIONAR).
 *
 * El tenant y la compañía Siesa salen SIEMPRE de la sesión (el body solo trae
 * `desde` y `limite`; cualquier ciaId/tenantId enviado se ignora). Los fallos
 * de Siesa se propagan al manejador global (502 uniforme con mensaje fijo).
 */
export const sincronizarCotizacionesSiesaController = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const parseo = sincronizarCotizacionesSiesaSchema.safeParse(req.body ?? {});
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  try {
    // El actor sale de la sesión: se usa como creadoPor y en la auditoría de cada escritura.
    const resultado = await sincronizarCotizacionesSiesa(req.user!.tenantId, parseo.data, {
      id: req.user!.id,
      nombre: req.user!.nombre,
    });
    return res.json(resultado);
  } catch (error) {
    if (error instanceof SiesaCiaNoConfiguradaError) {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }
};
