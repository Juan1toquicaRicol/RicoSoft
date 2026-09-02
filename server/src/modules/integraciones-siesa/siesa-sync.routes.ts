import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  sincronizarProveedores,
  listarSincronizaciones,
  obtenerSincronizacion,
  cancelarSincronizacion,
} from "./siesa-sync.controller";

const router = Router();

router.use(authenticateJWT);

router.post(
  "/proveedores/sincronizar",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_SINCRONIZAR),
  sincronizarProveedores,
);

router.get(
  "/sincronizaciones",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
  listarSincronizaciones,
);
router.get(
  "/sincronizaciones/:id",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
  obtenerSincronizacion,
);
router.post(
  "/sincronizaciones/:id/cancelar",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_SINCRONIZAR),
  cancelarSincronizacion,
);

export default router;
