import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { sincronizarProveedores } from "./siesa-sync.controller";

const router = Router();

router.use(authenticateJWT);

router.post(
  "/proveedores/sincronizar",
  requirePermission(PERMISOS_SISTEMA.INTEGRACION_SIESA_SINCRONIZAR),
  sincronizarProveedores,
);

export default router;
