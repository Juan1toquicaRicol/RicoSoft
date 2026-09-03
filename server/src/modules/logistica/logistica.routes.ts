import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { obtenerCumplimientoLogistico, obtenerNovedadesAbiertas } from "./logistica.controller";

const router = Router();

router.use(authenticateJWT);
router.use(attachTenantPrisma);

// Motor de Decisiones — Fase 2.1, P0 Logística: reutiliza el permiso ya
// existente de solo lectura de Despachos (despachos.ver) — ambos endpoints
// son cálculos sobre el mismo modelo Despacho/DespachoNovedad, no una
// capacidad nueva que amerite su propio permiso.
router.get("/cumplimiento", requirePermission("despachos.ver"), obtenerCumplimientoLogistico);
router.get("/novedades-abiertas", requirePermission("despachos.ver"), obtenerNovedadesAbiertas);

export default router;
