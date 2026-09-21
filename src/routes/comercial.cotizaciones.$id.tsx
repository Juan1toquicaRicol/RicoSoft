import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Ban, Check, FileOutput, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/data";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { useCotizacion, useAccionesCotizacion } from "@/hooks/use-comercial";

export const Route = createFileRoute("/comercial/cotizaciones/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.COTIZACIONES_VER),
  head: () => ({
    meta: [{ title: "Detalle de Cotización | RicoSoft" }],
  }),
  component: DetalleCotizacion,
});

function DetalleCotizacion() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { cotizacion, loading, error, refresh } = useCotizacion(id);
  const acciones = useAccionesCotizacion();
  const { user } = useSession();
  const [procesando, setProcesando] = useState(false);
  const [erpRowIdInput, setErpRowIdInput] = useState("");
  const [asignandoErp, setAsignandoErp] = useState(false);

  const puedeAprobar = hasPermission(user, PERMISOS_SISTEMA.COTIZACIONES_APROBAR);
  const puedeManipular = hasPermission(user, PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR);

  const asignarErp = async () => {
    const rowId = Number(erpRowIdInput.trim());
    if (!rowId || rowId <= 0) return;
    setAsignandoErp(true);
    try {
      await acciones.asignarErp(cotizacion!.id, rowId);
      toast.success("Documento ERP vinculado.");
      setErpRowIdInput("");
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible vincular el documento.");
    } finally {
      setAsignandoErp(false);
    }
  };

  const eliminarDefinitivamente = async () => {
    if (!cotizacion) return;
    if (
      !window.confirm(
        `Esto elimina PERMANENTEMENTE la cotización ${cotizacion.numeroFormateado}. No se puede deshacer. ¿Continuar?`,
      )
    ) {
      return;
    }
    try {
      await acciones.eliminar(cotizacion.id);
      toast.success(`Cotización ${cotizacion.numeroFormateado} eliminada.`);
      navigate({ to: "/comercial/gestion" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar la cotización.");
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
      <AppShell title="Cotización" description="Cargando...">
        <p className="text-xs text-slate-500">Cargando cotización...</p>
      </AppShell>
    );
  }

  if (error || !cotizacion) {
    return (
      <AppShell title="Cotización" description="No encontrada">
        <p className="text-xs text-slate-500">{error || "Cotización no encontrada."}</p>
        <Link to="/comercial/gestion" className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline">
          Volver a Gestión Comercial
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={cotizacion.numeroFormateado}
      description={`Cotización de ${cotizacion.clienteNombre}`}
      actions={
        <>
          <Link to="/comercial/gestion">
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Button>
          </Link>
          {puedeAprobar && cotizacion.estado === "BORRADOR" && (
            <Button
              size="sm"
              disabled={procesando}
              className="gap-1.5"
              onClick={() => ejecutar(() => acciones.enviar(cotizacion.id), "Cotización enviada.")}
            >
              <Send className="h-3.5 w-3.5" /> Enviar
            </Button>
          )}
          {puedeAprobar && cotizacion.estado === "ENVIADA" && (
            <>
              <Button
                size="sm"
                disabled={procesando}
                className="gap-1.5"
                onClick={() => ejecutar(() => acciones.aprobar(cotizacion.id), "Cotización aprobada.")}
              >
                <Check className="h-3.5 w-3.5" /> Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={procesando}
                className="gap-1.5"
                onClick={() => ejecutar(() => acciones.rechazar(cotizacion.id), "Cotización rechazada.")}
              >
                <X className="h-3.5 w-3.5" /> Rechazar
              </Button>
            </>
          )}
          {puedeAprobar && ["BORRADOR", "ENVIADA", "APROBADA"].includes(cotizacion.estado) && (
            <Button
              size="sm"
              variant="outline"
              disabled={procesando}
              className="gap-1.5 text-red-600"
              onClick={() => ejecutar(() => acciones.anular(cotizacion.id), "Cotización anulada.")}
            >
              <Ban className="h-3.5 w-3.5" /> Anular
            </Button>
          )}
          {puedeAprobar && ["BORRADOR", "ENVIADA", "APROBADA"].includes(cotizacion.estado) && (
            <Button
              size="sm"
              disabled={procesando}
              className="gap-1.5"
              onClick={() =>
                ejecutar(() => acciones.crearProforma(cotizacion.id), "Proforma creada desde la cotización.")
              }
            >
              <FileOutput className="h-3.5 w-3.5" /> Crear Proforma
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Encabezado</h3>
            <EstadoBadge estado={cotizacion.estado} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-slate-500">Cliente</dt>
            <dd className="font-medium">{cotizacion.clienteNombre}</dd>
            <dt className="text-slate-500">NIT</dt>
            <dd>{cotizacion.clienteNit || "—"}</dd>
            <dt className="text-slate-500">Vendedor</dt>
            <dd>{cotizacion.vendedorNombre || "—"}</dd>
            <dt className="text-slate-500">Fecha</dt>
            <dd>{new Date(cotizacion.fecha).toLocaleDateString("es-CO")}</dd>
            <dt className="text-slate-500">Fecha vencimiento</dt>
            <dd>
              {cotizacion.fechaVencimiento
                ? new Date(cotizacion.fechaVencimiento).toLocaleDateString("es-CO")
                : "—"}
            </dd>
            <dt className="text-slate-500">Moneda</dt>
            <dd>{cotizacion.moneda}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Documentos relacionados</h3>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Cotización</span>
              <Badge variant="outline">{cotizacion.numeroFormateado}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Proforma(s)</span>
              {cotizacion.proformas && cotizacion.proformas.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {cotizacion.proformas.map((p) => (
                    <Link key={p.id} to="/comercial/proformas/$id" params={{ id: p.id }}>
                      <Badge variant="outline">{p.numero}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400">Sin proforma</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Pedido(s)</span>
              {cotizacion.pedidos && cotizacion.pedidos.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {cotizacion.pedidos.map((p) => (
                    <Link key={p.id} to="/comercial/pedidos/$id" params={{ id: p.id }}>
                      <Badge variant="outline">PC-{String(p.numero).padStart(5, "0")}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <span className="text-slate-400">Sin pedido</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">ERP</span>
              {cotizacion.erpNumero ? (
                <span className="text-slate-400">{cotizacion.erpNumero}</span>
              ) : puedeManipular ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    value={erpRowIdInput}
                    onChange={(e) => setErpRowIdInput(e.target.value)}
                    placeholder="rowid CDV"
                    className="h-6 w-20 text-[11px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    disabled={asignandoErp}
                    onClick={() => void asignarErp()}
                  >
                    Vincular
                  </Button>
                </div>
              ) : (
                <span className="text-slate-400">Sin vincular</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {user?.isSuperadmin && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
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
              {cotizacion.items.map((it, idx) => {
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
          <span>{money(cotizacion.subtotal)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Descuentos</span>
          <span>{money(cotizacion.descuentos)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-slate-500">Impuestos</span>
          <span>{money(cotizacion.impuestos)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 py-1 font-semibold">
          <span>Total</span>
          <span>{money(cotizacion.total)}</span>
        </div>
      </div>

      {cotizacion.observaciones && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-xs">
          <h3 className="font-semibold text-slate-800">Observaciones</h3>
          <p className="mt-1 text-slate-600">{cotizacion.observaciones}</p>
        </div>
      )}
    </AppShell>
  );
}
