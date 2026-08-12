import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { obtenerResumenAnalitica, registrarProyeccion } from "./analitica.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/resumen", requirePermission("analitica.ver"), obtenerResumenAnalitica);
router.post("/proyeccion", requirePermission("proyeccion.gestionar"), registrarProyeccion);

export default router;
