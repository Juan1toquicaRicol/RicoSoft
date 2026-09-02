import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export type EstadoDisponibilidadComercial =
  | "disponible"
  | "requiere_produccion"
  | "requiere_produccion_y_compra"
  | "requiere_compra_directa";

export interface NecesidadCompraDisponibilidad {
  componenteRowId: number;
  descripcion: string | null;
  referencia: string | null;
  cantidadNecesaria: number;
  cantidadDisponible: number;
  deficit: number;
}

export interface DisponibilidadComercial {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadSolicitada: number;
  cantidadExistente: number;
  cantidadComprometida: number;
  disponibleLibre: number;
  deficit: number;
  estado: EstadoDisponibilidadComercial;
  capacidadProductiva: number | null;
  materialLimitante: string | null;
  deficitProductivo: number;
  necesidadesCompra: NecesidadCompraDisponibilidad[];
}

export interface RespuestaDisponibilidad {
  disponible: boolean;
  motivo?: string;
  resultado?: DisponibilidadComercial;
}

/** "¿Puedo vender esto?" — consulta bajo demanda, no autocarga como los demás hooks del sistema. */
export function useDisponibilidadComercial() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const consultar = useCallback(async (itemRowId: number, cantidad: number): Promise<RespuestaDisponibilidad> => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(
        `/ventas/disponibilidad?itemRowId=${encodeURIComponent(itemRowId)}&cantidad=${encodeURIComponent(cantidad)}`,
      );
      return data;
    } catch (err: any) {
      setError(err.message || "Error consultando la disponibilidad comercial.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { consultar, loading, error };
}

/** Cliente recurrente (compró en ≥2 de los últimos 3 meses completos) inactivo hace más de 45 días. */
export interface ClienteEnRiesgo {
  clienteRowId: number;
  clienteNombre: string | null;
  diasInactivo: number;
  /** Promedio mensual (venta/kilos) durante los meses en que sí compró, de los últimos 3 completos. */
  promedioMensualNeto: number;
  promedioMensualKilos: number;
  /** promedio mensual × (diasInactivo / 30) — estimado, no una cifra contable exacta. */
  ventaEstimadaPerdida: number;
  kilosEstimadosPerdidos: number;
  severidad: "alta" | "media";
}

export interface CaidaClienteTop {
  clienteRowId: number | null;
  clienteNombre: string | null;
  netoUltimoMes: number;
  netoMesAnterior: number;
  caidaPct: number;
}

export interface CentroComercial {
  disponible: boolean;
  motivo?: string;
  productosEnRiesgoQuiebre?: {
    itemRowId: number;
    titulo: string;
    referencia: string | null;
    cantidad: number | null;
    unidadMedida: string | null;
    motivo: string;
    detalle: { diasCobertura?: number | null; ventaPromedioMensual?: number; cantidadExistente?: number };
    accion: { tipo: string; itemRowId: number; descripcion: string | null; cantidad?: number };
  }[];
  clientesInactivos?: ClienteEnRiesgo[];
  caidasClientesTop?: CaidaClienteTop[];
  totalVentaEnRiesgo?: number;
  totalKilosEnRiesgo?: number;
}

/** Centro Comercial: qué debe atender hoy el área de ventas — riesgo de quiebre + clientes en riesgo. */
export function useCentroComercial() {
  const [centro, setCentro] = useState<CentroComercial>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/ventas/centro");
      setCentro(data);
    } catch (err: any) {
      setError(err.message || "Error cargando el Centro Comercial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { centro, loading, error, refresh };
}

export interface ItemBusqueda {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
}

export interface RespuestaBusquedaProductos {
  disponible: boolean;
  motivo?: string;
  items?: ItemBusqueda[];
}

/** Autocompletado de producto por descripción/referencia — consulta bajo demanda (debounce lo maneja quien la use). */
export function useBusquedaProductos() {
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(async (search: string): Promise<RespuestaBusquedaProductos> => {
    if (search.trim().length < 2) return { disponible: true, items: [] };
    setLoading(true);
    try {
      return await fetchAuth(`/ventas/productos/buscar?search=${encodeURIComponent(search)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  return { buscar, loading };
}

export interface ClientePorProducto {
  clienteRowId: number | null;
  clienteNombre: string | null;
  cantidadHistorica: number;
  netoHistorico: number;
}

export interface ContextoProducto {
  disponible: boolean;
  motivo?: string;
  itemRowId?: number;
  descripcion?: string | null;
  referencia?: string | null;
  unidadMedida?: string | null;
  costoUnitario?: number | null;
  precioPromedioVenta?: number | null;
  margenPromedioPct?: number | null;
  ventanaPrecioDias?: number;
  lineasVentaRecientes?: number;
  clientes?: ClientePorProducto[];
}

/** "¿Cuánto cuesta?" y "¿a quién se le vende?" — contexto comercial de un producto elegido en el autocompletado. */
export function useContextoProducto() {
  const [loading, setLoading] = useState(false);

  const consultar = useCallback(async (itemRowId: number): Promise<ContextoProducto> => {
    setLoading(true);
    try {
      return await fetchAuth(`/ventas/productos/${itemRowId}/contexto`);
    } finally {
      setLoading(false);
    }
  }, []);

  return { consultar, loading };
}
