import { ChevronLeft, ChevronRight, Database } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/data";
import { useFacturasSiesa, type FacturaSiesa } from "@/hooks/use-facturas-siesa";

const PAGE_SIZE = 25;

/**
 * Facturas de proveedores registradas en Siesa (t455_cm_factura_docto) —
 * consulta de SOLO LECTURA, deliberadamente separada en su propia pestaña
 * de la tabla nativa de Facturas de RicoSoft (ver facturas.index.tsx): no
 * son el mismo dato, no se cruzan entre sí, y aquí no hay ninguna acción
 * (aprobar/pagar/eliminar) — solo consulta.
 */
export function PestanaFacturasSiesa() {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [page, setPage] = useState(1);
  // El detalle NO pide nada al backend: usa el mismo registro que ya trajo
  // el listado — t455_cm_factura_docto es una tabla de cabecera (sin
  // líneas), así que no hay un "detalle" más profundo que consultar en
  // esta fase (ver alcance aprobado en siesa-facturas-compra.service.ts).
  const [facturaDetalle, setFacturaDetalle] = useState<FacturaSiesa | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [qDebounced]);

  const { items, total, disponible, motivo, loading, error } = useFacturasSiesa({
    search: qDebounced || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <div className="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 lg:flex lg:items-center lg:justify-between bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-indigo-200 bg-indigo-50 text-indigo-800 font-bold"
          >
            <Database className="h-3 w-3 mr-1" /> Fuente: Siesa (solo lectura)
          </Badge>
          <p className="text-[11px] text-slate-500">
            Facturas de proveedores registradas en Siesa. No se editan, pagan ni eliminan desde aquí
            — son independientes de las facturas nativas de RicoSoft.
          </p>
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por proveedor o NIT..."
          className="h-9 w-full max-w-xs bg-white text-xs border-slate-300 shadow-2xs"
        />
      </div>

      {!disponible && !loading ? (
        <EmptyState
          icon={Database}
          title="Facturas de Siesa no disponibles"
          description={
            motivo || "No fue posible consultar las facturas de proveedores desde Siesa."
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Factura
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Proveedor / NIT
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5">
                  Fecha factura
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                  Valor neto
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5 text-right">
                  CxP registrado
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-slate-800 font-medium">
              {items.map((f) => (
                <TableRow
                  key={f.facturaRowId}
                  onClick={() => setFacturaDetalle(f)}
                  className="cursor-pointer"
                  title="Ver detalle"
                >
                  <TableCell className="px-4 py-3 font-bold text-xs">
                    <span className="text-blue-800 hover:underline">
                      {f.prefijo ? `${f.prefijo}-${f.numero}` : (f.numero ?? "—")}
                    </span>
                    <p className="text-[10px] text-slate-400 font-normal">
                      Siesa #{f.facturaRowId}
                    </p>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <p className="font-bold text-slate-900 truncate max-w-[220px]">
                      {f.terceroNombre || "—"}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">{f.terceroNit || "—"}</p>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs font-mono text-slate-500">
                    {f.fechaDocumentoProveedor
                      ? new Date(f.fechaDocumentoProveedor).toLocaleDateString("es-CO")
                      : "—"}
                  </TableCell>
                  <TableCell className="num px-4 py-3 text-right font-bold text-slate-900 text-xs">
                    {money(f.valorNeto, f.monedaCausacion || "COP")}
                  </TableCell>
                  <TableCell className="num px-4 py-3 text-right font-semibold text-slate-700 text-xs">
                    {money(f.valorCxpRegistrado, f.monedaCausacion || "COP")}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    {loading ? (
                      <div className="py-12 text-center text-xs text-slate-500">
                        Cargando facturas de Siesa...
                      </div>
                    ) : error ? (
                      <div className="py-12 text-center text-xs text-slate-500">{error}</div>
                    ) : (
                      <EmptyState
                        icon={Database}
                        title="No hay facturas para el filtro seleccionado"
                        description="Cambia la búsqueda, o verifica el filtro de fecha."
                      />
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-500">
              <p>
                {items.length} de {total} facturas Siesa — página {page} de {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="gap-1"
                >
                  Siguiente <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!facturaDetalle} onOpenChange={(open) => !open && setFacturaDetalle(null)}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          {facturaDetalle && (
            <>
              <DialogHeader>
                <DialogTitle className="text-slate-900 font-bold">
                  Factura{" "}
                  {facturaDetalle.prefijo
                    ? `${facturaDetalle.prefijo}-${facturaDetalle.numero}`
                    : (facturaDetalle.numero ?? "—")}
                </DialogTitle>
                <DialogDescription className="text-slate-500">
                  Siesa #{facturaDetalle.facturaRowId} · Compañía {facturaDetalle.ciaId} — dato de
                  solo lectura, cabecera del documento (sin líneas).
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-xs">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5 mb-2">
                    Proveedor
                  </p>
                  <p className="font-bold text-slate-900">{facturaDetalle.terceroNombre || "—"}</p>
                  <p className="text-slate-500 font-mono">
                    NIT {facturaDetalle.terceroNit || "—"}
                    {facturaDetalle.terceroRowId != null &&
                      ` · Tercero Siesa #${facturaDetalle.terceroRowId}`}
                  </p>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5 mb-2">
                    Fechas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-slate-500">Fecha factura (proveedor)</p>
                      <p className="font-semibold text-slate-800">
                        {facturaDetalle.fechaDocumentoProveedor
                          ? new Date(facturaDetalle.fechaDocumentoProveedor).toLocaleDateString(
                              "es-CO",
                            )
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Fecha emisión (Siesa)</p>
                      <p className="font-semibold text-slate-800">
                        {facturaDetalle.fechaEmision
                          ? new Date(facturaDetalle.fechaEmision).toLocaleDateString("es-CO")
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-1.5 mb-2">
                    Valores ({facturaDetalle.monedaCausacion || "COP"})
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-slate-500">Valor neto</p>
                      <p className="font-bold text-slate-900">
                        {money(facturaDetalle.valorNeto, facturaDetalle.monedaCausacion || "COP")}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Impuesto</p>
                      <p className="font-semibold text-slate-800">
                        {money(
                          facturaDetalle.valorImpuesto,
                          facturaDetalle.monedaCausacion || "COP",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Descuento</p>
                      <p className="font-semibold text-slate-800">
                        {money(
                          facturaDetalle.valorDescuento,
                          facturaDetalle.monedaCausacion || "COP",
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Retención</p>
                      <p className="font-semibold text-slate-800">
                        {money(
                          facturaDetalle.valorRetencion,
                          facturaDetalle.monedaCausacion || "COP",
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-slate-600">CxP registrado en la factura</p>
                    <p className="font-bold text-amber-900">
                      {money(
                        facturaDetalle.valorCxpRegistrado,
                        facturaDetalle.monedaCausacion || "COP",
                      )}
                    </p>
                    <p className="mt-1 text-[10px] text-amber-700">
                      Valor tal como quedó causado en la factura — NO es el saldo pendiente actual
                      (pagos u otros movimientos posteriores no se reflejan aquí). El saldo abierto
                      real se consulta en Créditos &gt; Cartera Siesa.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
