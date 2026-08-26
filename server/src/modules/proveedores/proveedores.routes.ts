import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { crearProveedorSchema, actualizarProveedorSchema } from "./proveedores.schemas";
import { listarProveedores, crearProveedor, actualizarProveedor, eliminarProveedor } from "./proveedores.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("proveedores.ver"), listarProveedores);
router.post("/", requirePermission("proveedores.crear"), validarBody(crearProveedorSchema), crearProveedor);
router.patch(
  "/:id",
  requirePermission("proveedores.editar"),
  validarBody(actualizarProveedorSchema),
  actualizarProveedor,
);
router.delete("/:id", requirePermission("proveedores.eliminar"), eliminarProveedor);

export default router;
