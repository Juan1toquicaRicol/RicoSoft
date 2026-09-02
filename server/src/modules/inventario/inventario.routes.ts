import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  obtenerInventarioGerencial,
  obtenerPronosticoDemandaGerencial,
  obtenerProduccionRecomendadaGerencial,
  obtenerOportunidadComercialGerencial,
  obtenerCoberturaGerencial,
  obtenerAbastecimientoGerencial,
  obtenerConfiguracionInventario,
  actualizarConfiguracionInventario,
  obtenerDecisionesPlaneacion,
} from "./inventario.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Reutiliza analitica.ver: el módulo Inventario todavía es un bloque
// gerencial de solo lectura (como ventas/financiero), no un módulo con
// permisos propios de CRUD. Un permiso dedicado (inventario.ver) tiene
// sentido cuando el módulo crezca (toma física, ajustes, etc.).
router.get("/resumen", requirePermission("analitica.ver"), obtenerInventarioGerencial);
router.get("/demanda", requirePermission("analitica.ver"), obtenerPronosticoDemandaGerencial);
router.get(
  "/produccion-recomendada",
  requirePermission("analitica.ver"),
  obtenerProduccionRecomendadaGerencial,
);
router.get(
  "/oportunidad-comercial",
  requirePermission("analitica.ver"),
  obtenerOportunidadComercialGerencial,
);
router.get("/cobertura", requirePermission("analitica.ver"), obtenerCoberturaGerencial);
router.get("/abastecimiento", requirePermission("analitica.ver"), obtenerAbastecimientoGerencial);
router.get("/decisiones", requirePermission("analitica.ver"), obtenerDecisionesPlaneacion);
router.get("/configuracion", requirePermission("analitica.ver"), obtenerConfiguracionInventario);
router.put(
  "/configuracion",
  requirePermission("inventario.configurar"),
  actualizarConfiguracionInventario,
);

export default router;
