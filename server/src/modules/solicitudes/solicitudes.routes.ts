import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarSolicitudes,
  listarHistorialCompras,
  crearSolicitud,
  cambiarEstadoSolicitud,
} from "./solicitudes.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("solicitudes.ver"), listarSolicitudes);
router.get("/historial", requirePermission("solicitudes.ver"), listarHistorialCompras);
router.post("/", requirePermission("solicitudes.crear"), crearSolicitud);
// El permiso específico (aprobar/rechazar/comprar) se valida en el controlador según el estado destino.
router.patch("/:id/estado", cambiarEstadoSolicitud);

export default router;
