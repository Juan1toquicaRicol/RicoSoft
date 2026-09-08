import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarPerfilesFuncionales,
  crearPerfilFuncional,
  actualizarPerfilFuncional,
  eliminarPerfilFuncional,
  agregarUsuarioAPerfil,
  quitarUsuarioDePerfil,
} from "./perfiles-funcionales.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/", requirePermission("perfiles_funcionales.ver"), listarPerfilesFuncionales);
router.post("/", requirePermission("perfiles_funcionales.crear"), crearPerfilFuncional);
router.patch("/:id", requirePermission("perfiles_funcionales.editar"), actualizarPerfilFuncional);
router.delete("/:id", requirePermission("perfiles_funcionales.eliminar"), eliminarPerfilFuncional);
router.post(
  "/:id/usuarios",
  requirePermission("perfiles_funcionales.asignar"),
  agregarUsuarioAPerfil,
);
router.delete(
  "/:id/usuarios/:userId",
  requirePermission("perfiles_funcionales.asignar"),
  quitarUsuarioDePerfil,
);

export default router;
