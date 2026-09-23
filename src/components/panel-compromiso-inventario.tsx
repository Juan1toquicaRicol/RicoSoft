import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { useCompromisoInventarioPedido } from "@/hooks/use-comercial";
import { describirCompromiso } from "@/lib/compromiso-inventario";

const CLASE_TONO = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
  neutro: "text-slate-600",
} as const;

/** Panel "Compromiso de Inventario" del detalle de un Pedido Comercial:
 * lectura en vivo del compromiso en Siesa (unión por erpRowId). */
export function PanelCompromisoInventario({
  pedidoId,
  puedeVerComprometidoSiesa,
}: {
  pedidoId: string;
  puedeVerComprometidoSiesa: boolean;
}) {
  const { compromiso: c, loading, error, refresh } = useCompromisoInventarioPedido(pedidoId);
  const descripcion = c ? describirCompromiso(c) : null;

  return (
    <div
      className="mt-4 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="panel-compromiso"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Compromiso de Inventario</h3>
        <span className="text-[10px] text-slate-400">Lectura en vivo de Siesa</span>
      </div>

      {loading && <p className="mt-3 text-xs text-slate-500">Consultando Siesa...</p>}

      {!loading && error && (
        <p className="mt-3 text-xs text-amber-700">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refresh()}>
            Reintentar
          </button>
        </p>
      )}

      {!loading && !error && c && descripcion && (
        <div className="mt-3 space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={CLASE_TONO[descripcion.tono]}>
              {descripcion.titulo}
            </Badge>
            <span className="text-slate-500">{descripcion.detalle}</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <dt className="text-slate-500">Estado comercial (RicoSoft)</dt>
            <dd className="font-medium">{c.estadoComercial}</dd>
            <dt className="text-slate-500">Sincronización</dt>
            <dd className="font-medium">{c.estadoSincronizacion}</dd>
            {c.siesa && (
              <>
                <dt className="text-slate-500">Estado operativo Siesa</dt>
                <dd className="font-medium">{c.siesa.estadoOperativo}</dd>
                <dt className="text-slate-500">Pedido Siesa</dt>
                <dd className="font-medium">PDV-{c.siesa.pdvNumero}</dd>
              </>
            )}
          </dl>

          {c.siesa && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  ["Pedida", c.siesa.cantidadPedida],
                  ["Comprometida", c.siesa.cantidadComprometida],
                  ["Remisionada", c.siesa.cantidadRemisionada],
                  ["Facturada", c.siesa.cantidadFacturada],
                ] as const
              ).map(([etiqueta, valor]) => (
                <div key={etiqueta} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                  <p className="text-[10px] text-slate-500">{etiqueta}</p>
                  <p className="text-sm font-semibold text-slate-800">{valor}</p>
                </div>
              ))}
            </div>
          )}

          {c.compromiso === "COMPROMETIDO" && c.siesa && puedeVerComprometidoSiesa && (
            <Link
              to="/inventario/comprometidos"
              search={{ pedido: String(c.siesa.pdvNumero) }}
              className="inline-block font-semibold text-blue-700 hover:underline"
            >
              Ver detalle en Comprometido en Siesa →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
