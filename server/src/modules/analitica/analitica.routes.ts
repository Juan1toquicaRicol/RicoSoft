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
  obtenerCatalogoAnalisis,
  ejecutarAnalisisConstructor,
  listarAnalisisGuardados,
  obtenerAnalisisGuardado,
  crearAnalisisGuardado,
  eliminarAnalisisGuardado,
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

// Constructor de análisis (P0): catálogo cerrado + ejecución + análisis
// guardados. Reutiliza el mismo permiso "analitica.ver" que ya protege el
// resto del módulo — no se crea un permiso nuevo (ver instrucciones de la
// tarea): quien puede ver Analítica puede construir/ejecutar/guardar sus
// propios análisis sobre el mismo catálogo cerrado de métricas.
router.get("/analisis/catalogo", requirePermission("analitica.ver"), obtenerCatalogoAnalisis);
router.post("/analisis/ejecutar", requirePermission("analitica.ver"), ejecutarAnalisisConstructor);
router.get("/analisis/guardados", requirePermission("analitica.ver"), listarAnalisisGuardados);
router.post("/analisis/guardados", requirePermission("analitica.ver"), crearAnalisisGuardado);
router.get("/analisis/guardados/:id", requirePermission("analitica.ver"), obtenerAnalisisGuardado);
router.delete(
  "/analisis/guardados/:id",
  requirePermission("analitica.ver"),
  eliminarAnalisisGuardado,
);

export default router;
