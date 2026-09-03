import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarCreditos,
  listarCarteraSiesa,
  crearCredito,
  actualizarCredito,
  registrarPagoCredito,
  marcarPazYSalvoCredito,
  eliminarCredito,
} from "./creditos.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("creditos.ver"), listarCreditos);
// Ruta literal, se declara antes de cualquier /:id para que Express no la
// confunda con un id — mismo criterio ya usado en otros módulos de esta app.
router.get("/cartera-siesa", requirePermission("creditos.ver"), listarCarteraSiesa);
router.post("/", requirePermission("creditos.gestionar"), crearCredito);
router.patch("/:id", requirePermission("creditos.gestionar"), actualizarCredito);
router.post("/:id/pago", requirePermission("creditos.gestionar"), registrarPagoCredito);
router.post("/:id/paz-y-salvo", requirePermission("creditos.gestionar"), marcarPazYSalvoCredito);
router.delete("/:id", requirePermission("creditos.eliminar"), eliminarCredito);

export default router;
