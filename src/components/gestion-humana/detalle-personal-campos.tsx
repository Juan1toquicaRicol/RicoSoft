import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OpcionesSeguridadSocial } from "@/hooks/use-seguridad-social";
import { hoyLocalISO } from "@/lib/fecha-local";
import {
  CIUDADES_RESIDENCIA,
  DEPARTAMENTOS_RESIDENCIA,
  type DetallePersonalForm,
} from "@/lib/detalle-personal";

const INPUT = "h-9 text-xs border-slate-300";
const LABEL = "text-xs font-semibold text-slate-700";

/**
 * Campos de "Detalles" del colaborador, compartidos por el registro y por el
 * diálogo de Detalles. Orden: nacimiento y expedición de la cédula, ciudad y
 * departamento de residencia SEGUIDOS de la dirección, teléfonos y
 * afiliaciones (EPS, ARL y fondo de pensiones, elegidos del catálogo de
 * Gestión de información).
 */
export function DetallePersonalCampos({
  idPrefix,
  valor,
  onChange,
  opciones,
  disabled = false,
}: {
  idPrefix: string;
  valor: DetallePersonalForm;
  onChange: (v: DetallePersonalForm) => void;
  opciones: OpcionesSeguridadSocial;
  disabled?: boolean;
}) {
  const set = (campo: keyof DetallePersonalForm, v: string) => onChange({ ...valor, [campo]: v });
  const hoy = hoyLocalISO();

  const texto = (campo: keyof DetallePersonalForm, etiqueta: string, max: number, tel = false) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${campo}`} className={LABEL}>
        {etiqueta}
      </Label>
      <Input
        id={`${idPrefix}-${campo}`}
        value={valor[campo]}
        maxLength={max}
        disabled={disabled}
        inputMode={tel ? "tel" : undefined}
        onChange={(e) => set(campo, e.target.value)}
        className={INPUT}
      />
    </div>
  );

  const fecha = (campo: "fechaNacimiento" | "fechaExpedicionDocumento", etiqueta: string) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${campo}`} className={LABEL}>
        {etiqueta}
      </Label>
      <Input
        id={`${idPrefix}-${campo}`}
        type="date"
        min="1900-01-01"
        max={hoy}
        value={valor[campo]}
        disabled={disabled}
        onChange={(e) => set(campo, e.target.value)}
        className={INPUT}
      />
    </div>
  );

  // El valor guardado puede ya no estar en el catálogo (desactivado/renombrado):
  // se sigue mostrando como seleccionado.
  const seleccion = (
    campo: "eps" | "arl" | "fondoPensiones" | "ciudadResidencia" | "departamentoResidencia",
    etiqueta: string,
    lista: string[],
    sinOpcionesTexto = "Sin opciones. Agrégalas en Gestión de información.",
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}-${campo}`} className={LABEL}>
        {etiqueta}
      </Label>
      <Combobox
        id={`${idPrefix}-${campo}`}
        options={lista.map((n) => ({ value: n, label: n }))}
        value={valor[campo]}
        onValueChange={(v) => set(campo, v)}
        selectedLabel={valor[campo] || undefined}
        placeholder="Selecciona..."
        searchPlaceholder="Buscar..."
        emptyText={sinOpcionesTexto}
        disabled={disabled}
      />
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fecha("fechaNacimiento", "Fecha de nacimiento")}
      {texto("lugarNacimiento", "Lugar de nacimiento", 150)}
      {fecha("fechaExpedicionDocumento", "Fecha de expedición de la cédula")}
      <div className="hidden sm:block" aria-hidden="true" />
      {seleccion(
        "ciudadResidencia",
        "Ciudad de residencia",
        CIUDADES_RESIDENCIA,
        "Sin resultados.",
      )}
      {seleccion(
        "departamentoResidencia",
        "Departamento",
        DEPARTAMENTOS_RESIDENCIA,
        "Sin resultados.",
      )}
      <div className="sm:col-span-2">{texto("direccion", "Dirección de vivienda", 255)}</div>
      {texto("correoPersonal", "Correo personal", 255)}
      <div className="hidden sm:block" aria-hidden="true" />
      {texto("telefonoPrincipal", "Teléfono principal", 30, true)}
      {texto("telefonoSecundario", "Teléfono secundario", 30, true)}
      {seleccion("eps", "EPS", opciones.eps)}
      {seleccion("arl", "ARL", opciones.arl)}
      {seleccion("fondoPensiones", "Fondo de pensiones", opciones.fondosPensiones)}
    </div>
  );
}
