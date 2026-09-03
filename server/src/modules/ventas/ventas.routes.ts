import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  obtenerDisponibilidadComercial,
  obtenerCentroComercial,
  buscarProductosVenta,
  obtenerContextoProducto,
  obtenerHistoricoComprasCliente,
} from "./ventas.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/disponibilidad", requirePermission("ventas.ver"), obtenerDisponibilidadComercial);
router.get("/centro", requirePermission("ventas.ver"), obtenerCentroComercial);
router.get("/productos/buscar", requirePermission("ventas.ver"), buscarProductosVenta);
router.get("/productos/:itemRowId/contexto", requirePermission("ventas.ver"), obtenerContextoProducto);
router.get(
  "/clientes/:clienteRowId/historico",
  requirePermission("ventas.ver"),
  obtenerHistoricoComprasCliente,
);

export default router;
