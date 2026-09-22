import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";
import { getOrSetCache, invalidarCachePorPrefijo } from "../../lib/memo-cache";
import {
  DEFINICIONES_TIPOS,
  TIPOS_CATALOGO_VALIDOS,
  aliasesEnConflicto,
  claveCanonica,
  clavesValidas,
  esTipoCatalogoValido,
  esquemaMetadata,
  leerMetadata,
  resolverPrecedencia,
  serializarMetadata,
  validarClaveNueva,
  type MetadataCatalogo,
  type TipoCatalogo,
} from "../../lib/catalogos";
import { contarReferenciasCatalogo } from "./catalogos-referencias";

// Los discriminadores válidos y su definición viven en lib/catalogos.ts; se
// re-exportan aquí para no cambiar la superficie pública de este módulo.
export { TIPOS_CATALOGO_VALIDOS };

const CACHE_TTL_CATALOGO_MS = 30_000;
const PREFIJO_CACHE = "catalogo:";

const MENSAJE_TIPO = `tipo inválido. Valores permitidos: ${TIPOS_CATALOGO_VALIDOS.join(", ")}.`;

interface FilaCatalogo {
  id: string;
  tipo: string;
  clave: string;
  etiqueta: string;
  descripcion: string | null;
  metadata: string | null;
  orden: number;
  activo: boolean;
  tenantId: string | null;
}

function serializar(
  c: FilaCatalogo,
  marcas?: { sobrescribeGeneral?: boolean; sobrescrito?: boolean },
) {
  return {
    id: c.id,
    tipo: c.tipo,
    clave: c.clave,
    etiqueta: c.etiqueta,
    descripcion: c.descripcion,
    metadata: leerMetadata(c.metadata),
    orden: c.orden,
    activo: c.activo,
    alcance: c.tenantId === null ? "GENERAL" : "TENANT",
    ...(marcas ?? {}),
  };
}

/** Filas mínimas (GENERAL + del tenant) de un tipo, con caché corta por tenant. */
async function leerFilasResolubles(tenantId: string, tipo: string) {
  return getOrSetCache(`${PREFIJO_CACHE}${tipo}:${tenantId}`, CACHE_TTL_CATALOGO_MS, () =>
    prisma.catalogoValor.findMany({
      where: { tipo, ...whereAlcance(tenantId) },
      select: { clave: true, tenantId: true, activo: true, orden: true, metadata: true },
    }),
  );
}

/**
 * Claves válidas HOY para el tenant en un tipo: valor efectivo activo
 * (precedencia TENANT → GENERAL) más los alias heredados que declare — así los
 * validadores de otros módulos siguen aceptando el texto que ya está guardado
 * en datos históricos ("TON") además de la clave canónica ("TN"). La clave de
 * caché incluye tenantId: nunca se mezclan tenants.
 */
export async function obtenerClavesActivasCatalogo(
  tenantId: string,
  tipo: string,
): Promise<Set<string>> {
  return clavesValidas(await leerFilasResolubles(tenantId, tipo), tenantId);
}

/** Clave canónica de un valor recibido (clave o alias) o null si no es válido. */
export async function resolverClaveCatalogo(
  tenantId: string,
  tipo: string,
  valor: string,
): Promise<string | null> {
  return claveCanonica(await leerFilasResolubles(tenantId, tipo), tenantId, valor);
}

/** alias → clave canónica, sobre los valores efectivos (activos o no: sirve
 * para reconciliar datos históricos, no para validar). */
export async function obtenerMapaAliasCatalogo(
  tenantId: string,
  tipo: string,
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (const fila of resolverPrecedencia(await leerFilasResolubles(tenantId, tipo), tenantId)) {
    for (const alias of leerMetadata(fila.metadata).aliases ?? []) mapa.set(alias, fila.clave);
  }
  return mapa;
}

/** GET /catalogos/tipos — definición de cada tipo (etiqueta, grupo, campos), para no duplicarla en el frontend. */
export const listarTiposCatalogo = async (_req: AuthenticatedRequest, res: Response) => {
  return res.json(DEFINICIONES_TIPOS);
};

/**
 * GET /catalogos?tipo=INCOTERM (o sin filtro: todos). Autenticado; cualquier
 * usuario con sesión puede leer, son catálogos de referencia.
 *  - Consumo normal: el valor EFECTIVO de cada clave (TENANT sobre GENERAL) y
 *    solo activos; una fila del tenant desactivada oculta la general.
 *  - incluirInactivos=true (pantalla de administración): TODAS las filas
 *    visibles, con marcas de cuál sobrescribe a cuál.
 */
export const listarCatalogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tipo = typeof req.query.tipo === "string" ? req.query.tipo : undefined;
    const incluirInactivos = req.query.incluirInactivos === "true";

    if (tipo !== undefined && !esTipoCatalogoValido(tipo)) {
      return res.status(404).json({ message: `El catálogo "${tipo}" no existe.` });
    }

    const filas = await prisma.catalogoValor.findMany({
      where: { ...(tipo ? { tipo } : {}), ...whereAlcance(tenantId) },
      orderBy: [{ tipo: "asc" }, { orden: "asc" }, { clave: "asc" }],
    });

    if (incluirInactivos) {
      const tenantPorClave = new Set(
        filas.filter((f) => f.tenantId !== null).map((f) => `${f.tipo}/${f.clave}`),
      );
      const generalPorClave = new Set(
        filas.filter((f) => f.tenantId === null).map((f) => `${f.tipo}/${f.clave}`),
      );
      return res.json(
        filas.map((f) => {
          const clave = `${f.tipo}/${f.clave}`;
          return serializar(f, {
            sobrescribeGeneral: f.tenantId !== null && generalPorClave.has(clave),
            sobrescrito: f.tenantId === null && tenantPorClave.has(clave),
          });
        }),
      );
    }

    const porTipo = new Map<string, FilaCatalogo[]>();
    for (const f of filas) porTipo.set(f.tipo, [...(porTipo.get(f.tipo) ?? []), f]);
    const efectivos = [...porTipo.entries()].flatMap(([, grupo]) =>
      resolverPrecedencia(grupo, tenantId).filter((f) => f.activo),
    );
    return res.json(efectivos.map((f) => serializar(f)));
  } catch (error) {
    console.error("Error al listar catálogo:", error);
    return res.status(500).json({ message: "Error al obtener el catálogo." });
  }
};

/** Valida (y normaliza) `metadata` del body. Devuelve el error o el JSON a guardar. */
function procesarMetadata(crudo: unknown): { error: string } | { valor: MetadataCatalogo | null } {
  if (crudo === undefined || crudo === null) return { valor: null };
  const parseo = esquemaMetadata.safeParse(crudo);
  if (!parseo.success) {
    return {
      error: `metadata inválida: ${parseo.error.errors[0]?.message ?? "formato incorrecto"}.`,
    };
  }
  return { valor: parseo.data };
}

function limpiarTexto(valor: unknown, max: number): string | null | "invalido" {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return "invalido";
  const texto = valor.trim();
  if (texto.length > max) return "invalido";
  return texto || null;
}

export const crearValorCatalogo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { tipo, clave, etiqueta, descripcion, metadata, orden, activo, alcance } = req.body;

    if (!esTipoCatalogoValido(tipo)) {
      return res.status(400).json({ message: MENSAJE_TIPO });
    }
    if (typeof clave !== "string") {
      return res.status(400).json({ message: "clave es obligatoria." });
    }
    const errorClave = validarClaveNueva(tipo, clave);
    if (errorClave) return res.status(400).json({ message: errorClave });
    if (!etiqueta || typeof etiqueta !== "string" || !etiqueta.trim() || etiqueta.length > 255) {
      return res.status(400).json({ message: "etiqueta es obligatoria (máximo 255 caracteres)." });
    }
    const descripcionLimpia = limpiarTexto(descripcion, 500);
    if (descripcionLimpia === "invalido") {
      return res
        .status(400)
        .json({ message: "descripcion debe ser texto de máximo 500 caracteres." });
    }
    const meta = procesarMetadata(metadata);
    if ("error" in meta) return res.status(400).json({ message: meta.error });
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'alcance debe ser "GENERAL" o "TENANT".' });
    }
    if (activo !== undefined && typeof activo !== "boolean") {
      return res.status(400).json({ message: "activo debe ser booleano." });
    }
    // Un valor GENERAL lo ven todos los tenants: solo un superadmin lo crea.
    if (alcance === "GENERAL" && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede crear valores de catálogo de alcance general.",
      });
    }

    const claveFinal = clave.trim();
    const aliases = meta.valor?.aliases ?? [];
    if (aliases.length > 0) {
      const existentes = await prisma.catalogoValor.findMany({
        where: { tipo, ...whereAlcance(tenantId) },
        select: { clave: true, tenantId: true, activo: true },
      });
      const enConflicto = aliasesEnConflicto(aliases, claveFinal, existentes, tenantId);
      if (enConflicto.length > 0) {
        return res.status(409).json({
          message: `Los alias (${enConflicto.join(", ")}) chocan con una clave existente del mismo catálogo.`,
        });
      }
    }

    const valor = await prisma.catalogoValor.create({
      data: {
        tipo,
        clave: claveFinal,
        etiqueta: etiqueta.trim(),
        descripcion: descripcionLimpia,
        metadata: serializarMetadata(meta.valor),
        orden: typeof orden === "number" && Number.isFinite(orden) ? Math.trunc(orden) : 0,
        activo: activo ?? true,
        tenantId: alcance === "GENERAL" ? null : tenantId,
      },
    });
    invalidarCachePorPrefijo(PREFIJO_CACHE);

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CATALOGO_VALOR_CREADO",
        detalle: `${req.user!.nombre} creó el valor de catálogo "${valor.etiqueta}" (${valor.tipo}/${valor.clave}).`,
        entidadTipo: "CatalogoValor",
        entidadId: valor.id,
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
    const { etiqueta, descripcion, metadata, orden, activo } = req.body;

    const existente = await prisma.catalogoValor.findFirst({
      where: { id, ...whereAlcance(tenantId) },
    });
    if (!existente) {
      return res.status(404).json({ message: "Valor de catálogo no encontrado." });
    }
    // Los valores GENERALES no los modifica un usuario normal de un tenant: para
    // ajustarlos a su empresa crea un valor propio con la misma clave (lo
    // sobrescribe solo para ese tenant).
    if (existente.tenantId === null && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede editar valores de catálogo generales.",
      });
    }

    if (
      etiqueta !== undefined &&
      (typeof etiqueta !== "string" || !etiqueta.trim() || etiqueta.length > 255)
    ) {
      return res.status(400).json({ message: "etiqueta debe ser texto no vacío (máximo 255)." });
    }
    if (activo !== undefined && typeof activo !== "boolean") {
      return res.status(400).json({ message: "activo debe ser booleano." });
    }
    if (orden !== undefined && (typeof orden !== "number" || !Number.isFinite(orden))) {
      return res.status(400).json({ message: "orden debe ser numérico." });
    }
    const descripcionLimpia =
      descripcion === undefined ? undefined : limpiarTexto(descripcion, 500);
    if (descripcionLimpia === "invalido") {
      return res
        .status(400)
        .json({ message: "descripcion debe ser texto de máximo 500 caracteres." });
    }
    let metadataNueva: MetadataCatalogo | null | undefined;
    if (metadata !== undefined) {
      const meta = procesarMetadata(metadata);
      if ("error" in meta) return res.status(400).json({ message: meta.error });
      metadataNueva = meta.valor;
      const aliases = metadataNueva?.aliases ?? [];
      if (aliases.length > 0) {
        const existentes = await prisma.catalogoValor.findMany({
          where: { tipo: existente.tipo, ...whereAlcance(tenantId) },
          select: { clave: true, tenantId: true, activo: true },
        });
        const enConflicto = aliasesEnConflicto(aliases, existente.clave, existentes, tenantId);
        if (enConflicto.length > 0) {
          return res.status(409).json({
            message: `Los alias (${enConflicto.join(", ")}) chocan con una clave existente del mismo catálogo.`,
          });
        }
      }
    }

    const cambios = {
      ...(typeof etiqueta === "string" ? { etiqueta: etiqueta.trim() } : {}),
      ...(descripcionLimpia !== undefined ? { descripcion: descripcionLimpia } : {}),
      ...(metadataNueva !== undefined ? { metadata: serializarMetadata(metadataNueva) } : {}),
      ...(typeof orden === "number" ? { orden: Math.trunc(orden) } : {}),
      ...(typeof activo === "boolean" ? { activo } : {}),
    };

    const valor = await prisma.catalogoValor.update({ where: { id }, data: cambios });
    invalidarCachePorPrefijo(PREFIJO_CACHE);

    const anteriores = Object.fromEntries(
      Object.keys(cambios).map((campo) => [campo, existente[campo as keyof typeof existente]]),
    );
    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CATALOGO_VALOR_EDITADO",
        detalle: `${req.user!.nombre} editó el valor de catálogo "${valor.etiqueta}" (${valor.tipo}/${valor.clave}).`,
        entidadTipo: "CatalogoValor",
        entidadId: valor.id,
        datosAnteriores: JSON.stringify(anteriores),
        datosNuevos: JSON.stringify(cambios),
      },
    });

    return res.json(serializar(valor));
  } catch (error) {
    console.error("Error al actualizar valor de catálogo:", error);
    return res.status(500).json({ message: "Error al actualizar el valor de catálogo." });
  }
};

/**
 * Elimina un valor SOLO si ningún dato de negocio lo referencia (clave o
 * alias). Si está en uso responde 409 y la salida correcta es desactivarlo:
 * borrarlo dejaría filas históricas con un valor que ya no existe en el
 * catálogo. Excepción: un valor del tenant que solo sobrescribe a uno GENERAL
 * de la misma clave se puede borrar siempre — vuelve a regir el general y el
 * dato guardado sigue siendo válido.
 */
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

    const sobrescribeGeneral =
      existente.tenantId !== null &&
      (await prisma.catalogoValor.count({
        where: { tipo: existente.tipo, clave: existente.clave, tenantId: null },
      })) > 0;

    if (!sobrescribeGeneral && esTipoCatalogoValido(existente.tipo)) {
      const valores = [existente.clave, ...(leerMetadata(existente.metadata).aliases ?? [])];
      const enUso = await contarReferenciasCatalogo(
        existente.tipo as TipoCatalogo,
        valores,
        existente.tenantId,
      );
      if (enUso > 0) {
        return res.status(409).json({
          message: `El valor "${existente.clave}" está en uso en ${enUso} registro(s) y no se puede eliminar. Desactívalo para que deje de ofrecerse sin perder el histórico.`,
          referencias: enUso,
        });
      }
    }

    await prisma.catalogoValor.delete({ where: { id } });
    invalidarCachePorPrefijo(PREFIJO_CACHE);

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CATALOGO_VALOR_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el valor de catálogo "${existente.etiqueta}" (${existente.tipo}/${existente.clave}).`,
        entidadTipo: "CatalogoValor",
        entidadId: existente.id,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar valor de catálogo:", error);
    return res.status(500).json({ message: "Error al eliminar el valor de catálogo." });
  }
};

// Nota: la configuración de negocio (umbrales y parámetros de
// ConfiguracionInventario) se lee/edita en el módulo inventario existente —
// GET/PUT /api/inventario/configuracion — para no duplicar el mismo recurso
// en dos módulos.
