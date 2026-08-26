import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  obtenerResumenAnalitica,
  obtenerDashboardResumen,
  registrarProyeccion,
} from "./analitica.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/dashboard", obtenerDashboardResumen);
router.get("/resumen", requirePermission("analitica.ver"), obtenerResumenAnalitica);
router.post("/proyeccion", requirePermission("proyeccion.gestionar"), registrarProyeccion);

export default router;
