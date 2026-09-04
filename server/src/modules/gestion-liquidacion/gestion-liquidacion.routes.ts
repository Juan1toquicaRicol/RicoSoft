import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarGestionesLiquidacion,
  crearGestionLiquidacion,
  actualizarEstadoGestionLiquidacion,
} from "./gestion-liquidacion.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/", requirePermission("gestion_liquidacion.ver"), listarGestionesLiquidacion);
router.post("/", requirePermission("gestion_liquidacion.gestionar"), crearGestionLiquidacion);
router.patch(
  "/:id/estado",
  requirePermission("gestion_liquidacion.gestionar"),
  actualizarEstadoGestionLiquidacion,
);

export default router;
