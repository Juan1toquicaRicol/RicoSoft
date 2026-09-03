import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  validarSolicitudIdParaArchivo,
  uploadCotizacionSolicitud,
  validarSolicitudIdParaCotizacionProveedor,
  uploadCotizacionProveedor,
} from "../../middleware/upload.middleware";
import {
  listarSolicitudes,
  listarHistorialCompras,
  listarSolicitudesDisponiblesParaFactura,
  obtenerSolicitud,
  crearSolicitud,
  cambiarEstadoSolicitud,
  confirmarRecepcionSolicitud,
  eliminarSolicitud,
  subirCotizacionSolicitud,
  obtenerCotizacionSolicitud,
} from "./solicitudes.controller";
import {
  listarCotizacionesSolicitud,
  crearCotizacionSolicitud,
  eliminarCotizacionSolicitud,
  seleccionarCotizacionGanadora,
  obtenerArchivoCotizacionSolicitud,
} from "./cotizaciones.controller";

const router = Router();

router.use(authenticateJWT);
// SolicitudCompra + CotizacionProveedor usan req.tenantPrisma (mismo patrón
// que Proveedores/Facturas — ver tenant-prisma.ts).
router.use(attachTenantPrisma);

router.get("/", requirePermission("solicitudes.ver"), listarSolicitudes);
router.get("/historial", requirePermission("solicitudes.ver"), listarHistorialCompras);
// Selector "Solicitud de compra relacionada" en Recepcionar Factura — mismo
// permiso que el resto de lecturas de este módulo, sin permiso nuevo.
router.get(
  "/disponibles-para-factura",
  requirePermission("solicitudes.ver"),
  listarSolicitudesDisponiblesParaFactura,
);
router.post("/", requirePermission("solicitudes.crear"), crearSolicitud);
// Detalle de una solicitud puntual (página /solicitudes-compra/:id) — debe
// ir DESPUÉS de "/historial" y "/disponibles-para-factura" (rutas literales
// de un solo segmento, como :id) para que Express no las confunda con un id.
router.get("/:id", requirePermission("solicitudes.ver"), obtenerSolicitud);
// El permiso específico (aprobar/rechazar/comprar) se valida en el controlador según el estado destino.
router.patch("/:id/estado", cambiarEstadoSolicitud);
// Self-service: la propia validación de "solo el solicitante" vive en el
// controlador (no se puede resolver con requirePermission, es dueño-de-fila,
// no un permiso de catálogo).
router.post("/:id/confirmar-recepcion", confirmarRecepcionSolicitud);

router.get("/:id/archivo", requirePermission("solicitudes.ver"), obtenerCotizacionSolicitud);
router.post(
  "/:id/archivo",
  requirePermission("solicitudes.crear"),
  validarSolicitudIdParaArchivo,
  uploadCotizacionSolicitud,
  subirCotizacionSolicitud,
);

// Cuadro comparativo de cotizaciones de proveedor (regla de las 3 cotizaciones).
router.get("/:id/cotizaciones", requirePermission("solicitudes.ver"), listarCotizacionesSolicitud);
router.post(
  "/:id/cotizaciones",
  requirePermission("solicitudes.crear"),
  validarSolicitudIdParaCotizacionProveedor,
  uploadCotizacionProveedor,
  crearCotizacionSolicitud,
);
router.delete(
  "/:id/cotizaciones/:cotizacionId",
  requirePermission("solicitudes.crear"),
  eliminarCotizacionSolicitud,
);
router.post(
  "/:id/cotizaciones/:cotizacionId/seleccionar",
  requirePermission("solicitudes.aprobar"),
  seleccionarCotizacionGanadora,
);
router.get(
  "/:id/cotizaciones/:cotizacionId/archivo",
  requirePermission("solicitudes.ver"),
  obtenerArchivoCotizacionSolicitud,
);

router.delete("/:id", requirePermission("solicitudes.eliminar"), eliminarSolicitud);

export default router;
