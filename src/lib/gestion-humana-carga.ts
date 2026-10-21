function mensajeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type ResultadoCarga<T> = { datos?: T; error: string };

function convertirResultado<T>(
  resultado: PromiseSettledResult<T>,
  fallback: string,
): ResultadoCarga<T> {
  return resultado.status === "fulfilled"
    ? { datos: resultado.value, error: "" }
    : { error: mensajeError(resultado.reason, fallback) };
}

/** Ejecuta cada consulta independiente para que un permiso faltante no oculte las demás secciones. */
export async function cargarSeccionesGestionHumana<TEmpleado, TPermiso, TFalta>(solicitudes: {
  empleados: () => Promise<TEmpleado>;
  permisos: () => Promise<TPermiso>;
  faltas: () => Promise<TFalta>;
}) {
  const [empleados, permisos, faltas] = await Promise.allSettled([
    solicitudes.empleados(),
    solicitudes.permisos(),
    solicitudes.faltas(),
  ]);

  return {
    empleados: convertirResultado(empleados, "Error cargando colaboradores."),
    permisos: convertirResultado(permisos, "Error cargando solicitudes de permisos."),
    faltas: convertirResultado(faltas, "Error cargando faltas disciplinarias."),
  };
}
