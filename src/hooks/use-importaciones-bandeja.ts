import { useCallback, useEffect, useState } from "react";
import { fetchAuth, fetchAuthBlob } from "@/lib/session";

export type EstadoCorreoBandeja =
  | "PENDIENTE"
  | "CLASIFICADO"
  | "EXTRAIDO"
  | "MATCHEADO"
  | "REQUIERE_REVISION"
  | "RESUELTO"
  | "ERROR";

interface OrigenCorreo {
  buzon: { direccion: string };
}

export interface CorreoBandejaResumen {
  origenes: OrigenCorreo[];
  responsable: { id: string; nombre: string } | null;
  id: string;
  remitente: string;
  asunto: string;
  fechaRecibido: string;
  estadoProcesamiento: EstadoCorreoBandeja;
  clasificacion: string | null;
  proveedor: { id: string; nombre: string } | null;
  ordenCompra: { id: string; numeroOrden: string } | null;
  _count: { adjuntos: number; excepciones: number };
}

export interface ExtraccionBandeja {
  id: string;
  campo: string;
  valorExtraido: string;
  pagina: number | null;
  motorUsado: string;
  confianza: number | null;
  evidencia: string | null;
}

export interface AdjuntoBandeja {
  id: string;
  nombreOriginal: string;
  mimeType: string;
  tamano: number;
  estadoExtraccion: string;
  extracciones: ExtraccionBandeja[];
}

export interface ExcepcionBandeja {
  id: string;
  tipo: string;
  descripcion: string;
  candidatos: string | null;
  estado: "ABIERTA" | "RESUELTA" | "DESCARTADA";
  resueltoPorId: string | null;
  resueltoEn: string | null;
  createdAt: string;
}

export interface CorreoBandejaDetalle {
  origenes: OrigenCorreo[];
  responsable: { id: string; nombre: string } | null;
  reprocesable: boolean;
  id: string;
  messageId: string;
  remitente: string;
  destinatarios: string;
  asunto: string;
  fechaRecibido: string;
  cuerpoTexto: string | null;
  estadoProcesamiento: EstadoCorreoBandeja;
  clasificacion: string | null;
  ultimoError: string | null;
  proveedor: { id: string; nombre: string; nit: string } | null;
  ordenCompra: { id: string; numeroOrden: string; estado: string } | null;
  sugerenciasProveedor?: {
    id: string;
    nombre: string;
    señales: { campo: string; detalle: string }[];
  }[];
  adjuntos: AdjuntoBandeja[];
  excepciones: ExcepcionBandeja[];
}

export interface FiltrosBandeja {
  estado?: string;
  proveedorId?: string;
  ordenCompraId?: string;
  clasificacion?: string;
  requiereRevision?: boolean;
}

export function useCorreosBandeja(filtros: FiltrosBandeja = {}) {
  const [correos, setCorreos] = useState<CorreoBandejaResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filtros.estado) params.set("estado", filtros.estado);
      if (filtros.proveedorId) params.set("proveedorId", filtros.proveedorId);
      if (filtros.ordenCompraId) params.set("ordenCompraId", filtros.ordenCompraId);
      if (filtros.clasificacion) params.set("clasificacion", filtros.clasificacion);
      if (filtros.requiereRevision) params.set("requiereRevision", "true");
      const qs = params.toString();
      const data = await fetchAuth(`/importaciones/bandeja/correos${qs ? `?${qs}` : ""}`);
      setCorreos(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando la bandeja de correos.");
    } finally {
      setLoading(false);
    }
  }, [
    filtros.estado,
    filtros.proveedorId,
    filtros.ordenCompraId,
    filtros.clasificacion,
    filtros.requiereRevision,
  ]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { correos, loading, error, refresh };
}

export function useCorreoBandeja(id: string | undefined) {
  const [correo, setCorreo] = useState<CorreoBandejaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/importaciones/bandeja/correos/${id}`);
      setCorreo(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el correo.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resolverExcepcion = useCallback(
    async (
      excepcionId: string,
      datos: {
        accion: "SELECCIONAR_PROVEEDOR" | "SELECCIONAR_ORDEN" | "DESCARTAR";
        proveedorId?: string;
        ordenCompraId?: string;
      },
    ) => {
      if (!id) return;
      await fetchAuth(`/importaciones/bandeja/correos/${id}/excepciones/${excepcionId}/resolver`, {
        method: "POST",
        body: JSON.stringify(datos),
      });
      await refresh();
    },
    [id, refresh],
  );

  const reprocesar = useCallback(async () => {
    if (!id) return;
    await fetchAuth(`/importaciones/bandeja/correos/${id}/reprocesar`, { method: "POST" });
    await refresh();
  }, [id, refresh]);

  return { correo, loading, error, refresh, resolverExcepcion, reprocesar };
}

/** El endpoint exige el header Authorization (JWT) — nunca es una URL
 * pública que se pueda abrir con un <a href> plano. Se descarga como Blob
 * autenticado y se abre en una pestaña nueva, mismo patrón ya usado para
 * expediente aduanero/vistos buenos. */
export async function abrirAdjuntoBandeja(correoId: string, adjuntoId: string): Promise<void> {
  const blob = await fetchAuthBlob(
    `/importaciones/bandeja/correos/${correoId}/adjuntos/${adjuntoId}`,
  );
  window.open(URL.createObjectURL(blob), "_blank");
}
