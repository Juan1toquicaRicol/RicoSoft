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
      where: { tenantId, eliminado: false },
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

/**
 * Resumen ejecutivo para la portada (Dashboard). A diferencia de
 * obtenerResumenAnalitica (que exige "analitica.ver" para el módulo de
 * gráficas avanzadas), este endpoint solo exige sesión: cada sección
 * (facturas/solicitudes/créditos) se incluye únicamente si el usuario tiene
 * el permiso de "ver" de ese módulo, para que la portada nunca muestre datos
 * a los que ese usuario no tendría acceso desde su propio módulo.
 */
export const obtenerDashboardResumen = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const permisos = req.user!.permisos;
    const puede = (permiso: string) => req.user!.isSuperadmin || permisos.includes(permiso);
    const ahora = new Date();

    const resultado: {
      facturas?: unknown;
      solicitudes?: unknown;
      creditos?: unknown;
      servicios?: unknown;
    } = {};

    if (puede("facturas.ver")) {
      const facturas = await prisma.factura.findMany({
        where: { tenantId, eliminado: false },
        select: { total: true, estado: true, vence: true, proveedor: true },
      });

      const porEstado: Record<string, number> = { Pendiente: 0, Aprobada: 0, Rechazada: 0, Pagada: 0 };
      let valorPendiente = 0;
      let valorAprobado = 0;
      let valorPagado = 0;
      let vencidas = 0;

      for (const f of facturas) {
        const total = Number(f.total);
        porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
        if (f.estado === "Pendiente") valorPendiente += total;
        if (f.estado === "Aprobada") valorAprobado += total;
        if (f.estado === "Pagada") valorPagado += total;
        if ((f.estado === "Pendiente" || f.estado === "Aprobada") && f.vence < ahora) {
          vencidas += 1;
        }
      }

      const porProveedor = new Map<string, number>();
      facturas.forEach((f) => {
        porProveedor.set(f.proveedor, (porProveedor.get(f.proveedor) ?? 0) + Number(f.total));
      });
      const topProveedores = [...porProveedor.entries()]
        .map(([nombre, valor]) => ({ nombre, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);

      resultado.facturas = {
        total: facturas.length,
        porEstado,
        valorPendiente,
        valorAprobado,
        valorPagado,
        vencidas,
        topProveedores,
      };
    }

    if (puede("solicitudes.ver")) {
      const grupos = await prisma.solicitudCompra.groupBy({
        by: ["estado"],
        where: { tenantId, eliminado: false },
        _count: { _all: true },
      });
      const porEstado: Record<string, number> = {};
      let total = 0;
      grupos.forEach((g) => {
        porEstado[g.estado] = g._count._all;
        total += g._count._all;
      });
      resultado.solicitudes = { total, porEstado };
    }

    if (puede("servicios.ver")) {
      const servicios = await prisma.servicioSuscripcion.findMany({
        where: { tenantId, eliminado: false, estado: "Activo" },
        select: { costo: true, periodicidad: true, fechaRenovacion: true },
      });

      const costoRecurrenteMensual = servicios.reduce((acc, s) => {
        const costo = Number(s.costo);
        if (s.periodicidad === "Anual") return acc + costo / 12;
        if (s.periodicidad === "Trimestral") return acc + costo / 3;
        return acc + costo; // Mensual
      }, 0);

      const en30Dias = new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000);
      const proximosVencimientos = servicios.filter(
        (s) => s.fechaRenovacion >= ahora && s.fechaRenovacion <= en30Dias,
      ).length;

      resultado.servicios = {
        activos: servicios.length,
        costoRecurrenteMensual,
        proximosVencimientos,
      };
    }

    if (puede("creditos.ver")) {
      const creditos = await prisma.creditoCliente.findMany({
        where: { tenantId, eliminado: false },
        select: { cliente: true, saldo: true, estado: true },
      });
      const totalSaldo = creditos.reduce((acc, c) => acc + Number(c.saldo), 0);
      const pendientes = creditos.filter((c) => c.estado !== "Al día").length;
      const topDeudores = [...creditos]
        .sort((a, b) => Number(b.saldo) - Number(a.saldo))
        .slice(0, 5)
        .map((c) => ({ cliente: c.cliente, saldo: Number(c.saldo) }));
      resultado.creditos = { total: creditos.length, totalSaldo, pendientes, topDeudores };
    }

    return res.json(resultado);
  } catch (error) {
    console.error("Error al calcular el resumen del dashboard:", error);
    return res.status(500).json({ message: "Error al calcular el resumen del dashboard." });
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
