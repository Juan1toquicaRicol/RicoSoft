import * as React from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Densidad de tabla, centralizada:
 *  - "normal" (default): la de siempre (h-10 / p-2, text-sm) — las tablas
 *    existentes no cambian.
 *  - "compact": tablas de datos densas (bandejas, detalle de ítems): cabecera
 *    h-9, celdas px-3 py-1.5, text-xs.
 * Se declara una vez en <Table density="compact"> y la heredan cabeceras y celdas.
 */
export type DensidadTabla = "normal" | "compact";
const DensidadContext = React.createContext<DensidadTabla>("normal");

const CLASES_CABECERA: Record<DensidadTabla, string> = {
  normal: "h-10 px-2",
  compact: "h-9 px-3 text-xs",
};
const CLASES_CELDA: Record<DensidadTabla, string> = {
  normal: "p-2",
  compact: "px-3 py-1.5 text-xs",
};

/** Alineación numérica única: derecha + cifras tabulares (importes, cantidades). */
const CLASES_NUMERICO = "text-right tabular-nums";

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { density?: DensidadTabla }
>(({ className, density = "normal", ...props }, ref) => (
  <DensidadContext.Provider value={density}>
    <div className="relative w-full overflow-auto">
      <table
        ref={ref}
        data-density={density}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  </DensidadContext.Provider>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => {
  const density = React.useContext(DensidadContext);
  return (
    <th
      ref={ref}
      className={cn(
        "text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        CLASES_CABECERA[density],
        numeric && CLASES_NUMERICO,
        className,
      )}
      {...props}
    />
  );
});
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric, ...props }, ref) => {
  const density = React.useContext(DensidadContext);
  return (
    <td
      ref={ref}
      className={cn(
        "align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        CLASES_CELDA[density],
        numeric && CLASES_NUMERICO,
        className,
      )}
      {...props}
    />
  );
});
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

/**
 * Fila de estado de tabla estándar (carga / error / vacío) con colSpan
 * completo. Reemplaza los <TableRow><TableCell colSpan=…> sueltos que cada vista
 * repetía con textos y colores distintos.
 */
function TableMessageRow({
  colSpan,
  kind,
  title,
  description,
  icon,
}: {
  colSpan: number;
  kind: "loading" | "error" | "empty";
  /** loading: texto (default "Cargando..."); error: mensaje; empty: título. */
  title?: string;
  description?: string;
  /** Solo "empty": ícono del estado vacío. */
  icon?: LucideIcon;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        {kind === "loading" && (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {title ?? "Cargando..."}
          </p>
        )}
        {kind === "error" && (
          <p role="alert" className="py-8 text-center text-xs font-medium text-estado-danger-fg">
            {title ?? "No fue posible cargar los datos."}
          </p>
        )}
        {kind === "empty" && icon && (
          <EmptyState icon={icon} title={title ?? "Sin resultados"} description={description} />
        )}
        {kind === "empty" && !icon && (
          <p className="py-8 text-center text-xs text-slate-500">{title ?? "Sin resultados"}</p>
        )}
      </TableCell>
    </TableRow>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableMessageRow,
};
