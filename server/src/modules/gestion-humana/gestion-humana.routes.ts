import { Router } from "express";
import {
  authenticateJWT,
  requireAllPermissions,
  requireAnyPermission,
  requirePermission,
} from "../../middleware/auth.middleware";
import {
  uploadDocumentoEmpleado,
  validarEmpleadoIdParaArchivo,
} from "../../middleware/upload.middleware";
import {
  listarEmpleados,
  crearEmpleado,
  editarEmpleado,
  actualizarSalario,
  liquidarEmpleado,
  eliminarEmpleado,
} from "./empleados.controller";
import {
  listarPermisosLaborales,
  crearPermisoLaboral,
  actualizarEstadoPermisoLaboral,
} from "./permisos-laborales.controller";
import { listarFaltas, crearFalta } from "./faltas.controller";
import {
  listarCargos,
  listarCargosOpciones,
  crearCargo,
  actualizarCargo,
} from "./cargos.controller";
import {
  listarCatalogoSeguridadSocial,
  listarOpcionesSeguridadSocial,
  crearItemSeguridadSocial,
  actualizarItemSeguridadSocial,
} from "./catalogo-seguridad-social.controller";
import {
  obtenerDetallesEmpleado,
  guardarDetallesEmpleado,
  agregarFamiliar,
  eliminarFamiliar,
  agregarEstudio,
  eliminarEstudio,
  subirDocumentoEmpleado,
  descargarDocumentoEmpleado,
  eliminarDocumentoEmpleado,
} from "./empleado-detalles.controller";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  listarFuentesBiometricas,
  obtenerFuenteBiometrica,
  crearFuenteBiometrica,
  actualizarFuenteBiometrica,
  desactivarFuenteBiometrica,
} from "./biometrico-fuentes.controller";
import {
  listarAsociacionesBiometricas,
  crearAsociacionBiometrica,
  actualizarAsociacionBiometrica,
  eliminarAsociacionBiometrica,
} from "./biometrico-asociaciones.controller";
import { listarMarcacionesBiometricas } from "./biometrico-marcaciones.controller";
import {
  listarSincronizacionesBiometricas,
  obtenerSincronizacionBiometrica,
  sincronizarFuenteBiometricaManual,
} from "./biometrico-sincronizaciones.controller";

const router = Router();

router.use(authenticateJWT);

// Empleados
router.get("/empleados", requirePermission("empleados.ver"), listarEmpleados);
router.post("/empleados", requirePermission("empleados.crear"), crearEmpleado);
router.patch(
  "/empleados/:id",
  requirePermission(PERMISOS_SISTEMA.EMPLEADOS_EDITAR),
  editarEmpleado,
);
router.patch(
  "/empleados/:id/salario",
  requirePermission("empleados.editar_salario"),
  actualizarSalario,
);
router.patch("/empleados/:id/liquidar", requirePermission("empleados.liquidar"), liquidarEmpleado);
router.delete("/empleados/:id", requirePermission("empleados.eliminar"), eliminarEmpleado);

// Cargos (catálogo por tenant). /cargos/opciones solo expone los ACTIVOS para
// el selector del formulario de colaborador, sin exigir administrar el catálogo.
router.get(
  "/cargos/opciones",
  requireAnyPermission([
    PERMISOS_SISTEMA.EMPLEADOS_CREAR,
    PERMISOS_SISTEMA.EMPLEADOS_EDITAR,
    PERMISOS_SISTEMA.CARGOS_VER,
  ]),
  listarCargosOpciones,
);
router.get("/cargos", requirePermission(PERMISOS_SISTEMA.CARGOS_VER), listarCargos);
router.post("/cargos", requirePermission(PERMISOS_SISTEMA.CARGOS_GESTIONAR), crearCargo);
router.patch("/cargos/:id", requirePermission(PERMISOS_SISTEMA.CARGOS_GESTIONAR), actualizarCargo);

// Gestión de información: catálogo por tenant de EPS, ARL y fondos de pensiones.
// /opciones (solo activos) lo usa el formulario de colaborador.
router.get(
  "/catalogo-seguridad-social/opciones",
  requireAnyPermission([
    PERMISOS_SISTEMA.EMPLEADOS_CREAR,
    PERMISOS_SISTEMA.EMPLEADOS_EDITAR,
    PERMISOS_SISTEMA.EMPLEADOS_DETALLES_EDITAR,
    PERMISOS_SISTEMA.GESTION_INFORMACION_VER,
  ]),
  listarOpcionesSeguridadSocial,
);
router.get(
  "/catalogo-seguridad-social",
  requirePermission(PERMISOS_SISTEMA.GESTION_INFORMACION_VER),
  listarCatalogoSeguridadSocial,
);
router.post(
  "/catalogo-seguridad-social",
  requirePermission(PERMISOS_SISTEMA.GESTION_INFORMACION_GESTIONAR),
  crearItemSeguridadSocial,
);
router.patch(
  "/catalogo-seguridad-social/:id",
  requirePermission(PERMISOS_SISTEMA.GESTION_INFORMACION_GESTIONAR),
  actualizarItemSeguridadSocial,
);

// Detalles sensibles del colaborador y soportes privados. Cada ruta exige ver
// el expediente (empleados.ver) más el permiso específico del dato.
const verDetalles = requireAllPermissions([
  PERMISOS_SISTEMA.EMPLEADOS_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DETALLES_VER,
]);
const editarDetalles = requireAllPermissions([
  PERMISOS_SISTEMA.EMPLEADOS_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DETALLES_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DETALLES_EDITAR,
]);
const verDocumentos = requireAllPermissions([
  PERMISOS_SISTEMA.EMPLEADOS_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DETALLES_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_VER,
]);
const gestionarDocumentos = requireAllPermissions([
  PERMISOS_SISTEMA.EMPLEADOS_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DETALLES_VER,
  PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_GESTIONAR,
]);
router.get("/empleados/:id/detalles", verDetalles, obtenerDetallesEmpleado);
router.put("/empleados/:id/detalles", editarDetalles, guardarDetallesEmpleado);
router.post("/empleados/:id/familiares", editarDetalles, agregarFamiliar);
router.delete("/empleados/:id/familiares/:familiarId", editarDetalles, eliminarFamiliar);
router.post("/empleados/:id/estudios", editarDetalles, agregarEstudio);
router.delete("/empleados/:id/estudios/:estudioId", editarDetalles, eliminarEstudio);
// El permiso se evalúa ANTES de multer: sin permiso no se escribe nada en disco.
router.post(
  "/empleados/:id/documentos",
  gestionarDocumentos,
  validarEmpleadoIdParaArchivo,
  uploadDocumentoEmpleado,
  subirDocumentoEmpleado,
);
router.get(
  "/empleados/:id/documentos/:documentoId/archivo",
  verDocumentos,
  descargarDocumentoEmpleado,
);
router.delete(
  "/empleados/:id/documentos/:documentoId",
  gestionarDocumentos,
  eliminarDocumentoEmpleado,
);

// Permisos laborales
router.get("/permisos", requirePermission("permisos_laborales.ver"), listarPermisosLaborales);
router.post("/permisos", requirePermission("permisos_laborales.crear"), crearPermisoLaboral);
router.patch(
  "/permisos/:id/estado",
  requirePermission("permisos_laborales.aprobar"),
  actualizarEstadoPermisoLaboral,
);

// Faltas disciplinarias
router.get("/faltas", requirePermission("faltas.ver"), listarFaltas);
router.post("/faltas", requirePermission("faltas.crear"), crearFalta);

// Biométrico — fuentes (Fase 6)
router.get(
  "/biometrico/fuentes",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_VER),
  listarFuentesBiometricas,
);
router.get(
  "/biometrico/fuentes/:id",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_VER),
  obtenerFuenteBiometrica,
);
router.post(
  "/biometrico/fuentes",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_CONFIGURAR),
  crearFuenteBiometrica,
);
router.patch(
  "/biometrico/fuentes/:id",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_CONFIGURAR),
  actualizarFuenteBiometrica,
);
router.delete(
  "/biometrico/fuentes/:id",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_CONFIGURAR),
  desactivarFuenteBiometrica,
);

// Biométrico — sincronización manual e historial (Fase 6)
router.post(
  "/biometrico/fuentes/:id/sincronizar",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_SINCRONIZAR),
  sincronizarFuenteBiometricaManual,
);
router.get(
  "/biometrico/sincronizaciones",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_VER),
  listarSincronizacionesBiometricas,
);
router.get(
  "/biometrico/sincronizaciones/:id",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_VER),
  obtenerSincronizacionBiometrica,
);

// Biométrico — asociaciones empleado <-> usuario CrossChex (Fase 6)
router.get(
  "/biometrico/asociaciones",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_VER),
  listarAsociacionesBiometricas,
);
router.post(
  "/biometrico/asociaciones",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_ASOCIAR),
  crearAsociacionBiometrica,
);
router.patch(
  "/biometrico/asociaciones/:id",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_ASOCIAR),
  actualizarAsociacionBiometrica,
);
router.delete(
  "/biometrico/asociaciones/:id",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_ASOCIAR),
  eliminarAsociacionBiometrica,
);

// Biométrico — marcaciones (solo lectura) (Fase 6)
router.get(
  "/biometrico/marcaciones",
  requirePermission(PERMISOS_SISTEMA.BIOMETRICO_VER),
  listarMarcacionesBiometricas,
);

export default router;
