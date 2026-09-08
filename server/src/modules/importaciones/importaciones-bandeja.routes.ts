import { Router } from "express";
import {
  authenticateJWT,
  requirePermission,
  requireSuperadmin,
} from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  resolverExcepcionSchema,
  asignarProveedorCorreoSinTenantSchema,
} from "./importaciones-bandeja.schemas";
import {
  listarCorreosBandeja,
  obtenerCorreoBandeja,
  obtenerAdjuntoBandeja,
  resolverExcepcionBandeja,
  reprocesarCorreoBandeja,
  obtenerConfiguracionBandeja,
  listarCorreosSinAsignar,
  asignarProveedorACorreoSinTenant,
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

// Triage cross-tenant (correos sin proveedor identificado) — SOLO
// superadmin, antes de las rutas tenant-scoped para que "sin-asignar" nunca
// se interprete como un :id.
router.get("/sin-asignar", requireSuperadmin, listarCorreosSinAsignar);
router.post(
  "/sin-asignar/:id/asignar-proveedor",
  requireSuperadmin,
  validarBody(asignarProveedorCorreoSinTenantSchema),
  asignarProveedorACorreoSinTenant,
);

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
router.get(
  "/configuracion",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_CONFIGURAR),
  obtenerConfiguracionBandeja,
);

export default router;
