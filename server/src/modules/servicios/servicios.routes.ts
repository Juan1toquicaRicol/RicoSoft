import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarServicios,
  obtenerServicio,
  crearServicio,
  actualizarServicio,
  toggleEstadoServicio,
  eliminarServicio,
} from "./servicios.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/", requirePermission("servicios.ver"), listarServicios);
router.get("/:id", requirePermission("servicios.ver"), obtenerServicio);
router.post("/", requirePermission("servicios.crear"), crearServicio);
router.put("/:id", requirePermission("servicios.editar"), actualizarServicio);
router.patch("/:id/estado", requirePermission("servicios.editar"), toggleEstadoServicio);
router.delete("/:id", requirePermission("servicios.eliminar"), eliminarServicio);

export default router;
