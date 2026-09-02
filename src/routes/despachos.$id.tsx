import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Circle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDespacho, type EstadoDespacho } from "@/hooks/use-despachos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { compact, money } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/despachos/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.DESPACHOS_VER),
  head: () => ({
    meta: [{ title: "Detalle de Despacho | RicoSoft" }],
  }),
  component: DetalleDespacho,
});

const SIGUIENTES_ESTADOS: Record<EstadoDespacho, EstadoDespacho[]> = {
  RECIBIDO: ["PREPARANDO", "CANCELADO"],
  PREPARANDO: ["PREPARADO", "CANCELADO"],
  PREPARADO: ["PENDIENTE_CARGUE", "CANCELADO"],
  PENDIENTE_CARGUE: ["CARGANDO", "CANCELADO"],
  CARGANDO: ["CARGADO", "CANCELADO"],
  CARGADO: ["DESPACHADO", "CANCELADO"],
  DESPACHADO: ["EN_TRANSITO"],
  EN_TRANSITO: ["ENTREGADO", "ENTREGA_PARCIAL", "DEVUELTO"],
  ENTREGADO: [],
  ENTREGA_PARCIAL: ["DEVUELTO"],
  DEVUELTO: [],
  CANCELADO: [],
};

const ETAPAS_TIMELINE: { estado: EstadoDespacho; label: string }[] = [
  { estado: "RECIBIDO", label: "Pedido recibido" },
  { estado: "PREPARANDO", label: "Preparación iniciada" },
  { estado: "PREPARADO", label: "Pedido preparado" },
  { estado: "PENDIENTE_CARGUE", label: "Pendiente de cargue" },
  { estado: "CARGANDO", label: "Cargue iniciado" },
  { estado: "CARGADO", label: "Cargado" },
  { estado: "DESPACHADO", label: "Despachado" },
  { estado: "EN_TRANSITO", label: "En tránsito" },
  { estado: "ENTREGADO", label: "Entregado" },
];

const TIPOS_NOVEDAD = [
  "PRODUCTO_FALTANTE",
  "DIRECCION_INCORRECTA",
  "CLIENTE_AUSENTE",
  "VEHICULO_NO_DISPONIBLE",
  "MERCANCIA_AVERIADA",
  "ENTREGA_PARCIAL",
  "RECHAZO_CLIENTE",
  "DEVOLUCION",
  "OTRA",
];

function DialogoCambiarEstado({
  estadoActual,
  siguiente,
  abierto,
  onOpenChange,
  onConfirmar,
}: {
  estadoActual: EstadoDespacho;
  siguiente: EstadoDespacho;
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirmar: (datos: Record<string, string>) => Promise<void>;
}) {
  const [vehiculoPlaca, setVehiculoPlaca] = useState("");
  const [conductorNombre, setConductorNombre] = useState("");
  const [recibidoPor, setRecibidoPor] = useState("");
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);

  const requiereVehiculo = siguiente === "CARGANDO";
  const requiereRecibidoPor = siguiente === "ENTREGADO" || siguiente === "ENTREGA_PARCIAL";

  const handleConfirmar = async () => {
    setEnviando(true);
    try {
      await onConfirmar({ vehiculoPlaca, conductorNombre, recibidoPor, observacion });
      onOpenChange(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar a "{siguiente}"</DialogTitle>
          <DialogDescription>De {estadoActual} a {siguiente}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {requiereVehiculo && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Placa del vehículo</Label>
                <Input value={vehiculoPlaca} onChange={(e) => setVehiculoPlaca(e.target.value)} className="h-9 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-slate-500 uppercase">Conductor</Label>
                <Input value={conductorNombre} onChange={(e) => setConductorNombre(e.target.value)} className="h-9 text-xs" />
              </div>
            </>
          )}
          {requiereRecibidoPor && (
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-slate-500 uppercase">Recibido por</Label>
              <Input value={recibidoPor} onChange={(e) => setRecibidoPor(e.target.value)} className="h-9 text-xs" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Observación (opcional)</Label>
            <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleConfirmar}
            disabled={enviando || (requiereVehiculo && (!vehiculoPlaca || !conductorNombre)) || (requiereRecibidoPor && !recibidoPor)}
          >
            {enviando ? "Confirmando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoNovedad({
  abierto,
  onOpenChange,
  onCrear,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onCrear: (tipo: string, descripcion: string) => Promise<void>;
}) {
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleCrear = async () => {
    if (!tipo || !descripcion) return;
    setEnviando(true);
    try {
      await onCrear(tipo, descripcion);
      onOpenChange(false);
      setTipo("");
      setDescripcion("");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar novedad</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecciona un tipo" /></SelectTrigger>
              <SelectContent>
                {TIPOS_NOVEDAD.map((t) => (
                  <SelectItem key={t} value={t}>{t.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCrear} disabled={!tipo || !descripcion || enviando}>
            {enviando ? "Registrando..." : "Registrar novedad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetalleDespacho() {
  const { id } = Route.useParams();
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.DESPACHOS_GESTIONAR);
  const { detalle, loading, actualizarEstado, crearNovedad, resolverNovedad } = useDespacho(id);
  const [siguienteElegido, setSiguienteElegido] = useState<EstadoDespacho | null>(null);
  const [novedadAbierta, setNovedadAbierta] = useState(false);

  if (loading) return <AppShell title="Detalle de Despacho"><p className="text-xs text-slate-500">Cargando...</p></AppShell>;
  if (!detalle) return <AppShell title="Detalle de Despacho"><p className="text-xs text-slate-500">Despacho no encontrado.</p></AppShell>;

  const { despacho, lineas, novedades, eventos } = detalle;
  const siguientes = SIGUIENTES_ESTADOS[despacho.estado];

  const handleConfirmarEstado = async (datos: Record<string, string>) => {
    if (!siguienteElegido) return;
    try {
      await actualizarEstado({
        estado: siguienteElegido,
        vehiculoPlaca: datos.vehiculoPlaca || undefined,
        conductorNombre: datos.conductorNombre || undefined,
        recibidoPor: datos.recibidoPor || undefined,
        observacion: datos.observacion || undefined,
      });
      toast.success(`Estado actualizado a "${siguienteElegido}".`);
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar el estado.");
    }
  };

  const indiceEtapaActual = ETAPAS_TIMELINE.findIndex((e) => e.estado === despacho.estado);

  return (
    <AppShell
      title="Detalle de Despacho"
      description={`${despacho.clienteNombre} — ${despacho.siesaDocReferencia ?? despacho.siesaDocRowId}`}
    >
      <Link to="/despachos" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Despachos
      </Link>

      <div className="panel mb-4 p-5 bg-white border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">{despacho.clienteNombre}</h2>
            <p className="text-xs text-slate-500">
              Documento {despacho.siesaDocReferencia ?? despacho.siesaDocRowId} · {money(despacho.valorPedido)}
              {despacho.direccionEntrega && <> · {despacho.direccionEntrega}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <EstadoBadge estado={despacho.estado} />
            {puedeGestionar && (
              <>
                <Button size="sm" variant="outline" onClick={() => setNovedadAbierta(true)}>
                  <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Novedad
                </Button>
                {siguientes.length > 0 && (
                  <Select value="" onValueChange={(v) => setSiguienteElegido(v as EstadoDespacho)}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Cambiar estado" /></SelectTrigger>
                    <SelectContent>
                      {siguientes.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {siguienteElegido && (
        <DialogoCambiarEstado
          estadoActual={despacho.estado}
          siguiente={siguienteElegido}
          abierto={!!siguienteElegido}
          onOpenChange={(v) => !v && setSiguienteElegido(null)}
          onConfirmar={handleConfirmarEstado}
        />
      )}
      <DialogoNovedad
        abierto={novedadAbierta}
        onOpenChange={setNovedadAbierta}
        onCrear={async (tipo, descripcion) => {
          try {
            await crearNovedad(tipo, descripcion);
            toast.success("Novedad registrada.");
          } catch (err: any) {
            toast.error(err.message || "No se pudo registrar la novedad.");
          }
        }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs lg:col-span-1">
          <h3 className="text-sm font-bold text-slate-900">Línea de tiempo</h3>
          <div className="mt-4 space-y-3">
            {ETAPAS_TIMELINE.map((etapa, i) => {
              const completada = indiceEtapaActual >= 0 && i < indiceEtapaActual;
              const actual = i === indiceEtapaActual;
              const evento = eventos.find((e) => e.accion === `ESTADO_${etapa.estado}` || (etapa.estado === "RECIBIDO" && e.accion === "PEDIDO_RECIBIDO"));
              return (
                <div key={etapa.estado} className="flex items-start gap-2">
                  {completada || actual ? (
                    <Check className={cn("mt-0.5 h-4 w-4 shrink-0", actual ? "text-blue-600" : "text-emerald-600")} />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  )}
                  <div>
                    <p className={cn("text-xs font-semibold", completada || actual ? "text-slate-800" : "text-slate-400")}>
                      {etapa.label}
                    </p>
                    {evento && (
                      <p className="text-[11px] text-slate-500">
                        {new Date(evento.createdAt).toLocaleString("es-CO")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            {(despacho.estado === "DEVUELTO" || despacho.estado === "CANCELADO" || despacho.estado === "ENTREGA_PARCIAL") && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-xs font-semibold text-red-700">{despacho.estado}</p>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900">Productos</h3>
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">Producto</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">Solicitado</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">Preparado</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">Entregado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map((l) => (
                    <TableRow key={l.id} className="hover:bg-slate-50/80">
                      <TableCell className="text-xs font-semibold text-slate-800">
                        {l.descripcion ?? `Ítem ${l.itemRowId}`}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-600">
                        {compact(l.cantidadSolicitada)} {l.unidadMedida ?? ""}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-600">
                        {l.cantidadPreparada !== null ? compact(l.cantidadPreparada) : "—"}
                      </TableCell>
                      <TableCell className="num text-right text-xs text-slate-600">
                        {l.cantidadEntregada !== null ? compact(l.cantidadEntregada) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {novedades.length > 0 && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900">Novedades</h3>
              <div className="mt-3 space-y-2">
                {novedades.map((n) => (
                  <div key={n.id} className={cn("rounded-lg border p-3", n.estado === "ABIERTA" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-800">{n.tipo.replaceAll("_", " ")}</p>
                      <EstadoBadge estado={n.estado} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{n.descripcion}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {n.usuario} · {new Date(n.createdAt).toLocaleString("es-CO")}
                    </p>
                    {n.estado === "ABIERTA" && puedeGestionar && (
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => resolverNovedad(n.id)}>
                        Marcar como resuelta
                      </Button>
                    )}
                    {n.estado === "RESUELTA" && (
                      <p className="mt-1 text-[11px] text-emerald-700">
                        Resuelta por {n.resueltaPor} — {n.observacionResolucion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
