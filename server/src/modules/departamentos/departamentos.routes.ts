import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarDepartamentos,
  listarDepartamentosPublico,
  listarDepartamentosPropios,
  crearDepartamento,
  actualizarDepartamento,
  eliminarDepartamento,
} from "./departamentos.controller";

const router = Router();

// Público: el formulario de registro necesita listar departamentos sin sesión activa.
router.get("/publico", listarDepartamentosPublico);

router.use(authenticateJWT);

// Cualquier usuario autenticado (sin permiso "departamentos.ver") puede ver
// los departamentos de SU empresa para elegir un "Área" en formularios
// operativos — no es un listado administrativo.
router.get("/mi-empresa", listarDepartamentosPropios);

router.get("/", requirePermission("departamentos.ver"), listarDepartamentos);
router.post("/", requirePermission("departamentos.crear"), crearDepartamento);
router.patch("/:id", requirePermission("departamentos.editar"), actualizarDepartamento);
router.delete("/:id", requirePermission("departamentos.eliminar"), eliminarDepartamento);

export default router;
