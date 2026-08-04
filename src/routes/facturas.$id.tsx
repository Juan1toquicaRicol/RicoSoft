import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, CornerUpLeft, Download, FileText, X } from "lucide-react";

import { AppShell, EstadoBadge } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { facturas, money } from "@/lib/data";

export const Route = createFileRoute("/facturas/$id")({
  loader: ({ params }) => {
    const factura = facturas.find((f) => f.id === params.id);
    if (!factura) throw notFound();
    return { factura };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Factura no disponible | Facturaflow" }, { name: "robots", content: "noindex" }] };
    }
    const title = `Factura ${loaderData.factura.numero} | Facturaflow`;
    const description = `${loaderData.factura.proveedor} · ${money(loaderData.factura.total)} · estado ${loaderData.factura.estado}.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: () => (
    <AppShell title="Factura no disponible">
      <div className="panel p-10 text-center text-sm text-muted-foreground">No pudimos cargar esta factura.</div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Factura no encontrada">
      <div className="panel p-10 text-center text-sm text-muted-foreground">
        La factura solicitada no existe o fue archivada.
      </div>
    </AppShell>
  ),
  component: DetalleFactura,
});

function DetalleFactura() {
  const { factura } = Route.useLoaderData();

  const campos = [
    ["Proveedor", factura.proveedor],
    ["NIT", factura.nit],
    ["Empresa", factura.empresa],
    ["Contrato", factura.contrato],
    ["Centro de costos", factura.centroCostos],
    ["Área responsable", factura.area],
    ["Responsable", factura.responsable],
    ["Fecha de emisión", factura.fecha],
    ["Vencimiento", factura.vence],
    ["Moneda", factura.moneda],
    ["Prioridad", factura.prioridad],
    ["Origen", factura.origen],
  ];

  return (
    <AppShell
      title={`Factura ${factura.numero}`}
      description={`${factura.proveedor} · ${factura.contrato}`}
      actions={
        <>
          <Link to="/facturas">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="gap-2">
            <CornerUpLeft className="h-4 w-4" /> Devolver
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-destructive">
            <X className="h-4 w-4" /> Rechazar
          </Button>
          <Button size="sm" className="gap-2">
            <Check className="h-4 w-4" /> Aprobar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <h2 className="text-sm font-semibold">Datos extraídos por OCR</h2>
              <span className="rounded-md bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">
                Confianza 97%
              </span>
            </div>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {campos.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Subtotal</p>
                <p className="num text-base font-semibold">{money(factura.subtotal, factura.moneda)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IVA</p>
                <p className="num text-base font-semibold">{money(factura.iva, factura.moneda)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="num text-base font-semibold text-primary">{money(factura.total, factura.moneda)}</p>
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold">Documento</h2>
            <div className="mt-4 grid h-72 place-items-center rounded-lg border border-dashed border-border bg-muted/40 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">{factura.numero}.pdf</p>
                <p className="text-xs text-muted-foreground">Vista previa del documento original</p>
                <Button variant="outline" size="sm" className="mt-4 gap-2">
                  <Download className="h-4 w-4" /> Descargar
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Estado actual</h2>
              <EstadoBadge estado={factura.estado} />
            </div>
            <ol className="mt-5 space-y-4">
              {factura.historial.map((h, i) => (
                <li key={i} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  {i < factura.historial.length - 1 && (
                    <span className="absolute left-[4.5px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" />
                  )}
                  <p className="text-sm font-medium">{h.accion}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {h.fecha} · {h.actor}
                  </p>
                  {h.detalle && <p className="mt-1 text-xs text-muted-foreground">{h.detalle}</p>}
                </li>
              ))}
            </ol>
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold">Comentarios internos</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              Aún no hay comentarios en esta factura. Los comentarios quedan registrados en la auditoría.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
