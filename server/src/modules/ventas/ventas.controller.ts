import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { leerExistenciasSiesa, buscarItemsSiesa } from "../integraciones-siesa/siesa-inventario.service";
import { leerListaMaterialesSiesa } from "../integraciones-siesa/siesa-manufactura.service";
import {
  leerActividadMensualClientesSiesa,
  leerActividadMensualKilosClientesSiesa,
  leerUltimaCompraClientesSiesa,
  leerPrecioPromedioItemSiesa,
  leerClientesPorItemSiesa,
  leerHistoricoComprasClienteSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import { calcularClientesEnRiesgoSiesa } from "../../lib/ventas-siesa";
import { calcularDisponibilidadComercial } from "../../domain/ventas/disponibilidad";
import { construirContextoPlaneacionSiesa } from "../inventario/inventario.controller";
import {
  consultarDisponibilidadSchema,
  buscarProductosSchema,
  contextoProductoSchema,
  historicoClienteSchema,
} from "./ventas.schemas";

async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { siesaCiaId: true } });
  return tenant?.siesaCiaId ?? null;
}

/**
 * Disponibilidad comercial — "¿PUEDO VENDER ESTO?" (Sección 6/26 del
 * módulo Ventas). Reutiliza EXACTAMENTE el mismo dominio que el Centro de
 * Decisiones (domain/ventas/disponibilidad.ts → capacidad-productiva.ts +
 * abastecimiento-siesa.ts), aplicado a un único producto/cantidad en vez
 * del lote completo — para que un vendedor pueda validar un pedido
 * concreto antes de comprometerlo, sin preguntarle a Sistemas.
 */
export const obtenerDisponibilidadComercial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = consultarDisponibilidadSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
  }

  try {
    const [existencias, bom] = await Promise.all([
      leerExistenciasSiesa(siesaCiaId),
      leerListaMaterialesSiesa(siesaCiaId),
    ]);
    const resultado = calcularDisponibilidadComercial(
      parseo.data.itemRowId,
      parseo.data.cantidad,
      existencias,
      bom,
    );
    return res.json({ disponible: true, resultado });
  } catch (error) {
    console.error("Error al calcular disponibilidad comercial desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Centro Comercial — Sección 5 del módulo Ventas: trabajo accionable para
 * el área comercial hoy, NO otro dashboard de BI (eso ya existe en
 * /analitica). Compone:
 * - "riesgo_quiebre" del Centro de Decisiones (reutilizado tal cual vía
 *   construirContextoPlaneacionSiesa — mismo cálculo que /inventario) —
 *   productos que no se deberían seguir comprometiendo en ventas nuevas.
 * - Clientes en riesgo (reutilizado tal cual de
 *   calcularClientesEnRiesgoSiesa, la misma función que ya usa
 *   obtenerVentasGerencial en /analitica/ventas) — quién necesita
 *   seguimiento comercial hoy.
 *
 * Ningún cálculo nuevo aquí: es composición de lo que ya existe, con la
 * lente operativa de "qué debo atender hoy" en vez de "qué está pasando".
 */
export const obtenerCentroComercial = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const siesaCiaId = await resolverCiaSiesa(tenantId);

  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
  }

  const ahora = new Date();
  const desdeActividad = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 3, 1));
  const desdeUltimaCompra = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 12, 1));

  try {
    const [contexto, actividad, actividadKilos, ultimasCompras] = await Promise.all([
      construirContextoPlaneacionSiesa(req, tenantId, siesaCiaId),
      leerActividadMensualClientesSiesa(siesaCiaId, desdeActividad),
      leerActividadMensualKilosClientesSiesa(siesaCiaId, desdeActividad),
      leerUltimaCompraClientesSiesa(siesaCiaId, desdeUltimaCompra),
    ]);

    const riesgoComercial = calcularClientesEnRiesgoSiesa(actividad, actividadKilos, ultimasCompras, ahora);
    const productosEnRiesgoQuiebre = contexto.decisiones.filter((d) => d.tipo === "riesgo_quiebre");

    return res.json({
      disponible: true,
      productosEnRiesgoQuiebre,
      clientesInactivos: riesgoComercial.clientesInactivos,
      caidasClientesTop: riesgoComercial.caidasClientesTop,
      totalVentaEnRiesgo: riesgoComercial.totalVentaEnRiesgo,
      totalKilosEnRiesgo: riesgoComercial.totalKilosEnRiesgo,
    });
  } catch (error) {
    console.error("Error al calcular el Centro Comercial desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Autocompletado de producto por descripción o referencia — para el campo
 * "Referencia" del checker de disponibilidad. Búsqueda directa contra el
 * maestro de ítems de Siesa (t120_mc_items), no un catálogo propio.
 */
export const buscarProductosVenta = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = buscarProductosSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({ disponible: false, motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada." });
  }

  try {
    const items = await buscarItemsSiesa(siesaCiaId, parseo.data.search, 10);
    return res.json({ disponible: true, items });
  } catch (error) {
    console.error("Error al buscar productos en Siesa:", error);
    return res.json({ disponible: false, motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde." });
  }
};

/**
 * Contexto comercial de un producto — "¿cuánto cuesta?" y "¿a quién se le
 * vende?" (petición explícita de negocio). Reutiliza:
 * - leerExistenciasSiesa para el costo unitario real (valorTotal/existencia,
 *   la misma cifra que ya usa el resto del sistema, nunca un precio inventado).
 * - leerPrecioPromedioItemSiesa (nueva, sobre v470_ventas) para el precio
 *   promedio de venta REAL de los últimos 90 días — null si no hubo ventas
 *   recientes, nunca se simula un precio de lista que Siesa no reporta.
 * - leerClientesPorItemSiesa (nueva) para los clientes reales que lo compran.
 */
export const obtenerContextoProducto = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = contextoProductoSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({ disponible: false, motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada." });
  }

  const ahora = new Date();
  const desde90d = new Date(ahora.getTime() - 90 * 24 * 60 * 60 * 1000);

  try {
    const [existencias, precio, clientes] = await Promise.all([
      leerExistenciasSiesa(siesaCiaId),
      leerPrecioPromedioItemSiesa(siesaCiaId, parseo.data.itemRowId, desde90d),
      leerClientesPorItemSiesa(siesaCiaId, parseo.data.itemRowId, desde90d, 10),
    ]);

    const item = existencias.find((e) => e.itemRowId === parseo.data.itemRowId);
    const costoUnitario = item && item.cantidadExistente > 0 ? item.valorTotal / item.cantidadExistente : null;
    const precioPromedioVenta = precio.cantidadTotal > 0 ? precio.netoTotal / precio.cantidadTotal : null;
    const costoPromedioVenta = precio.cantidadTotal > 0 ? precio.costoTotal / precio.cantidadTotal : null;
    const margenPromedioPct =
      precioPromedioVenta !== null && costoPromedioVenta !== null && precioPromedioVenta > 0
        ? Math.round(((precioPromedioVenta - costoPromedioVenta) / precioPromedioVenta) * 1000) / 10
        : null;

    return res.json({
      disponible: true,
      itemRowId: parseo.data.itemRowId,
      descripcion: item?.descripcion ?? null,
      referencia: item?.referencia ?? null,
      unidadMedida: item?.unidadMedida ?? null,
      costoUnitario,
      precioPromedioVenta,
      margenPromedioPct,
      ventanaPrecioDias: 90,
      lineasVentaRecientes: precio.lineas,
      clientes,
    });
  } catch (error) {
    console.error("Error al calcular el contexto del producto desde Siesa:", error);
    return res.json({ disponible: false, motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde." });
  }
};

/**
 * "¿Qué dejó de comprar este cliente?" — historial de compras de UN
 * cliente, producto por producto, con la última fecha y cuántas veces lo
 * compró (Ventas > Clientes en riesgo, drill-down). Ventana de 12 meses,
 * mismo criterio que calcularClientesEnRiesgoSiesa (leerUltimaCompraClientesSiesa
 * ya usa esa misma ventana para "última compra" del cliente en general).
 */
export const obtenerHistoricoComprasCliente = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = historicoClienteSchema.safeParse(req.params);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
  }

  const ahora = new Date();
  const desde12m = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 12, 1));

  try {
    const productos = await leerHistoricoComprasClienteSiesa(
      siesaCiaId,
      parseo.data.clienteRowId,
      desde12m,
    );
    return res.json({ disponible: true, productos });
  } catch (error) {
    console.error("Error al leer el histórico de compras del cliente desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};
