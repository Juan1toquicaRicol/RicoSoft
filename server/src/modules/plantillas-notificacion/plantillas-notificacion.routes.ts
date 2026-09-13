import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  listarPlantillasNotificacion,
  crearPlantillaNotificacion,
  actualizarPlantillaNotificacion,
  eliminarPlantillaNotificacion,
} from "./plantillas-notificacion.controller";

const router = Router();

router.use(authenticateJWT);

// Lectura: cualquier usuario con sesión válida — igual que catálogos, son
// configuración de referencia, no datos sensibles.
router.get("/", listarPlantillasNotificacion);

router.post(
  "/",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_PLANTILLAS_NOTIFICACION),
  crearPlantillaNotificacion,
);
router.patch(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_PLANTILLAS_NOTIFICACION),
  actualizarPlantillaNotificacion,
);
router.delete(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_PLANTILLAS_NOTIFICACION),
  eliminarPlantillaNotificacion,
);

export default router;
