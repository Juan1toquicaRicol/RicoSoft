import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface MetadataCatalogo {
  simbolo?: string;
  responsabilidad?: string;
  documento?: string;
  dias?: number;
  aliases?: string[];
}

export interface CatalogoValor {
  id: string;
  tipo: string;
  clave: string;
  etiqueta: string;
  descripcion: string | null;
  metadata: MetadataCatalogo;
  orden: number;
  activo: boolean;
  alcance: "GENERAL" | "TENANT";
  /** Solo en la variante admin (incluirInactivos=true): este valor TENANT
   * sobrescribe a uno GENERAL de la misma clave, o este GENERAL está
   * sobrescrito por uno propio del tenant. */
  sobrescribeGeneral?: boolean;
  sobrescrito?: boolean;
}

export interface TipoCatalogoDefinicion {
  tipo: string;
  etiqueta: string;
  grupo: "General" | "Comercial" | "Importaciones" | "Logística" | "CRM";
  descripcion: string;
  camposMetadata: ("simbolo" | "responsabilidad" | "dias" | "documento")[];
  equivalenteCanonico?: string;
  claveCodigoEstable: boolean;
}

/** Fallback estático (mismo orden que antes) por si /catalogos/tipos no
 * respondiera todavía — la pantalla de administración prefiere siempre el
 * resultado de useTiposCatalogo() cuando ya cargó. */
export const TIPOS_CATALOGO_ADMINISTRABLES: { tipo: string; etiqueta: string }[] = [
  { tipo: "INCOTERM", etiqueta: "Incoterms" },
  { tipo: "MONEDA", etiqueta: "Monedas" },
  { tipo: "PAIS", etiqueta: "Países" },
  { tipo: "CONDICION_PAGO", etiqueta: "Condiciones de pago" },
  { tipo: "METODO_PAGO", etiqueta: "Métodos de pago" },
  { tipo: "UNIDAD_MEDIDA", etiqueta: "Unidades de medida" },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", etiqueta: "Motivos de novedad (despachos)" },
  { tipo: "ESTADO_COMERCIAL", etiqueta: "Estados comerciales" },
  { tipo: "TIPO_OPORTUNIDAD", etiqueta: "Tipos de oportunidad" },
  { tipo: "PAIS_ORIGEN", etiqueta: "Países de origen (importaciones)" },
  { tipo: "FORMA_PAGO", etiqueta: "Formas de pago (importaciones)" },
  { tipo: "FORMA_PAGO_VENTAS", etiqueta: "Formas de pago (Ventas/Proformas)" },
  { tipo: "MOTIVO_NOVEDAD_IMPORTACION", etiqueta: "Motivos de novedad (importaciones)" },
  { tipo: "ACCION_CONTACTO_OPORTUNIDAD", etiqueta: "Acciones de contacto (CRM)" },
  { tipo: "RESULTADO_CONTACTO_OPORTUNIDAD", etiqueta: "Resultados de contacto (CRM)" },
];

/** Definición de cada tipo de catálogo (etiqueta, grupo, campos de metadata
 * que admite) — viene del backend para no duplicar la lista aquí. */
export function useTiposCatalogo() {
  const [data, setData] = useState<TipoCatalogoDefinicion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const tipos = await fetchAuth("/catalogos/tipos");
        if (!cancelado) setData(Array.isArray(tipos) ? tipos : []);
      } catch {
        if (!cancelado) setData([]);
      } finally {
        if (!cancelado) setIsLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { data, isLoading };
}

/**
 * Lee los valores EFECTIVOS y activos de un tipo de catálogo (precedencia
 * TENANT sobre GENERAL, ya resuelta por el backend) — reemplaza los arrays
 * hardcodeados en el frontend que duplicaban datos administrables desde
 * Configuración → Catálogos.
 */
export function useCatalogo(tipo: string) {
  const [data, setData] = useState<CatalogoValor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const valores = await fetchAuth(`/catalogos?tipo=${encodeURIComponent(tipo)}`);
      setData(Array.isArray(valores) ? valores : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el catálogo.");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, isLoading, error, refresh };
}

export interface DatosNuevoValorCatalogo {
  clave: string;
  etiqueta: string;
  descripcion?: string | null;
  metadata?: MetadataCatalogo | null;
  orden?: number;
  activo?: boolean;
  alcance?: "GENERAL" | "TENANT";
}

export interface DatosEdicionValorCatalogo {
  etiqueta?: string;
  descripcion?: string | null;
  metadata?: MetadataCatalogo | null;
  orden?: number;
  activo?: boolean;
}

/**
 * Variante de administración: incluye valores inactivos (y las marcas de
 * sobrescritura general/tenant) y expone las mutaciones (crear/editar/
 * activar-desactivar/eliminar) usadas por Configuración → Catálogos. El
 * endpoint de lectura es el mismo `GET /catalogos`, solo que pidiendo
 * `incluirInactivos=true`; las escrituras requieren el permiso
 * `configuracion.catalogos` en el backend.
 */
export function useCatalogoAdmin(tipo: string) {
  const [data, setData] = useState<CatalogoValor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const valores = await fetchAuth(
        `/catalogos?tipo=${encodeURIComponent(tipo)}&incluirInactivos=true`,
      );
      setData(Array.isArray(valores) ? valores : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando el catálogo.");
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crear = useCallback(
    async (valores: DatosNuevoValorCatalogo) => {
      const creado = await fetchAuth("/catalogos", {
        method: "POST",
        body: JSON.stringify({ tipo, ...valores }),
      });
      await refresh();
      return creado as CatalogoValor;
    },
    [tipo, refresh],
  );

  const actualizar = useCallback(
    async (id: string, valores: DatosEdicionValorCatalogo) => {
      const actualizado = await fetchAuth(`/catalogos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(valores),
      });
      await refresh();
      return actualizado as CatalogoValor;
    },
    [refresh],
  );

  /** Lanza si el backend responde 409 (valor en uso): el llamador decide si
   * ofrecer "desactivar" en su lugar — este hook no lo hace por él. */
  const eliminar = useCallback(
    async (id: string) => {
      await fetchAuth(`/catalogos/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { data, isLoading, error, refresh, crear, actualizar, eliminar };
}
