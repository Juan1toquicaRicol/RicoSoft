import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarCreditos, crearCredito, actualizarCredito } from "./creditos.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("creditos.ver"), listarCreditos);
router.post("/", requirePermission("creditos.gestionar"), crearCredito);
router.patch("/:id", requirePermission("creditos.gestionar"), actualizarCredito);

export default router;
