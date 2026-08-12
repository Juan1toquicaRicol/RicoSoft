import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarAuditoria } from "./auditoria.controller";

const router = Router();

router.use(authenticateJWT);
router.get("/", requirePermission("auditoria.ver"), listarAuditoria);

export default router;
