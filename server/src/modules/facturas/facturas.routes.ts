import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { uploadFacturaArchivo, validarFacturaIdParaArchivo } from "../../middleware/upload.middleware";
import {
  listarFacturas,
  obtenerFactura,
  crearFactura,
  cambiarEstadoFactura,
  subirArchivoFactura,
  obtenerArchivoFactura,
  eliminarArchivoFactura,
  agregarComentarioFactura,
} from "./facturas.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("facturas.ver"), listarFacturas);
router.get("/:id", requirePermission("facturas.ver"), obtenerFactura);
router.post("/", requirePermission("facturas.crear"), crearFactura);
// El permiso específico (aprobar/rechazar/pagar) se valida dentro del controlador
// según el estado destino, porque depende del contenido del body.
router.patch("/:id/estado", cambiarEstadoFactura);

router.get("/:id/archivo", requirePermission("facturas.ver"), obtenerArchivoFactura);
router.post(
  "/:id/archivo",
  requirePermission("facturas.crear"),
  validarFacturaIdParaArchivo,
  uploadFacturaArchivo,
  subirArchivoFactura,
);
router.delete("/:id/archivo", requirePermission("facturas.crear"), eliminarArchivoFactura);

router.post("/:id/comentarios", requirePermission("facturas.ver"), agregarComentarioFactura);

export default router;
