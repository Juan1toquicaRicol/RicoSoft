import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarCreditos,
  crearCredito,
  actualizarCredito,
  registrarPagoCredito,
  marcarPazYSalvoCredito,
  eliminarCredito,
} from "./creditos.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("creditos.ver"), listarCreditos);
router.post("/", requirePermission("creditos.gestionar"), crearCredito);
router.patch("/:id", requirePermission("creditos.gestionar"), actualizarCredito);
router.post("/:id/pago", requirePermission("creditos.gestionar"), registrarPagoCredito);
router.post("/:id/paz-y-salvo", requirePermission("creditos.gestionar"), marcarPazYSalvoCredito);
router.delete("/:id", requirePermission("creditos.eliminar"), eliminarCredito);

export default router;
