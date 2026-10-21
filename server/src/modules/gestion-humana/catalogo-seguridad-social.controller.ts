import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { limpiarNombreCargo, normalizarNombreCargo } from "../../lib/cargos";

export const TIPOS_SEGURIDAD_SOCIAL = ["EPS", "ARL", "FONDO_PENSIONES", "TIPO_CONTRATO"] as const;
export type TipoSeguridadSocial = (typeof TIPOS_SEGURIDAD_SOCIAL)[number];

const ETIQUETA: Record<TipoSeguridadSocial, string> = {
  EPS: "EPS",
  ARL: "ARL",
  FONDO_PENSIONES: "fondo de pensiones",
  TIPO_CONTRATO: "tipo de contrato",
};
const NOMBRE_MAX = 150;

function esTipo(valor: unknown): valor is TipoSeguridadSocial {
  return typeof valor === "string" && (TIPOS_SEGURIDAD_SOCIAL as readonly string[]).includes(valor);
}

function esViolacionUnica(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function serializar(e: { id: string; tipo: string; nombre: string; activo: boolean }) {
  return { id: e.id, tipo: e.tipo, nombre: e.nombre, activo: e.activo };
}

function validarNombre(valor: unknown): { nombre: string; normalizado: string } | string {
  if (typeof valor !== "string") return "El nombre es obligatorio.";
  const nombre = limpiarNombreCargo(valor);
  if (!nombre) return "El nombre es obligatorio.";
  if (nombre.length > NOMBRE_MAX) return `El nombre no puede superar ${NOMBRE_MAX} caracteres.`;
  return { nombre, normalizado: normalizarNombreCargo(nombre) };
}

/** Catálogo completo (activos e inactivos) del tenant autenticado, opcionalmente de un tipo. */
export const listarCatalogoSeguridadSocial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { tipo } = req.query;
    if (tipo !== undefined && !esTipo(tipo)) {
      return res.status(400).json({ message: "Tipo de catálogo no válido." });
    }
    const items = await prisma.catalogoSeguridadSocial.findMany({
      where: { tenantId, ...(tipo ? { tipo } : {}) },
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
    });
    return res.json(items.map(serializar));
  } catch (error) {
    console.error("Error al listar catálogo de seguridad social:", error);
    return res.status(500).json({ message: "Error al obtener el catálogo." });
  }
};

/** Solo ACTIVOS, agrupados por tipo, para los selectores del formulario de colaborador. */
export const listarOpcionesSeguridadSocial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const items = await prisma.catalogoSeguridadSocial.findMany({
      where: { tenantId, activo: true },
      select: { tipo: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return res.json({
      eps: items.filter((i) => i.tipo === "EPS").map((i) => i.nombre),
      arl: items.filter((i) => i.tipo === "ARL").map((i) => i.nombre),
      fondosPensiones: items.filter((i) => i.tipo === "FONDO_PENSIONES").map((i) => i.nombre),
      tiposContrato: items.filter((i) => i.tipo === "TIPO_CONTRATO").map((i) => i.nombre),
    });
  } catch (error) {
    console.error("Error al listar opciones de seguridad social:", error);
    return res.status(500).json({ message: "Error al obtener el catálogo." });
  }
};

export const crearItemSeguridadSocial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { tipo, nombre: nombreBody } = req.body ?? {};
    if (!esTipo(tipo)) return res.status(400).json({ message: "Tipo de catálogo no válido." });
    const validado = validarNombre(nombreBody);
    if (typeof validado === "string") return res.status(400).json({ message: validado });

    const existente = await prisma.catalogoSeguridadSocial.findFirst({
      where: { tenantId, tipo, nombreNormalizado: validado.normalizado },
      select: { id: true },
    });
    if (existente) {
      return res.status(409).json({ message: `Ya existe ${ETIQUETA[tipo]} con ese nombre.` });
    }

    const creado = await prisma.$transaction(async (tx) => {
      const item = await tx.catalogoSeguridadSocial.create({
        data: { tenantId, tipo, nombre: validado.nombre, nombreNormalizado: validado.normalizado },
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "CATALOGO_SEGURIDAD_SOCIAL_CREADO",
          detalle: `${req.user!.nombre} agregó ${ETIQUETA[tipo]} "${item.nombre}"`,
          entidadTipo: "CatalogoSeguridadSocial",
          entidadId: item.id,
        },
      });
      return item;
    });
    return res.status(201).json(serializar(creado));
  } catch (error) {
    if (esViolacionUnica(error)) {
      return res.status(409).json({ message: "Ya existe una entrada con ese nombre." });
    }
    console.error("Error al crear entrada de seguridad social:", error);
    return res.status(500).json({ message: "Error al crear la entrada." });
  }
};

export const actualizarItemSeguridadSocial = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nombre: nombreBody, activo } = req.body ?? {};

    const existente = await prisma.catalogoSeguridadSocial.findFirst({ where: { id, tenantId } });
    if (!existente) return res.status(404).json({ message: "Entrada no encontrada." });
    const tipo = existente.tipo as TipoSeguridadSocial;

    const data: Prisma.CatalogoSeguridadSocialUpdateInput = {};
    const cambios: string[] = [];
    if (nombreBody !== undefined) {
      const validado = validarNombre(nombreBody);
      if (typeof validado === "string") return res.status(400).json({ message: validado });
      if (validado.normalizado !== existente.nombreNormalizado) {
        const duplicado = await prisma.catalogoSeguridadSocial.findFirst({
          where: { tenantId, tipo, nombreNormalizado: validado.normalizado, id: { not: id } },
          select: { id: true },
        });
        if (duplicado) {
          return res.status(409).json({ message: `Ya existe ${ETIQUETA[tipo]} con ese nombre.` });
        }
      }
      if (validado.nombre !== existente.nombre) {
        data.nombre = validado.nombre;
        data.nombreNormalizado = validado.normalizado;
        cambios.push("nombre");
      }
    }
    if (activo !== undefined) {
      if (typeof activo !== "boolean") {
        return res.status(400).json({ message: "activo debe ser booleano." });
      }
      if (activo !== existente.activo) {
        data.activo = activo;
        cambios.push(activo ? "activado" : "desactivado");
      }
    }
    if (cambios.length === 0) return res.json(serializar(existente));

    // Renombrar/desactivar no reescribe lo ya guardado en los colaboradores.
    const actualizado = await prisma.$transaction(async (tx) => {
      const item = await tx.catalogoSeguridadSocial.update({ where: { id }, data });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "CATALOGO_SEGURIDAD_SOCIAL_EDITADO",
          detalle: `${req.user!.nombre} editó ${ETIQUETA[tipo]} "${existente.nombre}" (${cambios.join(", ")})`,
          entidadTipo: "CatalogoSeguridadSocial",
          entidadId: id,
        },
      });
      return item;
    });
    return res.json(serializar(actualizado));
  } catch (error) {
    if (esViolacionUnica(error)) {
      return res.status(409).json({ message: "Ya existe una entrada con ese nombre." });
    }
    console.error("Error al actualizar entrada de seguridad social:", error);
    return res.status(500).json({ message: "Error al actualizar la entrada." });
  }
};
