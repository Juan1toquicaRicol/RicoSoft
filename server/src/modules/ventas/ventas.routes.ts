import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  obtenerDisponibilidadComercial,
  obtenerCentroComercial,
  buscarProductosVenta,
  obtenerContextoProducto,
  obtenerHistoricoComprasCliente,
  obtenerClienteResumen,
  listarPedidosCliente,
  obtenerTrazabilidadPedido,
  listarRemisionesCliente,
  obtenerDetalleRemision,
  listarFacturasCliente,
} from "./ventas.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/disponibilidad", requirePermission("ventas.ver"), obtenerDisponibilidadComercial);
router.get("/centro", requirePermission("ventas.ver"), obtenerCentroComercial);
router.get("/productos/buscar", requirePermission("ventas.ver"), buscarProductosVenta);
router.get(
  "/productos/:itemRowId/contexto",
  requirePermission("ventas.ver"),
  obtenerContextoProducto,
);
router.get(
  "/clientes/:clienteRowId/historico",
  requirePermission("ventas.ver"),
  obtenerHistoricoComprasCliente,
);

// --- Ficha 360 del cliente (CRM) ---
router.get(
  "/clientes/:clienteRowId/resumen",
  requirePermission("ventas.ver"),
  obtenerClienteResumen,
);
router.get(
  "/clientes/:clienteRowId/pedidos",
  requirePermission("ventas.ver"),
  listarPedidosCliente,
);
router.get(
  "/clientes/:clienteRowId/pedidos/:pedidoRowId/trazabilidad",
  requirePermission("ventas.ver"),
  obtenerTrazabilidadPedido,
);
router.get(
  "/clientes/:clienteRowId/remisiones",
  requirePermission("ventas.ver"),
  listarRemisionesCliente,
);
router.get(
  "/clientes/:clienteRowId/remisiones/:remisionRowId",
  requirePermission("ventas.ver"),
  obtenerDetalleRemision,
);
router.get(
  "/clientes/:clienteRowId/facturas",
  requirePermission("ventas.ver"),
  listarFacturasCliente,
);

export default router;
