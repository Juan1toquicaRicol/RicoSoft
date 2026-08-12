import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarRoles, crearRol, actualizarRol, eliminarRol } from "./roles.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("roles.ver"), listarRoles);
router.post("/", requirePermission("roles.crear"), crearRol);
router.patch("/:id", requirePermission("roles.editar"), actualizarRol);
router.delete("/:id", requirePermission("roles.eliminar"), eliminarRol);

export default router;
