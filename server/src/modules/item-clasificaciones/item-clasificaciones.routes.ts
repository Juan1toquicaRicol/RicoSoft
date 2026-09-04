import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { attachTenantPrisma } from "../../middleware/tenant-prisma.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  actualizarClasificacionSchema,
  actualizarClasificacionesItemSchema,
  asignacionMasivaSchema,
  cambiarActivoClasificacionSchema,
  crearClasificacionSchema,
} from "./item-clasificaciones.schemas";
import {
  actualizarClasificacion,
  actualizarClasificacionesDeItem,
  asignacionMasiva,
  cambiarActivoClasificacion,
  crearClasificacion,
  listarClasificaciones,
  listarItemsConClasificacion,
  obtenerClasificacionesDeItem,
} from "./item-clasificaciones.controller";

const router = Router();

router.use(authenticateJWT, attachTenantPrisma);

router.get("/", requirePermission(PERMISOS_SISTEMA.CONFIGURACION_VER), listarClasificaciones);
router.post(
  "/",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_EDITAR),
  validarBody(crearClasificacionSchema),
  crearClasificacion,
);
router.patch(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_EDITAR),
  validarBody(actualizarClasificacionSchema),
  actualizarClasificacion,
);
router.patch(
  "/:id/activo",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_EDITAR),
  validarBody(cambiarActivoClasificacionSchema),
  cambiarActivoClasificacion,
);

router.get(
  "/items",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_VER),
  listarItemsConClasificacion,
);
router.get(
  "/items/:itemRowId",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_VER),
  obtenerClasificacionesDeItem,
);
router.put(
  "/items/:itemRowId",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_EDITAR),
  validarBody(actualizarClasificacionesItemSchema),
  actualizarClasificacionesDeItem,
);

router.post(
  "/asignacion-masiva",
  requirePermission(PERMISOS_SISTEMA.CONFIGURACION_EDITAR),
  validarBody(asignacionMasivaSchema),
  asignacionMasiva,
);

export default router;
