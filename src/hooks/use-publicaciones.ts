import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuth, fetchAuthBlob, fetchAuthUpload } from "@/lib/session";
import { TRANSFER_TIMEOUT_MS } from "@/config/api";
import { useSession } from "@/lib/session-context";

export type CategoriaPublicacion = "NOVEDAD" | "AVISO" | "EVENTO";
export type EstadoPublicacion = "PROGRAMADA" | "PUBLICADA" | "DESACTIVADA" | "VENCIDA";
export type AlcancePublicacion = "GENERAL" | "TENANT";

export type TipoArchivoPublicacion = "IMAGEN" | "VIDEO" | "DOCUMENTO";

export interface ArchivoPublicacion {
  id: string;
  tipo: TipoArchivoPublicacion;
  nombre: string;
  mime: string;
  tamano: number;
}

export interface Publicacion {
  id: string;
  categoria: CategoriaPublicacion;
  tipo: string;
  titulo: string;
  contenido: string;
  fechaPublicacion: string;
  fechaVencimiento: string | null;
  fechaEvento: string | null;
  activo: boolean;
  autorNombre: string | null;
  alcance: AlcancePublicacion;
  archivos: ArchivoPublicacion[];
}

export interface PublicacionAdmin extends Publicacion {
  estado: EstadoPublicacion;
}

// Contenido corporativo (novedades/avisos/eventos): no necesita estar
// "fresco al segundo", unos minutos de cache evitan repetir las 3 llamadas
// (una por categoría) en cada navegación de vuelta al Home.
const STALE_TIME_PUBLICACIONES_MS = 2 * 60_000;

/**
 * Contenido del Home ("Inicio") por categoría: novedades de la organización,
 * información importante (avisos), o próximos eventos. El backend ya filtra
 * por tenant de la sesión (GENERAL + el propio) y por vigencia — nunca se
 * filtra ni se decide alcance en el frontend.
 *
 * La query key incluye tenantId: cambiar de empresa activa nunca debe
 * reutilizar publicaciones cacheadas de la empresa anterior.
 */
export function usePublicaciones(categoria: CategoriaPublicacion) {
  const { user } = useSession();

  const query = useQuery({
    queryKey: ["publicaciones", categoria, user?.tenantId],
    queryFn: async () => {
      const data = await fetchAuth(`/publicaciones?categoria=${categoria}`);
      return (Array.isArray(data) ? data : []) as Publicacion[];
    },
    enabled: Boolean(user?.tenantId),
    staleTime: STALE_TIME_PUBLICACIONES_MS,
    // El hook original no reintentaba ante un fallo.
    retry: false,
  });

  return {
    publicaciones: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : "",
  };
}

/**
 * Eventos de un rango de fechas (el mes visible del calendario del Inicio),
 * incluidos los días ya pasados. El backend filtra por tenant y vigencia igual
 * que en usePublicaciones; solo cambia "eventos futuros" por "eventos entre
 * desde y hasta". La key lleva desde/hasta: cada mes se cachea por separado.
 */
export function useEventosCalendario(desde: Date, hasta: Date) {
  const { user } = useSession();
  const desdeIso = desde.toISOString();
  const hastaIso = hasta.toISOString();

  const query = useQuery({
    queryKey: ["publicaciones", "EVENTO", "rango", desdeIso, hastaIso, user?.tenantId],
    queryFn: async () => {
      const params = new URLSearchParams({ categoria: "EVENTO", desde: desdeIso, hasta: hastaIso });
      const data = await fetchAuth(`/publicaciones?${params.toString()}`);
      return (Array.isArray(data) ? data : []) as Publicacion[];
    },
    enabled: Boolean(user?.tenantId),
    staleTime: STALE_TIME_PUBLICACIONES_MS,
    retry: false,
    // Al cambiar de mes se sigue mostrando el anterior mientras carga el nuevo
    // (sin parpadeo del calendario a "vacío").
    placeholderData: (previo) => previo,
  });

  return {
    eventos: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : "",
  };
}

export function formatTamano(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Ruta autenticada de un adjunto (no hay URL pública: siempre pasa por la API). */
export function rutaArchivoPublicacion(publicacionId: string, archivoId: string) {
  return `/publicaciones/${publicacionId}/archivos/${archivoId}`;
}

/** Descarga un adjunto como Blob (los <img>/<video> no pueden mandar el Bearer). */
export function descargarArchivoPublicacion(publicacionId: string, archivoId: string) {
  return fetchAuthBlob(rutaArchivoPublicacion(publicacionId, archivoId), TRANSFER_TIMEOUT_MS);
}

export interface FiltrosPublicacionesAdmin {
  categoria?: CategoriaPublicacion;
  estado?: EstadoPublicacion;
  alcance?: AlcancePublicacion;
  q?: string;
}

export interface DatosPublicacion {
  categoria: CategoriaPublicacion;
  tipo: string;
  titulo: string;
  contenido: string;
  fechaPublicacion?: string;
  fechaVencimiento?: string | null;
  fechaEvento?: string | null;
  alcance?: AlcancePublicacion;
}

/**
 * Administración de publicaciones (Configuración > Publicaciones): usa
 * GET /publicaciones/admin (ve inactivas/vencidas/programadas, a diferencia
 * de usePublicaciones que solo trae lo que ya se le muestra al usuario en el
 * Home) y expone el CRUD completo. Protegido en backend por
 * publicaciones.gestionar — este hook no decide autorización, solo llama a
 * la API y deja que el 403 real del servidor cierre el flujo si no aplica.
 */
export function usePublicacionesAdmin(filtros: FiltrosPublicacionesAdmin) {
  const [publicaciones, setPublicaciones] = useState<PublicacionAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refrescar = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filtros.categoria) params.set("categoria", filtros.categoria);
    if (filtros.estado) params.set("estado", filtros.estado);
    if (filtros.alcance) params.set("alcance", filtros.alcance);
    if (filtros.q?.trim()) params.set("q", filtros.q.trim());
    try {
      const data = await fetchAuth(`/publicaciones/admin?${params.toString()}`);
      setPublicaciones(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar las publicaciones.");
      setPublicaciones([]);
    } finally {
      setLoading(false);
    }
  }, [filtros.categoria, filtros.estado, filtros.alcance, filtros.q]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const crear = useCallback(
    async (datos: DatosPublicacion) => {
      const creada = (await fetchAuth("/publicaciones", {
        method: "POST",
        body: JSON.stringify(datos),
      })) as PublicacionAdmin;
      await refrescar();
      return creada;
    },
    [refrescar],
  );

  const actualizar = useCallback(
    async (id: string, datos: Partial<DatosPublicacion>) => {
      await fetchAuth(`/publicaciones/${id}`, { method: "PATCH", body: JSON.stringify(datos) });
      await refrescar();
    },
    [refrescar],
  );

  const publicarAhora = useCallback(
    async (id: string) => {
      await fetchAuth(`/publicaciones/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ intent: "publicar" }),
      });
      await refrescar();
    },
    [refrescar],
  );

  const cambiarActivo = useCallback(
    async (id: string, activo: boolean) => {
      await fetchAuth(`/publicaciones/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo, intent: activo ? "activar" : "desactivar" }),
      });
      await refrescar();
    },
    [refrescar],
  );

  const subirArchivos = useCallback(
    async (id: string, archivos: File[]) => {
      const formData = new FormData();
      archivos.forEach((archivo) => formData.append("archivos", archivo));
      const actualizada = (await fetchAuthUpload(
        `/publicaciones/${id}/archivos`,
        formData,
        TRANSFER_TIMEOUT_MS,
      )) as PublicacionAdmin;
      await refrescar();
      return actualizada;
    },
    [refrescar],
  );

  const eliminarArchivo = useCallback(
    async (id: string, archivoId: string) => {
      await fetchAuth(rutaArchivoPublicacion(id, archivoId), { method: "DELETE" });
      await refrescar();
    },
    [refrescar],
  );

  const eliminar = useCallback(
    async (id: string) => {
      await fetchAuth(`/publicaciones/${id}`, { method: "DELETE" });
      await refrescar();
    },
    [refrescar],
  );

  return {
    publicaciones,
    loading,
    error,
    refrescar,
    crear,
    actualizar,
    publicarAhora,
    cambiarActivo,
    subirArchivos,
    eliminarArchivo,
    eliminar,
  };
}
