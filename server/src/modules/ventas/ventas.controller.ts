import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import {
  leerExistenciasSiesa,
  buscarItemsSiesa,
} from "../integraciones-siesa/siesa-inventario.service";
import { leerListaMaterialesSiesa } from "../integraciones-siesa/siesa-manufactura.service";
import {
  leerActividadMensualClientesSiesa,
  leerActividadMensualKilosClientesSiesa,
  leerUltimaCompraClientesSiesa,
  leerPrecioPromedioItemSiesa,
  leerClientesPorItemSiesa,
  leerHistoricoComprasClienteSiesa,
  leerHistoricoVentasSiesa,
  contarHistoricoVentasSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import { leerClienteSiesa } from "../integraciones-siesa/siesa-clientes.service";
import {
  contarPedidosClienteSiesa,
  leerPedidosClienteSiesa,
  leerLineasPedidoClienteSiesa,
  leerTrazabilidadPedidoClienteSiesa,
} from "../integraciones-siesa/siesa-pedidos.service";
import {
  contarRemisionesClienteSiesa,
  leerRemisionesClienteSiesa,
  leerLineasRemisionClienteSiesa,
} from "../integraciones-siesa/siesa-remisiones.service";
import { calcularClientesEnRiesgoSiesa } from "../../lib/ventas-siesa";
import { calcularDisponibilidadComercial } from "../../domain/ventas/disponibilidad";
import { construirContextoPlaneacionSiesa } from "../inventario/inventario.controller";
import {
  consultarDisponibilidadSchema,
  buscarProductosSchema,
  contextoProductoSchema,
  historicoClienteSchema,
  clienteResumenSchema,
  listarPedidosClienteSchema,
  listarRemisionesClienteSchema,
  listarFacturasClienteSchema,
  trazabilidadPedidoSchema,
  detalleRemisionSchema,
} from "./ventas.schemas";

async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
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

    const riesgoComercial = calcularClientesEnRiesgoSiesa(
      actividad,
      actividadKilos,
      ultimasCompras,
      ahora,
    );
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
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
  }

  try {
    const items = await buscarItemsSiesa(siesaCiaId, parseo.data.search, 10);
    return res.json({ disponible: true, items });
  } catch (error) {
    console.error("Error al buscar productos en Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
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
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
    });
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
    const costoUnitario =
      item && item.cantidadExistente > 0 ? item.valorTotal / item.cantidadExistente : null;
    const precioPromedioVenta =
      precio.cantidadTotal > 0 ? precio.netoTotal / precio.cantidadTotal : null;
    const costoPromedioVenta =
      precio.cantidadTotal > 0 ? precio.costoTotal / precio.cantidadTotal : null;
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
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
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

/**
 * Ficha 360 del cliente — Resumen (identificación, estado, vendedor,
 * condición de pago, cupo, bloqueos). Es la ÚNICA sección que carga junto
 * con el encabezado de la ficha; el resto (pedidos/remisiones/facturas/
 * crédito/cartera/actividad) se consulta bajo demanda al abrir cada pestaña.
 */
export const obtenerClienteResumen = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = clienteResumenSchema.safeParse(req.params);
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
    const cliente = await leerClienteSiesa(siesaCiaId, parseo.data.clienteRowId);
    if (!cliente) {
      return res.json({ disponible: false, motivo: "Cliente no encontrado en esta compañía." });
    }
    return res.json({ disponible: true, cliente });
  } catch (error) {
    console.error("Error al leer el resumen del cliente desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/** Ficha 360 — Pedidos del cliente, paginados server-side (OFFSET/FETCH). */
export const listarPedidosCliente = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarPedidosClienteSchema.safeParse({ ...req.params, ...req.query });
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      items: [],
      page: 1,
      pageSize: parseo.data.pageSize,
      total: 0,
    });
  }

  const { clienteRowId, page, pageSize } = parseo.data;
  try {
    const [items, total] = await Promise.all([
      leerPedidosClienteSiesa(siesaCiaId, clienteRowId, page, pageSize),
      contarPedidosClienteSiesa(siesaCiaId, clienteRowId),
    ]);
    return res.json({ disponible: true, items, page, pageSize, total });
  } catch (error) {
    console.error("Error al leer los pedidos del cliente desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page,
      pageSize,
      total: 0,
    });
  }
};

/**
 * Ficha 360 — Trazabilidad de UN pedido: línea -> remisiones parciales ->
 * factura. `pedidoRowId` SIEMPRE se valida contra (ciaId, clienteRowId) en
 * el propio JOIN del service — nunca se confía en que el pedido pertenezca
 * a este cliente solo porque el id "se ve válido".
 */
export const obtenerTrazabilidadPedido = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = trazabilidadPedidoSchema.safeParse(req.params);
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

  const { clienteRowId, pedidoRowId } = parseo.data;
  try {
    const lineas = await leerLineasPedidoClienteSiesa(siesaCiaId, clienteRowId, pedidoRowId);
    if (lineas.length === 0) {
      // Pedido inexistente, de otra compañía, o de otro cliente — el JOIN ya
      // lo filtró; nunca se distingue el motivo exacto en la respuesta
      // (mismo principio de IDOR "404 silencioso" del resto del sistema).
      return res.json({ disponible: false, motivo: "Pedido no encontrado para este cliente." });
    }
    const remisiones = await leerTrazabilidadPedidoClienteSiesa(
      siesaCiaId,
      clienteRowId,
      pedidoRowId,
    );
    const porLinea = lineas.map((linea) => ({
      ...linea,
      remisiones: remisiones.filter(
        (r) => r.lineaRowId === linea.lineaRowId && r.remisionRowId !== null,
      ),
    }));
    return res.json({ disponible: true, lineas: porLinea });
  } catch (error) {
    console.error("Error al leer la trazabilidad del pedido desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/** Ficha 360 — Remisiones del cliente, paginadas server-side. */
export const listarRemisionesCliente = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarRemisionesClienteSchema.safeParse({ ...req.params, ...req.query });
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      items: [],
      page: 1,
      pageSize: parseo.data.pageSize,
      total: 0,
    });
  }

  const { clienteRowId, page, pageSize } = parseo.data;
  try {
    const [items, total] = await Promise.all([
      leerRemisionesClienteSiesa(siesaCiaId, clienteRowId, page, pageSize),
      contarRemisionesClienteSiesa(siesaCiaId, clienteRowId),
    ]);
    return res.json({ disponible: true, items, page, pageSize, total });
  } catch (error) {
    console.error("Error al leer las remisiones del cliente desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page,
      pageSize,
      total: 0,
    });
  }
};

/** Ficha 360 — Líneas (detalle) de UNA remisión del cliente, con bodega/lote/origen. */
export const obtenerDetalleRemision = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = detalleRemisionSchema.safeParse(req.params);
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

  const { clienteRowId, remisionRowId } = parseo.data;
  try {
    const lineas = await leerLineasRemisionClienteSiesa(siesaCiaId, clienteRowId, remisionRowId);
    if (lineas.length === 0) {
      return res.json({ disponible: false, motivo: "Remisión no encontrada para este cliente." });
    }
    return res.json({ disponible: true, lineas });
  } catch (error) {
    console.error("Error al leer el detalle de la remisión desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
    });
  }
};

/**
 * Ficha 360 — Facturas del cliente. NO es un servicio nuevo: reutiliza
 * leerHistoricoVentasSiesa/contarHistoricoVentasSiesa (siesa-ventas.service.ts),
 * que ya soporta filtro por clienteRowId y paginación OFFSET/FETCH real
 * contra 85K+ documentos — mismo patrón que /historia-compras.
 */
export const listarFacturasCliente = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarFacturasClienteSchema.safeParse({ ...req.params, ...req.query });
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      items: [],
      page: 1,
      pageSize: parseo.data.pageSize,
      total: 0,
    });
  }

  const { clienteRowId, page, pageSize } = parseo.data;
  const hasta = parseo.data.hasta ?? new Date();
  const desde = parseo.data.desde ?? new Date(hasta.getFullYear() - 5, hasta.getMonth(), 1);

  const filtros = { ciaId: siesaCiaId, desde, hasta, clienteRowId };
  try {
    const [items, total] = await Promise.all([
      leerHistoricoVentasSiesa(filtros, page, pageSize),
      contarHistoricoVentasSiesa(filtros),
    ]);
    return res.json({ disponible: true, items, page, pageSize, total });
  } catch (error) {
    console.error("Error al leer las facturas del cliente desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page,
      pageSize,
      total: 0,
    });
  }
};
