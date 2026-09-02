import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { crearPermisoSchema, actualizarPermisoSchema } from "./permisos.schemas";
import {
  listarPermisos,
  crearPermiso,
  actualizarPermiso,
  eliminarPermiso,
} from "./permisos.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("permisos.ver"), listarPermisos);
router.post(
  "/",
  requirePermission("permisos.gestionar"),
  validarBody(crearPermisoSchema),
  crearPermiso,
);
router.patch(
  "/:id",
  requirePermission("permisos.gestionar"),
  validarBody(actualizarPermisoSchema),
  actualizarPermiso,
);
router.delete("/:id", requirePermission("permisos.gestionar"), eliminarPermiso);

export default router;
