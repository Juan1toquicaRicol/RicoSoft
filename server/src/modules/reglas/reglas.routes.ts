import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarReglas, crearRegla, actualizarRegla, eliminarRegla } from "./reglas.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("reglas.ver"), listarReglas);
router.post("/", requirePermission("reglas.crear"), crearRegla);
router.patch("/:id", requirePermission("reglas.editar"), actualizarRegla);
router.delete("/:id", requirePermission("reglas.eliminar"), eliminarRegla);

export default router;
