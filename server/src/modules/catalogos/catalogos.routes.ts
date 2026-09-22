import { Router } from "express";
import { authenticateJWT, requirePermission } from "../../middleware/auth.middleware";
import {
  listarCatalogo,
  listarTiposCatalogo,
  crearValorCatalogo,
  actualizarValorCatalogo,
  eliminarValorCatalogo,
} from "./catalogos.controller";

const router = Router();

router.use(authenticateJWT);

// Lectura: cualquier usuario con sesión válida — son catálogos de
// referencia (incoterms, monedas, etc.), no datos sensibles.
router.get("/", listarCatalogo);
// Definición de cada tipo (etiqueta, grupo, campos de metadata): la UI la
// consume en vez de duplicar la lista de tipos.
router.get("/tipos", listarTiposCatalogo);

router.post("/", requirePermission("configuracion.catalogos"), crearValorCatalogo);
router.patch("/:id", requirePermission("configuracion.catalogos"), actualizarValorCatalogo);
router.delete("/:id", requirePermission("configuracion.catalogos"), eliminarValorCatalogo);

export default router;
