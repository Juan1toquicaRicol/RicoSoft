import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarDepartamentos,
  listarDepartamentosPublico,
  crearDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
} from "./departamentos.controller";

const router = Router();

// Público: el formulario de registro necesita listar departamentos sin sesión activa.
router.get("/publico", listarDepartamentosPublico);

router.use(authenticateJWT);

router.get("/", requirePermission("departamentos.ver"), listarDepartamentos);
router.post("/", requirePermission("departamentos.crear"), crearDepartamento);
router.patch("/:id", requirePermission("departamentos.editar"), actualizarDepartamento);
router.delete("/:id", requirePermission("departamentos.eliminar"), eliminarDepartamento);

export default router;
