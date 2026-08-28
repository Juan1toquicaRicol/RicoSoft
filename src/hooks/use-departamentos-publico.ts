import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

/**
 * Catálogo de departamentos activos (id + nombre) para poblar selects de
 * "Área" en formularios operativos (Gestión Humana, Facturas, Solicitudes
 * de Compra, Servicios). Usa /departamentos/mi-empresa (autenticado, sin
 * permiso administrativo) para que cualquier usuario logueado vea los
 * departamentos reales de SU empresa configurados en Configuración >
 * Departamentos, en vez de una lista fija desincronizada.
 *
 * Antes de la auditoría de multi-tenant usaba el endpoint público
 * /departamentos/publico (pensado para el formulario de registro sin
 * sesión) sin enviar el token; funcionaba solo porque el backend resolvía
 * el tenant con tenant.findFirst() — al corregir ese endpoint para resolver
 * por dominio de correo, dejó de servir para este caso (usuario ya logueado,
 * no hay "dominio" en contexto), así que se movió a un endpoint autenticado.
 */
export function useDepartamentosPublico() {
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await fetchAuth("/departamentos/mi-empresa");
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
