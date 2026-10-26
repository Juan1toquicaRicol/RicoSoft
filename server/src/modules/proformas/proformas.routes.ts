import { Router } from "express";
import {
  authenticateJWT,
  requireAnyPermission,
  requirePermission,
  requireSuperadmin,
} from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  buscarClientesProforma,
  obtenerDatosFacturacionCliente,
  listarBodegasProforma,
  obtenerConfiguracionComercial,
  actualizarConfiguracionComercial,
  obtenerSiguienteNumeroProforma,
  listarProformas,
  obtenerProforma,
  crearProforma,
  actualizarProforma,
  buscarCotizaciones,
  obtenerCotizacion,
  anularProforma,
  aceptarProforma,
  eliminarProforma,
  asignarDocumentoErpProforma,
} from "./proformas.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Rutas de path fijo ANTES de "/:id" — de lo contrario Express las
// interpretaría como un id de proforma.
//
// Proformas es su propia sección del módulo Comercial (modelo Módulo →
// Sección → Ver/Manipular): antes reutilizaba "ventas.ver" (el permiso de la
// pantalla Centro Comercial) para TODO, lectura y escritura. Se separa en
// PROFORMAS_VER/PROFORMAS_GESTIONAR — "ventas.ver" sigue intacto para
// /ventas y Clientes, que no cambian.
router.get(
  "/clientes/buscar",
  requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER),
  buscarClientesProforma,
);
router.get(
  "/clientes/:clienteRowId/datos-facturacion",
  requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER),
  obtenerDatosFacturacionCliente,
);
router.get("/bodegas", requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER), listarBodegasProforma);
router.get(
  "/cotizaciones/buscar",
  requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER),
  buscarCotizaciones,
);
router.get(
  "/cotizaciones/:id",
  requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER),
  obtenerCotizacion,
);
router.get(
  "/siguiente-numero",
  requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER),
  obtenerSiguienteNumeroProforma,
);
// Quien puede EDITAR la configuración comercial (configuracion.editar) debe poder LEERLA aunque no
// tenga proformas.ver (la pantalla Config. de negocio la carga al entrar).
router.get(
  "/configuracion-comercial",
  requireAnyPermission([PERMISOS_SISTEMA.PROFORMAS_VER, PERMISOS_SISTEMA.CONFIGURACION_EDITAR]),
  obtenerConfiguracionComercial,
);
router.put(
  "/configuracion-comercial",
  requirePermission("configuracion.editar"),
  actualizarConfiguracionComercial,
);

router.get("/", requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER), listarProformas);
router.get("/:id", requirePermission(PERMISOS_SISTEMA.PROFORMAS_VER), obtenerProforma);
router.post("/", requirePermission(PERMISOS_SISTEMA.PROFORMAS_GESTIONAR), crearProforma);
router.patch("/:id", requirePermission(PERMISOS_SISTEMA.PROFORMAS_GESTIONAR), actualizarProforma);
router.post("/:id/anular", requirePermission(PERMISOS_SISTEMA.PROFORMAS_GESTIONAR), anularProforma);
// Aceptar exige su permiso propio (comercial.proformas.aceptar, que a su vez exige proformas.ver):
// aceptar es una decisión comercial distinta de crear/editar la proforma.
router.post("/:id/aceptar", requirePermission(PERMISOS_SISTEMA.PROFORMAS_ACEPTAR), aceptarProforma);
// Vincular/corregir a mano el documento Siesa (CDV) de una proforma cuando
// la búsqueda automática no lo encontró — mismo permiso que editar la
// proforma, no requiere superadmin.
router.patch(
  "/:id/documento-erp",
  requirePermission(PERMISOS_SISTEMA.PROFORMAS_GESTIONAR),
  asignarDocumentoErpProforma,
);
// Borrado PERMANENTE — a diferencia de anular (que conserva el histórico),
// esto elimina la fila y sus items. Solo superadmin, ver requireSuperadmin.
router.delete("/:id", requireSuperadmin, eliminarProforma);

export default router;
