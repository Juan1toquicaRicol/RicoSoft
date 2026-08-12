import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarServicios, crearServicio, toggleEstadoServicio } from "./servicios.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("servicios.ver"), listarServicios);
router.post("/", requirePermission("servicios.crear"), crearServicio);
router.patch("/:id/estado", requirePermission("servicios.editar"), toggleEstadoServicio);

export default router;
