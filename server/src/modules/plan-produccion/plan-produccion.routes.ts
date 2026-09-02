import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarPlanesProduccion,
  crearPlanProduccion,
  actualizarEstadoPlanProduccion,
} from "./plan-produccion.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/", requirePermission("plan_produccion.ver"), listarPlanesProduccion);
router.post("/", requirePermission("plan_produccion.gestionar"), crearPlanProduccion);
router.patch("/:id/estado", requirePermission("plan_produccion.gestionar"), actualizarEstadoPlanProduccion);

export default router;
