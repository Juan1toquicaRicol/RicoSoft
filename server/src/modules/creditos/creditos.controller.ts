import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const ESTADOS_VALIDOS = ["Al día", "Por vencer", "Vencido"];

function serializar(c: any) {
  return { ...c, cupo: Number(c.cupo), saldo: Number(c.saldo) };
}

export const listarCreditos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const creditos = await prisma.creditoCliente.findMany({
      where: { tenantId },
      orderBy: { vence: "asc" },
    });
    return res.json(creditos.map(serializar));
  } catch (error) {
    console.error("Error al listar créditos:", error);
    return res.status(500).json({ message: "Error al obtener los créditos." });
  }
};

export const crearCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { cliente, cupo, saldo, vence, estado } = req.body;

    if (!cliente || !vence) {
      return res.status(400).json({ message: "Cliente y fecha de vencimiento son obligatorios." });
    }
    const cupoNum = Number(cupo);
    const saldoNum = Number(saldo);
    if (!Number.isFinite(cupoNum) || cupoNum < 0 || !Number.isFinite(saldoNum) || saldoNum < 0) {
      return res.status(400).json({ message: "Cupo y saldo deben ser números no negativos." });
    }

    const credito = await prisma.creditoCliente.create({
      data: {
        tenantId,
        cliente,
        cupo: cupoNum,
        saldo: saldoNum,
        vence: new Date(vence),
        estado: ESTADOS_VALIDOS.includes(estado) ? estado : "Al día",
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_CREADO",
        detalle: `${req.user!.nombre} registró un crédito para "${cliente}"`,
      },
    });

    return res.status(201).json(serializar(credito));
  } catch (error) {
    console.error("Error al crear crédito:", error);
    return res.status(500).json({ message: "Error al registrar el crédito." });
  }
};

export const actualizarCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { saldo, estado } = req.body;

    const existente = await prisma.creditoCliente.findFirst({ where: { id, tenantId } });
    if (!existente) return res.status(404).json({ message: "Crédito no encontrado." });

    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    if (saldo !== undefined && (!Number.isFinite(Number(saldo)) || Number(saldo) < 0)) {
      return res.status(400).json({ message: "El saldo debe ser un número no negativo." });
    }

    const credito = await prisma.creditoCliente.update({
      where: { id },
      data: {
        ...(saldo !== undefined ? { saldo: Number(saldo) } : {}),
        ...(estado ? { estado } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_EDITADO",
        detalle: `${req.user!.nombre} actualizó el crédito de "${credito.cliente}"`,
      },
    });

    return res.json(serializar(credito));
  } catch (error) {
    console.error("Error al actualizar crédito:", error);
    return res.status(500).json({ message: "Error al actualizar el crédito." });
  }
};
