import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import {
  listarBodegas,
  listarTomasFisicas,
  crearTomaFisica,
  obtenerTomaFisica,
  registrarConteo,
  cerrarTomaFisica,
  obtenerPatronesRecurrentes,
} from "./toma-fisica.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

router.get("/bodegas", requirePermission("toma_fisica.ver"), listarBodegas);
router.get("/patrones", requirePermission("toma_fisica.ver"), obtenerPatronesRecurrentes);
router.get("/", requirePermission("toma_fisica.ver"), listarTomasFisicas);
router.post("/", requirePermission("toma_fisica.gestionar"), crearTomaFisica);
router.get("/:id", requirePermission("toma_fisica.ver"), obtenerTomaFisica);
router.patch("/:id/lineas/:lineaId", requirePermission("toma_fisica.gestionar"), registrarConteo);
router.patch("/:id/cerrar", requirePermission("toma_fisica.gestionar"), cerrarTomaFisica);

export default router;
