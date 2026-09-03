import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  obtenerResumenAnalitica,
  obtenerDashboardResumen,
  registrarProyeccion,
  obtenerCuentasPorPagar,
  obtenerResumenGerencial,
  obtenerVentasGerencial,
  obtenerVentasPorVendedorGerencial,
  obtenerHistoricoVentasGerencial,
  obtenerClientesVentaGerencial,
} from "./analitica.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/dashboard", obtenerDashboardResumen);
router.get("/resumen", requirePermission("analitica.ver"), obtenerResumenAnalitica);
router.post("/proyeccion", requirePermission("proyeccion.gestionar"), registrarProyeccion);
router.get("/cuentas-por-pagar", requirePermission("analitica.ver"), obtenerCuentasPorPagar);
router.get("/resumen-gerencial", requirePermission("analitica.ver"), obtenerResumenGerencial);
router.get("/ventas", requirePermission("analitica.ver"), obtenerVentasGerencial);
router.get(
  "/ventas/vendedores",
  requirePermission("analitica.ver"),
  obtenerVentasPorVendedorGerencial,
);
router.get(
  "/ventas/historico",
  requirePermission("analitica.ver"),
  obtenerHistoricoVentasGerencial,
);
router.get("/ventas/clientes", requirePermission("analitica.ver"), obtenerClientesVentaGerencial);

export default router;
