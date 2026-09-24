import { Router } from "express";
import {
  authenticateJWT,
  requireAllPermissions,
  requireAnyPermission,
  requirePermission,
  requireSuperadmin,
} from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { listarDocumentosComerciales } from "./documentos.controller";
import { asyncHandler } from "../../lib/async-handler";
import { sincronizarCotizacionesSiesaController } from "./cotizaciones-siesa.controller";
import {
  listarCotizaciones,
  obtenerCotizacion,
  crearCotizacion,
  actualizarCotizacion,
  enviarCotizacion,
  aprobarCotizacion,
  rechazarCotizacion,
  anularCotizacion,
  crearProformaDesdeCotizacion,
  asignarErpCotizacion,
  eliminarCotizacion,
} from "./cotizaciones.controller";
import {
  listarPedidos,
  obtenerPedido,
  obtenerCompromisoInventarioPedido,
  obtenerEstadoPedidoUnoeeHandler,
  crearPedidoDesdeProforma,
  confirmarPedido,
  marcarListoParaErpPedido,
  anularPedido,
  asignarErpPedido,
  eliminarPedido,
} from "./pedidos.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Bandeja agregada (Comercial → Gestión Comercial) — agrega Cotizaciones,
// Proformas y Pedidos comerciales, cada uno con su propio permiso VER; basta
// con tener acceso a UNA de las tres secciones para poder abrir la bandeja
// (el controller filtra qué tipos incluye según los permisos reales, ver
// documentos.controller.ts).
router.get(
  "/documentos",
  requireAnyPermission([
    PERMISOS_SISTEMA.COTIZACIONES_VER,
    PERMISOS_SISTEMA.PROFORMAS_VER,
    PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
  ]),
  listarDocumentosComerciales,
);

// Cotizaciones
// Ingesta de cotizaciones desde Siesa (esqueleto: simulación, solo lectura). Va ANTES de las rutas
// "/cotizaciones/:id..." para que "siesa" nunca se interprete como un id.
router.post(
  "/cotizaciones/siesa/sincronizar",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR),
  asyncHandler(sincronizarCotizacionesSiesaController),
);
router.get(
  "/cotizaciones",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_VER),
  listarCotizaciones,
);
router.get(
  "/cotizaciones/:id",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_VER),
  obtenerCotizacion,
);
router.post(
  "/cotizaciones",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR),
  crearCotizacion,
);
router.patch(
  "/cotizaciones/:id",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR),
  actualizarCotizacion,
);
// Enviar y anular son operaciones ORDINARIAS del ciclo de vida del
// documento, no decisiones de autoridad: van en GESTIONAR. Antes exigían
// COTIZACIONES_APROBAR, lo que obligaba a dar poder de aprobación a
// cualquiera que solo necesitara enviarle la cotización al cliente.
router.post(
  "/cotizaciones/:id/enviar",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR),
  enviarCotizacion,
);
router.post(
  "/cotizaciones/:id/anular",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR),
  anularCotizacion,
);
// Aprobar/rechazar SÍ son decisión de autoridad: permiso especial, que
// depende de VER pero no de GESTIONAR (permite un aprobador que revisa y
// decide sin poder editar el documento).
router.post(
  "/cotizaciones/:id/aprobar",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_APROBAR),
  aprobarCotizacion,
);
router.post(
  "/cotizaciones/:id/rechazar",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_APROBAR),
  rechazarCotizacion,
);
// Cruza dos secciones: crea una Proforma Y cambia el estado de la Cotización
// a CONVERTIDA, así que exige gestionar en AMBAS. Antes exigía solo
// cotizaciones.aprobar y creaba la Proforma invocando su handler
// directamente, saltándose por completo el permiso de Proformas.
router.post(
  "/cotizaciones/:id/proforma",
  requireAllPermissions([
    PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
    PERMISOS_SISTEMA.PROFORMAS_GESTIONAR,
  ]),
  crearProformaDesdeCotizacion,
);
// Vincular/corregir a mano el documento Siesa (CDV) de una cotización.
router.post(
  "/cotizaciones/:id/asignar-erp",
  requirePermission(PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR),
  asignarErpCotizacion,
);
// Borrado PERMANENTE — a diferencia de anular (conserva el histórico), esto
// elimina la fila y sus items. Solo superadmin.
router.delete("/cotizaciones/:id", requireSuperadmin, eliminarCotizacion);

// Pedidos comerciales
router.get("/pedidos", requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER), listarPedidos);
router.get(
  "/pedidos/:id",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER),
  obtenerPedido,
);
// Compromiso de inventario en Siesa (solo lectura; unión por erpRowId).
router.get(
  "/pedidos/:id/compromiso-inventario",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER),
  obtenerCompromisoInventarioPedido,
);
// Estado del Pedido UnoEE: cabecera + ítems del PDV vinculado (solo lectura).
router.get(
  "/pedidos/:id/estado-unoee",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER),
  obtenerEstadoPedidoUnoeeHandler,
);
// Confirmar y marcar listo para ERP avanzan el pedido hacia el ERP: son la
// decisión de autoridad de esta sección (permiso especial).
router.post(
  "/pedidos/:id/confirmar",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_CONFIRMAR),
  confirmarPedido,
);
router.post(
  "/pedidos/:id/listo-erp",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_CONFIRMAR),
  marcarListoParaErpPedido,
);
// Anular es operación ordinaria del ciclo de vida, no "confirmar": va en
// GESTIONAR (antes exigía CONFIRMAR, que es un permiso de otro significado).
router.post(
  "/pedidos/:id/anular",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR),
  anularPedido,
);
// Vincular/corregir a mano el PDV real de Siesa de un pedido (V1: solo
// documento, ver asignarErpPedido) — mismo permiso que el resto de
// operaciones ordinarias de gestión de Pedidos, sin permiso nuevo (mismo
// criterio que asignar-erp de Cotización, que tampoco tiene uno propio).
router.post(
  "/pedidos/:id/asignar-erp",
  requirePermission(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR),
  asignarErpPedido,
);
// Borrado PERMANENTE — solo superadmin.
router.delete("/pedidos/:id", requireSuperadmin, eliminarPedido);

// Crear Pedido desde una Proforma activa: cruza dos secciones (lee la
// Proforma, crea el Pedido), así que exige ver Proformas + gestionar Pedidos.
router.post(
  "/proformas/:id/pedido",
  requireAllPermissions([
    PERMISOS_SISTEMA.PROFORMAS_VER,
    PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR,
  ]),
  crearPedidoDesdeProforma,
);

export default router;
