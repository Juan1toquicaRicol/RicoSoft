import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarEmpleados,
  crearEmpleado,
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
  "/empleados/:id/salario",
  requirePermission("empleados.editar_salario"),
  actualizarSalario,
);
router.patch("/empleados/:id/liquidar", requirePermission("empleados.liquidar"), liquidarEmpleado);
router.delete("/empleados/:id", requirePermission("empleados.eliminar"), eliminarEmpleado);

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
