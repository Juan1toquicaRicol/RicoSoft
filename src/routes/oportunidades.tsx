import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Info, Loader2, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOportunidadComercial, type OportunidadCliente } from "@/hooks/use-oportunidades";
import { useHistoricoComprasCliente } from "@/hooks/use-ventas";
import {
  useSeguimientoOportunidad,
  useProximosSeguimientos,
  ACCIONES_CONTACTO,
  RESULTADOS_CONTACTO,
  RESULTADOS_TERMINALES,
  ETIQUETA_RESULTADO,
  type AccionContacto,
  type ResultadoContacto,
} from "@/hooks/use-oportunidades";
import { formatCantidad, money } from "@/lib/data";

export const Route = createFileRoute("/oportunidades")({
  head: () => ({
    meta: [
      { title: "Oportunidades | RicoSoft" },
      {
        name: "description",
        content:
          "Oportunidad comercial: qué le podemos vender a cada cliente con el inventario disponible hoy, según su historial real de compras — con seguimiento comercial.",
      },
      { property: "og:title", content: "Oportunidades | RicoSoft" },
      {
        property: "og:description",
        content: "A quién le podemos vender el inventario disponible.",
      },
    ],
  }),
  component: Oportunidades,
});

function Oportunidades() {
  const { oportunidad, loading } = useOportunidadComercial();
  const {
    pendientes,
    loading: cargandoPendientes,
    refresh: refrescarPendientes,
  } = useProximosSeguimientos();

  return (
    <AppShell
      title="Oportunidades"
      description="Clientes que ya compran productos que tenemos disponibles hoy — según su historial real de compras en Siesa"
    >
      {/* "¿Qué debo hacer hoy?" primero — antes que la lista completa de oportunidades. */}
      {!cargandoPendientes && pendientes.length > 0 && (
        <div className="mb-4 panel p-5 bg-white border-slate-200 shadow-2xs">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Phone className="h-4 w-4 text-blue-700" /> Próximos seguimientos
          </h2>
          <p className="text-xs text-slate-500">Lo que quedó pendiente de contactar</p>
          <ul className="mt-3 space-y-2">
            {pendientes.slice(0, 8).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-800">{s.clienteNombre}</p>
                  <p className="text-[11px] text-slate-500">{s.proximaAccion}</p>
                </div>
                <span className="num shrink-0 font-semibold text-slate-600">
                  {s.proximoSeguimientoFecha
                    ? new Date(s.proximoSeguimientoFecha).toLocaleDateString("es-CO", {
                        timeZone: "UTC",
                      })
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && <p className="text-xs text-slate-500">Cargando...</p>}

      {!loading && !oportunidad.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {oportunidad.motivo ?? "Oportunidad comercial no disponible."}
        </div>
      )}

      {!loading && oportunidad.disponible && (
        <>
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">A quién le podemos vender</h2>
                <p className="text-xs text-slate-500">
                  Clientes que ya compran productos que tenemos disponibles hoy — hasta ~1 mes de su
                  ritmo de compra histórico
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold text-slate-500">Potencial total</p>
                <p className="num text-lg font-bold text-blue-700">
                  {money(oportunidad.totalPotencialVenta ?? 0)}
                </p>
              </div>
            </div>

            {(oportunidad.clientes ?? []).length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">
                No hay coincidencias entre lo disponible y el historial de compras reciente.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {(oportunidad.clientes ?? []).map((cl) => (
                  <TarjetaOportunidadCliente
                    key={cl.clienteRowId ?? cl.clienteNombre}
                    cliente={cl}
                    onSeguimientoRegistrado={refrescarPendientes}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Cruza qué le compra cada cliente (últimos 12 meses reales) contra qué hay disponible
              hoy — la cantidad ofertable se limita a ~1 mes de ritmo histórico de compra, nunca
              más. El seguimiento comercial (llamadas, cotizaciones, próxima acción) es una capa
              ligera de gestión de contacto, no un CRM completo.
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}

const TABS = ["compras", "seguimiento"] as const;
type Tab = (typeof TABS)[number];

function TarjetaOportunidadCliente({
  cliente: cl,
  onSeguimientoRegistrado,
}: {
  cliente: OportunidadCliente;
  onSeguimientoRegistrado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tab, setTab] = useState<Tab>("compras");
  const clienteRowId = cl.clienteRowId;

  const { consultar: consultarHistorico, loading: cargandoHistorico } =
    useHistoricoComprasCliente();
  const [historico, setHistorico] = useState<Awaited<ReturnType<typeof consultarHistorico>> | null>(
    null,
  );

  const seguimiento = useSeguimientoOportunidad(abierto ? clienteRowId : null);

  const handleToggle = async () => {
    const next = !abierto;
    setAbierto(next);
    if (next && !historico && clienteRowId !== null) {
      try {
        setHistorico(await consultarHistorico(clienteRowId));
      } catch {
        // El hook ya expone `error`.
      }
    }
  };

  return (
    <div className="rounded-xl border border-slate-200">
      <div
        className="flex cursor-pointer items-center justify-between gap-3 p-4"
        onClick={handleToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
          />
          <span className="min-w-0 truncate text-xs font-bold text-slate-800">
            {cl.clienteNombre ?? "Cliente sin nombre"}
          </span>
          {seguimiento.estadoActual && (
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-50 text-[10px] text-slate-600"
            >
              {ETIQUETA_RESULTADO[seguimiento.estadoActual]}
            </Badge>
          )}
        </div>
        <span className="num shrink-0 text-xs font-bold text-blue-700">
          {money(cl.potencialTotal)}
        </span>
      </div>

      {!abierto && (
        <ul className="space-y-1 px-4 pb-4">
          {cl.productos.slice(0, 3).map((p) => (
            <li key={p.itemRowId} className="flex items-center justify-between text-xs">
              <span className="min-w-0 truncate text-slate-600">
                {p.descripcion ?? "Producto sin descripción"}
              </span>
              <span className="num shrink-0 text-slate-500">
                {formatCantidad(p.cantidadOfertable, p.unidadMedida)} · {money(p.potencialVenta)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <div className="border-t border-slate-200 p-4">
          <div className="mb-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Productos con oportunidad
            </p>
            <ul className="mt-1 space-y-1">
              {cl.productos.map((p) => (
                <li key={p.itemRowId} className="flex items-center justify-between text-xs">
                  <span className="min-w-0 truncate text-slate-600">
                    {p.descripcion ?? "Producto sin descripción"}
                    {p.referencia && <span className="text-slate-400"> · {p.referencia}</span>}
                  </span>
                  <span className="num shrink-0 text-slate-500">
                    {formatCantidad(p.cantidadOfertable, p.unidadMedida)} ·{" "}
                    {money(p.potencialVenta)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex gap-4 border-b border-slate-200 text-xs font-semibold text-slate-500">
            <button
              type="button"
              onClick={() => setTab("compras")}
              className={`cursor-pointer border-b-2 pb-2 ${tab === "compras" ? "border-blue-700 text-blue-700" : "border-transparent hover:text-slate-800"}`}
            >
              Histórico de compras
            </button>
            <button
              type="button"
              onClick={() => setTab("seguimiento")}
              className={`cursor-pointer border-b-2 pb-2 ${tab === "seguimiento" ? "border-blue-700 text-blue-700" : "border-transparent hover:text-slate-800"}`}
            >
              Seguimiento comercial
            </button>
          </div>

          {tab === "compras" && (
            <div className="pt-3">
              {cargandoHistorico && !historico && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando historial de compras...
                </p>
              )}
              {historico && !historico.disponible && (
                <p className="text-xs text-slate-500">
                  {historico.motivo ?? "Sin datos disponibles."}
                </p>
              )}
              {historico?.disponible &&
                ((historico.productos ?? []).length === 0 ? (
                  <p className="text-xs text-slate-500">Sin compras registradas en el período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-slate-100/80">
                        <TableRow className="hover:bg-slate-100/80">
                          <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            Producto
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            Cantidad
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            Valor histórico
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            Veces
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                            Última compra
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(historico.productos ?? []).map((p) => (
                          <TableRow key={p.itemRowId}>
                            <TableCell className="text-xs text-slate-700">
                              {p.descripcion ?? p.referencia ?? "Producto sin descripción"}
                            </TableCell>
                            <TableCell className="num text-right text-xs text-slate-600">
                              {formatCantidad(p.cantidadHistorica, p.unidadMedida)}
                            </TableCell>
                            <TableCell className="num text-right text-xs text-slate-600">
                              {money(p.netoHistorico)}
                            </TableCell>
                            <TableCell className="num text-right text-xs text-slate-600">
                              {p.numCompras}
                            </TableCell>
                            <TableCell className="text-right text-xs text-slate-500">
                              {new Date(p.ultimaCompra).toLocaleDateString("es-CO", {
                                timeZone: "UTC",
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
            </div>
          )}

          {tab === "seguimiento" && (
            <SeguimientoComercial
              clienteNombre={cl.clienteNombre ?? "Cliente sin nombre"}
              seguimiento={seguimiento}
              onRegistrado={onSeguimientoRegistrado}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SeguimientoComercial({
  clienteNombre,
  seguimiento,
  onRegistrado,
}: {
  clienteNombre: string;
  seguimiento: ReturnType<typeof useSeguimientoOportunidad>;
  onRegistrado: () => void;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [accion, setAccion] = useState<AccionContacto>("Llamada");
  const [resultado, setResultado] = useState<ResultadoContacto>("Contactado");
  const [comentario, setComentario] = useState("");
  const [proximaAccion, setProximaAccion] = useState("");
  const [proximaFecha, setProximaFecha] = useState("");
  const [guardando, setGuardando] = useState(false);

  const esTerminal = RESULTADOS_TERMINALES.has(resultado);

  const handleGuardar = async () => {
    if (!esTerminal && (!proximaAccion.trim() || !proximaFecha)) {
      toast.error(
        "Una oportunidad activa requiere próxima acción y fecha (solo se omiten si el resultado es 'No interesado' o 'Venta realizada').",
      );
      return;
    }
    setGuardando(true);
    try {
      await seguimiento.registrar({
        clienteNombre,
        accion,
        resultado,
        comentario: comentario.trim() || undefined,
        proximaAccion: esTerminal ? undefined : proximaAccion.trim(),
        proximoSeguimientoFecha: esTerminal ? undefined : new Date(proximaFecha).toISOString(),
      });
      toast.success("Seguimiento registrado.");
      setMostrarForm(false);
      setComentario("");
      setProximaAccion("");
      setProximaFecha("");
      onRegistrado();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el seguimiento.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="pt-3">
      {seguimiento.proximoSeguimiento && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
          <p className="font-bold text-blue-800">
            Próximo paso: {seguimiento.proximoSeguimiento.accion}
          </p>
          <p className="text-blue-700">
            {new Date(seguimiento.proximoSeguimiento.fecha).toLocaleDateString("es-CO", {
              timeZone: "UTC",
            })}
          </p>
        </div>
      )}

      {!mostrarForm ? (
        <Button size="sm" variant="outline" onClick={() => setMostrarForm(true)}>
          + Registrar seguimiento
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Acción de contacto</Label>
              <Select value={accion} onValueChange={(v) => setAccion(v as AccionContacto)}>
                <SelectTrigger className="h-8 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {ACCIONES_CONTACTO.map((a) => (
                    <SelectItem key={a} value={a} className="text-xs">
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Resultado</Label>
              <Select value={resultado} onValueChange={(v) => setResultado(v as ResultadoContacto)}>
                <SelectTrigger className="h-8 bg-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {RESULTADOS_CONTACTO.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {ETIQUETA_RESULTADO[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Comentario (opcional)</Label>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
              className="bg-white text-xs"
            />
          </div>
          {!esTerminal && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Próxima acción *</Label>
                <Input
                  value={proximaAccion}
                  onChange={(e) => setProximaAccion(e.target.value)}
                  placeholder="Ej. Enviar cotización"
                  className="h-8 bg-white text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Fecha de seguimiento *</Label>
                <Input
                  type="date"
                  value={proximaFecha}
                  onChange={(e) => setProximaFecha(e.target.value)}
                  className="h-8 bg-white text-xs"
                />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMostrarForm(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Historial</p>
        {seguimiento.loading && seguimiento.seguimientos.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">Cargando...</p>
        )}
        {seguimiento.seguimientos.length === 0 && !seguimiento.loading ? (
          <p className="mt-1 text-xs text-slate-500">Sin seguimiento registrado todavía.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {seguimiento.seguimientos.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">
                    {s.accion} · {ETIQUETA_RESULTADO[s.resultado]}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(s.createdAt).toLocaleString("es-CO", { timeZone: "UTC" })}
                  </span>
                </div>
                {s.comentario && <p className="mt-1 text-slate-600">{s.comentario}</p>}
                <p className="mt-1 text-[11px] text-slate-400">{s.usuario}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
