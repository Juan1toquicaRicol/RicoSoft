import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Registro de requisitos de importación por proveedor (Proveedores y
 * requisitos, dentro del módulo de Importaciones). Un requisito NO es
 * necesariamente un documento — ver comentario en schema.prisma sobre
 * RequisitoProveedorImportacion — por eso `tipo` es un catálogo cerrado
 * validado aquí, no una tabla de "documentos".
 */
export const TIPOS_REQUISITO_VALIDOS = [
  "DOCUMENTO",
  "ACCION",
  "CONDICION",
  "INFORMACION",
  "PAGO",
  "ESPECIFICACION",
];

/** Mismo patrón que parsearMateriales en proveedores.controller.ts — un
 * valor corrupto/preexistente no debe tumbar la pantalla. */
function parsearMateriales(json: string | null): string[] {
  if (!json) return [];
  try {
    const valor = JSON.parse(json);
    return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Lista los requisitos ACTIVOS de un proveedor, ordenados por `orden` —
 * usado tanto por la pantalla de administración (con `?incluirInactivos=true`
 * para ver también los desactivados) como por el detalle de una orden de
 * compra internacional ("Requisitos del proveedor"). Referencia VIVA por
 * diseño (decisión de esta fase, ver auditoría): siempre los vigentes, sin
 * snapshot — si el proveedor no pertenece a este tenant, 404 (nunca revela
 * que existe en otro tenant).
 */
export const listarRequisitosProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { proveedorId } = req.params;
    const proveedor = await req.tenantPrisma!.proveedor.findFirst({
      where: { id: proveedorId },
      select: {
        id: true,
        nombre: true,
        nit: true,
        paisOrigen: true,
        materialesHabituales: true,
      },
    });
    if (!proveedor) return res.status(404).json({ message: "Proveedor no encontrado." });

    const incluirInactivos = req.query.incluirInactivos === "true";
    const requisitos = await req.tenantPrisma!.requisitoProveedorImportacion.findMany({
      where: { proveedorId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { orden: "asc" },
    });

    return res.json({
      proveedor: {
        ...proveedor,
        materialesHabituales: parsearMateriales(proveedor.materialesHabituales),
      },
      requisitos,
    });
  } catch (error) {
    console.error("Error al listar requisitos del proveedor:", error);
    return res.status(500).json({ message: "Error al obtener los requisitos del proveedor." });
  }
};

/**
 * Proveedores que YA tienen algo configurado (país de origen, materiales
 * habituales o al menos un requisito) — para mostrarlos de una vez en
 * "Proveedores y Requisitos" sin tener que volver a buscarlos uno por uno en
 * el selector. Un proveedor sin ninguno de los tres nunca aparece aquí (sería
 * ruido: la lista completa de proveedores ya existe en Configuración).
 */
export const listarProveedoresConfigurados = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const proveedores = await req.tenantPrisma!.proveedor.findMany({
      where: {
        OR: [
          { paisOrigen: { not: null } },
          { materialesHabituales: { not: null } },
          { requisitosImportacion: { some: {} } },
        ],
      },
      select: {
        id: true,
        nombre: true,
        nit: true,
        paisOrigen: true,
        materialesHabituales: true,
        _count: { select: { requisitosImportacion: true } },
      },
      orderBy: { nombre: "asc" },
    });

    return res.json(
      proveedores.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        nit: p.nit,
        paisOrigen: p.paisOrigen,
        materialesHabituales: parsearMateriales(p.materialesHabituales),
        totalRequisitos: p._count.requisitosImportacion,
      })),
    );
  } catch (error) {
    console.error("Error al listar proveedores configurados:", error);
    return res.status(500).json({ message: "Error al obtener los proveedores configurados." });
  }
};

export const crearRequisitoProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { proveedorId } = req.params;
    const { tipo, nombre, descripcion, obligatorio, orden } = req.body;

    const proveedor = await req.tenantPrisma!.proveedor.findFirst({ where: { id: proveedorId } });
    if (!proveedor) return res.status(404).json({ message: "Proveedor no encontrado." });

    if (!TIPOS_REQUISITO_VALIDOS.includes(tipo)) {
      return res.status(400).json({
        message: `Tipo de requisito inválido. Valores permitidos: ${TIPOS_REQUISITO_VALIDOS.join(", ")}.`,
      });
    }

    const requisito = await req.tenantPrisma!.requisitoProveedorImportacion.create({
      data: {
        // tenantId lo inyecta igual el wrapper de tenantPrisma en runtime
        // (lib/tenant-prisma.ts) — se pasa explícito solo porque el tipo
        // generado por Prisma lo exige en tiempo de compilación.
        tenantId,
        proveedorId,
        tipo,
        nombre,
        descripcion: descripcion ?? null,
        obligatorio: obligatorio ?? true,
        orden: orden ?? 0,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REQUISITO_PROVEEDOR_CREADO",
        detalle: `${req.user!.nombre} creó el requisito "${requisito.nombre}" para el proveedor "${proveedor.nombre}"`,
        entidadTipo: "RequisitoProveedorImportacion",
        entidadId: requisito.id,
        datosNuevos: JSON.stringify(requisito),
      },
    });

    return res.status(201).json(requisito);
  } catch (error) {
    console.error("Error al crear requisito de proveedor:", error);
    return res.status(500).json({ message: "Error al crear el requisito." });
  }
};

export const actualizarRequisitoProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { requisitoId } = req.params;
    const { tipo, nombre, descripcion, obligatorio, activo, orden } = req.body;

    const existente = await req.tenantPrisma!.requisitoProveedorImportacion.findFirst({
      where: { id: requisitoId },
      include: { proveedor: { select: { nombre: true } } },
    });
    if (!existente) return res.status(404).json({ message: "Requisito no encontrado." });

    if (tipo !== undefined && tipo !== null && !TIPOS_REQUISITO_VALIDOS.includes(tipo)) {
      return res.status(400).json({
        message: `Tipo de requisito inválido. Valores permitidos: ${TIPOS_REQUISITO_VALIDOS.join(", ")}.`,
      });
    }

    const requisito = await req.tenantPrisma!.requisitoProveedorImportacion.update({
      where: { id: requisitoId },
      data: {
        ...(typeof tipo === "string" ? { tipo } : {}),
        ...(typeof nombre === "string" ? { nombre } : {}),
        ...(descripcion !== undefined ? { descripcion } : {}),
        ...(typeof obligatorio === "boolean" ? { obligatorio } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(typeof orden === "number" ? { orden } : {}),
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REQUISITO_PROVEEDOR_EDITADO",
        detalle: `${req.user!.nombre} editó el requisito "${existente.nombre}" del proveedor "${existente.proveedor.nombre}"`,
        entidadTipo: "RequisitoProveedorImportacion",
        entidadId: requisito.id,
        datosAnteriores: JSON.stringify(existente),
        datosNuevos: JSON.stringify(requisito),
      },
    });

    return res.json(requisito);
  } catch (error) {
    console.error("Error al actualizar requisito de proveedor:", error);
    return res.status(500).json({ message: "Error al actualizar el requisito." });
  }
};

export const eliminarRequisitoProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { requisitoId } = req.params;

    const existente = await req.tenantPrisma!.requisitoProveedorImportacion.findFirst({
      where: { id: requisitoId },
      include: { proveedor: { select: { nombre: true } } },
    });
    if (!existente) return res.status(404).json({ message: "Requisito no encontrado." });

    await req.tenantPrisma!.requisitoProveedorImportacion.delete({ where: { id: requisitoId } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "REQUISITO_PROVEEDOR_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el requisito "${existente.nombre}" del proveedor "${existente.proveedor.nombre}"`,
        entidadTipo: "RequisitoProveedorImportacion",
        entidadId: requisitoId,
        datosAnteriores: JSON.stringify(existente),
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar requisito de proveedor:", error);
    return res.status(500).json({ message: "Error al eliminar el requisito." });
  }
};
