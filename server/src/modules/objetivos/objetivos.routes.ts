import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarObjetivos,
  obtenerObjetivo,
  obtenerResumenObjetivo,
  obtenerVendedoresObjetivo,
  listarCatalogoVendedores,
  crearObjetivo,
  actualizarObjetivo,
  eliminarObjetivo,
} from "./objetivos.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/vendedores/catalogo", requirePermission("objetivos.ver"), listarCatalogoVendedores);
router.get("/", requirePermission("objetivos.ver"), listarObjetivos);
router.get("/:id", requirePermission("objetivos.ver"), obtenerObjetivo);
router.get("/:id/resumen", requirePermission("objetivos.ver"), obtenerResumenObjetivo);
router.get("/:id/vendedores", requirePermission("objetivos.ver"), obtenerVendedoresObjetivo);
router.post("/", requirePermission("objetivos.crear"), crearObjetivo);
router.patch("/:id", requirePermission("objetivos.editar"), actualizarObjetivo);
router.delete("/:id", requirePermission("objetivos.eliminar"), eliminarObjetivo);

export default router;
