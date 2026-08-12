import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, CornerUpLeft, DollarSign, Download, FileText, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/data";
import { useFacturas } from "@/hooks/use-facturas";

export const Route = createFileRoute("/facturas/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de Factura | RicoSoft" },
      { name: "description", content: "Trazabilidad y aprobación de la factura." },
    ],
  }),
  component: DetalleFactura,
});

function DetalleFactura() {
  const { id } = Route.useParams();
  const { facturas, loading, error, updateEstadoFactura } = useFacturas();

  const factura = facturas.find((f) => f.id === id);

  if (loading) {
    return (
      <AppShell title="Cargando factura..." description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-sm text-muted-foreground">Cargando...</div>
      </AppShell>
    );
  }

  if (!factura) {
    return (
      <AppShell title="Factura no encontrada" description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-base mb-2">Factura no registrada</p>
          <p>{error || `No se encontró la factura ${id} en la base de datos de esta empresa.`}</p>
          <Link to="/facturas" className="mt-4 inline-block">
            <Button size="sm">Volver a Facturas</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const campos = [
    ["Número", factura.numero],
    ["Empresa ID", factura.empresaId],
    ["Proveedor", factura.proveedor],
    ["NIT Proveedor", factura.nit],
    ["Área Responsable", factura.area],
    ["Responsable", factura.responsable],
    ["Fecha de Emisión", factura.fecha],
    ["Vencimiento", factura.vence],
    ["Moneda", factura.moneda],
    ["Prioridad", factura.prioridad],
    ["Origen", factura.origen],
  ];

  return (
    <AppShell
      title={`Factura ${factura.numero}`}
      description={`${factura.proveedor} · Empresa ID: ${factura.empresaId}`}
      actions={
        <>
          <Link to="/facturas">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {factura.estado === "Pendiente" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateEstadoFactura(factura.id, "Rechazada", "Rechazada en revisión manual").catch(
                    (err: any) => alert(err.message || "Error al rechazar la factura."),
                  )
                }
                className="gap-2 text-rose-600 border-rose-500/30 hover:bg-rose-50"
              >
                <X className="h-4 w-4" /> Rechazar
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  updateEstadoFactura(factura.id, "Aprobada", "Validado correctamente").catch(
                    (err: any) => alert(err.message || "Error al aprobar la factura."),
                  )
                }
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Check className="h-4 w-4" /> Aprobar Factura
              </Button>
            </>
          )}
          {factura.estado === "Aprobada" && (
            <Button
              size="sm"
              onClick={() =>
                updateEstadoFactura(factura.id, "Pagada", "Transferencia procesada").catch(
                  (err: any) => alert(err.message || "Error al registrar el pago."),
                )
              }
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <DollarSign className="h-4 w-4" /> Registrar Pago
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border mb-4">
              <h2 className="text-sm font-semibold">Datos Generales de la Factura</h2>
              <EstadoBadge estado={factura.estado} />
            </div>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {campos.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Subtotal
                </p>
                <p className="num text-base font-semibold">
                  {money(factura.subtotal, factura.moneda)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IVA</p>
                <p className="num text-base font-semibold">{money(factura.iva, factura.moneda)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total a Pagar
                </p>
                <p className="num text-lg font-bold text-primary">
                  {money(factura.total, factura.moneda)}
                </p>
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold">Documento Digitalizado</h2>
            <div className="mt-4 grid h-52 place-items-center rounded-lg border border-dashed border-border bg-muted/30 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-primary opacity-60" />
                <p className="mt-2 text-sm font-medium">{factura.numero}.pdf</p>
                <p className="text-xs text-muted-foreground">
                  Soporte adjunto digitalizado de RicoSoft
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold mb-4">Trazabilidad y Auditoría</h2>
            <ol className="space-y-4">
              {factura.historial.map((h, i) => (
                <li key={i} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  {i < factura.historial.length - 1 && (
                    <span className="absolute left-[4.5px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" />
                  )}
                  <p className="text-xs font-semibold">{h.accion}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {h.fecha} · {h.actor}
                  </p>
                  {h.detalle && (
                    <p className="mt-1 text-xs text-muted-foreground italic">{h.detalle}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
