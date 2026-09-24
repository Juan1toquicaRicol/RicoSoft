import { prisma } from "../../config/prisma";
import { getSiesaPool } from "../../config/siesa";
import { resolverCiaSiesa } from "../../lib/siesa-tenant";
import {
  leerCompromisoSiesaPorPdv,
  SiesaConsultaError,
  SiesaNoConfiguradoError,
  type ResumenSiesaPedido,
} from "./pedidos-compromiso.service";

/**
 * "Estado del Pedido UnoEE": vista de SOLO LECTURA del PDV de Siesa vinculado
 * a un PedidoComercial (cabecera + ítems), como la del CRM de Siesa. Misma
 * regla de unión que el resto de la trazabilidad: ÚNICAMENTE
 * PedidoComercial.erpRowId = t430.f430_rowid (+ compañía del tenant y tipo
 * 'PDV'); nunca por número visible ni por cliente. Sin vínculo ERP no se
 * consulta Siesa.
 */

export interface ItemEstadoUnoee {
  lineaRowId: number;
  itemRowId: number | null;
  referencia: string | null;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  /** cantidad × precio unitario (antes de descuentos e impuestos). */
  subtotal: number;
  descuentos: number;
  estado: string;
  cantidadRemisionada: number;
  cantidadPendiente: number;
}

export interface CabeceraEstadoUnoee {
  /** Consecutivo visible, ej. "PDV-00055444" (solo para mostrar). */
  consecutivo: string;
  /** Estado operativo visible: Comprometido, Facturado, Retenido, etc. */
  estado: string;
  valorTotal: number;
  descuentos: number;
  impuestos: number;
}

export interface EstadoPedidoUnoeeDto {
  pedidoId: string;
  /** false = el pedido no tiene erpRowId ("El pedido no ha sido enviado"). */
  vinculado: boolean;
  erpRowId: number | null;
  estadoComercial: string;
  estadoSincronizacion: string;
  /** Vinculado pero Siesa no devuelve ese PDV en la compañía del tenant. */
  encontradoEnSiesa: boolean;
  cabecera: CabeceraEstadoUnoee | null;
  items: ItemEstadoUnoee[];
}

/** "PDV-00055444": consecutivo de Siesa rellenado a 8 dígitos. */
export function formatearConsecutivoPdv(pdvNumero: number): string {
  return `PDV-${String(pdvNumero).padStart(8, "0")}`;
}

/**
 * Estado de una línea del PDV, en este orden de precedencia: facturado →
 * parcialmente facturado → remisionado → parcialmente remisionado → backorder
 * → comprometido → sin comprometer.
 */
export function estadoItemUnoee(l: {
  cantidad: number;
  cantidadComprometida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
  backorder: boolean;
}): string {
  if (l.cantidad > 0 && l.cantidadFacturada >= l.cantidad) return "Facturado";
  if (l.cantidadFacturada > 0) return "Parcialmente facturado";
  if (l.cantidad > 0 && l.cantidadRemisionada >= l.cantidad) return "Remisionado";
  if (l.cantidadRemisionada > 0) return "Parcialmente remisionado";
  if (l.backorder) return "Backorder";
  if (l.cantidadComprometida > 0) return "Comprometido";
  return "Sin comprometer";
}

interface FilaLinea {
  lineaRowId: number;
  itemRowId: number | null;
  referencia: string | null;
  descripcion: string | null;
  cantidadPedida: number | null;
  cantidadComprometida: number | null;
  cantidadRemisionada: number | null;
  cantidadFacturada: number | null;
  precioUnitario: number | null;
  descuentoLinea: number | null;
  descuentoGlobal: number | null;
  impuesto: number | null;
  valorNeto: number | null;
  backorder: unknown;
}

/** Líneas del PDV (una consulta), filtradas por compañía y tipo PDV. */
export async function leerLineasPdv(ciaId: number, pdvRowId: number) {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("rowId", pdvRowId)
    .query<FilaLinea>(`
      SELECT
        m.f431_rowid AS lineaRowId,
        m.f431_rowid_item_ext AS itemRowId,
        it.f120_referencia AS referencia,
        it.f120_descripcion AS descripcion,
        m.f431_cant1_pedida AS cantidadPedida,
        m.f431_cant1_comprometida AS cantidadComprometida,
        m.f431_cant1_remisionada AS cantidadRemisionada,
        m.f431_cant1_facturada AS cantidadFacturada,
        m.f431_precio_unitario_base AS precioUnitario,
        m.f431_vlr_dscto_linea AS descuentoLinea,
        m.f431_vlr_dscto_global AS descuentoGlobal,
        m.f431_vlr_imp AS impuesto,
        m.f431_vlr_neto AS valorNeto,
        CAST(m.f431_ind_backorder AS INT) AS backorder
      FROM t431_cm_pv_movto m
      INNER JOIN t430_cm_pv_docto d
        ON d.f430_rowid = m.f431_rowid_pv_docto
        AND d.f430_id_cia = @ciaId
        AND d.f430_id_tipo_docto = 'PDV'
      LEFT JOIN t120_mc_items it ON it.f120_rowid = m.f431_rowid_item_ext
      WHERE m.f431_id_cia = @ciaId AND m.f431_rowid_pv_docto = @rowId
      ORDER BY m.f431_rowid
    `);

  return recordset.map((r) => {
    const cantidad = Number(r.cantidadPedida ?? 0);
    const cantidadComprometida = Number(r.cantidadComprometida ?? 0);
    const cantidadRemisionada = Number(r.cantidadRemisionada ?? 0);
    const cantidadFacturada = Number(r.cantidadFacturada ?? 0);
    const precioUnitario = Number(r.precioUnitario ?? 0);
    const item: ItemEstadoUnoee = {
      lineaRowId: r.lineaRowId,
      itemRowId: r.itemRowId,
      referencia: r.referencia?.trim() || null,
      descripcion: r.descripcion?.trim() || null,
      cantidad,
      precioUnitario,
      subtotal: cantidad * precioUnitario,
      descuentos: Number(r.descuentoLinea ?? 0) + Number(r.descuentoGlobal ?? 0),
      estado: estadoItemUnoee({
        cantidad,
        cantidadComprometida,
        cantidadRemisionada,
        cantidadFacturada,
        backorder: r.backorder === true || r.backorder === 1,
      }),
      cantidadRemisionada,
      cantidadPendiente: Math.max(0, cantidad - cantidadRemisionada),
    };
    return { item, impuesto: Number(r.impuesto ?? 0), valorNeto: Number(r.valorNeto ?? 0) };
  });
}

/** Cabecera a partir del resumen del PDV y de los totales de sus líneas. */
export function construirCabecera(
  resumen: ResumenSiesaPedido,
  lineas: { item: ItemEstadoUnoee; impuesto: number; valorNeto: number }[],
): CabeceraEstadoUnoee {
  return {
    consecutivo: formatearConsecutivoPdv(resumen.pdvNumero),
    estado: resumen.estadoUnoee,
    valorTotal: lineas.reduce((acc, l) => acc + l.valorNeto, 0),
    descuentos: lineas.reduce((acc, l) => acc + l.item.descuentos, 0),
    impuestos: lineas.reduce((acc, l) => acc + l.impuesto, 0),
  };
}

/**
 * Estado UnoEE del pedido (por id de RicoSoft), acotado a `tenantId`.
 * Devuelve null si el pedido no existe en el tenant (404). Sin erpRowId no
 * consulta Siesa. Con vínculo: dos consultas (resumen + líneas), nunca por ítem.
 */
export async function obtenerEstadoPedidoUnoee(
  tenantId: string,
  pedidoId: string,
): Promise<EstadoPedidoUnoeeDto | null> {
  const pedido = await prisma.pedidoComercial.findFirst({
    where: { id: pedidoId, tenantId },
    select: { id: true, estado: true, erpRowId: true, erpEstadoSincronizacion: true },
  });
  if (!pedido) return null;

  const base = {
    pedidoId: pedido.id,
    erpRowId: pedido.erpRowId,
    estadoComercial: pedido.estado,
    estadoSincronizacion:
      pedido.erpRowId === null ? "NO_VINCULADO" : (pedido.erpEstadoSincronizacion ?? "VINCULADO"),
  };
  if (pedido.erpRowId === null) {
    return { ...base, vinculado: false, encontradoEnSiesa: false, cabecera: null, items: [] };
  }

  const ciaId = await resolverCiaSiesa(tenantId);
  if (!ciaId) throw new SiesaNoConfiguradoError();

  try {
    const resumen = (await leerCompromisoSiesaPorPdv(ciaId, [pedido.erpRowId])).get(pedido.erpRowId);
    if (!resumen) {
      return { ...base, vinculado: true, encontradoEnSiesa: false, cabecera: null, items: [] };
    }
    const lineas = await leerLineasPdv(ciaId, pedido.erpRowId);
    return {
      ...base,
      vinculado: true,
      encontradoEnSiesa: true,
      cabecera: construirCabecera(resumen, lineas),
      items: lineas.map((l) => l.item),
    };
  } catch (error) {
    throw new SiesaConsultaError(error);
  }
}
