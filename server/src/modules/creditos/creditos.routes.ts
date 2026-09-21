import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarCreditos,
  obtenerResumenCreditos,
  listarCarteraSiesa,
  obtenerCarteraCliente,
  obtenerIndicadorCreditoCliente,
  crearCredito,
  actualizarCredito,
  registrarPagoCredito,
  marcarPazYSalvoCredito,
  eliminarCredito,
} from "./creditos.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/", requirePermission("creditos.ver"), listarCreditos);
// Rutas literales, se declaran antes de cualquier /:id para que Express no
// las confunda con un id — mismo criterio ya usado en otros módulos.
router.get("/resumen", requirePermission("creditos.ver"), obtenerResumenCreditos);
router.get("/cartera-siesa", requirePermission("creditos.ver"), listarCarteraSiesa);
router.get(
  "/clientes/:clienteRowId/cartera",
  requirePermission("creditos.ver"),
  obtenerCarteraCliente,
);
router.get(
  "/clientes/:clienteRowId/indicador",
  requirePermission("creditos.ver"),
  obtenerIndicadorCreditoCliente,
);
router.post("/", requirePermission("creditos.gestionar"), crearCredito);
router.patch("/:id", requirePermission("creditos.gestionar"), actualizarCredito);
router.post("/:id/pago", requirePermission("creditos.gestionar"), registrarPagoCredito);
router.post("/:id/paz-y-salvo", requirePermission("creditos.gestionar"), marcarPazYSalvoCredito);
router.delete("/:id", requirePermission("creditos.eliminar"), eliminarCredito);

export default router;
