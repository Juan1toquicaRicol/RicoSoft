import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarContratos, crearContrato, actualizarContrato, eliminarContrato } from "./contratos.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("contratos.ver"), listarContratos);
router.post("/", requirePermission("contratos.crear"), crearContrato);
router.patch("/:id", requirePermission("contratos.editar"), actualizarContrato);
router.delete("/:id", requirePermission("contratos.eliminar"), eliminarContrato);

export default router;
