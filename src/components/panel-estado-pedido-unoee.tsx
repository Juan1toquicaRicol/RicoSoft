import { EstadoBadge } from "@/components/ui/badge";
import { EstadoCarga } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMessageRow,
  TableRow,
} from "@/components/ui/table";
import { useEstadoPedidoUnoee, type EstadoPedidoUnoee } from "@/hooks/use-comercial";
import { formatCantidad, money } from "@/lib/data";
import { CLASES_TONO_ESTADO } from "@/lib/estado-tono";
import { cn } from "@/lib/utils";

/** Mensaje del Caso B (pedido sin documento ERP / PDV). */
export const MENSAJE_PEDIDO_NO_ENVIADO = "El pedido no ha sido enviado";

/**
 * Panel "Estado del Pedido UnoEE" del detalle de un Pedido Comercial, con la
 * estructura del CRM de Siesa (solo lectura):
 *  - Caso A (PDV vinculado): cabecera (consecutivo, estado, valor total,
 *    descuentos, impuestos) + tabla de ítems.
 *  - Caso B (sin PDV): banner rojo "El pedido no ha sido enviado".
 * Los datos salen de GET /comercial/pedidos/:id/estado-unoee (unión por
 * PedidoComercial.erpRowId; la compañía Siesa la deriva el servidor). Colores:
 * únicamente el semáforo oficial (tokens --estado-*).
 */
export function PanelEstadoPedidoUnoee({ pedidoId }: { pedidoId: string }) {
  const { estado, loading, error, refresh } = useEstadoPedidoUnoee(pedidoId);
  return (
    <VistaEstadoPedidoUnoee
      estado={estado}
      loading={loading}
      error={error}
      onReintentar={() => void refresh()}
    />
  );
}

/** Tarjeta de la cabecera: etiqueta + valor. Misma caja para todos los datos. */
function TarjetaCabecera({
  etiqueta,
  children,
  destacada,
}: {
  etiqueta: string;
  children: React.ReactNode;
  destacada?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <dt className="text-[11px] font-medium text-slate-500">{etiqueta}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm tabular-nums text-slate-800",
          destacada ? "font-semibold" : "font-medium",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** Vista pura (sin hooks): renderiza el DTO de estado-unoee. Separada del panel
 * para poder verificar ambos casos (A y B) sin red. */
export function VistaEstadoPedidoUnoee({
  estado,
  loading,
  error,
  onReintentar,
}: {
  estado: EstadoPedidoUnoee | null;
  loading: boolean;
  error: string;
  onReintentar: () => void;
}) {
  return (
    <div
      className="mt-4 rounded-lg border border-slate-200 bg-white p-4"
      data-testid="panel-estado-unoee"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Estado del Pedido UnoEE</h3>
        <span className="text-[11px] text-slate-500">Lectura en vivo de Siesa</span>
      </div>

      {loading && <EstadoCarga texto="Consultando Siesa..." />}

      {!loading && error && (
        <p
          role="alert"
          className={cn(
            "mt-3 rounded-md border px-3 py-2 text-xs",
            CLASES_TONO_ESTADO.danger,
          )}
        >
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={onReintentar}>
            Reintentar
          </button>
        </p>
      )}

      {/* Caso B: sin vínculo ERP */}
      {!loading && !error && estado && !estado.vinculado && (
        <div
          role="alert"
          className={cn(
            "mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold",
            CLASES_TONO_ESTADO.danger,
          )}
        >
          <span>⚠️ {MENSAJE_PEDIDO_NO_ENVIADO}</span>
        </div>
      )}

      {/* Vinculado, pero Siesa no devuelve el documento */}
      {!loading && !error && estado?.vinculado && !estado.encontradoEnSiesa && (
        <p
          role="status"
          className={cn("mt-3 rounded-md border px-3 py-2 text-xs", CLASES_TONO_ESTADO.warning)}
        >
          El documento vinculado no existe en la compañía Siesa de este tenant.
        </p>
      )}

      {/* Caso A: cabecera + ítems */}
      {!loading && !error && estado?.vinculado && estado.encontradoEnSiesa && estado.cabecera && (
        <div className="mt-3 space-y-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <TarjetaCabecera etiqueta="Consecutivo" destacada>
              {estado.cabecera.consecutivo}
            </TarjetaCabecera>
            <TarjetaCabecera etiqueta="Estado">
              <EstadoBadge estado={estado.cabecera.estado} />
            </TarjetaCabecera>
            <TarjetaCabecera etiqueta="Valor total" destacada>
              {money(estado.cabecera.valorTotal)}
            </TarjetaCabecera>
            <TarjetaCabecera etiqueta="Descuentos">{money(estado.cabecera.descuentos)}</TarjetaCabecera>
            <TarjetaCabecera etiqueta="Impuestos">{money(estado.cabecera.impuestos)}</TarjetaCabecera>
          </dl>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead numeric>ID Item</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead numeric>Cantidad</TableHead>
                  <TableHead numeric>Precio unitario</TableHead>
                  <TableHead numeric>Subtotal</TableHead>
                  <TableHead numeric>Descuentos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead numeric>Cant. remisionada</TableHead>
                  <TableHead numeric>Cant. pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estado.items.length === 0 && (
                  <TableMessageRow
                    colSpan={10}
                    kind="empty"
                    title="El pedido en Siesa no tiene ítems."
                  />
                )}
                {estado.items.map((it) => (
                  <TableRow key={it.lineaRowId}>
                    <TableCell>{it.referencia ?? "—"}</TableCell>
                    <TableCell numeric>{it.itemRowId ?? "—"}</TableCell>
                    <TableCell>{it.descripcion ?? "—"}</TableCell>
                    <TableCell numeric>{formatCantidad(it.cantidad, null)}</TableCell>
                    <TableCell numeric>{money(it.precioUnitario)}</TableCell>
                    <TableCell numeric>{money(it.subtotal)}</TableCell>
                    <TableCell numeric>{money(it.descuentos)}</TableCell>
                    <TableCell>
                      <EstadoBadge estado={it.estado} />
                    </TableCell>
                    <TableCell numeric>{formatCantidad(it.cantidadRemisionada, null)}</TableCell>
                    <TableCell numeric>{formatCantidad(it.cantidadPendiente, null)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
