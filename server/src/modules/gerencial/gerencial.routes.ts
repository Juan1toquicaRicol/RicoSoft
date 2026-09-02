import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { obtenerCentroGerencial } from "./gerencial.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Reutiliza analitica.ver: el Centro Gerencial es de solo lectura, agrega
// endpoints que ya usan ese mismo permiso (finanzas, ventas, inventario).
router.get("/resumen", requirePermission("analitica.ver"), obtenerCentroGerencial);

export default router;
