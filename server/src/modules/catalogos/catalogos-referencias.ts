import { prisma } from "../../config/prisma";
import type { TipoCatalogo } from "../../lib/catalogos";

/**
 * Dónde se guarda, como texto, cada tipo de catálogo. Sirve para decidir si un
 * valor se puede ELIMINAR: uno referenciado por datos históricos nunca se
 * borra (habría filas con un valor que ya no existe en el catálogo), se
 * desactiva. `tenantId = null` (valor GENERAL) cuenta en TODOS los tenants;
 * con tenantId, solo en el suyo.
 *
 * Record<TipoCatalogo, …> obliga (en compilación) a declarar las referencias
 * de todo tipo nuevo que se agregue: no se puede olvidar uno y dejar que se
 * borre "en falso seguro".
 */
type Contador = (valores: string[], tenantId: string | null) => Promise<number>;

const t = (tenantId: string | null) => (tenantId ? { tenantId } : {});

const REFERENCIAS: Record<TipoCatalogo, Contador[]> = {
  INCOTERM: [
    (v, ten) => prisma.ordenCompraIntl.count({ where: { incoterm: { in: v }, ...t(ten) } }),
  ],
  MONEDA: [
    (v, ten) => prisma.ordenCompraIntl.count({ where: { moneda: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.factura.count({ where: { moneda: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.servicioSuscripcion.count({ where: { moneda: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.importacionPago.count({ where: { moneda: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.proforma.count({ where: { moneda: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.cotizacion.count({ where: { moneda: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.pedidoComercial.count({ where: { moneda: { in: v }, ...t(ten) } }),
  ],
  PAIS: [
    (v, ten) => prisma.ordenCompraIntl.count({ where: { paisOrigen: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.proveedor.count({ where: { paisOrigen: { in: v }, ...t(ten) } }),
  ],
  PAIS_ORIGEN: [
    (v, ten) => prisma.ordenCompraIntl.count({ where: { paisOrigen: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.proveedor.count({ where: { paisOrigen: { in: v }, ...t(ten) } }),
  ],
  CONDICION_PAGO: [
    (v, ten) => prisma.ordenCompraIntl.count({ where: { formaPago: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.proforma.count({ where: { formaPago: { in: v }, ...t(ten) } }),
  ],
  FORMA_PAGO: [
    (v, ten) => prisma.ordenCompraIntl.count({ where: { formaPago: { in: v }, ...t(ten) } }),
  ],
  FORMA_PAGO_VENTAS: [
    (v, ten) => prisma.proforma.count({ where: { formaPago: { in: v }, ...t(ten) } }),
  ],
  METODO_PAGO: [(v, ten) => prisma.pago.count({ where: { metodoPago: { in: v }, ...t(ten) } })],
  UNIDAD_MEDIDA: [
    (v, ten) =>
      prisma.itemOrdenCompraIntl.count({
        where: { unidadMedida: { in: v }, ...(ten ? { ordenCompra: { tenantId: ten } } : {}) },
      }),
    (v, ten) =>
      prisma.proformaItem.count({
        where: { unidadMedida: { in: v }, ...(ten ? { proforma: { tenantId: ten } } : {}) },
      }),
    (v, ten) =>
      prisma.cotizacionItem.count({
        where: { unidadMedida: { in: v }, ...(ten ? { cotizacion: { tenantId: ten } } : {}) },
      }),
    (v, ten) =>
      prisma.pedidoComercialItem.count({
        where: { unidadMedida: { in: v }, ...(ten ? { pedido: { tenantId: ten } } : {}) },
      }),
    (v, ten) =>
      prisma.despachoLinea.count({
        where: { unidadMedida: { in: v }, ...(ten ? { despacho: { tenantId: ten } } : {}) },
      }),
    (v, ten) => prisma.planProduccion.count({ where: { unidadMedida: { in: v }, ...t(ten) } }),
  ],
  MOTIVO_NOVEDAD_DESPACHO: [
    (v, ten) =>
      prisma.despachoNovedad.count({
        where: { tipo: { in: v }, ...(ten ? { despacho: { tenantId: ten } } : {}) },
      }),
  ],
  MOTIVO_NOVEDAD_IMPORTACION: [
    (v, ten) => prisma.importacionNovedad.count({ where: { tipo: { in: v }, ...t(ten) } }),
  ],
  ESTADO_COMERCIAL: [
    (v, ten) => prisma.proforma.count({ where: { estado: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.cotizacion.count({ where: { estado: { in: v }, ...t(ten) } }),
    (v, ten) => prisma.pedidoComercial.count({ where: { estado: { in: v }, ...t(ten) } }),
  ],
  // Todavía ningún modelo guarda un tipo de oportunidad: nada lo referencia.
  TIPO_OPORTUNIDAD: [],
  ACCION_CONTACTO_OPORTUNIDAD: [
    (v, ten) => prisma.oportunidadSeguimiento.count({ where: { accion: { in: v }, ...t(ten) } }),
  ],
  RESULTADO_CONTACTO_OPORTUNIDAD: [
    (v, ten) => prisma.oportunidadSeguimiento.count({ where: { resultado: { in: v }, ...t(ten) } }),
  ],
};

/** Cantidad de filas de negocio que usan alguno de `valores` (clave + alias). */
export async function contarReferenciasCatalogo(
  tipo: TipoCatalogo,
  valores: string[],
  tenantId: string | null,
): Promise<number> {
  const conteos = await Promise.all(REFERENCIAS[tipo].map((contar) => contar(valores, tenantId)));
  return conteos.reduce((a, b) => a + b, 0);
}
