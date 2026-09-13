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
