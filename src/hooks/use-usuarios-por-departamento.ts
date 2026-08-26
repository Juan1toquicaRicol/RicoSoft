import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface UsuarioOpcion {
  id: string;
  nombre: string;
}

/**
 * Usuarios activos de un departamento (id + nombre), para poblar el selector
 * de "Responsable" en formularios operativos (Facturas, Solicitudes de
 * Compra) una vez elegida el área. Se recarga cada vez que cambia el
 * departamento seleccionado.
 */
export function useUsuariosPorDepartamento(departamentoId: string | null | undefined) {
  const [usuarios, setUsuarios] = useState<UsuarioOpcion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!departamentoId) {
      setUsuarios([]);
      return;
    }
    let cancelado = false;
    setLoading(true);
    fetchAuth(`/usuarios/por-departamento/${departamentoId}`)
      .then((data) => {
        if (!cancelado) setUsuarios(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelado) setUsuarios([]);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [departamentoId]);

  return { usuarios, loading };
}
