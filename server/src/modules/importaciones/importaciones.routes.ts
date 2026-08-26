import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  crearLoteImportacionSchema,
  crearOrdenCompraIntlSchema,
  actualizarEstadoLoteSchema,
  liquidarCosteoImportacionSchema,
} from "./importaciones.schemas";
import {
  listarOrdenesCompraIntl,
  obtenerOrdenCompraIntl,
  crearOrdenCompraIntl,
  crearLoteImportacion,
  actualizarEstadoLote,
  recibirPreCompraPlanta,
  liquidarCosteoImportacion,
  anularOrdenCompraIntl,
} from "./importaciones.controller";

const router = Router();

router.use(authenticateJWT);

router.get("/", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER), listarOrdenesCompraIntl);
router.get("/:id", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_VER), obtenerOrdenCompraIntl);
router.post(
  "/",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(crearOrdenCompraIntlSchema),
  crearOrdenCompraIntl,
);
router.delete("/:id", requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_ELIMINAR), anularOrdenCompraIntl);

router.post(
  "/:id/lotes",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_CREAR),
  validarBody(crearLoteImportacionSchema),
  crearLoteImportacion,
);
router.patch(
  "/lotes/:id/estado",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO),
  validarBody(actualizarEstadoLoteSchema),
  actualizarEstadoLote,
);
router.patch(
  "/lotes/:id/recibir-pre-compra",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR),
  recibirPreCompraPlanta,
);
router.post(
  "/lotes/:id/liquidar-costeo",
  requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR),
  validarBody(liquidarCosteoImportacionSchema),
  liquidarCosteoImportacion,
);

export default router;
