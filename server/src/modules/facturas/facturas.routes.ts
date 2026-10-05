import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import {
  uploadFacturaArchivo,
  validarFacturaIdParaArchivo,
  uploadComprobantePago,
  validarPagoIdParaArchivo,
} from "../../middleware/upload.middleware";
import {
  listarFacturas,
  obtenerFactura,
  crearFactura,
  actualizarCondicionesPagoFactura,
  cambiarEstadoFactura,
  subirArchivoFactura,
  obtenerArchivoFactura,
  eliminarArchivoFactura,
  agregarComentarioFactura,
  eliminarFactura,
} from "./facturas.controller";
import { listarFacturasSiesaController } from "./facturas-siesa.controller";
import {
  listarPagosFactura,
  registrarPago,
  anularPago,
  subirComprobantePago,
  obtenerComprobantePago,
} from "./pagos.controller";
import { registrarPagoSchema } from "./pagos.schemas";

const router = Router();

router.use(authenticateJWT);
// Fase 4: Facturas + Pagos usan req.tenantPrisma — el resto del sistema
// sigue con el cliente Prisma global (ver tenant-prisma.ts).
router.use(attachTenantPrisma);

router.get("/", requirePermission("facturas.ver"), listarFacturas);
// Antes de "/:id": consulta de solo lectura a Siesa (t455_cm_factura_docto),
// separada del CRUD nativo de abajo — ver facturas-siesa.controller.ts.
router.get("/siesa", requirePermission("facturas.ver"), listarFacturasSiesaController);
router.get("/:id", requirePermission("facturas.ver"), obtenerFactura);
router.post("/", requirePermission("facturas.crear"), crearFactura);
// El permiso específico (aprobar/rechazar/pagar) se valida dentro del controlador
// según el estado destino, porque depende del contenido del body.
router.patch("/:id/estado", cambiarEstadoFactura);
router.patch(
  "/:id/condiciones-pago",
  requirePermission("facturas.crear"),
  actualizarCondicionesPagoFactura,
);

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

// Pagos: ver reutiliza facturas.ver (se consultan siempre en contexto de una
// factura); registrar/anular reutiliza facturas.pagar (misma capacidad de
// negocio que ya existía, ahora respaldada por un registro real en vez de
// solo cambiar el estado).
router.get("/:facturaId/pagos", requirePermission("facturas.ver"), listarPagosFactura);
router.post(
  "/:facturaId/pagos",
  requirePermission("facturas.pagar"),
  validarBody(registrarPagoSchema),
  registrarPago,
);
router.patch("/:facturaId/pagos/:id/anular", requirePermission("facturas.pagar"), anularPago);
router.get(
  "/:facturaId/pagos/:id/comprobante",
  requirePermission("facturas.ver"),
  obtenerComprobantePago,
);
router.post(
  "/:facturaId/pagos/:id/comprobante",
  requirePermission("facturas.pagar"),
  validarPagoIdParaArchivo,
  uploadComprobantePago,
  subirComprobantePago,
);

router.delete("/:id", requirePermission("facturas.eliminar"), eliminarFactura);

export default router;
