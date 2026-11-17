import { Link } from "@tanstack/react-router";

import { ID_DEFINICIONES_ANALITICA, type EstadoIndicador } from "./estado-indicador";

export function EstadoVacioIndicador({
  estado,
  detalleExclusiones,
  estadosIncluidos,
}: {
  estado: Exclude<EstadoIndicador, "con-datos">;
  /** Texto ya armado con los motivos de exclusión que informa el backend. */
  detalleExclusiones?: string;
  /** metadatos.periodo.estadosIncluidos tal como lo devuelve el backend. */
  estadosIncluidos?: string[];
}) {
  const estados =
    estadosIncluidos && estadosIncluidos.length > 0
      ? ` con estado ${estadosIncluidos.join(" o ")}`
      : "";
  if (estado === "sin-operaciones") {
    return (
      <div>
        <span className="text-xl font-semibold text-slate-900">Sin operaciones</span>
        <p className="text-[11px] text-slate-500">
          No se encontraron órdenes{estados} en el periodo y filtros seleccionados. Ajusta las
          fechas o los filtros para ver otros resultados.
        </p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-xl font-semibold text-slate-900">Datos insuficientes</span>
      <p className="text-[11px] text-slate-500">
        Hay operaciones en el periodo, pero ninguna tiene los datos necesarios para calcular este
        indicador.
        {detalleExclusiones ? ` Motivos: ${detalleExclusiones}.` : ""}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] font-medium">
        <Link to="/importaciones" className="text-blue-700 hover:underline">
          Ver órdenes
        </Link>
        <a href={`#${ID_DEFINICIONES_ANALITICA}`} className="text-blue-700 hover:underline">
          Cómo se calcula
        </a>
      </p>
    </div>
  );
}
