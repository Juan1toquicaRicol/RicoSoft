import { Router } from "express";
import { authenticateJWT } from "../../middleware/auth.middleware";
import {
  listarNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
} from "./notificaciones.controller";

const router = Router();

router.use(authenticateJWT);

// Autoservicio total: cualquier usuario autenticado gestiona sus propias
// notificaciones, sin requerir un permiso administrativo especial.
router.get("/", listarNotificaciones);
router.get("/no-leidas/contador", contarNoLeidas);
router.patch("/leer-todas", marcarTodasLeidas);
router.patch("/:id/leida", marcarLeida);

export default router;
