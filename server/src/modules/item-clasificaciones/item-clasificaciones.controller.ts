import { Response } from "express";
import { ClasificacionFuncionalItem } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { listarItemsMaestroSiesa } from "../integraciones-siesa/siesa-inventario.service";

/**
 * Clasificación funcional de ítems — metadata PROPIA de RicoSoft sobre en
 * qué partes del sistema debe gestionarse cada ítem de Siesa. Nunca escribe
 * en Siesa, nunca depende de la sincronización de Siesa (que solo trae
 * Proveedores) — es una capa de configuración de RicoSoft por completo,
 * indexada por itemRowId (rowid real de t120_mc_items), no por una FK a un
 * catálogo propio de productos que no existe en el sistema.
 */

// Semilla de las 5 clasificaciones funcionales iniciales — se crea sola la
// primera vez que un tenant consulta el catálogo (ver listarClasificaciones),
// nunca en una migración de datos que no alcanzaría a tenants futuros.
const CLASIFICACIONES_SEMILLA = [
  { codigo: "IMPORTACION", nombre: "Importación", orden: 1 },
  { codigo: "EXPORTACION", nombre: "Exportación", orden: 2 },
  { codigo: "INVENTARIO", nombre: "Inventario", orden: 3 },
  { codigo: "PRODUCCION", nombre: "Producción", orden: 4 },
  { codigo: "COMERCIAL", nombre: "Comercial", orden: 5 },
];

async function resolverCiaSiesa(tenantId: string): Promise<number | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  return tenant?.siesaCiaId ?? null;
}

const serializarClasificacion = (
  c: ClasificacionFuncionalItem & { _count?: { asignaciones: number } },
) => ({
  id: c.id,
  codigo: c.codigo,
  nombre: c.nombre,
  descripcion: c.descripcion,
  activo: c.activo,
  orden: c.orden,
  itemsAsociados: c._count?.asignaciones ?? 0,
  createdAt: c.createdAt,
});

/**
 * Lista las clasificaciones del tenant, sembrando las 5 iniciales si el
 * tenant todavía no tiene ninguna — idempotente (createMany con
 * skipDuplicates, protegido además por el índice único tenantId+codigo).
 */
export const listarClasificaciones = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;

    const existentes = await req.tenantPrisma!.clasificacionFuncionalItem.count();
    if (existentes === 0) {
      // SQL Server no soporta skipDuplicates en createMany — es seguro
      // insertar sin ese resguardo porque el bloque solo se ejecuta cuando
      // el conteo ya dio 0 (y el índice único tenantId+codigo respalda
      // cualquier condición de carrera igualmente).
      await req.tenantPrisma!.clasificacionFuncionalItem.createMany({
        data: CLASIFICACIONES_SEMILLA.map((c) => ({ ...c, tenantId })),
      });
    }

    const clasificaciones = await req.tenantPrisma!.clasificacionFuncionalItem.findMany({
      include: { _count: { select: { asignaciones: true } } },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });

    return res.json(clasificaciones.map(serializarClasificacion));
  } catch (error) {
    console.error("Error al listar clasificaciones funcionales de ítems:", error);
    return res.status(500).json({ message: "Error al obtener las clasificaciones." });
  }
};

export const crearClasificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { codigo, nombre, descripcion, orden } = req.body;
    const codigoNormalizado = codigo.trim().toUpperCase().replace(/\s+/g, "_");

    const existente = await req.tenantPrisma!.clasificacionFuncionalItem.findFirst({
      where: { codigo: codigoNormalizado },
    });
    if (existente) {
      return res.status(409).json({
        message: `Ya existe una clasificación con el código "${codigoNormalizado}".`,
      });
    }

    const ultimaOrden =
      orden ??
      ((await req.tenantPrisma!.clasificacionFuncionalItem.aggregate({ _max: { orden: true } }))
        ._max.orden ?? 0) + 1;

    const clasificacion = await req.tenantPrisma!.clasificacionFuncionalItem.create({
      data: {
        tenantId,
        codigo: codigoNormalizado,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        orden: ultimaOrden,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CLASIFICACION_ITEM_CREADA",
        detalle: `${req.user!.nombre} creó la clasificación funcional "${clasificacion.nombre}" (${clasificacion.codigo})`,
        entidadTipo: "ClasificacionFuncionalItem",
        entidadId: clasificacion.id,
      },
    });

    return res
      .status(201)
      .json(serializarClasificacion({ ...clasificacion, _count: { asignaciones: 0 } }));
  } catch (error) {
    console.error("Error al crear clasificación funcional de ítem:", error);
    return res.status(500).json({ message: "Error al crear la clasificación." });
  }
};

export const actualizarClasificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { nombre, descripcion, orden } = req.body;

    const existente = await req.tenantPrisma!.clasificacionFuncionalItem.findFirst({
      where: { id },
    });
    if (!existente) return res.status(404).json({ message: "Clasificación no encontrada." });

    const actualizada = await req.tenantPrisma!.clasificacionFuncionalItem.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(descripcion !== undefined ? { descripcion: descripcion?.trim() || null } : {}),
        ...(orden !== undefined && orden !== null ? { orden } : {}),
      },
      include: { _count: { select: { asignaciones: true } } },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CLASIFICACION_ITEM_EDITADA",
        detalle: `${req.user!.nombre} editó la clasificación funcional "${actualizada.nombre}"`,
        entidadTipo: "ClasificacionFuncionalItem",
        entidadId: id,
      },
    });

    return res.json(serializarClasificacion(actualizada));
  } catch (error) {
    console.error("Error al actualizar clasificación funcional de ítem:", error);
    return res.status(500).json({ message: "Error al actualizar la clasificación." });
  }
};

/**
 * Activar/desactivar — nunca se elimina físicamente una clasificación
 * (mismo principio de soft-delete que el resto del sistema). Desactivarla
 * no borra las asignaciones existentes: solo deja de ofrecerse para
 * clasificar ítems nuevos.
 */
export const cambiarActivoClasificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { activo } = req.body;

    const existente = await req.tenantPrisma!.clasificacionFuncionalItem.findFirst({
      where: { id },
    });
    if (!existente) return res.status(404).json({ message: "Clasificación no encontrada." });

    const actualizada = await req.tenantPrisma!.clasificacionFuncionalItem.update({
      where: { id },
      data: { activo },
      include: { _count: { select: { asignaciones: true } } },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: activo ? "CLASIFICACION_ITEM_ACTIVADA" : "CLASIFICACION_ITEM_DESACTIVADA",
        detalle: `${req.user!.nombre} ${activo ? "activó" : "desactivó"} la clasificación funcional "${actualizada.nombre}"`,
        entidadTipo: "ClasificacionFuncionalItem",
        entidadId: id,
      },
    });

    return res.json(serializarClasificacion(actualizada));
  } catch (error) {
    console.error("Error al cambiar el estado de la clasificación funcional de ítem:", error);
    return res.status(500).json({ message: "Error al actualizar la clasificación." });
  }
};

// SQL Server limita ~2100 parámetros por consulta. listarItemsMaestroSiesa
// ya usa @ciaId/@search/@skip/@take, así que se deja margen amplio antes de
// ese límite para el IN/NOT IN de itemRowId.
const LIMITE_IDS_EN_CLAUSULA_SQL = 1500;

/**
 * Ítems del maestro de Siesa (paginado) + sus clasificaciones funcionales
 * ya asignadas en RicoSoft — se resuelven en dos pasos (Siesa y la BD
 * propia son conexiones distintas, no se puede hacer un JOIN entre las
 * dos). Cuando el filtro es `clasificacionId` o `sinClasificar`, el
 * conjunto de itemRowId candidato se resuelve primero en RicoSoft y se
 * empuja a Siesa como IN/NOT IN — así el filtrado, la búsqueda de texto y
 * la paginación ocurren los tres en SQL, sin traer el catálogo completo a
 * Node. Excepción documentada: si ese conjunto de itemRowId supera
 * LIMITE_IDS_EN_CLAUSULA_SQL (tenant con miles de ítems ya clasificados,
 * o filtrando "sin clasificar" en un catálogo con miles de asignaciones
 * previas), un IN/NOT IN con esa cantidad de parámetros excede el límite
 * de SQL Server — en ese caso puntual se conserva el comportamiento
 * anterior (traer hasta 5000 ítems de Siesa y filtrar en Node). No hay,
 * dentro de la arquitectura actual (dos bases de datos separadas, sin
 * posibilidad de JOIN), una alternativa limpia para ese caso extremo sin
 * introducir una tabla puente o una réplica del catálogo — deliberadamente
 * fuera de alcance de este ajuste.
 */
export const listarItemsConClasificacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const siesaCiaId = await resolverCiaSiesa(tenantId);
    if (!siesaCiaId) {
      return res.json({
        disponible: false,
        motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
      });
    }

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
    );
    const clasificacionId =
      typeof req.query.clasificacionId === "string" && req.query.clasificacionId
        ? req.query.clasificacionId
        : undefined;
    const sinClasificar = req.query.sinClasificar === "true";

    if (clasificacionId || sinClasificar) {
      const clasificacion = clasificacionId
        ? await req.tenantPrisma!.clasificacionFuncionalItem.findFirst({
            where: { id: clasificacionId },
          })
        : null;
      if (clasificacionId && !clasificacion) {
        return res.status(404).json({ message: "Clasificación no encontrada." });
      }

      const todasLasAsignaciones = await req.tenantPrisma!.itemClasificacionAsignada.findMany({
        select: { itemRowId: true, clasificacionId: true },
      });
      const itemsClasificados = [...new Set(todasLasAsignaciones.map((a) => a.itemRowId))];
      const itemsConClasificacion = clasificacionId
        ? [
            ...new Set(
              todasLasAsignaciones
                .filter((a) => a.clasificacionId === clasificacionId)
                .map((a) => a.itemRowId),
            ),
          ]
        : null;

      const idsParaFiltroSql = sinClasificar ? itemsClasificados : itemsConClasificacion!;

      if (idsParaFiltroSql.length <= LIMITE_IDS_EN_CLAUSULA_SQL) {
        // Caso normal: el conjunto de itemRowId candidato se empuja a
        // Siesa como IN/NOT IN — filtrado, búsqueda y paginación ocurren
        // en SQL, sin traer el catálogo completo.
        const { items, total } = await listarItemsMaestroSiesa(siesaCiaId, {
          search: search || undefined,
          page,
          pageSize,
          itemRowIdsFiltro: {
            modo: sinClasificar ? "excluir" : "incluir",
            ids: idsParaFiltroSql,
          },
        });
        const conClasificaciones = await adjuntarClasificaciones(req, items);

        return res.json({
          disponible: true,
          items: conClasificaciones,
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        });
      }

      // Caso extremo documentado (ver comentario de la función): el
      // conjunto de itemRowId a filtrar excede el límite de parámetros de
      // una consulta SQL — se conserva el comportamiento anterior.
      const itemsClasificadosSet = new Set(itemsClasificados);
      const itemsConClasificacionSet = itemsConClasificacion
        ? new Set(itemsConClasificacion)
        : null;

      const { items: catalogoCompleto } = await listarItemsMaestroSiesa(siesaCiaId, {
        search: search || undefined,
        page: 1,
        pageSize: 5000,
      });

      const filtrados = catalogoCompleto.filter((it) =>
        sinClasificar
          ? !itemsClasificadosSet.has(it.itemRowId)
          : itemsConClasificacionSet!.has(it.itemRowId),
      );

      const total = filtrados.length;
      const pagina = filtrados.slice((page - 1) * pageSize, page * pageSize);
      const conClasificaciones = await adjuntarClasificaciones(req, pagina);

      return res.json({
        disponible: true,
        items: conClasificaciones,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      });
    }

    const { items, total } = await listarItemsMaestroSiesa(siesaCiaId, {
      search: search || undefined,
      page,
      pageSize,
    });
    const conClasificaciones = await adjuntarClasificaciones(req, items);

    return res.json({
      disponible: true,
      items: conClasificaciones,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error("Error al listar ítems con clasificación funcional:", error);
    return res.status(500).json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    });
  }
};

async function adjuntarClasificaciones(
  req: AuthenticatedRequest,
  items: {
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    unidadMedida: string | null;
    esVendible: boolean;
    naturaleza: string;
  }[],
) {
  if (items.length === 0) return [];
  const itemRowIds = items.map((i) => i.itemRowId);
  const asignaciones = await req.tenantPrisma!.itemClasificacionAsignada.findMany({
    where: { itemRowId: { in: itemRowIds } },
    include: { clasificacion: { select: { id: true, nombre: true, codigo: true, activo: true } } },
  });
  const porItem = new Map<number, { id: string; nombre: string; codigo: string }[]>();
  for (const a of asignaciones) {
    const lista = porItem.get(a.itemRowId) ?? [];
    lista.push({
      id: a.clasificacion.id,
      nombre: a.clasificacion.nombre,
      codigo: a.clasificacion.codigo,
    });
    porItem.set(a.itemRowId, lista);
  }
  return items.map((it) => ({ ...it, clasificaciones: porItem.get(it.itemRowId) ?? [] }));
}

export const obtenerClasificacionesDeItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const itemRowId = Number.parseInt(req.params.itemRowId, 10);
    if (!Number.isFinite(itemRowId)) {
      return res.status(400).json({ message: "itemRowId inválido." });
    }

    const asignaciones = await req.tenantPrisma!.itemClasificacionAsignada.findMany({
      where: { itemRowId },
      include: {
        clasificacion: { select: { id: true, nombre: true, codigo: true, activo: true } },
      },
    });

    return res.json({
      itemRowId,
      clasificaciones: asignaciones.map((a) => ({
        id: a.clasificacion.id,
        nombre: a.clasificacion.nombre,
        codigo: a.clasificacion.codigo,
        activo: a.clasificacion.activo,
      })),
    });
  } catch (error) {
    console.error("Error al obtener las clasificaciones de un ítem:", error);
    return res.status(500).json({ message: "Error al obtener las clasificaciones del ítem." });
  }
};

/**
 * Reemplaza el conjunto completo de clasificaciones de un ítem en una sola
 * llamada (el checklist del panel de edición) — calcula el diff
 * (agregar/quitar) en vez de borrar todo y recrear, para no generar ruido
 * de auditoría/eventos innecesario si nada cambió en una fila puntual.
 */
export const actualizarClasificacionesDeItem = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const itemRowId = Number.parseInt(req.params.itemRowId, 10);
    if (!Number.isFinite(itemRowId)) {
      return res.status(400).json({ message: "itemRowId inválido." });
    }
    const { clasificacionIds } = req.body as { clasificacionIds: string[] };

    // Todas las clasificaciones referenciadas deben existir Y pertenecer a
    // este tenant — req.tenantPrisma ya filtra por tenantId, así que un id
    // de otro tenant simplemente no aparece aquí (nunca se confía en el
    // conteo del body).
    const clasificacionesValidas = await req.tenantPrisma!.clasificacionFuncionalItem.findMany({
      where: { id: { in: clasificacionIds } },
      select: { id: true, nombre: true },
    });
    if (clasificacionesValidas.length !== new Set(clasificacionIds).size) {
      return res
        .status(404)
        .json({ message: "Una o más clasificaciones no existen en este tenant." });
    }

    const actuales = await req.tenantPrisma!.itemClasificacionAsignada.findMany({
      where: { itemRowId },
      select: { id: true, clasificacionId: true },
    });
    const idsActuales = new Set(actuales.map((a) => a.clasificacionId));
    const idsNuevos = new Set(clasificacionIds);

    const aQuitar = actuales.filter((a) => !idsNuevos.has(a.clasificacionId));
    const aAgregar = clasificacionIds.filter((id) => !idsActuales.has(id));

    if (aQuitar.length === 0 && aAgregar.length === 0) {
      return res.json({ itemRowId, clasificaciones: clasificacionesValidas });
    }

    await req.tenantPrisma!.$transaction([
      ...(aQuitar.length > 0
        ? [
            req.tenantPrisma!.itemClasificacionAsignada.deleteMany({
              where: { id: { in: aQuitar.map((a) => a.id) } },
            }),
          ]
        : []),
      ...(aAgregar.length > 0
        ? [
            req.tenantPrisma!.itemClasificacionAsignada.createMany({
              // aAgregar ya excluye lo que estaba en idsActuales, y SQL
              // Server no soporta skipDuplicates en createMany.
              data: aAgregar.map((clasificacionId) => ({
                tenantId,
                itemRowId,
                clasificacionId,
                asignadoPorId: req.user!.id,
                asignadoPorNombre: req.user!.nombre,
              })),
            }),
          ]
        : []),
    ]);

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ITEM_CLASIFICACIONES_ACTUALIZADAS",
        detalle: `${req.user!.nombre} actualizó las clasificaciones del ítem Siesa #${itemRowId}: +[${aAgregar
          .map((id) => clasificacionesValidas.find((c) => c.id === id)?.nombre)
          .join(", ")}] -[${aQuitar
          .map(
            (a) =>
              actuales.find((x) => x.id === a.id) &&
              clasificacionesValidas.find((c) => c.id === a.clasificacionId)?.nombre,
          )
          .filter(Boolean)
          .join(", ")}]`,
        entidadTipo: "ItemClasificacionAsignada",
        entidadId: String(itemRowId),
      },
    });

    return res.json({ itemRowId, clasificaciones: clasificacionesValidas });
  } catch (error) {
    console.error("Error al actualizar las clasificaciones de un ítem:", error);
    return res.status(500).json({ message: "Error al actualizar las clasificaciones del ítem." });
  }
};

/**
 * Clasificación masiva: asigna o quita UNA clasificación sobre N ítems a la
 * vez, transaccional. `skipDuplicates` evita el 409 en cadena si algunos
 * ítems del lote ya tenían la clasificación (asignar es idempotente).
 */
export const asignacionMasiva = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { itemRowIds, clasificacionId, accion } = req.body as {
      itemRowIds: number[];
      clasificacionId: string;
      accion: "asignar" | "quitar";
    };

    const clasificacion = await req.tenantPrisma!.clasificacionFuncionalItem.findFirst({
      where: { id: clasificacionId },
    });
    if (!clasificacion) {
      return res.status(404).json({ message: "Clasificación no encontrada." });
    }

    const itemRowIdsUnicos = [...new Set(itemRowIds)];
    let afectados = 0;

    if (accion === "asignar") {
      // SQL Server no soporta skipDuplicates en createMany — se resuelve el
      // conjunto ya asignado primero y solo se insertan los faltantes,
      // respaldado además por el índice único tenantId+itemRowId+clasificacionId.
      const yaAsignados = await req.tenantPrisma!.itemClasificacionAsignada.findMany({
        where: { itemRowId: { in: itemRowIdsUnicos }, clasificacionId },
        select: { itemRowId: true },
      });
      const itemRowIdsYaAsignados = new Set(yaAsignados.map((a) => a.itemRowId));
      const itemRowIdsAInsertar = itemRowIdsUnicos.filter((id) => !itemRowIdsYaAsignados.has(id));

      if (itemRowIdsAInsertar.length > 0) {
        const resultado = await req.tenantPrisma!.itemClasificacionAsignada.createMany({
          data: itemRowIdsAInsertar.map((itemRowId) => ({
            tenantId,
            itemRowId,
            clasificacionId,
            asignadoPorId: req.user!.id,
            asignadoPorNombre: req.user!.nombre,
          })),
        });
        afectados = resultado.count;
      }
    } else {
      const resultado = await req.tenantPrisma!.itemClasificacionAsignada.deleteMany({
        where: { itemRowId: { in: itemRowIdsUnicos }, clasificacionId },
      });
      afectados = resultado.count;
    }

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "ITEM_CLASIFICACION_MASIVA",
        detalle: `${req.user!.nombre} ${accion === "asignar" ? "asignó" : "quitó"} "${clasificacion.nombre}" ${
          accion === "asignar" ? "a" : "de"
        } ${itemRowIdsUnicos.length} ítem(s) (${afectados} cambios reales)`,
        entidadTipo: "ClasificacionFuncionalItem",
        entidadId: clasificacionId,
      },
    });

    return res.json({
      solicitados: itemRowIdsUnicos.length,
      afectados,
      mensaje:
        accion === "asignar"
          ? `Se asignó "${clasificacion.nombre}" a ${afectados} de ${itemRowIdsUnicos.length} ítem(s) (los demás ya la tenían).`
          : `Se quitó "${clasificacion.nombre}" de ${afectados} ítem(s).`,
    });
  } catch (error) {
    console.error("Error en la clasificación masiva de ítems:", error);
    return res.status(500).json({ message: "Error al procesar la clasificación masiva." });
  }
};
