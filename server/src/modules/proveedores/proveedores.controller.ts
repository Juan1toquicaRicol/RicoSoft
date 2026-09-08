import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Búsqueda/listado paginado server-side (Fase 11/12 del plan Siesa): con
 * ~3.000 proveedores por tenant ya reales, dejó de ser viable devolver el
 * catálogo completo en cada carga. `search` filtra por nombre o NIT;
 * `departamentoId` filtra por el departamento dueño del proveedor (o "sin
 * departamento" = general, visible para cualquier área — mismo criterio que
 * ya usaba el filtrado en el frontend, ahora resuelto en el servidor);
 * `soloActivos` (default true) excluye los desactivados por Siesa.
 */
export const listarProveedores = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const departamentoId =
      typeof req.query.departamentoId === "string" && req.query.departamentoId
        ? req.query.departamentoId
        : undefined;
    const soloActivos = req.query.soloActivos !== "false";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    // OJO: search y departamentoId usan cada uno su propio OR — no se pueden
    // mezclar en la misma clave "OR" del objeto where (la segunda pisaría a
    // la primera), por eso van en un AND explícito.
    const where = {
      tenantId,
      ...(soloActivos ? { activo: true } : {}),
      AND: [
        ...(search
          ? [{ OR: [{ nombre: { contains: search } }, { nit: { contains: search } }] }]
          : []),
        ...(departamentoId ? [{ OR: [{ departamentoId }, { departamentoId: null }] }] : []),
      ],
    };

    const [proveedores, total] = await Promise.all([
      req.tenantPrisma!.proveedor.findMany({
        where,
        include: {
          departamento: { select: { id: true, nombre: true } },
          _count: { select: { facturas: true, solicitudesCompra: true } },
        },
        orderBy: { nombre: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      req.tenantPrisma!.proveedor.count({ where }),
    ]);

    return res.json({
      items: proveedores.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        nit: p.nit,
        contacto: p.contacto,
        telefono: p.telefono,
        email: p.email,
        condicionesPago: p.condicionesPago,
        datosPago: p.datosPago,
        activo: p.activo,
        departamentoId: p.departamentoId,
        departamento: p.departamento
          ? { id: p.departamento.id, nombre: p.departamento.nombre }
          : null,
        origen: p.origen,
        ultimaSincronizacion: p.ultimaSincronizacion,
        facturasAsociadas: p._count.facturas,
        solicitudesAsociadas: p._count.solicitudesCompra,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error al listar proveedores:", error);
    return res.status(500).json({ message: "Error al obtener proveedores." });
  }
};

export const crearProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    // Forma del body ya validada por validarBody(crearProveedorSchema).
    const { nombre, nit, contacto, telefono, email, condicionesPago, datosPago, departamentoId } =
      req.body;

    const nitLimpio = nit.trim();
    const existente = await req.tenantPrisma!.proveedor.findFirst({
      where: { tenantId, nit: nitLimpio },
    });
    if (existente) {
      return res
        .status(409)
        .json({ message: `Ya existe un proveedor registrado con el NIT "${nitLimpio}".` });
    }

    // Si se indica un departamento, debe existir en el mismo tenant (IDOR) —
    // igual que el resto de referencias por id en este módulo.
    let departamentoIdFinal: string | null = null;
    if (typeof departamentoId === "string" && departamentoId.trim()) {
      const departamentoDb = await prisma.departamento.findFirst({
        where: { id: departamentoId, tenantId },
      });
      if (!departamentoDb) {
        return res.status(404).json({ message: "El departamento seleccionado no existe." });
      }
      departamentoIdFinal = departamentoDb.id;
    }

    const proveedor = await req.tenantPrisma!.proveedor.create({
      data: {
        tenantId,
        nombre: nombre.trim(),
        nit: nitLimpio,
        contacto: typeof contacto === "string" && contacto.trim() ? contacto.trim() : null,
        telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null,
        email: typeof email === "string" && email.trim() ? email.trim() : null,
        condicionesPago:
          typeof condicionesPago === "string" && condicionesPago.trim()
            ? condicionesPago.trim()
            : null,
        datosPago: typeof datosPago === "string" && datosPago.trim() ? datosPago.trim() : null,
        departamentoId: departamentoIdFinal,
      },
      include: { departamento: { select: { id: true, nombre: true } } },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PROVEEDOR_CREADO",
        detalle: `${req.user!.nombre} registró el proveedor "${proveedor.nombre}" (NIT ${proveedor.nit})`,
        entidadTipo: "Proveedor",
        entidadId: proveedor.id,
        datosNuevos: JSON.stringify({ nombre: proveedor.nombre, nit: proveedor.nit }),
      },
    });

    return res.status(201).json({
      id: proveedor.id,
      nombre: proveedor.nombre,
      nit: proveedor.nit,
      contacto: proveedor.contacto,
      telefono: proveedor.telefono,
      email: proveedor.email,
      condicionesPago: proveedor.condicionesPago,
      datosPago: proveedor.datosPago,
      activo: proveedor.activo,
      departamentoId: proveedor.departamentoId,
      departamento: proveedor.departamento
        ? { id: proveedor.departamento.id, nombre: proveedor.departamento.nombre }
        : null,
      facturasAsociadas: 0,
      solicitudesAsociadas: 0,
    });
  } catch (error) {
    console.error("Error al crear proveedor:", error);
    return res.status(500).json({ message: "Error al registrar el proveedor." });
  }
};

export const actualizarProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    // Forma del body ya validada por validarBody(actualizarProveedorSchema).
    const {
      nombre,
      nit,
      contacto,
      telefono,
      email,
      condicionesPago,
      datosPago,
      activo,
      departamentoId,
    } = req.body;

    const existente = await req.tenantPrisma!.proveedor.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return res.status(404).json({ message: "Proveedor no encontrado." });
    }

    if (typeof nit === "string" && nit.trim() && nit.trim() !== existente.nit) {
      const nitEnUso = await req.tenantPrisma!.proveedor.findFirst({
        where: { tenantId, nit: nit.trim() },
      });
      if (nitEnUso) {
        return res
          .status(409)
          .json({ message: `Ya existe un proveedor registrado con el NIT "${nit.trim()}".` });
      }
    }

    // departamentoId !== undefined permite tanto asignar uno nuevo como
    // limpiarlo explícitamente (enviando null) para volver a un proveedor
    // "general"; si no viene en el body, el departamento actual no cambia.
    let departamentoIdFinal: string | null | undefined;
    if (departamentoId !== undefined) {
      if (typeof departamentoId === "string" && departamentoId.trim()) {
        const departamentoDb = await prisma.departamento.findFirst({
          where: { id: departamentoId, tenantId },
        });
        if (!departamentoDb) {
          return res.status(404).json({ message: "El departamento seleccionado no existe." });
        }
        departamentoIdFinal = departamentoDb.id;
      } else {
        departamentoIdFinal = null;
      }
    }

    const proveedor = await req.tenantPrisma!.proveedor.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(typeof nit === "string" && nit.trim() ? { nit: nit.trim() } : {}),
        ...(contacto !== undefined
          ? { contacto: typeof contacto === "string" && contacto.trim() ? contacto.trim() : null }
          : {}),
        ...(telefono !== undefined
          ? { telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null }
          : {}),
        ...(email !== undefined
          ? { email: typeof email === "string" && email.trim() ? email.trim() : null }
          : {}),
        ...(condicionesPago !== undefined
          ? {
              condicionesPago:
                typeof condicionesPago === "string" && condicionesPago.trim()
                  ? condicionesPago.trim()
                  : null,
            }
          : {}),
        ...(datosPago !== undefined
          ? {
              datosPago:
                typeof datosPago === "string" && datosPago.trim() ? datosPago.trim() : null,
            }
          : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(departamentoIdFinal !== undefined ? { departamentoId: departamentoIdFinal } : {}),
      },
      include: {
        departamento: { select: { id: true, nombre: true } },
        _count: { select: { facturas: true, solicitudesCompra: true } },
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PROVEEDOR_EDITADO",
        detalle: `${req.user!.nombre} editó el proveedor "${proveedor.nombre}"`,
        entidadTipo: "Proveedor",
        entidadId: id,
        datosAnteriores: JSON.stringify({
          nombre: existente.nombre,
          nit: existente.nit,
          activo: existente.activo,
        }),
        datosNuevos: JSON.stringify({
          nombre: proveedor.nombre,
          nit: proveedor.nit,
          activo: proveedor.activo,
        }),
      },
    });

    return res.json({
      id: proveedor.id,
      nombre: proveedor.nombre,
      nit: proveedor.nit,
      contacto: proveedor.contacto,
      telefono: proveedor.telefono,
      email: proveedor.email,
      condicionesPago: proveedor.condicionesPago,
      datosPago: proveedor.datosPago,
      activo: proveedor.activo,
      departamentoId: proveedor.departamentoId,
      departamento: proveedor.departamento
        ? { id: proveedor.departamento.id, nombre: proveedor.departamento.nombre }
        : null,
      facturasAsociadas: proveedor._count.facturas,
      solicitudesAsociadas: proveedor._count.solicitudesCompra,
    });
  } catch (error) {
    console.error("Error al actualizar proveedor:", error);
    return res.status(500).json({ message: "Error al actualizar el proveedor." });
  }
};

/**
 * Elimina un proveedor solo si no tiene facturas ni solicitudes de compra
 * asociadas (integridad referencial); si los tiene, se le pide al
 * administrador desactivarlo en su lugar, igual que con Departamentos.
 */
export const eliminarProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const proveedor = await req.tenantPrisma!.proveedor.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { facturas: true, solicitudesCompra: true } } },
    });
    if (!proveedor) {
      return res.status(404).json({ message: "Proveedor no encontrado." });
    }
    const totalAsociados = proveedor._count.facturas + proveedor._count.solicitudesCompra;
    if (totalAsociados > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: hay ${totalAsociados} registro(s) (facturas/solicitudes de compra) asociados a este proveedor. Desactívalo en su lugar.`,
      });
    }

    await req.tenantPrisma!.proveedor.delete({ where: { id } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PROVEEDOR_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el proveedor "${proveedor.nombre}"`,
        entidadTipo: "Proveedor",
        entidadId: id,
        datosAnteriores: JSON.stringify({ nombre: proveedor.nombre, nit: proveedor.nit }),
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar proveedor:", error);
    return res.status(500).json({ message: "Error al eliminar el proveedor." });
  }
};

/**
 * Resumen financiero de un proveedor: navegación consolidada
 * Proveedor -> Facturas -> Pagos -> Servicios sin salir de la ficha del
 * proveedor. Todas las consultas van filtradas por tenantId además de
 * req.tenantPrisma (defensa en profundidad), igual que el resto del módulo.
 */
export const obtenerResumenFinancieroProveedor = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const proveedor = await req.tenantPrisma!.proveedor.findFirst({ where: { id, tenantId } });
    if (!proveedor) {
      return res.status(404).json({ message: "Proveedor no encontrado." });
    }

    const [facturas, pagosAgg, serviciosActivos] = await Promise.all([
      req.tenantPrisma!.factura.findMany({
        where: { proveedorId: id, tenantId, eliminado: false },
        select: { id: true, total: true, estado: true },
      }),
      req.tenantPrisma!.pago.aggregate({
        where: { tenantId, estado: "Confirmado", factura: { proveedorId: id } },
        _sum: { valor: true },
      }),
      req.tenantPrisma!.servicioSuscripcion.count({
        where: { proveedorId: id, tenantId, eliminado: false, estado: "Activo" },
      }),
    ]);

    const totalFacturado = facturas.reduce((acc, f) => acc + Number(f.total), 0);
    const totalPagado = Number(pagosAgg._sum.valor ?? 0);

    return res.json({
      proveedor: { id: proveedor.id, nombre: proveedor.nombre, nit: proveedor.nit },
      facturas: {
        total: facturas.length,
        porEstado: facturas.reduce<Record<string, number>>((acc, f) => {
          acc[f.estado] = (acc[f.estado] ?? 0) + 1;
          return acc;
        }, {}),
        totalFacturado,
        totalPagado,
        saldoPendiente: totalFacturado - totalPagado,
      },
      servicios: { activos: serviciosActivos },
    });
  } catch (error) {
    console.error("Error al calcular el resumen financiero del proveedor:", error);
    return res.status(500).json({ message: "Error al calcular el resumen financiero." });
  }
};
