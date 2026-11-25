import { operacionBandeja } from "./bandeja-operacion";
import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { resolverExcepcionSchema } from "./importaciones-bandeja.schemas";
import {
  listarCorreosBandeja,
  obtenerCorreoBandeja,
  buscarOrdenesVinculables,
  obtenerAdjuntoBandeja,
  resolverExcepcionBandeja,
  reprocesarCorreoBandeja,
  reasignarCorreoBandeja,
  obtenerConfiguracionBandeja,
  denegarTriageSinTenant,
} from "./importaciones-bandeja.controller";

/**
 * Bandeja Inteligente de Importaciones — router propio, montado en
 * app.ts bajo /api/importaciones/bandeja (prefijo distinto del router
 * principal de Importaciones para no interferir con sus rutas
 * "/:id" ya existentes). Pertenece funcionalmente al módulo de
 * Importaciones (mismo criterio ya aplicado a Proveedores y Requisitos):
 * no es una aplicación separada, solo un archivo de rutas aparte por
 * tamaño/organización.
 */
const router = Router();

router.use(authenticateJWT);
router.use("/operacion", operacionBandeja);

// Triage cross-tenant (correos sin proveedor identificado): DENEGADO para
// todos, incluido isSuperadmin (flag por tenant, no de plataforma). Va antes
// de las rutas tenant-scoped y cubre cualquier método/subruta.
router.use("/sin-asignar", denegarTriageSinTenant);

router.get(
  "/correos",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER),
  listarCorreosBandeja,
);
router.get(
  "/correos/:id",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER),
  obtenerCorreoBandeja,
);
router.get(
  "/correos/:id/ordenes",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_RESOLVER),
  buscarOrdenesVinculables,
);
router.get(
  "/correos/:id/adjuntos/:adjuntoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER),
  obtenerAdjuntoBandeja,
);
router.post(
  "/correos/:id/excepciones/:excepcionId/resolver",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_RESOLVER),
  validarBody(resolverExcepcionSchema),
  resolverExcepcionBandeja,
);
router.post(
  "/correos/:id/reprocesar",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_PROCESAR),
  reprocesarCorreoBandeja,
);
router.put(
  "/correos/:id/responsable",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_CONFIGURAR),
  reasignarCorreoBandeja,
);
router.get(
  "/configuracion",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_CONFIGURAR),
  obtenerConfiguracionBandeja,
);

export default router;
