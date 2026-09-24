import { Router } from "express";
import {
  authenticateJWT,
  requireAnyPermission,
  requirePermission,
} from "../../middleware/auth.middleware";
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
  obtenerPedidosComprometidosItem,
  obtenerPedidosComprometidosTodos,
} from "./inventario.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Reutiliza analitica.ver: el módulo Inventario todavía es un bloque
// gerencial de solo lectura (como ventas/financiero), no un módulo con
// permisos propios de CRUD. Un permiso dedicado (inventario.ver) tiene
// sentido cuando el módulo crezca (toma física, ajustes, etc.).
router.get("/resumen", requirePermission("analitica.ver"), obtenerInventarioGerencial);
router.get(
  "/productos/:itemRowId/comprometidos",
  requirePermission("analitica.ver"),
  obtenerPedidosComprometidosItem,
);
// Sin filtro de ítem — alimenta la pantalla de detalle completo a la que
// navega el clic en la tarjeta "Comprometido (estimado)" (agregado de todo
// el inventario, no de un producto puntual).
router.get("/comprometidos", requirePermission("analitica.ver"), obtenerPedidosComprometidosTodos);
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
// Quien puede EDITAR la configuración (inventario.configurar) debe poder LEERLA: sin esto entraba
// a la pantalla y recibía 403 al cargar sus propios valores.
router.get(
  "/configuracion",
  requireAnyPermission(["analitica.ver", "inventario.configurar"]),
  obtenerConfiguracionInventario,
);
router.put(
  "/configuracion",
  requirePermission("inventario.configurar"),
  actualizarConfiguracionInventario,
);

export default router;
