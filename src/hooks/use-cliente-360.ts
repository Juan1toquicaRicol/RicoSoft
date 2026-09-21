import { useCallback, useState } from "react";
import { fetchAuth } from "@/lib/session";

/** Ficha 360 del cliente — cada hook consulta SOLO cuando se le pide
 * explícitamente (nunca en un useEffect automático), para que abrir la
 * ficha no dispare 8 peticiones a Siesa de una sola vez. Cada pestaña llama
 * a `consultar`/`cargar` cuando se monta (al hacer clic en esa pestaña). */

export interface ClienteSiesa {
  clienteRowId: number;
  nit: string | null;
  razonSocial: string | null;
  activoTercero: boolean;
  activoCliente: boolean;
  bloqueadoEstado: boolean;
  cupoCredito: number;
  bloqueadoCupo: boolean;
  bloqueadoMora: boolean;
  condicionPagoCodigo: string | null;
  condicionPagoDescripcion: string | null;
  tipoClienteCodigo: string | null;
  calificacion: string | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
}

export interface RespuestaClienteResumen {
  disponible: boolean;
  motivo?: string;
  cliente?: ClienteSiesa;
}

export function useClienteResumen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(async (clienteRowId: number): Promise<RespuestaClienteResumen> => {
    setLoading(true);
    setError("");
    try {
      return await fetchAuth(`/ventas/clientes/${clienteRowId}/resumen`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el resumen del cliente.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { consultar, loading, error };
}

interface RespuestaPaginada<T> {
  disponible: boolean;
  motivo?: string;
  items?: T[];
  page?: number;
  pageSize?: number;
  total?: number;
}

/** Fábrica de hooks paginados "bajo demanda" para las pestañas de la ficha
 * 360 — mismo contrato de respuesta {disponible, items, page, pageSize,
 * total} en pedidos/remisiones/facturas. */
function usePaginadoCliente<T>(endpoint: (clienteRowId: number) => string) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [disponible, setDisponible] = useState(true);
  const [motivo, setMotivo] = useState<string | undefined>();

  const cargar = useCallback(
    async (clienteRowId: number, paginaSolicitada = 1) => {
      setLoading(true);
      setError("");
      try {
        const data: RespuestaPaginada<T> = await fetchAuth(
          `${endpoint(clienteRowId)}?page=${paginaSolicitada}&pageSize=${pageSize}`,
        );
        setDisponible(data.disponible);
        setMotivo(data.motivo);
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(paginaSolicitada);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando la información.");
      } finally {
        setLoading(false);
      }
    },
    [endpoint, pageSize],
  );

  return { items, total, page, pageSize, loading, error, disponible, motivo, cargar };
}

export interface PedidoClienteSiesa {
  pedidoRowId: number;
  numeroPedido: number;
  fecha: string;
  estado: number | null;
  aprobado: boolean;
  backorder: boolean;
  condicionPagoCodigo: string | null;
  condicionPagoDescripcion: string | null;
  retenidoCupo: boolean;
  retenidoMora: boolean;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  valorNeto: number;
  cantidadPedida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
}

export function usePedidosCliente() {
  return usePaginadoCliente<PedidoClienteSiesa>((id) => `/ventas/clientes/${id}/pedidos`);
}

export interface RemisionClienteSiesa {
  remisionRowId: number;
  fecha: string;
  pedidoRowId: number | null;
  numeroPedido: number | null;
  facturaRowId: number | null;
  valorNeto: number;
  cantidadTotal: number;
  numLineas: number;
}

export function useRemisionesCliente() {
  return usePaginadoCliente<RemisionClienteSiesa>((id) => `/ventas/clientes/${id}/remisiones`);
}

export interface FacturaClienteSiesa {
  id: number;
  fecha: string;
  referencia: string | null;
  bruto: number;
  dscto: number;
  neto: number;
  clienteRowId: number | null;
  clienteNombre: string | null;
  clienteNit: string | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
}

export function useFacturasCliente() {
  return usePaginadoCliente<FacturaClienteSiesa>((id) => `/ventas/clientes/${id}/facturas`);
}

export interface LineaPedidoSiesa {
  lineaRowId: number;
  itemRowId: number;
  referencia: string | null;
  descripcion: string | null;
  cantidadPedida: number;
  cantidadRemisionada: number;
  cantidadFacturada: number;
  cantidadPendiente: number;
  precioUnitario: number;
  valorNeto: number;
  remisiones: {
    remisionRowId: number | null;
    fechaRemision: string | null;
    cantidad: number | null;
    facturaRowId: number | null;
  }[];
}

export interface RespuestaTrazabilidad {
  disponible: boolean;
  motivo?: string;
  lineas?: LineaPedidoSiesa[];
}

/** Trazabilidad Pedido -> Línea -> Remisiones parciales -> Factura, bajo demanda (drill-down). */
export function useTrazabilidadPedido() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(
    async (clienteRowId: number, pedidoRowId: number): Promise<RespuestaTrazabilidad> => {
      setLoading(true);
      setError("");
      try {
        return await fetchAuth(
          `/ventas/clientes/${clienteRowId}/pedidos/${pedidoRowId}/trazabilidad`,
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando la trazabilidad del pedido.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { consultar, loading, error };
}

export interface LineaRemisionSiesa {
  movtoRowId: number;
  lineaPedidoRowId: number | null;
  concepto: number;
  origen: "PEDIDO" | "VENTA_DIRECTA" | "DEVOLUCION";
  itemRowId: number;
  referencia: string | null;
  descripcion: string | null;
  cantidad: number;
  unidadMedida: string | null;
  bodegaRowId: number | null;
  bodegaNombre: string | null;
  lote: string | null;
  costoTotal: number;
}

export interface RespuestaDetalleRemision {
  disponible: boolean;
  motivo?: string;
  lineas?: LineaRemisionSiesa[];
}

/** Detalle (líneas + bodega/lote/origen) de UNA remisión, bajo demanda. */
export function useDetalleRemision() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(
    async (clienteRowId: number, remisionRowId: number): Promise<RespuestaDetalleRemision> => {
      setLoading(true);
      setError("");
      try {
        return await fetchAuth(`/ventas/clientes/${clienteRowId}/remisiones/${remisionRowId}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando el detalle de la remisión.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { consultar, loading, error };
}

export interface ItemCarteraCliente {
  saldo: number;
  vence: string;
  diasMora: number;
  estado: string;
}

export interface RespuestaCarteraCliente {
  disponible: boolean;
  motivo?: string;
  items?: ItemCarteraCliente[];
  resumen?: { porRecaudar: number; vencido: number; porVencer: number; alDia: number };
}

/** Cartera real del cliente (t353, en vivo) — bajo demanda al abrir la pestaña Cartera. */
export function useCarteraCliente() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(async (clienteRowId: number): Promise<RespuestaCarteraCliente> => {
    setLoading(true);
    setError("");
    try {
      return await fetchAuth(`/creditos/clientes/${clienteRowId}/cartera`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la cartera del cliente.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { consultar, loading, error };
}

export interface RespuestaIndicadorCredito {
  disponible: boolean;
  motivo?: string;
  cupoCredito?: number;
  disponibleCredito?: number;
  carteraCorriente?: number;
  carteraVencida?: number;
  diasPromedioVencido?: number | null;
  diasPromedioPago?: number | null;
  bloquearCupo?: boolean;
  bloquearMora?: boolean;
  bloquear?: boolean;
  origenDato?: string;
  /** ISO string — SIEMPRE debe mostrarse en la UI junto al dato (es un snapshot, no tiempo real). */
  actualizadoEn?: string;
}

/** Indicador de crédito (t9896, snapshot) — bajo demanda al abrir la pestaña Crédito. */
export function useIndicadorCreditoCliente() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(
    async (clienteRowId: number): Promise<RespuestaIndicadorCredito> => {
      setLoading(true);
      setError("");
      try {
        return await fetchAuth(`/creditos/clientes/${clienteRowId}/indicador`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error cargando el indicador de crédito.");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { consultar, loading, error };
}
