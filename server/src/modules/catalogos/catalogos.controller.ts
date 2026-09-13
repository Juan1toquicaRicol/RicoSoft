import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";
import { getOrSetCache } from "../../lib/memo-cache";

/** Discriminadores válidos de CatalogoValor.tipo — mantener en sincronía con
 * el seed (prisma/seed.ts) y con cualquier código que consuma un tipo nuevo. */
export const TIPOS_CATALOGO_VALIDOS = [
  "INCOTERM",
  "MONEDA",
  "PAIS_ORIGEN",
  "FORMA_PAGO",
  "UNIDAD_MEDIDA",
  "METODO_PAGO",
  "MOTIVO_NOVEDAD_IMPORTACION",
  "ACCION_CONTACTO_OPORTUNIDAD",
  "RESULTADO_CONTACTO_OPORTUNIDAD",
] as const;

const CACHE_TTL_CATALOGO_MS = 30_000;

function serializar(c: {
  id: string;
  tipo: string;
  clave: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
  tenantId: string | null;
}) {
  return {
    id: c.id,
    tipo: c.tipo,
    clave: c.clave,
    etiqueta: c.etiqueta,
    orden: c.orden,
    activo: c.activo,
    alcance: c.tenantId === null ? "GENERAL" : "TENANT",
  };
}

/**
 * Lee las claves activas (GENERAL + del tenant) de un tipo de catálogo, con
 * caché corta en memoria — usado por validaciones de otros módulos
 * (importaciones, etc.) que antes comparaban contra un array hardcodeado.
 * Nunca cachea entre tenants distintos: la clave de caché incluye tenantId.
 */
export async function obtenerClavesActivasCatalogo(
  tenantId: string,
  tipo: string,
): Promise<Set<string>> {
  const clave = `catalogo:${tipo}:${tenantId}`;
  const valores = await getOrSetCache(clave, CACHE_TTL_CATALOGO_MS, () =>
    prisma.catalogoValor.findMany({
      where: { tipo, activo: true, ...whereAlcance(tenantId) },
      select: { clave: true },
    }),
  );
  return new Set(valores.map((v) => v.clave));
}

/** GET /catalogos?tipo=INCOTERM (o sin filtro: todos). Autenticado, cualquier
 * usuario con sesión válida puede leer — son catálogos de referencia. */
export const listarCatalogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = typeof req.query.tipo === "string" ? req.query.tipo : undefined;
    const incluirInactivos = req.query.incluirInactivos === "true";

    const valores = await prisma.catalogoValor.findMany({
      where: {
        ...(tipo ? { tipo } : {}),
        ...(incluirInactivos ? {} : { activo: true }),
        ...whereAlcance(tenantId),
      },
      orderBy: [{ tipo: "asc" }, { orden: "asc" }],
    });

    return res.json(valores.map(serializar));
  } catch (error) {
    console.error("Error al listar catálogo:", error);
    return res.status(500).json({ message: "Error al obtener el catálogo." });
  }
};

export const crearValorCatalogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { tipo, clave, etiqueta, orden, alcance } = req.body;

    if (!tipo || typeof tipo !== "string" || !TIPOS_CATALOGO_VALIDOS.includes(tipo as never)) {
      return res.status(400).json({
        message: `tipo inválido. Valores permitidos: ${TIPOS_CATALOGO_VALIDOS.join(", ")}.`,
      });
    }
    if (!clave || typeof clave !== "string" || !clave.trim()) {
      return res.status(400).json({ message: "clave es obligatoria." });
    }
    if (!etiqueta || typeof etiqueta !== "string" || !etiqueta.trim()) {
      return res.status(400).json({ message: "etiqueta es obligatoria." });
    }
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'alcance debe ser "GENERAL" o "TENANT".' });
    }
    // Igual que Departamento/Rol/Modulo: un valor GENERAL es visible/editable
    // por todos los tenants, solo un superadmin puede crearlo.
    if (alcance === "GENERAL" && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede crear valores de catálogo de alcance general.",
      });
    }

    const valor = await prisma.catalogoValor.create({
      data: {
        tipo,
        clave: clave.trim(),
        etiqueta: etiqueta.trim(),
        orden: typeof orden === "number" ? orden : 0,
        tenantId: alcance === "GENERAL" ? null : tenantId,
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CATALOGO_VALOR_CREADO",
        detalle: `${req.user!.nombre} creó el valor de catálogo "${valor.etiqueta}" (${valor.tipo}/${valor.clave}).`,
      },
    });

    return res.status(201).json(serializar(valor));
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return res.status(409).json({ message: "Ya existe un valor con esa clave para ese tipo." });
    }
    console.error("Error al crear valor de catálogo:", error);
    return res.status(500).json({ message: "Error al crear el valor de catálogo." });
  }
};

export const actualizarValorCatalogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { etiqueta, orden, activo } = req.body;

    const existente = await prisma.catalogoValor.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Valor de catálogo no encontrado." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede editar valores de catálogo generales.",
      });
    }

    const valor = await prisma.catalogoValor.update({
      where: { id },
      data: {
        ...(typeof etiqueta === "string" && etiqueta.trim() ? { etiqueta: etiqueta.trim() } : {}),
        ...(typeof orden === "number" ? { orden } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CATALOGO_VALOR_EDITADO",
        detalle: `${req.user!.nombre} editó el valor de catálogo "${valor.etiqueta}" (${valor.tipo}/${valor.clave}).`,
      },
    });

    return res.json(serializar(valor));
  } catch (error) {
    console.error("Error al actualizar valor de catálogo:", error);
    return res.status(500).json({ message: "Error al actualizar el valor de catálogo." });
  }
};

export const eliminarValorCatalogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const existente = await prisma.catalogoValor.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Valor de catálogo no encontrado." });
    }
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede eliminar valores de catálogo generales.",
      });
    }

    await prisma.catalogoValor.delete({ where: { id } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CATALOGO_VALOR_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el valor de catálogo "${existente.etiqueta}" (${existente.tipo}/${existente.clave}).`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar valor de catálogo:", error);
    return res.status(500).json({ message: "Error al eliminar el valor de catálogo." });
  }
};

// Nota: la configuración de negocio (umbrales de ConfiguracionInventario,
// incluyendo los nuevos campos de esta migración) se lee/edita en el módulo
// inventario existente — GET/PUT /api/inventario/configuracion
// (inventario.controller.ts: obtenerConfiguracionInventario /
// actualizarConfiguracionInventario) — para no duplicar el mismo recurso en
// dos módulos. Ese schema (inventario.schemas.ts) ya se extendió con los
// campos nuevos.
