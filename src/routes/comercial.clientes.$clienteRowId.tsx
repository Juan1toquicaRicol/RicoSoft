import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Wallet,
  ShoppingCart,
  Truck,
  FileText,
  Package,
  MessageSquare,
  Route as RouteIcon,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";
import {
  useClienteResumen,
  usePedidosCliente,
  useRemisionesCliente,
  useFacturasCliente,
  useTrazabilidadPedido,
  useDetalleRemision,
  useCarteraCliente,
  useIndicadorCreditoCliente,
  type ClienteSiesa,
  type LineaPedidoSiesa,
  type LineaRemisionSiesa,
} from "@/hooks/use-cliente-360";
import { useHistoricoComprasCliente } from "@/hooks/use-ventas";
import {
  useSeguimientoOportunidad,
  ACCIONES_CONTACTO_VALIDAS,
  RESULTADOS_CONTACTO_VALIDOS,
  RESULTADOS_TERMINALES,
} from "@/hooks/use-oportunidades";

export const Route = createFileRoute("/comercial/clientes/$clienteRowId")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.VENTAS_VER),
  head: () => ({
    meta: [{ title: "Cliente 360 | RicoSoft" }],
  }),
  component: ClienteFichaPage,
});

function formatFecha(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO");
}

function formatFechaHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO");
}

/* ───────────────────────── Resumen ───────────────────────── */

function PanelResumen({ cliente }: { cliente: ClienteSiesa }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Identificación</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Razón social</dt>
            <dd className="font-semibold text-slate-900">{cliente.razonSocial ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">NIT</dt>
            <dd className="font-mono text-slate-800">{cliente.nit ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Estado</dt>
            <dd>
              {cliente.activoCliente ? (
                <Badge className="border-blue-200 bg-blue-50 text-blue-800" variant="outline">
                  Activo
                </Badge>
              ) : (
                <Badge className="bg-slate-900 text-white border-transparent" variant="outline">
                  Inactivo
                </Badge>
              )}
              {cliente.bloqueadoEstado && (
                <Badge className="ml-1.5 border-red-200 bg-red-50 text-red-700" variant="outline">
                  Bloqueado
                </Badge>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Vendedor</dt>
            <dd className="text-slate-800">{cliente.vendedorNombre ?? "Sin pedidos previos"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Clasificación</dt>
            <dd className="text-slate-800">{cliente.tipoClienteCodigo ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <div className="panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-slate-700">Condición comercial</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Condición de pago</dt>
            <dd className="text-slate-800">
              {cliente.condicionPagoDescripcion ?? cliente.condicionPagoCodigo ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Cupo de crédito</dt>
            <dd className="num font-semibold text-slate-900">{money(cliente.cupoCredito)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Bloqueo por cupo</dt>
            <dd>{cliente.bloqueadoCupo ? <BadgeAlerta /> : <BadgeOk />}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Bloqueo por mora</dt>
            <dd>{cliente.bloqueadoMora ? <BadgeAlerta /> : <BadgeOk />}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function BadgeAlerta() {
  return (
    <Badge className="gap-1 border-red-200 bg-red-50 text-red-700" variant="outline">
      <ShieldAlert className="h-3 w-3" /> Sí
    </Badge>
  );
}
function BadgeOk() {
  return (
    <Badge className="border-slate-200 bg-slate-50 text-slate-600" variant="outline">
      No
    </Badge>
  );
}

/* ───────────────────────── Crédito ───────────────────────── */

function PestanaCredito({ clienteRowId }: { clienteRowId: number }) {
  const { consultar, loading } = useIndicadorCreditoCliente();
  const [data, setData] = useState<Awaited<ReturnType<typeof consultar>> | null>(null);

  useEffect(() => {
    consultar(clienteRowId)
      .then(setData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  if (loading && !data) return <p className="p-6 text-sm text-slate-500">Cargando crédito...</p>;
  if (!data?.disponible) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Sin indicador de crédito disponible"
        description={data?.motivo ?? "Siesa no tiene este análisis registrado para el cliente."}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Snapshot de análisis crediticio (Siesa) — actualizado {formatFechaHora(data.actualizadoEn)}.
        No reemplaza la cartera en vivo (pestaña Cartera).
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Cupo de crédito", value: money(data.cupoCredito ?? 0) },
          { label: "Disponible", value: money(data.disponibleCredito ?? 0) },
          { label: "Cartera corriente", value: money(data.carteraCorriente ?? 0) },
          { label: "Cartera vencida", value: money(data.carteraVencida ?? 0) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase text-slate-500">{k.label}</p>
            <p className="num mt-1 text-lg font-bold text-slate-900">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {data.bloquearCupo && <BadgeAlertaTexto texto="Bloqueado por cupo" />}
        {data.bloquearMora && <BadgeAlertaTexto texto="Bloqueado por mora" />}
        {!data.bloquearCupo && !data.bloquearMora && (
          <Badge className="border-blue-200 bg-blue-50 text-blue-800" variant="outline">
            Sin bloqueos
          </Badge>
        )}
      </div>
    </div>
  );
}

function BadgeAlertaTexto({ texto }: { texto: string }) {
  return (
    <Badge className="gap-1 border-red-200 bg-red-50 text-red-700" variant="outline">
      <ShieldAlert className="h-3 w-3" /> {texto}
    </Badge>
  );
}

/* ───────────────────────── Cartera ───────────────────────── */

function PestanaCartera({ clienteRowId }: { clienteRowId: number }) {
  const { consultar, loading } = useCarteraCliente();
  const [data, setData] = useState<Awaited<ReturnType<typeof consultar>> | null>(null);

  useEffect(() => {
    consultar(clienteRowId)
      .then(setData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  if (loading && !data) return <p className="p-6 text-sm text-slate-500">Cargando cartera...</p>;
  if (!data?.disponible) {
    return (
      <EmptyState
        icon={Wallet}
        title="Sin cartera disponible"
        description={data?.motivo ?? "No fue posible consultar la cartera en Siesa."}
      />
    );
  }
  if (!data.items || data.items.length === 0) {
    return <EmptyState icon={Wallet} title="Cliente sin cartera pendiente" />;
  }

  return (
    <div className="space-y-3">
      {data.resumen && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">Vencido</p>
            <p className="num font-bold text-red-700">{money(data.resumen.vencido)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">Por vencer</p>
            <p className="num font-bold text-amber-700">{money(data.resumen.porVencer)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">Al día</p>
            <p className="num font-bold text-blue-700">{money(data.resumen.alDia)}</p>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vence</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="text-right">Días mora</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((it, i) => (
            <TableRow key={i}>
              <TableCell>{formatFecha(it.vence)}</TableCell>
              <TableCell className="num text-right">{money(it.saldo)}</TableCell>
              <TableCell className="num text-right">{it.diasMora}</TableCell>
              <TableCell>{it.estado}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ───────────────────────── Pedidos + Trazabilidad ───────────────────────── */

function PestanaPedidos({ clienteRowId }: { clienteRowId: number }) {
  const { items, total, page, pageSize, loading, disponible, motivo, cargar } = usePedidosCliente();
  const { consultar: consultarTrazabilidad, loading: cargandoTraza } = useTrazabilidadPedido();
  const [pedidoAbierto, setPedidoAbierto] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaPedidoSiesa[]>([]);

  useEffect(() => {
    cargar(clienteRowId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  const abrirTrazabilidad = async (pedidoRowId: number) => {
    setPedidoAbierto(pedidoRowId);
    try {
      const data = await consultarTrazabilidad(clienteRowId, pedidoRowId);
      setLineas(data.lineas ?? []);
    } catch {
      setLineas([]);
    }
  };

  if (loading && items.length === 0)
    return <p className="p-6 text-sm text-slate-500">Cargando pedidos...</p>;
  if (!disponible) {
    return <EmptyState icon={ShoppingCart} title="Sin pedidos disponibles" description={motivo} />;
  }
  if (items.length === 0) {
    return <EmptyState icon={ShoppingCart} title="Este cliente no tiene pedidos registrados" />;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Condición pago</TableHead>
            <TableHead className="text-right">Pedida</TableHead>
            <TableHead className="text-right">Remisionada</TableHead>
            <TableHead className="text-right">Facturada</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Alertas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow
              key={p.pedidoRowId}
              className="cursor-pointer"
              onClick={() => abrirTrazabilidad(p.pedidoRowId)}
            >
              <TableCell className="font-semibold">{p.numeroPedido}</TableCell>
              <TableCell>{formatFecha(p.fecha)}</TableCell>
              <TableCell>{p.vendedorNombre ?? "—"}</TableCell>
              <TableCell>{p.condicionPagoDescripcion ?? p.condicionPagoCodigo ?? "—"}</TableCell>
              <TableCell className="num text-right">{p.cantidadPedida}</TableCell>
              <TableCell className="num text-right">{p.cantidadRemisionada}</TableCell>
              <TableCell className="num text-right">{p.cantidadFacturada}</TableCell>
              <TableCell className="num text-right">{money(p.valorNeto)}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {p.retenidoCupo && <BadgeAlerta />}
                  {p.retenidoMora && <BadgeAlerta />}
                  {p.backorder && (
                    <Badge
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-700"
                    >
                      Backorder
                    </Badge>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginadorSimple
        page={page}
        pageSize={pageSize}
        total={total}
        onChange={(p) => cargar(clienteRowId, p)}
      />

      <Dialog open={pedidoAbierto !== null} onOpenChange={(o) => !o && setPedidoAbierto(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4" /> Trazabilidad del pedido
            </DialogTitle>
          </DialogHeader>
          {cargandoTraza ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : lineas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin líneas para este pedido.</p>
          ) : (
            <div className="space-y-4">
              {lineas.map((linea) => (
                <div key={linea.lineaRowId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">
                      {linea.descripcion ?? linea.referencia ?? `Ítem ${linea.itemRowId}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      Pedida {linea.cantidadPedida} · Remisionada {linea.cantidadRemisionada} ·
                      Facturada {linea.cantidadFacturada} · Pendiente{" "}
                      <span className="font-semibold text-slate-800">
                        {linea.cantidadPendiente}
                      </span>
                    </p>
                  </div>
                  {linea.remisiones.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-400">Sin remisiones todavía.</p>
                  ) : (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="pr-4 py-1">Remisión</th>
                          <th className="pr-4 py-1">Fecha</th>
                          <th className="pr-4 py-1">Cantidad</th>
                          <th className="pr-4 py-1">Factura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linea.remisiones.map((r, i) => (
                          <tr key={i}>
                            <td className="pr-4 py-1 font-mono">{r.remisionRowId}</td>
                            <td className="pr-4 py-1">{formatFecha(r.fechaRemision)}</td>
                            <td className="pr-4 py-1">{r.cantidad}</td>
                            <td className="pr-4 py-1">{r.facturaRowId ?? "Sin facturar"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Remisiones ───────────────────────── */

const ORIGEN_ETIQUETA: Record<LineaRemisionSiesa["origen"], string> = {
  PEDIDO: "Pedido",
  VENTA_DIRECTA: "Venta directa",
  DEVOLUCION: "Devolución",
};

function PestanaRemisiones({ clienteRowId }: { clienteRowId: number }) {
  const { items, total, page, pageSize, loading, disponible, motivo, cargar } =
    useRemisionesCliente();
  const { consultar: consultarDetalle, loading: cargandoDetalle } = useDetalleRemision();
  const [remisionAbierta, setRemisionAbierta] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaRemisionSiesa[]>([]);

  useEffect(() => {
    cargar(clienteRowId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  const abrirDetalle = async (remisionRowId: number) => {
    setRemisionAbierta(remisionRowId);
    try {
      const data = await consultarDetalle(clienteRowId, remisionRowId);
      setLineas(data.lineas ?? []);
    } catch {
      setLineas([]);
    }
  };

  if (loading && items.length === 0)
    return <p className="p-6 text-sm text-slate-500">Cargando remisiones...</p>;
  if (!disponible) {
    return <EmptyState icon={Truck} title="Sin remisiones disponibles" description={motivo} />;
  }
  if (items.length === 0) {
    return <EmptyState icon={Truck} title="Este cliente no tiene remisiones registradas" />;
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Remisión</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Factura</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead className="text-right">Valor</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow
              key={r.remisionRowId}
              className="cursor-pointer"
              onClick={() => abrirDetalle(r.remisionRowId)}
            >
              <TableCell className="font-mono">{r.remisionRowId}</TableCell>
              <TableCell>{formatFecha(r.fecha)}</TableCell>
              <TableCell>
                {r.numeroPedido ?? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                    Venta directa
                  </Badge>
                )}
              </TableCell>
              <TableCell>{r.facturaRowId ?? "Sin facturar"}</TableCell>
              <TableCell className="num text-right">{r.cantidadTotal}</TableCell>
              <TableCell className="num text-right">{money(r.valorNeto)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginadorSimple
        page={page}
        pageSize={pageSize}
        total={total}
        onChange={(p) => cargar(clienteRowId, p)}
      />

      <Dialog open={remisionAbierta !== null} onOpenChange={(o) => !o && setRemisionAbierta(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de la remisión {remisionAbierta}</DialogTitle>
          </DialogHeader>
          {cargandoDetalle ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Bodega</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l) => (
                  <TableRow key={l.movtoRowId}>
                    <TableCell>{l.descripcion ?? l.referencia ?? l.itemRowId}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          l.origen === "DEVOLUCION"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : l.origen === "VENTA_DIRECTA"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : "border-blue-200 bg-blue-50 text-blue-800"
                        }
                      >
                        {ORIGEN_ETIQUETA[l.origen]}
                      </Badge>
                    </TableCell>
                    <TableCell>{l.bodegaNombre ?? "—"}</TableCell>
                    <TableCell>{l.lote ?? "—"}</TableCell>
                    <TableCell className="num text-right">
                      {l.cantidad} {l.unidadMedida ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Facturas ───────────────────────── */

function PestanaFacturas({ clienteRowId }: { clienteRowId: number }) {
  const { items, total, page, pageSize, loading, disponible, motivo, cargar } =
    useFacturasCliente();

  useEffect(() => {
    cargar(clienteRowId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  if (loading && items.length === 0)
    return <p className="p-6 text-sm text-slate-500">Cargando facturas...</p>;
  if (!disponible) {
    return <EmptyState icon={FileText} title="Sin facturas disponibles" description={motivo} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState icon={FileText} title="Este cliente no tiene facturas en el período consultado" />
    );
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Referencia</TableHead>
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead className="text-right">Descuento</TableHead>
            <TableHead className="text-right">Neto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono">{f.id}</TableCell>
              <TableCell>{formatFecha(f.fecha)}</TableCell>
              <TableCell>{f.referencia ?? "—"}</TableCell>
              <TableCell className="num text-right">{money(f.bruto)}</TableCell>
              <TableCell className="num text-right">{money(f.dscto)}</TableCell>
              <TableCell className="num text-right font-semibold">{money(f.neto)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginadorSimple
        page={page}
        pageSize={pageSize}
        total={total}
        onChange={(p) => cargar(clienteRowId, p)}
      />
    </div>
  );
}

/* ───────────────────────── Productos comprados (reutiliza hook existente) ───────────────────────── */

function PestanaProductos({ clienteRowId }: { clienteRowId: number }) {
  const { consultar, loading } = useHistoricoComprasCliente();
  const [data, setData] = useState<Awaited<ReturnType<typeof consultar>> | null>(null);

  useEffect(() => {
    consultar(clienteRowId)
      .then(setData)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  if (loading && !data) return <p className="p-6 text-sm text-slate-500">Cargando productos...</p>;
  if (!data?.disponible || !data.productos || data.productos.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Sin productos comprados en los últimos 12 meses"
        description={data?.motivo}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Neto</TableHead>
          <TableHead className="text-right">N° compras</TableHead>
          <TableHead>Última compra</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.productos.map((p) => (
          <TableRow key={p.itemRowId}>
            <TableCell>{p.descripcion ?? p.referencia ?? p.itemRowId}</TableCell>
            <TableCell className="num text-right">
              {p.cantidadHistorica} {p.unidadMedida ?? ""}
            </TableCell>
            <TableCell className="num text-right">{money(p.netoHistorico)}</TableCell>
            <TableCell className="num text-right">{p.numCompras}</TableCell>
            <TableCell>{formatFecha(p.ultimaCompra)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ───────────────────────── Actividad comercial (reutiliza OportunidadSeguimiento) ───────────────────────── */

function PestanaActividad({
  clienteRowId,
  clienteNombre,
}: {
  clienteRowId: number;
  clienteNombre: string;
}) {
  const { seguimientos, loading, registrar, completar } = useSeguimientoOportunidad(clienteRowId);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({
    accion: "Llamada" as (typeof ACCIONES_CONTACTO_VALIDAS)[number],
    resultado: "Contactado" as (typeof RESULTADOS_CONTACTO_VALIDOS)[number],
    comentario: "",
    proximaAccion: "",
    proximoSeguimientoFecha: "",
  });
  const [guardando, setGuardando] = useState(false);

  const esTerminal = RESULTADOS_TERMINALES.has(form.resultado);

  const guardar = async () => {
    setGuardando(true);
    try {
      await registrar({
        clienteNombre,
        accion: form.accion,
        resultado: form.resultado,
        comentario: form.comentario || undefined,
        proximaAccion: esTerminal ? undefined : form.proximaAccion || undefined,
        proximoSeguimientoFecha: esTerminal
          ? undefined
          : form.proximoSeguimientoFecha
            ? new Date(form.proximoSeguimientoFecha).toISOString()
            : undefined,
      });
      toast.success("Seguimiento registrado.");
      setAbierto(false);
      setForm({ ...form, comentario: "", proximaAccion: "", proximoSeguimientoFecha: "" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el seguimiento.");
    } finally {
      setGuardando(false);
    }
  };

  const compromisosPendientes = seguimientos.filter(
    (s) => s.proximaAccion && s.proximoSeguimientoFecha && !s.compromisoCompletado,
  );
  const compromisosCompletados = seguimientos.filter((s) => s.compromisoCompletado);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAbierto(true)} className="gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> Registrar seguimiento
        </Button>
      </div>

      {compromisosPendientes.length > 0 && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500">
            <Clock className="h-3.5 w-3.5" /> Compromisos pendientes
          </h4>
          {compromisosPendientes.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{c.proximaAccion}</p>
                <p className="text-xs text-slate-500">
                  Programado para {formatFecha(c.proximoSeguimientoFecha)} · {c.usuario}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => completar(c.id)}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Completar
              </Button>
            </div>
          ))}
        </div>
      )}

      {compromisosCompletados.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase text-slate-500">Compromisos completados</h4>
          {compromisosCompletados.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-sm text-slate-700">{c.proximaAccion}</p>
              <p className="text-xs text-slate-400">
                Completado {formatFechaHora(c.compromisoCompletadoEn)} por{" "}
                {c.compromisoCompletadoPor}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase text-slate-500">Timeline</h4>
        {loading && seguimientos.length === 0 ? (
          <p className="text-sm text-slate-500">Cargando actividad...</p>
        ) : seguimientos.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Sin actividad comercial registrada todavía" />
        ) : (
          seguimientos.map((s) => (
            <div key={s.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Badge variant="outline">{s.accion}</Badge>
                <span>{s.resultado}</span>
                <span>· {formatFechaHora(s.createdAt)}</span>
                <span>· {s.usuario}</span>
              </div>
              {s.comentario && <p className="mt-1 text-sm text-slate-700">{s.comentario}</p>}
            </div>
          ))
        )}
      </div>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar seguimiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Acción</Label>
                <Select
                  value={form.accion}
                  onValueChange={(v) => setForm({ ...form, accion: v as typeof form.accion })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCIONES_CONTACTO_VALIDAS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Resultado</Label>
                <Select
                  value={form.resultado}
                  onValueChange={(v) => setForm({ ...form, resultado: v as typeof form.resultado })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULTADOS_CONTACTO_VALIDOS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Comentario</Label>
              <Textarea
                value={form.comentario}
                onChange={(e) => setForm({ ...form, comentario: e.target.value })}
              />
            </div>
            {!esTerminal && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Próxima acción (compromiso)</Label>
                  <Input
                    value={form.proximaAccion}
                    onChange={(e) => setForm({ ...form, proximaAccion: e.target.value })}
                    placeholder="Ej. Enviar cotización"
                  />
                </div>
                <div>
                  <Label>Fecha programada</Label>
                  <Input
                    type="date"
                    value={form.proximoSeguimientoFecha}
                    onChange={(e) => setForm({ ...form, proximoSeguimientoFecha: e.target.value })}
                  />
                </div>
              </div>
            )}
            <Button className="w-full" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar seguimiento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────── Paginador simple ───────────────────────── */

function PaginadorSimple({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-xs text-slate-500">
      <span>
        Página {page} de {totalPages} · {total} registros
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Página principal ───────────────────────── */

function ClienteFichaPage() {
  const { clienteRowId: clienteRowIdParam } = Route.useParams();
  const clienteRowId = Number(clienteRowIdParam);
  const { consultar, loading, error } = useClienteResumen();
  const [cliente, setCliente] = useState<ClienteSiesa | null>(null);
  const [noDisponible, setNoDisponible] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(clienteRowId)) return;
    consultar(clienteRowId)
      .then((data) => {
        if (data.disponible && data.cliente) {
          setCliente(data.cliente);
        } else {
          setNoDisponible(data.motivo ?? "Cliente no disponible.");
        }
      })
      .catch(() => setNoDisponible("No fue posible conectar con Siesa."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteRowId]);

  return (
    <AppShell
      title="Cliente 360"
      description="Vista comercial y financiera completa del cliente, con Siesa como fuente en vivo."
      actions={
        <Link to="/comercial/clientes">
          <Button variant="outline" size="sm" className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Button>
        </Link>
      }
    >
      {loading && !cliente && (
        <div className="flex items-center gap-2 p-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando ficha del cliente...
        </div>
      )}
      {(error || noDisponible) && !cliente && (
        <EmptyState
          icon={Building2}
          title="No se pudo cargar el cliente"
          description={error || noDisponible || undefined}
        />
      )}
      {cliente && (
        <div className="space-y-4">
          <div className="panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">{cliente.razonSocial}</h1>
            <p className="text-sm text-slate-500">
              NIT {cliente.nit} · Cliente Siesa #{cliente.clienteRowId}
            </p>
          </div>

          <Tabs defaultValue="resumen" className="mt-2">
            <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-slate-100 p-1">
              <TabsTrigger value="resumen" className="text-xs">
                Resumen
              </TabsTrigger>
              <TabsTrigger value="credito" className="text-xs">
                Crédito
              </TabsTrigger>
              <TabsTrigger value="cartera" className="text-xs">
                Cartera
              </TabsTrigger>
              <TabsTrigger value="pedidos" className="text-xs">
                Pedidos
              </TabsTrigger>
              <TabsTrigger value="remisiones" className="text-xs">
                Remisiones
              </TabsTrigger>
              <TabsTrigger value="facturas" className="text-xs">
                Facturas
              </TabsTrigger>
              <TabsTrigger value="productos" className="text-xs">
                Productos comprados
              </TabsTrigger>
              <TabsTrigger value="actividad" className="text-xs">
                Actividad comercial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="space-y-4 pt-4">
              <PanelResumen cliente={cliente} />
            </TabsContent>
            <TabsContent value="credito" className="pt-4">
              <PestanaCredito clienteRowId={clienteRowId} />
            </TabsContent>
            <TabsContent value="cartera" className="pt-4">
              <PestanaCartera clienteRowId={clienteRowId} />
            </TabsContent>
            <TabsContent value="pedidos" className="pt-4">
              <PestanaPedidos clienteRowId={clienteRowId} />
            </TabsContent>
            <TabsContent value="remisiones" className="pt-4">
              <PestanaRemisiones clienteRowId={clienteRowId} />
            </TabsContent>
            <TabsContent value="facturas" className="pt-4">
              <PestanaFacturas clienteRowId={clienteRowId} />
            </TabsContent>
            <TabsContent value="productos" className="pt-4">
              <PestanaProductos clienteRowId={clienteRowId} />
            </TabsContent>
            <TabsContent value="actividad" className="pt-4">
              <PestanaActividad
                clienteRowId={clienteRowId}
                clienteNombre={cliente.razonSocial ?? "Cliente"}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppShell>
  );
}
