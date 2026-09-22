import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { obtenerMonitoreoJobs, obtenerMonitoreoSiesa } from "./monitoreo.controller";

const router = Router();

router.use(authenticateJWT);

// Monitoreo de integraciones y operación: solo lectura. Reutiliza el permiso
// de ver la integración con Siesa (el de quien administra integraciones) en
// vez de inventar uno nuevo; la auditoría conserva su propio permiso
// (auditoria.ver) y su propia pantalla.
router.get(
  "/siesa",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
  obtenerMonitoreoSiesa,
);
router.get(
  "/jobs",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
  obtenerMonitoreoJobs,
);

export default router;
