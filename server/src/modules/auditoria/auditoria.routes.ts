import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarAuditoria,
  exportarAuditoria,
  opcionesFiltrosAuditoria,
} from "./auditoria.controller";

const router = Router();

router.use(authenticateJWT);
router.get("/", requirePermission("auditoria.ver"), listarAuditoria);
router.get("/filtros", requirePermission("auditoria.ver"), opcionesFiltrosAuditoria);
router.get("/exportar", requirePermission("auditoria.exportar"), exportarAuditoria);

export default router;
