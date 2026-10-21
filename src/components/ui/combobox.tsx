import * as React from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** id del botón disparador, para asociarlo a un <Label htmlFor>. */
  id?: string;
  "aria-label"?: string;
  /** Si es false (campos obligatorios), volver a hacer clic en la opción ya
   * elegida no la deselecciona — se comporta como un <Select> normal.
   * Por defecto true (permite volver a "sin selección" con un clic). */
  clearable?: boolean;
  /**
   * Modo búsqueda server-side (p. ej. catálogos de miles de proveedores):
   * si se pasa, `options` deja de filtrarse localmente (se asume que ya son
   * exactamente el resultado de la búsqueda en curso) y este callback recibe
   * el texto escrito, con un debounce de 300ms aplicado acá adentro.
   */
  onSearchChange?: (query: string) => void;
  loadingOptions?: boolean;
  /** Etiqueta a mostrar para `value` cuando la opción seleccionada no viene
   * en la página actual de `options` (modo server-side: el usuario eligió un
   * proveedor y luego escribió otra búsqueda que ya no lo incluye). */
  selectedLabel?: string;
}

/**
 * Select con búsqueda: igual que <Select> pero permite escribir para
 * filtrar entre muchas opciones (p. ej. el catálogo de proveedores) en vez
 * de tener que desplazarse por una lista larga. Mismo contrato controlado
 * (value/onValueChange) que <Select>, para poder reemplazarlo sin tocar el
 * resto del formulario.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Selecciona...",
  searchPlaceholder = "Buscar...",
  emptyText = "Sin resultados.",
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  clearable = true,
  onSearchChange,
  loadingOptions,
  selectedLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const seleccionado = options.find((o) => o.value === value);
  const etiquetaMostrada = seleccionado?.label ?? (value ? selectedLabel : undefined);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = (texto: string) => {
    if (!onSearchChange) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(texto), 300);
  };
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between text-xs font-normal border-slate-300 bg-white",
            !etiquetaMostrada && "text-slate-500",
            className,
          )}
        >
          <span className="truncate">{etiquetaMostrada || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0 bg-white border-slate-200">
        <Command shouldFilter={!onSearchChange}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-xs"
            onValueChange={handleInputChange}
          />
          <CommandList>
            {loadingOptions ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
              </div>
            ) : (
              <>
                <CommandEmpty className="py-4 text-xs text-slate-500">{emptyText}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      className="text-xs"
                      onSelect={() => {
                        if (option.value !== value) {
                          onValueChange(option.value);
                        } else if (clearable) {
                          onValueChange("");
                        }
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-3.5 w-3.5",
                          option.value === value ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
