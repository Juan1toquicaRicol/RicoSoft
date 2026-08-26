import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { validarSolicitudIdParaArchivo, uploadCotizacionSolicitud } from "../../middleware/upload.middleware";
import {
  listarSolicitudes,
  listarHistorialCompras,
  crearSolicitud,
  cambiarEstadoSolicitud,
  eliminarSolicitud,
  subirCotizacionSolicitud,
  obtenerCotizacionSolicitud,
} from "./solicitudes.controller";

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

router.delete("/:id", requirePermission("solicitudes.eliminar"), eliminarSolicitud);

export default router;
