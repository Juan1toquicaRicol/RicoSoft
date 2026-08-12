// server/src/modules/usuarios/usuarios.routes.ts
import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware"; // <-- Verificar que esta ruta exista
import {
  listarUsuarios,
  cambiarEstadoUsuario,
  asignarRolUsuario,
  asignarDepartamentoUsuario,
} from "./usuarios.controller"; // <-- Mismo directorio

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("usuarios.ver"), listarUsuarios);
router.patch("/:id/estado", requirePermission("usuarios.desactivar"), cambiarEstadoUsuario);
router.patch("/:id/rol", requirePermission("usuarios.cambiar_rol"), asignarRolUsuario);
router.patch(
  "/:id/departamento",
  requirePermission("usuarios.cambiar_departamento"),
  asignarDepartamentoUsuario,
);

export default router;
