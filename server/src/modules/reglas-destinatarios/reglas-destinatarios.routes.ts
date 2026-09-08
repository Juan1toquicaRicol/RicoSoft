import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarReglasDestinatarios,
  obtenerReglaDestinatarios,
  crearReglaDestinatarios,
  actualizarReglaDestinatarios,
  eliminarReglaDestinatarios,
  agregarDestinatario,
  quitarDestinatario,
  listarTiposDestinatario,
} from "./reglas-destinatarios.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/tipos", requirePermission("reglas_destinatarios.ver"), listarTiposDestinatario);
router.get("/", requirePermission("reglas_destinatarios.ver"), listarReglasDestinatarios);
router.get("/:id", requirePermission("reglas_destinatarios.ver"), obtenerReglaDestinatarios);
router.post("/", requirePermission("reglas_destinatarios.crear"), crearReglaDestinatarios);
router.patch(
  "/:id",
  requirePermission("reglas_destinatarios.editar"),
  actualizarReglaDestinatarios,
);
router.delete(
  "/:id",
  requirePermission("reglas_destinatarios.eliminar"),
  eliminarReglaDestinatarios,
);
router.post(
  "/:id/destinatarios",
  requirePermission("reglas_destinatarios.editar"),
  agregarDestinatario,
);
router.delete(
  "/:id/destinatarios/:destinatarioId",
  requirePermission("reglas_destinatarios.editar"),
  quitarDestinatario,
);

export default router;
