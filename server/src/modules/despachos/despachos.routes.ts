import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarDocumentosVentaParaDespacho,
  crearDespacho,
  listarDespachos,
  obtenerResumenDespachos,
  obtenerDespacho,
  actualizarEstadoDespacho,
  actualizarLineaDespacho,
  crearNovedad,
  resolverNovedad,
} from "./despachos.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get(
  "/documentos-venta",
  requirePermission("despachos.gestionar"),
  listarDocumentosVentaParaDespacho,
);
router.get("/resumen", requirePermission("despachos.ver"), obtenerResumenDespachos);
router.get("/", requirePermission("despachos.ver"), listarDespachos);
router.post("/", requirePermission("despachos.gestionar"), crearDespacho);
router.get("/:id", requirePermission("despachos.ver"), obtenerDespacho);
router.patch("/:id/estado", requirePermission("despachos.gestionar"), actualizarEstadoDespacho);
router.patch(
  "/:id/lineas/:lineaId",
  requirePermission("despachos.gestionar"),
  actualizarLineaDespacho,
);
router.post("/:id/novedades", requirePermission("despachos.gestionar"), crearNovedad);
router.patch(
  "/:id/novedades/:novedadId/resolver",
  requirePermission("despachos.gestionar"),
  resolverNovedad,
);

export default router;
