import { asignacionEmbarqueSchema, guardarAsignacionEmbarque, vincularItemHistorico, vinculoItemSiesaSchema } from "./importaciones-disponibilidad";
import { Router } from "express";
import {
  authenticateJWT,
  requireAnyPermission,
  requireAllPermissions,
  requirePermission,
} from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import {
  validarExpedienteIdParaArchivo,
  uploadDocumentoExpediente,
  validarVistoBuenoIdParaArchivo,
  uploadDocumentoVistoBueno,
  validarOrdenIdParaArchivo,
  uploadDocumentoOrdenCompraIntl,
  validarLoteIdParaArchivo,
  uploadDocumentoLoteImportacion,
} from "../../middleware/upload.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  crearLoteImportacionSchema,
  crearOrdenCompraIntlSchema,
  actualizarEstadoLoteSchema,
  actualizarEmbarqueLoteSchema,
  crearContenedorLoteSchema,
  liquidarCosteoImportacionSchema,
  registrarHitoLoteSchema,
  actualizarExpedienteAduaneroSchema,
  crearVistoBuenoSchema,
  actualizarVistoBuenoSchema,
  crearActividadImportacionSchema,
  actualizarActividadImportacionSchema,
  crearNovedadImportacionSchema,
  resolverNovedadImportacionSchema,
  crearPagoImportacionSchema,
  actualizarEstadoPagoImportacionSchema,
  cerrarOrdenCompraIntlSchema,
  fijarConsecutivoImportacionSchema,
} from "./importaciones.schemas";
import {
  listarOrdenesCompraIntl,
  obtenerOrdenCompraIntl,
  obtenerTrmOficialController,
  buscarItemsOrdenCompraIntl,
  listarResponsablesImportacion,
  crearOrdenCompraIntl,
  crearLoteImportacion,
  actualizarEstadoLote,
  actualizarEmbarqueLote,
  crearContenedorLote,
  eliminarContenedorLote,
  sincronizarTrackingLote,
  recibirPreCompraPlanta,
  liquidarCosteoImportacion,
  anularOrdenCompraIntl,
  actualizarExpedienteAduanero,
  subirDocumentoExpedienteAduanero,
  obtenerDocumentoExpedienteAduanero,
  eliminarDocumentoExpedienteAduanero,
  crearVistoBueno,
  actualizarVistoBueno,
  subirDocumentoVistoBueno,
  obtenerDocumentoVistoBueno,
  registrarHitoLote,
  eliminarHitoLote,
  subirDocumentoLote,
  obtenerDocumentoLote,
  eliminarDocumentoLote,
  subirDocumentoOrdenCompraIntl,
  obtenerDocumentoOrdenCompraIntl,
  eliminarDocumentoOrdenCompraIntl,
  crearActividadImportacion,
  actualizarActividadImportacion,
  crearNovedadImportacion,
  resolverNovedadImportacion,
  crearPagoImportacion,
  actualizarEstadoPagoImportacion,
  cerrarOrdenCompraIntl,
} from "./importaciones.controller";
import {
  listarRequisitosProveedor,
  listarProveedoresConfigurados,
  crearRequisitoProveedor,
  actualizarRequisitoProveedor,
  eliminarRequisitoProveedor,
} from "./importaciones-requisitos-proveedor.controller";
import {
  obtenerConsecutivoImportaciones,
  fijarConsecutivoImportaciones,
} from "./importaciones-consecutivo.controller";
import {
  obtenerResumenAnaliticaImportaciones,
  listarOperacionesAnaliticaImportaciones,
} from "./importaciones-analitica.controller";
import {
  crearRequisitoProveedorSchema,
  actualizarRequisitoProveedorSchema,
} from "./importaciones-requisitos-proveedor.schemas";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Proveedores y requisitos — antes de "/:id" a propósito (mismo motivo que
// /trm-oficial: si quedara después, Express interpretaría "proveedores"
// como un :id).
router.get(
  "/proveedores/configurados",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_VER),
  listarProveedoresConfigurados,
);
router.get(
  "/proveedores/:proveedorId/requisitos",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_VER),
  listarRequisitosProveedor,
);
router.post(
  "/proveedores/:proveedorId/requisitos",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_CREAR),
  validarBody(crearRequisitoProveedorSchema),
  crearRequisitoProveedor,
);
router.patch(
  "/proveedores/requisitos/:requisitoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_EDITAR),
  validarBody(actualizarRequisitoProveedorSchema),
  actualizarRequisitoProveedor,
);
router.delete(
  "/proveedores/requisitos/:requisitoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_ELIMINAR),
  eliminarRequisitoProveedor,
);

// Analítica de Importaciones V1 — antes de "/:id" a propósito, mismo motivo
// que /trm-oficial: si quedara después, Express interpretaría "analitica"
// como un :id. Reutiliza IMPORTACIONES_VER (misma responsabilidad de
// consulta que el resto del módulo), sin crear un permiso nuevo.
router.get(
  "/analitica/resumen",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  obtenerResumenAnaliticaImportaciones,
);
router.get(
  "/analitica/operaciones",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  listarOperacionesAnaliticaImportaciones,
);

// Consecutivo de órdenes (IMP-<año>-<n>) del año actual y el tenant de la sesión.
// Antes de "/:id" (mismo motivo que /trm-oficial). Se lee con importaciones.crear
// (el formulario muestra el número estimado) O configuracion.editar (la pantalla
// Config. de negocio); se FIJA solo con configuracion.editar.
router.get(
  "/consecutivo",
  requireAnyPermission([
    PERMISOS_SISTEMA.IMPORTACIONES_CREAR,
    PERMISOS_SISTEMA.CONFIGURACION_EDITAR,
  ]),
  obtenerConsecutivoImportaciones,
);
router.put(
  "/consecutivo",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_EDITAR),
  validarBody(fijarConsecutivoImportacionSchema),
  fijarConsecutivoImportaciones,
);

router.get("/", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER), listarOrdenesCompraIntl);
// Antes de "/:id" a propósito: si quedara después, Express interpretaría
// "trm-oficial" como un :id y nunca llegaría a este handler.
router.get(
  "/trm-oficial",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  obtenerTrmOficialController,
);
router.get(
  "/items-siesa/buscar",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  buscarItemsOrdenCompraIntl,
);
// Usuarios activos del tenant para el selector "Responsable de la
// importación" — mismo patrón que /usuarios/por-departamento (no requiere
// el permiso administrativo "usuarios.ver", basta con poder crear órdenes).
router.get(
  "/responsables",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  listarResponsablesImportacion,
);
router.get("/:id", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER), obtenerOrdenCompraIntl);
const permisoVincularCorreo = requireAllPermissions([
  PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER,
  PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_RESOLVER,
]);

router.post(
  "/",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(crearOrdenCompraIntlSchema),
  (req, res, next) => (req.body.correoOrigenId ? permisoVincularCorreo(req, res, next) : next()),
  crearOrdenCompraIntl,
);
router.delete(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_ELIMINAR),
  anularOrdenCompraIntl,
);

// Documentos iniciales de la orden (Cotización/Proforma Invoice/Oferta
// comercial/Otros) — reutiliza IMPORTACIONES_CREAR (misma responsabilidad
// que registrar la orden) para subir/eliminar, e IMPORTACIONES_VER para
// descargar, sin crear un permiso nuevo.
router.get(
  "/:id/documentos/:documentoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  obtenerDocumentoOrdenCompraIntl,
);
router.post(
  "/:id/documentos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarOrdenIdParaArchivo,
  uploadDocumentoOrdenCompraIntl,
  subirDocumentoOrdenCompraIntl,
);
router.delete(
  "/:id/documentos/:documentoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  eliminarDocumentoOrdenCompraIntl,
);

router.post(
  "/:id/lotes",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(crearLoteImportacionSchema),
  crearLoteImportacion,
);
router.put(
  "/items/:itemId/vinculo-siesa",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(vinculoItemSiesaSchema),
  vincularItemHistorico,
);
router.put(
  "/lotes/:id/asignaciones/:itemId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(asignacionEmbarqueSchema),
  guardarAsignacionEmbarque,
);
router.patch(
  "/lotes/:id/estado",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarEstadoLoteSchema),
  actualizarEstadoLote,
);
// Tracking Marítimo V1 — embarque/buque/contenedores del lote. Mismo
// permiso que el resto de la gestión de tránsito (booking/BL/naviera ya
// vivían ahí; buque/tracking es la misma responsabilidad operativa).
router.patch(
  "/lotes/:id/embarque",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarEmbarqueLoteSchema),
  actualizarEmbarqueLote,
);
router.post(
  "/lotes/:id/contenedores",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(crearContenedorLoteSchema),
  crearContenedorLote,
);
router.delete(
  "/lotes/:id/contenedores/:contenedorId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  eliminarContenedorLote,
);
router.post(
  "/lotes/:id/tracking/sincronizar",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  sincronizarTrackingLote,
);
router.patch(
  "/lotes/:id/recibir-pre-compra",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR),
  recibirPreCompraPlanta,
);
router.post(
  "/lotes/:id/liquidar-costeo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR),
  validarBody(liquidarCosteoImportacionSchema),
  liquidarCosteoImportacion,
);

// Expediente aduanero y documentos (DIM/factura comercial/certificado de
// origen): el permiso IMPORTACIONES_GESTIONAR_TRANSITO ya cubre este alcance
// según su propia descripción en el catálogo ("...y su documentación DIAN
// (DIM, vistos buenos)"), no se creó un permiso nuevo.
router.put(
  "/lotes/:id/expediente",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarExpedienteAduaneroSchema),
  actualizarExpedienteAduanero,
);
router.get(
  "/lotes/:id/expediente/documentos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  obtenerDocumentoExpedienteAduanero,
);
router.post(
  "/lotes/:id/expediente/documentos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarExpedienteIdParaArchivo,
  uploadDocumentoExpediente,
  subirDocumentoExpedienteAduanero,
);
router.delete(
  "/lotes/:id/expediente/documentos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  eliminarDocumentoExpedienteAduanero,
);

// Vistos buenos (INVIMA/ICA/etc.)
router.post(
  "/lotes/:id/expediente/vistos-buenos",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(crearVistoBuenoSchema),
  crearVistoBueno,
);
router.patch(
  "/vistos-buenos/:id",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarVistoBuenoSchema),
  actualizarVistoBueno,
);
router.get(
  "/vistos-buenos/:id/documento",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  obtenerDocumentoVistoBueno,
);
router.post(
  "/vistos-buenos/:id/documento",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarVistoBuenoIdParaArchivo,
  uploadDocumentoVistoBueno,
  subirDocumentoVistoBueno,
);

// Hitos reales del lote (embarque, llegada a puerto, inspección aduanera): los
// registra una persona con el mismo permiso que el resto de la gestión de
// tránsito. La recepción en planta NO se registra aquí: la deriva el sistema
// al recibir el lote (importaciones.recibir). Sin permiso nuevo.
router.put(
  "/lotes/:id/hitos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(registrarHitoLoteSchema),
  registrarHitoLote,
);
router.delete(
  "/lotes/:id/hitos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  eliminarHitoLote,
);

// Documentos del lote (B/L-AWB, certificado de análisis, otros) — gestionar
// tránsito para subir/eliminar (misma responsabilidad que el expediente) e
// importaciones.ver para descargar. Sin permiso nuevo.
router.get(
  "/lotes/:id/documentos/:documentoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER),
  obtenerDocumentoLote,
);
router.post(
  "/lotes/:id/documentos/:tipo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarLoteIdParaArchivo,
  uploadDocumentoLoteImportacion,
  subirDocumentoLote,
);
router.delete(
  "/lotes/:id/documentos/:documentoId",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  eliminarDocumentoLote,
);

// Actividades esperadas (motor de seguimiento) — mismo permiso que gestionar
// tránsito/expediente: es parte de la misma responsabilidad operativa.
router.post(
  "/:id/actividades",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(crearActividadImportacionSchema),
  crearActividadImportacion,
);
router.patch(
  "/actividades/:id",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarActividadImportacionSchema),
  actualizarActividadImportacion,
);

// Novedades — mismo permiso, mismo motivo.
router.post(
  "/:id/novedades",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(crearNovedadImportacionSchema),
  crearNovedadImportacion,
);
router.patch(
  "/novedades/:id/resolver",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(resolverNovedadImportacionSchema),
  resolverNovedadImportacion,
);

// Pagos — reutiliza IMPORTACIONES_LIQUIDAR (misma responsabilidad
// financiera que ya cubre la liquidación de costeo), no se crea un permiso
// nuevo.
router.post(
  "/:id/pagos",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR),
  validarBody(crearPagoImportacionSchema),
  crearPagoImportacion,
);
router.patch(
  "/pagos/:id/estado",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR),
  validarBody(actualizarEstadoPagoImportacionSchema),
  actualizarEstadoPagoImportacion,
);

// Cierre del expediente.
router.post(
  "/:id/cerrar",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(cerrarOrdenCompraIntlSchema),
  cerrarOrdenCompraIntl,
);

export default router;
