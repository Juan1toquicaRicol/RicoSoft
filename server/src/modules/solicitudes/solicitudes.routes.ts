import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  validarSolicitudIdParaArchivo,
  uploadCotizacionSolicitud,
  validarSolicitudIdParaCotizacionProveedor,
  uploadCotizacionProveedor,
} from "../../middleware/upload.middleware";
import {
  listarSolicitudes,
  listarHistorialCompras,
  crearSolicitud,
  cambiarEstadoSolicitud,
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

router.get("/", requirePermission("solicitudes.ver"), listarSolicitudes);
router.get("/historial", requirePermission("solicitudes.ver"), listarHistorialCompras);
router.post("/", requirePermission("solicitudes.crear"), crearSolicitud);
// El permiso específico (aprobar/rechazar/comprar) se valida en el controlador según el estado destino.
router.patch("/:id/estado", cambiarEstadoSolicitud);

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
