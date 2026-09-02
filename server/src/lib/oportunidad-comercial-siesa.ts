import type { CompraClienteProductoSiesa } from "../modules/integraciones-siesa/siesa-ventas.service";
import type { ExistenciaItemSiesa } from "../modules/integraciones-siesa/siesa-inventario.service";

/**
 * Oportunidad comercial del inventario — Bloque 5 del módulo Producción &
 * Inventario: "¿a quién le podemos vender lo que ya tenemos disponible?"
 *
 * Cruza el historial real de compras por cliente+producto (últimos 12
 * meses) contra el inventario vendible disponible hoy. Para cada par
 * cliente-producto donde el cliente YA compró ese producto antes y hoy hay
 * existencia:
 *
 *   precioPromedio = netoHistorico ÷ cantidadHistorica (precio real, sin IVA)
 *   cantidadOfertable = min(existenciaDisponible, cantidadHistorica ÷ 12)
 *   potencialVenta = cantidadOfertable × precioPromedio
 *
 * "cantidadHistorica ÷ 12" limita la oferta a aproximadamente un mes de su
 * ritmo de compra histórico — evita sugerir venderle a un cliente en un mes
 * la cantidad que normalmente compra en un año entero, que sería una
 * proyección poco realista de la oportunidad real de corto plazo.
 *
 * Solo aplica a mercancía vendible con existencia > 0 — no tiene sentido
 * "ofrecer" un insumo interno o algo que no hay.
 */
const MESES_HISTORIAL = 12;

export interface OportunidadProductoSiesa {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadOfertable: number;
  potencialVenta: number;
}

export interface OportunidadClienteSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  /** Suma sobre TODOS los productos ofertables de este cliente, no solo los mostrados en `productos`. */
  potencialTotal: number;
  /** Top 5 productos por potencial de venta. */
  productos: OportunidadProductoSiesa[];
}

export interface OportunidadComercialSiesa {
  /** Suma sobre TODOS los clientes con oportunidad, no solo los mostrados en `clientes`. */
  totalPotencialVenta: number;
  /** Top 10 clientes por potencial total. */
  clientes: OportunidadClienteSiesa[];
}

/**
 * Calcula la oportunidad comercial del inventario disponible. Función
 * pura — sin I/O — probada con datos fabricados; las dos consultas SQL ya
 * se verificaron en vivo por separado.
 */
export function calcularOportunidadComercialSiesa(
  compras: CompraClienteProductoSiesa[],
  existencias: ExistenciaItemSiesa[],
): OportunidadComercialSiesa {
  const existenciaPorItem = new Map(existencias.map((e) => [e.itemRowId, e]));

  const porCliente = new Map<
    string,
    { rowId: number | null; nombre: string | null; productos: OportunidadProductoSiesa[] }
  >();

  for (const c of compras) {
    if (c.cantidadHistorica <= 0) continue;
    const e = existenciaPorItem.get(c.itemRowId);
    if (!e || !e.esVendible || e.cantidadExistente <= 0) continue;

    const precioPromedio = c.netoHistorico / c.cantidadHistorica;
    const promedioMensualHistorico = c.cantidadHistorica / MESES_HISTORIAL;
    const cantidadOfertable = Math.min(e.cantidadExistente, promedioMensualHistorico);
    if (cantidadOfertable <= 0) continue;
    const potencialVenta = cantidadOfertable * precioPromedio;
    if (potencialVenta <= 0) continue;

    const clave = String(c.clienteRowId ?? c.clienteNombre ?? "sin-cliente");
    let cl = porCliente.get(clave);
    if (!cl) {
      cl = { rowId: c.clienteRowId, nombre: c.clienteNombre, productos: [] };
      porCliente.set(clave, cl);
    }
    cl.productos.push({
      itemRowId: c.itemRowId,
      descripcion: c.descripcion,
      referencia: c.referencia,
      unidadMedida: c.unidadMedida,
      cantidadOfertable,
      potencialVenta,
    });
  }

  const clientesCompletos = [...porCliente.values()].map((cl) => ({
    clienteRowId: cl.rowId,
    clienteNombre: cl.nombre,
    potencialTotal: cl.productos.reduce((acc, p) => acc + p.potencialVenta, 0),
    productos: [...cl.productos].sort((a, b) => b.potencialVenta - a.potencialVenta).slice(0, 5),
  }));

  const totalPotencialVenta = clientesCompletos.reduce((acc, cl) => acc + cl.potencialTotal, 0);
  const clientes = [...clientesCompletos]
    .sort((a, b) => b.potencialTotal - a.potencialTotal)
    .slice(0, 10);

  return { totalPotencialVenta, clientes };
}
