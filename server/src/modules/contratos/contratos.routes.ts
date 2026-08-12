import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { listarContratos, crearContrato, actualizarContrato } from "./contratos.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission("contratos.ver"), listarContratos);
router.post("/", requirePermission("contratos.crear"), crearContrato);
router.patch("/:id", requirePermission("contratos.editar"), actualizarContrato);

export default router;
