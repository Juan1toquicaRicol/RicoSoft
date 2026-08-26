// server/src/modules/usuarios/usuarios.routes.ts
import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware"; // <-- Verificar que esta ruta exista
import { validarBody } from "../../middleware/validate.middleware";
import {
  crearUsuarioSchema,
  actualizarPerfilPropioSchema,
  cambiarPasswordPropioSchema,
  cambiarEstadoSchema,
  asignarRolSchema,
  asignarDepartamentoSchema,
  cambiarEmailSchema,
  resetPasswordSchema,
} from "./usuarios.schemas";
import {
  listarUsuarios,
  listarUsuariosPorDepartamento,
  crearUsuario,
  cambiarEstadoUsuario,
  asignarRolUsuario,
  asignarDepartamentoUsuario,
  actualizarPerfilPropio,
  cambiarPasswordPropio,
  cambiarEmailUsuario,
  resetPasswordUsuario,
  eliminarUsuario,
} from "./usuarios.controller"; // <-- Mismo directorio

const router = Router();

router.use(authenticateJWT);

// Autoservicio: cualquier usuario autenticado puede ver/editar SU PROPIO
// perfil (el id sale del JWT, nunca de la URL). No requiere permiso
// administrativo especial ni expone datos de otros usuarios.
router.patch("/me", validarBody(actualizarPerfilPropioSchema), actualizarPerfilPropio);
router.patch("/me/password", validarBody(cambiarPasswordPropioSchema), cambiarPasswordPropio);

// Selector de responsable por área: cualquier usuario autenticado puede
// consultar quiénes pertenecen a un departamento (solo id + nombre) para
// asignar facturas/solicitudes, sin necesitar el permiso "usuarios.ver".
router.get("/por-departamento/:departamentoId", listarUsuariosPorDepartamento);

router.get("/", requirePermission("usuarios.ver"), listarUsuarios);
router.post("/", requirePermission("usuarios.crear"), validarBody(crearUsuarioSchema), crearUsuario);
router.patch(
  "/:id/estado",
  requirePermission("usuarios.desactivar"),
  validarBody(cambiarEstadoSchema),
  cambiarEstadoUsuario,
);
router.patch(
  "/:id/rol",
  requirePermission("usuarios.cambiar_rol"),
  validarBody(asignarRolSchema),
  asignarRolUsuario,
);
router.patch(
  "/:id/departamento",
  requirePermission("usuarios.cambiar_departamento"),
  validarBody(asignarDepartamentoSchema),
  asignarDepartamentoUsuario,
);
router.patch(
  "/:id/email",
  requirePermission("usuarios.editar"),
  validarBody(cambiarEmailSchema),
  cambiarEmailUsuario,
);
router.patch(
  "/:id/password",
  requirePermission("usuarios.reset_password"),
  validarBody(resetPasswordSchema),
  resetPasswordUsuario,
);
router.delete("/:id", requirePermission("usuarios.eliminar"), eliminarUsuario);

export default router;
