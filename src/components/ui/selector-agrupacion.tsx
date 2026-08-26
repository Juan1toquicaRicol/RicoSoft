import { Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface OpcionAgrupacion {
  value: string;
  label: string;
}

export const OPCION_SIN_AGRUPAR: OpcionAgrupacion = { value: "ninguno", label: "Sin agrupar" };

/**
 * Selector reutilizable de "Agrupar por: X" para tablas de listado. Cada
 * pantalla define sus propias opciones (Área, Estado, Proveedor, etc., según
 * qué campos tenga esa entidad) y resuelve el valor elegido a una función de
 * clave para `agruparFilas`.
 */
/**
 * Encabezado de grupo dentro de un <tbody>: una fila que abarca todas las
 * columnas de la tabla, usada entre cada bloque de filas cuando hay una
 * agrupación activa. `clave === ""` (sin agrupar) no debe renderizarse: el
 * llamador decide eso antes de usar este componente.
 */
export function FilaGrupo({ clave, cantidad, colSpan }: { clave: string; cantidad: number; colSpan: number }) {
  return (
    <tr className="bg-slate-50/80">
      <td colSpan={colSpan} className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-y border-slate-200">
        {clave} <span className="font-normal text-slate-400">({cantidad})</span>
      </td>
    </tr>
  );
}

export function SelectorAgrupacion({
  value,
  onChange,
  opciones,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionAgrupacion[];
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[170px] text-xs border-slate-300 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-white border-slate-200">
          {opciones.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
