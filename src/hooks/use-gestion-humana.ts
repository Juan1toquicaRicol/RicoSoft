import { useCallback, useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import type { Empleado, Permiso, FaltaStrike } from "@/lib/data";
import { cargarSeccionesGestionHumana } from "@/lib/gestion-humana-carga";

export function useGestionHumana() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [faltas, setFaltas] = useState<FaltaStrike[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorEmpleados, setErrorEmpleados] = useState("");
  const [errorPermisos, setErrorPermisos] = useState("");
  const [errorFaltas, setErrorFaltas] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorEmpleados("");
    setErrorPermisos("");
    setErrorFaltas("");
    try {
      const resultado = await cargarSeccionesGestionHumana({
        empleados: () => fetchAuth("/gestion-humana/empleados"),
        permisos: () => fetchAuth("/gestion-humana/permisos"),
        faltas: () => fetchAuth("/gestion-humana/faltas"),
      });
      if (resultado.empleados.datos !== undefined) setEmpleados(resultado.empleados.datos);
      setErrorEmpleados(resultado.empleados.error);
      if (resultado.permisos.datos !== undefined) setPermisos(resultado.permisos.datos);
      setErrorPermisos(resultado.permisos.error);
      if (resultado.faltas.datos !== undefined) setFaltas(resultado.faltas.datos);
      setErrorFaltas(resultado.faltas.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addEmpleado = useCallback(
    async (data: {
      empresaId: string;
      documento: string;
      nombres: string;
      apellidos: string;
      correo: string;
      cargo?: string;
      cargoId?: string;
      tipoContrato?: string;
      area: string;
      fechaContratacion: string;
      salarioActual: number;
    }) => {
      const creado: { id: string } = await fetchAuth("/gestion-humana/empleados", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
      return creado;
    },
    [refresh],
  );

  const editarEmpleado = useCallback(
    async (id: string, data: { cargoId?: string; correo?: string; tipoContrato?: string }) => {
      await fetchAuth(`/gestion-humana/empleados/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refresh();
    },
    [refresh],
  );

  const updateSalarioEmpleado = useCallback(
    async (id: string, nuevoSalario: number, motivo: string) => {
      await fetchAuth(`/gestion-humana/empleados/${id}/salario`, {
        method: "PATCH",
        body: JSON.stringify({ nuevoSalario, motivo }),
      });
      await refresh();
    },
    [refresh],
  );

  const liquidarEmpleado = useCallback(
    async (id: string, fechaLiquidacion: string) => {
      await fetchAuth(`/gestion-humana/empleados/${id}/liquidar`, {
        method: "PATCH",
        body: JSON.stringify({ fechaLiquidacion }),
      });
      await refresh();
    },
    [refresh],
  );

  const eliminarEmpleado = useCallback(
    async (id: string) => {
      await fetchAuth(`/gestion-humana/empleados/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const addPermiso = useCallback(
    async (data: {
      empleadoId: string;
      tipoPermiso: string;
      fechaInicio: string;
      fechaFin: string;
      dias: number;
      observaciones: string;
    }) => {
      await fetchAuth("/gestion-humana/permisos", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  const updateEstadoPermiso = useCallback(
    async (id: string, estado: Permiso["estado"]) => {
      await fetchAuth(`/gestion-humana/permisos/${id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ estado }),
      });
      await refresh();
    },
    [refresh],
  );

  const addFalta = useCallback(
    async (data: { empleadoId: string; gravedad: string; motivo: string; descargos: string }) => {
      await fetchAuth("/gestion-humana/faltas", { method: "POST", body: JSON.stringify(data) });
      await refresh();
    },
    [refresh],
  );

  return {
    empleados,
    permisos,
    faltas,
    loading,
    error: errorEmpleados,
    errorPermisos,
    errorFaltas,
    refresh,
    addEmpleado,
    editarEmpleado,
    updateSalarioEmpleado,
    liquidarEmpleado,
    eliminarEmpleado,
    addPermiso,
    updateEstadoPermiso,
    addFalta,
  };
}
