import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarFacturas, obtenerFactura, crearFactura, cambiarEstadoFactura } from "./facturas.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("facturas.ver"), listarFacturas);
router.get("/:id", requirePermission("facturas.ver"), obtenerFactura);
router.post("/", requirePermission("facturas.crear"), crearFactura);
// El permiso específico (aprobar/rechazar/pagar) se valida dentro del controlador
// según el estado destino, porque depende del contenido del body.
router.patch("/:id/estado", cambiarEstadoFactura);

export default router;
