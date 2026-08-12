import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const MESES_CORTOS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export const obtenerResumenAnalitica = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const facturas = await prisma.factura.findMany({
      where: { tenantId },
      select: { fecha: true, total: true, estado: true, proveedor: true, nit: true, area: true },
    });

    // Serie mensual: últimos 7 meses calendario, calculada desde facturas reales.
    const ahora = new Date();
    const meses = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - (6 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: MESES_CORTOS[d.getMonth()] };
    });

    const serieMensual = meses.map((m) => {
      const delMes = facturas.filter((f) => {
        const fd = new Date(f.fecha);
        return fd.getFullYear() === m.year && fd.getMonth() === m.month;
      });
      const recibido = delMes.reduce((acc, f) => acc + Number(f.total), 0);
      const aprobado = delMes
        .filter((f) => f.estado === "Aprobada" || f.estado === "Pagada")
        .reduce((acc, f) => acc + Number(f.total), 0);
      const pagado = delMes.filter((f) => f.estado === "Pagada").reduce((acc, f) => acc + Number(f.total), 0);
      return { mes: m.label, recibido, aprobado, pagado };
    });

    // Top proveedores por valor total facturado.
    const porProveedor = new Map<string, { nit: string; valor: number; facturas: number }>();
    facturas.forEach((f) => {
      const cur = porProveedor.get(f.proveedor) ?? { nit: f.nit, valor: 0, facturas: 0 };
      cur.valor += Number(f.total);
      cur.facturas += 1;
      porProveedor.set(f.proveedor, cur);
    });
    const topProveedores = [...porProveedor.entries()]
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Comparativo por área (en millones COP, para mostrar compacto).
    const porAreaMap = new Map<string, number>();
    facturas.forEach((f) => {
      porAreaMap.set(f.area, (porAreaMap.get(f.area) ?? 0) + Number(f.total));
    });
    const porArea = [...porAreaMap.entries()]
      .map(([nombre, valor]) => ({ nombre, valor: Math.round(valor / 1_000_000) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5);

    // Proyección: valores futuros ingresados manualmente por Finanzas.
    const proyecciones = await prisma.proyeccionMensual.findMany({
      where: { tenantId },
      orderBy: [{ anio: "asc" }, { createdAt: "asc" }],
    });
    const proyeccion = proyecciones.map((p) => ({ mes: p.mes, real: null, proyectado: Number(p.proyectado) }));

    return res.json({ serieMensual, topProveedores, porArea, proyeccion });
  } catch (error) {
    console.error("Error al calcular resumen analítico:", error);
    return res.status(500).json({ message: "Error al calcular el resumen analítico." });
  }
};

export const registrarProyeccion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { mes, anio, proyectado } = req.body;

    if (!mes || !Number.isFinite(Number(anio)) || !Number.isFinite(Number(proyectado))) {
      return res.status(400).json({ message: "Mes, año y valor proyectado son obligatorios." });
    }

    const registro = await prisma.proyeccionMensual.upsert({
      where: { tenantId_mes_anio: { tenantId, mes, anio: Number(anio) } },
      update: { proyectado: Number(proyectado) },
      create: { tenantId, mes, anio: Number(anio), proyectado: Number(proyectado) },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "PROYECCION_REGISTRADA",
        detalle: `${req.user!.nombre} registró la proyección de ${mes} ${anio}`,
      },
    });

    return res.status(201).json({ ...registro, proyectado: Number(registro.proyectado) });
  } catch (error) {
    console.error("Error al registrar proyección:", error);
    return res.status(500).json({ message: "Error al registrar la proyección." });
  }
};
