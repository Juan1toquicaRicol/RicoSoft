import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarSeguimientosCliente,
  crearSeguimiento,
  listarProximosSeguimientos,
} from "./oportunidades.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Reutiliza analitica.ver — mismo permiso que ya gobierna
// GET /inventario/oportunidad-comercial (la fuente de la lista de
// oportunidades); no se crea un permiso paralelo para esta capa ligera de
// seguimiento.
router.get("/seguimientos/pendientes", requirePermission("analitica.ver"), listarProximosSeguimientos);
router.get(
  "/:clienteRowId/seguimientos",
  requirePermission("analitica.ver"),
  listarSeguimientosCliente,
);
router.post("/:clienteRowId/seguimientos", requirePermission("analitica.ver"), crearSeguimiento);

export default router;
