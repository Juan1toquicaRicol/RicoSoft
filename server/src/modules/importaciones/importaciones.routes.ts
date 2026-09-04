import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import {
  validarExpedienteIdParaArchivo,
  uploadDocumentoExpediente,
  validarVistoBuenoIdParaArchivo,
  uploadDocumentoVistoBueno,
} from "../../middleware/upload.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  crearLoteImportacionSchema,
  crearOrdenCompraIntlSchema,
  actualizarEstadoLoteSchema,
  liquidarCosteoImportacionSchema,
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
} from "./importaciones.schemas";
import {
  listarOrdenesCompraIntl,
  obtenerOrdenCompraIntl,
  crearOrdenCompraIntl,
  crearLoteImportacion,
  actualizarEstadoLote,
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
  crearActividadImportacion,
  actualizarActividadImportacion,
  crearNovedadImportacion,
  resolverNovedadImportacion,
  crearPagoImportacion,
  actualizarEstadoPagoImportacion,
  cerrarOrdenCompraIntl,
} from "./importaciones.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER), listarOrdenesCompraIntl);
router.get("/:id", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER), obtenerOrdenCompraIntl);
router.post(
  "/",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(crearOrdenCompraIntlSchema),
  crearOrdenCompraIntl,
);
router.delete(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_ELIMINAR),
  anularOrdenCompraIntl,
);

router.post(
  "/:id/lotes",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(crearLoteImportacionSchema),
  crearLoteImportacion,
);
router.patch(
  "/lotes/:id/estado",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarEstadoLoteSchema),
  actualizarEstadoLote,
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
