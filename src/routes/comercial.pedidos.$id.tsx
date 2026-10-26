import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ban, Check, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/data";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { usePedidoComercial, useAccionesPedido } from "@/hooks/use-comercial";
import { PanelEstadoPedidoUnoee } from "@/components/panel-estado-pedido-unoee";

export const Route = createFileRoute("/comercial/pedidos/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER),
  head: () => ({
    meta: [{ title: "Detalle de Pedido | RicoSoft" }],
  }),
  component: DetallePedido,
});

function DetallePedido() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { pedido, loading, error, refresh } = usePedidoComercial(id);
  const acciones = useAccionesPedido();
  const { user } = useSession();
  const [procesando, setProcesando] = useState(false);

  const puedeConfirmar = hasPermission(user, PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_CONFIRMAR);

  const eliminarDefinitivamente = async () => {
    if (!pedido) return;
    if (
      !window.confirm(
        `Esto elimina PERMANENTEMENTE el pedido ${pedido.numeroFormateado}. No se puede deshacer. ¿Continuar?`,
      )
    ) {
      return;
    }
    try {
      await acciones.eliminar(pedido.id);
      toast.success(`Pedido ${pedido.numeroFormateado} eliminado.`);
      navigate({ to: "/comercial/gestion" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar el pedido.");
    }
  };

  const ejecutar = async (fn: () => Promise<unknown>, mensajeExito: string) => {
    setProcesando(true);
    try {
      await fn();
      toast.success(mensajeExito);
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible completar la acción.");
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Pedido" description="Cargando...">
        <p className="text-xs text-slate-500">Cargando pedido...</p>
      </AppShell>
    );
  }

  if (error || !pedido) {
    return (
      <AppShell title="Pedido" description="No encontrado">
        <p className="text-xs text-slate-500">{error || "Pedido no encontrado."}</p>
        <Link
          to="/comercial/gestion"
          className="mt-2 inline-block text-xs font-semibold text-estado-info-fg hover:underline"
        >
          Volver a Gestión Comercial
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={pedido.numeroFormateado}
      description={`Pedido comercial de ${pedido.clienteNombre}`}
      actions={
        <>
          <Link to="/comercial/gestion">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Button>
          </Link>
          {puedeConfirmar && pedido.estado === "BORRADOR" && (
            <Button
              size="sm"
              disabled={procesando}
              className="gap-1.5"
              onClick={() => ejecutar(() => acciones.confirmar(pedido.id), "Pedido confirmado.")}
            >
              <Check className="h-3.5 w-3.5" /> Confirmar
            </Button>
          )}
          {puedeConfirmar && pedido.estado === "CONFIRMADO" && (
            <Button
              size="sm"
              disabled={procesando}
              className="gap-1.5"
              onClick={() =>
                ejecutar(
                  () => acciones.marcarListoParaErp(pedido.id),
                  "Pedido marcado listo para ERP.",
                )
              }
            >
              <PackageCheck className="h-3.5 w-3.5" /> Marcar listo para ERP
            </Button>
          )}
          {puedeConfirmar &&
            ["BORRADOR", "CONFIRMADO", "LISTO_PARA_ERP"].includes(pedido.estado) && (
              <Button
                size="sm"
                variant="outline"
                disabled={procesando}
                className="gap-1.5 text-estado-danger-fg hover:bg-estado-danger-bg"
                onClick={() => ejecutar(() => acciones.anular(pedido.id), "Pedido anulado.")}
              >
                <Ban className="h-3.5 w-3.5" /> Anular
              </Button>
            )}
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Encabezado</h3>
            <EstadoBadge estado={pedido.estado} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-slate-500">Cliente</dt>
            <dd className="font-medium">{pedido.clienteNombre}</dd>
            <dt className="text-slate-500">NIT</dt>
            <dd>{pedido.clienteNit || "—"}</dd>
            <dt className="text-slate-500">Vendedor</dt>
            <dd>{pedido.vendedorNombre || "—"}</dd>
            <dt className="text-slate-500">Fecha</dt>
            <dd>{new Date(pedido.fecha).toLocaleDateString("es-CO")}</dd>
            <dt className="text-slate-500">Moneda</dt>
            <dd>{pedido.moneda}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Documentos relacionados</h3>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cotización</span>
              {pedido.cotizacion ? (
                <Link to="/comercial/cotizaciones/$id" params={{ id: pedido.cotizacion.id }}>
                  <Badge variant="outline">
                    COT-{String(pedido.cotizacion.numero).padStart(5, "0")}
                  </Badge>
                </Link>
              ) : (
                <span className="text-slate-500">Sin cotización</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Proforma</span>
              {pedido.proforma ? (
                <Link to="/comercial/proformas/$id" params={{ id: pedido.proforma.id }}>
                  <Badge variant="outline">{pedido.proforma.numero}</Badge>
                </Link>
              ) : (
                <span className="text-slate-500">Sin proforma</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Pedido</span>
              <Badge variant="outline">{pedido.numeroFormateado}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">ERP</span>
              <span className="flex items-center gap-2">
                {pedido.erpNumero && (
                  <span className="tabular-nums text-slate-700">{pedido.erpNumero}</span>
                )}
                <EstadoBadge
                  estado={
                    pedido.erpNumero || pedido.erpRowId ? "Vinculado" : "Pendiente de envío a ERP"
                  }
                />
              </span>
            </div>
          </div>
        </div>
      </div>

      <PanelEstadoPedidoUnoee pedidoId={pedido.id} />

      {user?.isSuperadmin && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-estado-danger-fg hover:bg-estado-danger-bg hover:text-estado-danger-fg"
            disabled={procesando}
            onClick={() => void eliminarDefinitivamente()}
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar definitivamente
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Descuento</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead>Bodega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pedido.items.map((it, idx) => {
                const subLinea = it.cantidad * it.precioUnitario * (1 - it.descuentoPct / 100);
                return (
                  <TableRow key={it.id ?? idx}>
                    <TableCell>{it.referencia || "—"}</TableCell>
                    <TableCell>{it.descripcion}</TableCell>
                    <TableCell className="text-right">{it.cantidad}</TableCell>
                    <TableCell className="text-right">{money(it.precioUnitario)}</TableCell>
                    <TableCell className="text-right">{it.descuentoPct}%</TableCell>
                    <TableCell className="text-right">{it.ivaPct}%</TableCell>
                    <TableCell className="text-right">{money(subLinea)}</TableCell>
                    <TableCell>{it.bodega || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-4 ml-auto w-full max-w-xs rounded-lg border border-slate-200 bg-white p-4 text-xs">
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Subtotal</span>
          <span>{money(pedido.subtotal)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Descuentos</span>
          <span>{money(pedido.descuentos)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Impuestos</span>
          <span>{money(pedido.impuestos)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 py-1 font-semibold">
          <span>Total</span>
          <span>{money(pedido.total)}</span>
        </div>
      </div>

      {pedido.observaciones && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs">
          <h3 className="font-semibold text-slate-800">Observaciones</h3>
          <p className="mt-1 text-slate-600">{pedido.observaciones}</p>
        </div>
      )}
    </AppShell>
  );
}
