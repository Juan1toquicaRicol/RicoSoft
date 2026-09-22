import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  listarPublicaciones,
  listarPublicacionesAdmin,
  crearPublicacion,
  actualizarPublicacion,
  eliminarPublicacion,
  subirArchivosPublicacion,
  obtenerArchivoPublicacion,
  eliminarArchivoPublicacion,
} from "./publicaciones.controller";
import {
  uploadArchivosPublicacion,
  validarPublicacionIdParaArchivo,
} from "../../middleware/upload.middleware";

const router = Router();

router.use(authenticateJWT);

// Lectura: cualquier usuario con sesión válida — es el contenido del Home,
// no un dato administrativo.
router.get("/", listarPublicaciones);

// Administración (Configuración > Publicaciones): a diferencia de "/", aquí
// se ven inactivas/vencidas/programadas — requiere el permiso de gestión.
router.get(
  "/admin",
  requirePermission(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
  listarPublicacionesAdmin,
);

router.post("/", requirePermission(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR), crearPublicacion);
router.patch(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
  actualizarPublicacion,
);
router.delete(
  "/:id",
  requirePermission(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
  eliminarPublicacion,
);

// Adjuntos (fotos/videos/documentos). Leer un archivo lo puede cualquier
// usuario con sesión (es contenido del Home; el controller valida alcance y
// vigencia); subir/eliminar requiere gestionar.
router.get("/:id/archivos/:archivoId", validarPublicacionIdParaArchivo, obtenerArchivoPublicacion);
router.post(
  "/:id/archivos",
  requirePermission(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
  validarPublicacionIdParaArchivo,
  uploadArchivosPublicacion,
  subirArchivosPublicacion,
);
router.delete(
  "/:id/archivos/:archivoId",
  requirePermission(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
  validarPublicacionIdParaArchivo,
  eliminarArchivoPublicacion,
);

export default router;
