import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface Proveedor {
  id: string;
  nombre: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
  facturasAsociadas: number;
  contratosAsociados: number;
  solicitudesAsociadas: number;
}

export interface DatosProveedor {
  nombre: string;
  nit: string;
  contacto?: string;
  telefono?: string;
  email?: string;
}

/**
 * Catálogo de proveedores, compartido entre Facturas y Contratos. Antes cada
 * módulo guardaba "proveedor" como texto libre; ahora ambos referencian el
 * mismo catálogo por id, así que este hook es la única fuente para listarlo,
 * crearlo y administrarlo.
 */
export function useProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (search?: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAuth(`/proveedores${search ? `?search=${encodeURIComponent(search)}` : ""}`);
      setProveedores(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Error cargando proveedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearProveedor = useCallback(
    async (data: DatosProveedor) => {
      const creado: Proveedor = await fetchAuth("/proveedores", { method: "POST", body: JSON.stringify(data) });
      await refresh();
      return creado;
    },
    [refresh],
  );

  const actualizarProveedor = useCallback(
    async (id: string, data: Partial<DatosProveedor & { activo: boolean }>) => {
      await fetchAuth(`/proveedores/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const eliminarProveedor = useCallback(
    async (id: string) => {
      await fetchAuth(`/proveedores/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  return { proveedores, loading, error, refresh, crearProveedor, actualizarProveedor, eliminarProveedor };
}
