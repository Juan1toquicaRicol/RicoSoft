import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { crearProveedorSchema, actualizarProveedorSchema } from "./proveedores.schemas";
import {
  listarProveedores,
  crearProveedor,
  actualizarProveedor,
  eliminarProveedor,
  obtenerResumenFinancieroProveedor,
} from "./proveedores.controller";

const router = Router();

router.use(authenticateJWT);
// Piloto Fase 2: solo Proveedores usa req.tenantPrisma por ahora — el resto
// de módulos sigue con el cliente Prisma global (ver tenant-prisma.ts).
router.use(attachTenantPrisma);

router.get("/", requirePermission("proveedores.ver"), listarProveedores);
router.post(
  "/",
  requirePermission("proveedores.crear"),
  validarBody(crearProveedorSchema),
  crearProveedor,
);
router.patch(
  "/:id",
  requirePermission("proveedores.editar"),
  validarBody(actualizarProveedorSchema),
  actualizarProveedor,
);
router.delete("/:id", requirePermission("proveedores.eliminar"), eliminarProveedor);
router.get(
  "/:id/resumen-financiero",
  requirePermission("proveedores.ver"),
  obtenerResumenFinancieroProveedor,
);

export default router;
