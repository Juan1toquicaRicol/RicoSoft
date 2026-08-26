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

const router = Router();

router.use(authenticateJWT);

// Empleados
router.get("/empleados", requirePermission("empleados.ver"), listarEmpleados);
router.post("/empleados", requirePermission("empleados.crear"), crearEmpleado);
router.patch("/empleados/:id/salario", requirePermission("empleados.editar_salario"), actualizarSalario);
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

export default router;
