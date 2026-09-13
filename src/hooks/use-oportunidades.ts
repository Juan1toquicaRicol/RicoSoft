import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

// Valores válidos de negocio (mismo enum que el backend espera) — ya no se
// usan para poblar las opciones visibles del <Select> (eso viene del
// catálogo ACCION_CONTACTO_OPORTUNIDAD/RESULTADO_CONTACTO_OPORTUNIDAD vía
// useCatalogo), solo para tipar y para la lógica de negocio de abajo
// (RESULTADOS_TERMINALES).
const ACCIONES_CONTACTO_VALIDAS = [
  "Llamada",
  "WhatsApp",
  "Correo",
  "Reunion",
  "Visita",
  "Cotizacion",
  "Seguimiento",
  "Otro",
] as const;
export type AccionContacto = (typeof ACCIONES_CONTACTO_VALIDAS)[number];

const RESULTADOS_CONTACTO_VALIDOS = [
  "Contactado",
  "SinRespuesta",
  "Interesado",
  "CotizacionSolicitada",
  "CotizacionEnviada",
  "EnNegociacion",
  "NoInteresado",
  "VentaRealizada",
] as const;
export type ResultadoContacto = (typeof RESULTADOS_CONTACTO_VALIDOS)[number];

export const RESULTADOS_TERMINALES = new Set<ResultadoContacto>(["NoInteresado", "VentaRealizada"]);

export interface SeguimientoOportunidad {
  id: string;
  clienteRowId: number;
  clienteNombre: string;
  itemRowId: number | null;
  itemDescripcion: string | null;
  accion: AccionContacto;
  resultado: ResultadoContacto;
  comentario: string | null;
  proximaAccion: string | null;
  /** ISO string o null. */
  proximoSeguimientoFecha: string | null;
  usuario: string;
  /** ISO string. */
  createdAt: string;
}

export interface TimelineOportunidad {
  seguimientos: SeguimientoOportunidad[];
  estadoActual: ResultadoContacto | null;
  proximoSeguimiento: { fecha: string; accion: string | null } | null;
}

export interface NuevoSeguimiento {
  clienteNombre: string;
  itemRowId?: number | null;
  itemDescripcion?: string | null;
  accion: AccionContacto;
  resultado: ResultadoContacto;
  comentario?: string;
  proximaAccion?: string;
  proximoSeguimientoFecha?: string;
}

/** Timeline de seguimiento comercial de un cliente — capa ligera de gestión de contacto, no un CRM. */
export function useSeguimientoOportunidad(clienteRowId: number | null) {
  const [timeline, setTimeline] = useState<TimelineOportunidad>({
    seguimientos: [],
    estadoActual: null,
    proximoSeguimiento: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (clienteRowId === null) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/oportunidades/${clienteRowId}/seguimientos`);
      setTimeline(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el seguimiento comercial.");
    } finally {
      setLoading(false);
    }
  }, [clienteRowId]);

  useEffect(() => {
    if (clienteRowId !== null) refresh();
  }, [refresh, clienteRowId]);

  const registrar = useCallback(
    async (data: NuevoSeguimiento) => {
      if (clienteRowId === null) return;
      await fetchAuth(`/oportunidades/${clienteRowId}/seguimientos`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [clienteRowId, refresh],
  );

  return { ...timeline, loading, error, refresh, registrar };
}

/** "¿Qué debo hacer hoy?" — próximos seguimientos pendientes de todo el tenant. */
export function useProximosSeguimientos() {
  const [pendientes, setPendientes] = useState<SeguimientoOportunidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/oportunidades/seguimientos/pendientes");
      setPendientes(data.pendientes ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando los próximos seguimientos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { pendientes, loading, error, refresh };
}

export interface OportunidadProducto {
  itemRowId: number;
  descripcion: string | null;
  referencia: string | null;
  unidadMedida: string | null;
  cantidadOfertable: number;
  potencialVenta: number;
}

export interface OportunidadCliente {
  clienteRowId: number | null;
  clienteNombre: string | null;
  potencialTotal: number;
  productos: OportunidadProducto[];
}

export interface OportunidadComercial {
  disponible: boolean;
  motivo?: string;
  totalPotencialVenta?: number;
  clientes?: OportunidadCliente[];
}

/** Oportunidad comercial: qué le podemos vender a cada cliente con el inventario disponible hoy. */
export function useOportunidadComercial() {
  const [oportunidad, setOportunidad] = useState<OportunidadComercial>({ disponible: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth("/inventario/oportunidad-comercial");
      setOportunidad(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la oportunidad comercial.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { oportunidad, loading, error, refresh };
}
