import { Router } from "express";
import { authenticateJWT, requireSuperadmin } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { crearMembresiaSchema, actualizarMembresiaSchema } from "./membresias.schemas";
import {
  listarTenants,
  listarRolesDeTenant,
  listarDepartamentosDeTenant,
  listarMembresiasUsuario,
  crearMembresia,
  actualizarMembresia,
  eliminarMembresia,
} from "./membresias.controller";

const router = Router();

router.use(authenticateJWT, requireSuperadmin);

router.get("/tenants", listarTenants);
router.get("/tenants/:tenantId/roles", listarRolesDeTenant);
router.get("/tenants/:tenantId/departamentos", listarDepartamentosDeTenant);
router.get("/usuarios/:userId", listarMembresiasUsuario);
router.post("/usuarios/:userId", validarBody(crearMembresiaSchema), crearMembresia);
router.patch("/:id", validarBody(actualizarMembresiaSchema), actualizarMembresia);
router.delete("/:id", eliminarMembresia);

export default router;
