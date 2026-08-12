import { useEffect, useState } from "react";
import { fetchApi } from "@/config/api";

export interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

/**
 * Catálogo de departamentos activos (id + nombre) para poblar selects de
 * "Área" en formularios operativos (Gestión Humana, Facturas, Solicitudes
 * de Compra, Servicios). Usa el endpoint público /departamentos/publico
 * (sin permiso administrativo) para que cualquier usuario autenticado que
 * llena estos formularios vea los departamentos reales configurados en
 * Configuración > Departamentos, en vez de una lista fija desincronizada.
 */
export function useDepartamentosPublico() {
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await fetchApi("/departamentos/publico");
        if (!cancelado) setDepartamentos(data);
      } catch {
        if (!cancelado) setDepartamentos([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return { departamentos, loading };
}
