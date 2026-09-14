import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  resumenAnaliticaImportaciones,
  operacionesAnaliticaImportaciones,
  type FiltrosAnaliticaImportaciones,
} from "./importaciones-analitica.service";

function parsearFiltros(req: AuthenticatedRequest): FiltrosAnaliticaImportaciones {
  const { desde, hasta, proveedorId, paisOrigen, puerto } = req.query;
  const filtros: FiltrosAnaliticaImportaciones = {};
  if (typeof desde === "string" && desde) {
    const f = new Date(desde);
    if (!Number.isNaN(f.getTime())) filtros.desde = f;
  }
  if (typeof hasta === "string" && hasta) {
    const f = new Date(hasta);
    if (!Number.isNaN(f.getTime())) filtros.hasta = f;
  }
  if (typeof proveedorId === "string" && proveedorId) filtros.proveedorId = proveedorId;
  if (typeof paisOrigen === "string" && paisOrigen) filtros.paisOrigen = paisOrigen;
  if (typeof puerto === "string" && puerto) filtros.puerto = puerto;
  return filtros;
}

export const obtenerResumenAnaliticaImportaciones = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const filtros = parsearFiltros(req);
    const resumen = await resumenAnaliticaImportaciones(tenantId, filtros);
    return res.json(resumen);
  } catch (error) {
    console.error("Error al obtener resumen de analítica de importaciones:", error);
    return res.status(500).json({ message: "Error al calcular la analítica de importaciones." });
  }
};

export const listarOperacionesAnaliticaImportaciones = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const filtros = parsearFiltros(req);
    const operaciones = await operacionesAnaliticaImportaciones(tenantId, filtros);
    return res.json({ operaciones });
  } catch (error) {
    console.error("Error al obtener operaciones de analítica de importaciones:", error);
    return res.status(500).json({ message: "Error al listar las operaciones analizadas." });
  }
};
