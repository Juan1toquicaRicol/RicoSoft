import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarModulos, listarModulosMenu, actualizarModulo } from "./modulos.controller";

const router = Router();

router.use(authenticateJWT);

// Accesible para cualquier usuario autenticado: alimenta el sidebar.
router.get("/menu", listarModulosMenu);

router.get("/", requirePermission("modulos.ver"), listarModulos);
router.patch("/:id", requirePermission("modulos.gestionar"), actualizarModulo);

export default router;
