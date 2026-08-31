import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const listarProveedores = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const proveedores = await prisma.proveedor.findMany({
      where: {
        tenantId,
        ...(search
          ? { OR: [{ nombre: { contains: search } }, { nit: { contains: search } }] }
          : {}),
      },
      include: {
        departamento: { select: { id: true, nombre: true } },
        _count: { select: { facturas: true, contratos: true, solicitudesCompra: true } },
      },
      orderBy: { nombre: "asc" },
    });

    return res.json(
      proveedores.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        nit: p.nit,
        contacto: p.contacto,
        telefono: p.telefono,
        email: p.email,
        activo: p.activo,
        departamentoId: p.departamentoId,
        departamento: p.departamento ? { id: p.departamento.id, nombre: p.departamento.nombre } : null,
        facturasAsociadas: p._count.facturas,
        contratosAsociados: p._count.contratos,
        solicitudesAsociadas: p._count.solicitudesCompra,
      })),
    );
  } catch (error) {
    console.error("Error al listar proveedores:", error);
    return res.status(500).json({ message: "Error al obtener proveedores." });
  }
};

export const crearProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    // Forma del body ya validada por validarBody(crearProveedorSchema).
    const { nombre, nit, contacto, telefono, email, departamentoId } = req.body;

    const nitLimpio = nit.trim();
    const existente = await prisma.proveedor.findFirst({ where: { tenantId, nit: nitLimpio } });
    if (existente) {
      return res.status(409).json({ message: `Ya existe un proveedor registrado con el NIT "${nitLimpio}".` });
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

    const proveedor = await prisma.proveedor.create({
      data: {
        tenantId,
        nombre: nombre.trim(),
        nit: nitLimpio,
        contacto: typeof contacto === "string" && contacto.trim() ? contacto.trim() : null,
        telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null,
        email: typeof email === "string" && email.trim() ? email.trim() : null,
        departamentoId: departamentoIdFinal,
      },
      include: { departamento: { select: { id: true, nombre: true } } },
    });

    await prisma.auditoria.create({
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
      activo: proveedor.activo,
      departamentoId: proveedor.departamentoId,
      departamento: proveedor.departamento
        ? { id: proveedor.departamento.id, nombre: proveedor.departamento.nombre }
        : null,
      facturasAsociadas: 0,
      contratosAsociados: 0,
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
    const { nombre, nit, contacto, telefono, email, activo, departamentoId } = req.body;

    const existente = await prisma.proveedor.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return res.status(404).json({ message: "Proveedor no encontrado." });
    }

    if (typeof nit === "string" && nit.trim() && nit.trim() !== existente.nit) {
      const nitEnUso = await prisma.proveedor.findFirst({ where: { tenantId, nit: nit.trim() } });
      if (nitEnUso) {
        return res.status(409).json({ message: `Ya existe un proveedor registrado con el NIT "${nit.trim()}".` });
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

    const proveedor = await prisma.proveedor.update({
      where: { id },
      data: {
        ...(typeof nombre === "string" && nombre.trim() ? { nombre: nombre.trim() } : {}),
        ...(typeof nit === "string" && nit.trim() ? { nit: nit.trim() } : {}),
        ...(contacto !== undefined ? { contacto: typeof contacto === "string" && contacto.trim() ? contacto.trim() : null } : {}),
        ...(telefono !== undefined ? { telefono: typeof telefono === "string" && telefono.trim() ? telefono.trim() : null } : {}),
        ...(email !== undefined ? { email: typeof email === "string" && email.trim() ? email.trim() : null } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(departamentoIdFinal !== undefined ? { departamentoId: departamentoIdFinal } : {}),
      },
      include: {
        departamento: { select: { id: true, nombre: true } },
        _count: { select: { facturas: true, contratos: true, solicitudesCompra: true } },
      },
    });

    await prisma.auditoria.create({
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
      activo: proveedor.activo,
      departamentoId: proveedor.departamentoId,
      departamento: proveedor.departamento
        ? { id: proveedor.departamento.id, nombre: proveedor.departamento.nombre }
        : null,
      facturasAsociadas: proveedor._count.facturas,
      contratosAsociados: proveedor._count.contratos,
      solicitudesAsociadas: proveedor._count.solicitudesCompra,
    });
  } catch (error) {
    console.error("Error al actualizar proveedor:", error);
    return res.status(500).json({ message: "Error al actualizar el proveedor." });
  }
};

/**
 * Elimina un proveedor solo si no tiene facturas, contratos ni solicitudes de
 * compra asociadas (integridad referencial); si los tiene, se le pide al
 * administrador desactivarlo en su lugar, igual que con Departamentos.
 */
export const eliminarProveedor = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;

    const proveedor = await prisma.proveedor.findFirst({
      where: { id, tenantId },
      include: { _count: { select: { facturas: true, contratos: true, solicitudesCompra: true } } },
    });
    if (!proveedor) {
      return res.status(404).json({ message: "Proveedor no encontrado." });
    }
    const totalAsociados = proveedor._count.facturas + proveedor._count.contratos + proveedor._count.solicitudesCompra;
    if (totalAsociados > 0) {
      return res.status(409).json({
        message: `No se puede eliminar: hay ${totalAsociados} registro(s) (facturas/contratos/solicitudes de compra) asociados a este proveedor. Desactívalo en su lugar.`,
      });
    }

    await prisma.proveedor.delete({ where: { id } });

    await prisma.auditoria.create({
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
