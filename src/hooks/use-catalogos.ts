import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface CatalogoValor {
  id: string;
  tipo: string;
  clave: string;
  etiqueta: string;
  orden: number;
  activo: boolean;
  alcance: "GENERAL" | "TENANT";
}

/** Tipos de catálogo administrables desde Configuración → Catálogos, en el
 * mismo orden que TIPOS_CATALOGO_VALIDOS del backend (catalogos.controller.ts). */
export const TIPOS_CATALOGO_ADMINISTRABLES: { tipo: string; etiqueta: string }[] = [
  { tipo: "INCOTERM", etiqueta: "Incoterms" },
  { tipo: "MONEDA", etiqueta: "Monedas" },
  { tipo: "PAIS_ORIGEN", etiqueta: "Países de origen" },
  { tipo: "FORMA_PAGO", etiqueta: "Formas de pago" },
  { tipo: "UNIDAD_MEDIDA", etiqueta: "Unidades de medida" },
  { tipo: "METODO_PAGO", etiqueta: "Métodos de pago" },
  { tipo: "MOTIVO_NOVEDAD_IMPORTACION", etiqueta: "Motivos de novedad (importaciones)" },
  { tipo: "ACCION_CONTACTO_OPORTUNIDAD", etiqueta: "Acciones de contacto (CRM)" },
  { tipo: "RESULTADO_CONTACTO_OPORTUNIDAD", etiqueta: "Resultados de contacto (CRM)" },
];

/**
 * Lee los valores activos de un tipo de catálogo (INCOTERM, MONEDA,
 * PAIS_ORIGEN, FORMA_PAGO, UNIDAD_MEDIDA, METODO_PAGO,
 * MOTIVO_NOVEDAD_IMPORTACION, ACCION_CONTACTO_OPORTUNIDAD,
 * RESULTADO_CONTACTO_OPORTUNIDAD, etc.) — reemplaza los arrays hardcodeados
 * en el frontend que duplicaban datos ya administrables desde
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

/**
 * Variante de administración: incluye valores inactivos y expone las
 * mutaciones (crear/editar/activar-desactivar/eliminar) usadas por la
 * pantalla Configuración → Catálogos. El endpoint de lectura es el mismo
 * `GET /catalogos`, solo que pidiendo `incluirInactivos=true`; las
 * escrituras requieren el permiso `configuracion.catalogos` en el backend.
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
    async (valores: {
      clave: string;
      etiqueta: string;
      orden?: number;
      alcance?: "GENERAL" | "TENANT";
    }) => {
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
    async (id: string, valores: { etiqueta?: string; orden?: number; activo?: boolean }) => {
      const actualizado = await fetchAuth(`/catalogos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(valores),
      });
      await refresh();
      return actualizado as CatalogoValor;
    },
    [refresh],
  );

  const eliminar = useCallback(
    async (id: string) => {
      await fetchAuth(`/catalogos/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { data, isLoading, error, refresh, crear, actualizar, eliminar };
}
