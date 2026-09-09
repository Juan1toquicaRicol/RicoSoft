import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";

export interface Proveedor {
  id: string;
  nombre: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  condicionesPago: string | null;
  datosPago: string | null;
  activo: boolean;
  // Departamento dueño del proveedor; null = proveedor general, disponible
  // para cualquier departamento (ver comentario en schema.prisma).
  departamentoId: string | null;
  departamento: { id: string; nombre: string } | null;
  // País de origen (mismo catálogo que OrdenCompraIntl.paisOrigen); null = no
  // configurado todavía.
  paisOrigen: string | null;
  // Origen SIESA/MANUAL y última sincronización — ver plan de integración
  // Siesa → Proveedores. Ausentes en respuestas de antes de esa migración.
  origen?: "SIESA" | "MANUAL";
  ultimaSincronizacion?: string | null;
  facturasAsociadas: number;
  solicitudesAsociadas: number;
}

export interface DatosProveedor {
  nombre: string;
  nit: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  condicionesPago?: string;
  datosPago?: string;
  departamentoId?: string | null;
  paisOrigen?: string | null;
}

/**
 * Catálogo de proveedores PAGINADO, para la administración en
 * Configuración > Proveedores (la única pantalla que necesita ver/editar el
 * catálogo completo, con búsqueda y paginación server-side — con miles de
 * proveedores reales por tenant, cargar todo en memoria dejó de ser viable).
 * Para elegir un proveedor dentro de un formulario (Facturas, Solicitudes de
 * Compra, etc.) usa `useProveedorBusqueda` en su lugar.
 */
export function useProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (opts?: { search?: string; page?: number; limit?: number }) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (opts?.search) params.set("search", opts.search);
      params.set("page", String(opts?.page ?? 1));
      params.set("limit", String(opts?.limit ?? 25));
      params.set("soloActivos", "false"); // la administración debe poder ver también los desactivados
      const data = await fetchAuth(`/proveedores?${params.toString()}`);
      setProveedores(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setPage(data.page ?? 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cargando proveedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const crearProveedor = useCallback(
    async (data: DatosProveedor) => {
      const creado: Proveedor = await fetchAuth("/proveedores", {
        method: "POST",
        body: JSON.stringify(data),
      });
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

  return {
    proveedores,
    total,
    page,
    totalPages,
    loading,
    error,
    refresh,
    crearProveedor,
    actualizarProveedor,
    eliminarProveedor,
  };
}

export interface ProveedorOpcion {
  id: string;
  nombre: string;
  nit: string;
  paisOrigen?: string | null;
}

/**
 * Búsqueda server-side para elegir UN proveedor dentro de un formulario
 * (Facturas, Servicios, Solicitudes de Compra/Cotizaciones) — ver
 * <Combobox onSearchChange=.../>. Nunca descarga el catálogo completo: solo
 * trae los ~25 resultados que coinciden con lo que el usuario escribió,
 * filtrados por departamento si aplica. Empieza con una carga inicial vacía
 * (sin `search`) para mostrar algo antes de que el usuario escriba.
 */
export function useProveedorBusqueda(departamentoId?: string) {
  const [opciones, setOpciones] = useState<ProveedorOpcion[]>([]);
  const [loading, setLoading] = useState(false);

  const buscar = useCallback(
    async (texto: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (texto) params.set("search", texto);
        if (departamentoId) params.set("departamentoId", departamentoId);
        params.set("limit", "25");
        const data = await fetchAuth(`/proveedores?${params.toString()}`);
        setOpciones(Array.isArray(data.items) ? data.items : []);
      } catch {
        setOpciones([]);
      } finally {
        setLoading(false);
      }
    },
    [departamentoId],
  );

  useEffect(() => {
    buscar("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departamentoId]);

  return { opciones, loading, buscar };
}
