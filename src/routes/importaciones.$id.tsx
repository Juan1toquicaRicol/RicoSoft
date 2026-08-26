import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Package, Plus, Ship } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { BarraVencimiento } from "@/components/ui/barra-vencimiento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useOrdenCompraIntl,
  type CrearLoteInput,
  type LiquidarCosteoInput,
  type LoteImportacion,
} from "@/hooks/use-importaciones";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { money } from "@/lib/data";

export const Route = createFileRoute("/importaciones/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de Orden de Compra Internacional | RicoSoft" },
      { name: "description", content: "Trazabilidad de lotes, expediente aduanero y costeo landed (NIC 2/21)." },
    ],
  }),
  component: DetalleOrdenIntl,
});

const ESTADOS_TRANSITO_MANUAL = ["En tránsito", "En puerto", "En inspección"];
const ESTADOS_LOTE_LIQUIDABLES = ["En puerto", "En inspección", "Liberado pre-compra"];

const loteVacio: CrearLoteInput = {
  blAwb: "",
  contenedor: "",
  precinto: "",
  puertoOrigen: "",
  puertoDestino: "",
  naviera: "",
};

const liquidacionVacia: LiquidarCosteoInput = {
  trmLiquidacion: 4000,
  valorCifTotalUsd: 0,
  arancelTotalCop: 0,
  ivaTotalCop: 0,
  ivaDescontableCop: 0,
  fletesNacionalesCop: 0,
  agenciamientoCop: 0,
  otrosCostosCop: 0,
};

function DetalleOrdenIntl() {
  const { id } = Route.useParams();
  const { orden, loading, error, addLote, actualizarEstadoLote, recibirPreCompraPlanta, liquidarCosteoImportacion } =
    useOrdenCompraIntl(id);
  const { user } = useSession();

  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_CREAR);
  const puedeGestionarTransito = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO);
  const puedeRecibir = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR);
  const puedeLiquidar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR);

  const [modalLoteOpen, setModalLoteOpen] = useState(false);
  const [loteForm, setLoteForm] = useState<CrearLoteInput>({ ...loteVacio });
  const [guardandoLote, setGuardandoLote] = useState(false);

  const [loteLiquidando, setLoteLiquidando] = useState<LoteImportacion | null>(null);
  const [liquidacionForm, setLiquidacionForm] = useState<LiquidarCosteoInput>({ ...liquidacionVacia });
  const [liquidando, setLiquidando] = useState(false);

  const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);

  if (loading) {
    return (
      <AppShell title="Orden de Compra Internacional" description="Cargando...">
        <div className="p-12 text-center text-xs text-slate-500">Cargando orden...</div>
      </AppShell>
    );
  }

  if (error || !orden) {
    return (
      <AppShell title="Orden de Compra Internacional" description="No fue posible cargar la orden.">
        <div className="p-12 text-center text-xs text-slate-500">{error || "Orden no encontrada."}</div>
      </AppShell>
    );
  }

  const descripcionItem = (itemId: string) => orden.items.find((i) => i.id === itemId)?.descripcion ?? "—";

  const handleAgregarLote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteForm.blAwb || !loteForm.puertoOrigen || !loteForm.puertoDestino) return;
    setGuardandoLote(true);
    try {
      await addLote(loteForm);
      toast.success("Lote registrado.");
      setModalLoteOpen(false);
      setLoteForm({ ...loteVacio });
    } catch (err: any) {
      toast.error(err.message || "No fue posible registrar el lote.");
    } finally {
      setGuardandoLote(false);
    }
  };

  const handleAvanzarTransito = async (lote: LoteImportacion, siguienteEstado: string) => {
    setAccionEnCurso(lote.id);
    try {
      await actualizarEstadoLote(lote.id, siguienteEstado);
      toast.success(`Lote ${lote.blAwb} → ${siguienteEstado}.`);
    } catch (err: any) {
      toast.error(err.message || "No fue posible actualizar el estado del lote.");
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleRecibirPlanta = async (lote: LoteImportacion) => {
    setAccionEnCurso(lote.id);
    try {
      await recibirPreCompraPlanta(lote.id);
      toast.success(`Lote ${lote.blAwb} recibido en planta (pre-compra). Costeo provisional generado.`);
    } catch (err: any) {
      toast.error(err.message || "No fue posible registrar el ingreso a planta.");
    } finally {
      setAccionEnCurso(null);
    }
  };

  const handleLiquidar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loteLiquidando) return;
    setLiquidando(true);
    try {
      await liquidarCosteoImportacion(loteLiquidando.id, liquidacionForm);
      toast.success(`Costeo del lote ${loteLiquidando.blAwb} liquidado.`);
      setLoteLiquidando(null);
      setLiquidacionForm({ ...liquidacionVacia });
    } catch (err: any) {
      toast.error(err.message || "No fue posible liquidar el costeo.");
    } finally {
      setLiquidando(false);
    }
  };

  return (
    <AppShell
      title={`Orden ${orden.numeroOrden}`}
      description={`${orden.proveedorExtranjero} · ${orden.paisOrigen} · Incoterm ${orden.incoterm}`}
      actions={
        <Link to="/importaciones">
          <Button size="sm" variant="outline" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Volver al listado
          </Button>
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Estado</p>
          <div className="mt-1"><EstadoBadge estado={orden.estado} /></div>
        </div>
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Moneda / TRM pactada</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{orden.moneda} · {orden.trmPactada.toLocaleString("es-CO")}</p>
        </div>
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">FOB × TRM estimado</p>
          <p className="num mt-1 text-sm font-bold text-slate-900">{money(orden.valorEstimadoTotal, "COP")}</p>
        </div>
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Responsable</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{orden.responsable?.nombre ?? "—"}</p>
        </div>
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs mt-4">
        <div className="border-b border-slate-200 p-4 bg-slate-50/80">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Ítems de la Orden</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Valor FOB unit.</th>
                <th className="px-4 py-3 text-right">Subtotal FOB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {orden.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">{item.descripcion}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{item.cantidad}</td>
                  <td className="num px-4 py-2.5 text-right">{money(item.valorUnitarioFob, orden.moneda)}</td>
                  <td className="num px-4 py-2.5 text-right font-bold">
                    {money(item.cantidad * item.valorUnitarioFob, orden.moneda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs mt-4">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 bg-slate-50/80">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
            <Ship className="h-3.5 w-3.5" /> Lotes de Embarque
          </h3>
          {puedeCrear && orden.estado !== "Anulada" && orden.estado !== "Cerrada" && (
            <Button size="xs" onClick={() => setModalLoteOpen(true)} className="h-7 text-[11px] font-bold bg-blue-800 text-white hover:bg-blue-900">
              <Plus className="h-3 w-3 mr-1" /> Registrar Lote
            </Button>
          )}
        </div>

        {orden.lotes.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Esta orden no tiene lotes registrados todavía.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orden.lotes.map((lote) => (
              <div key={lote.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-900">BL/AWB {lote.blAwb}</p>
                    <p className="text-[11px] text-slate-500">
                      {lote.puertoOrigen} → {lote.puertoDestino}
                      {lote.contenedor ? ` · Contenedor ${lote.contenedor}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <EstadoBadge estado={lote.estado} />
                    {ESTADOS_TRANSITO_MANUAL.includes(lote.estado) && lote.fechaLlegadaEstimada && (
                      <BarraVencimiento
                        fecha={lote.fechaLlegadaEstimada}
                        etiquetaVencido="Debió llegar"
                        ventanaDias={20}
                      />
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {puedeGestionarTransito &&
                    ESTADOS_TRANSITO_MANUAL.includes(lote.estado) &&
                    ESTADOS_TRANSITO_MANUAL.filter((e) => e !== lote.estado).map((estado) => (
                      <Button
                        key={estado}
                        size="xs"
                        variant="outline"
                        disabled={accionEnCurso === lote.id}
                        onClick={() => handleAvanzarTransito(lote, estado)}
                        className="h-7 text-[11px] font-bold"
                      >
                        Mover a "{estado}"
                      </Button>
                    ))}
                  {puedeRecibir && ESTADOS_TRANSITO_MANUAL.includes(lote.estado) && (
                    <Button
                      size="xs"
                      disabled={accionEnCurso === lote.id}
                      onClick={() => handleRecibirPlanta(lote)}
                      className="h-7 text-[11px] font-bold bg-slate-900 text-white hover:bg-slate-800"
                    >
                      <Package className="h-3 w-3 mr-1" /> Recibir en planta (pre-compra)
                    </Button>
                  )}
                  {puedeLiquidar && ESTADOS_LOTE_LIQUIDABLES.includes(lote.estado) && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setLoteLiquidando(lote);
                        setLiquidacionForm({ ...liquidacionVacia, trmLiquidacion: orden.trmPactada });
                      }}
                      className="h-7 text-[11px] font-bold border-blue-300 text-blue-800 hover:bg-blue-50"
                    >
                      Liquidar costeo de importación
                    </Button>
                  )}
                </div>

                {lote.costeos.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="bg-slate-50 text-slate-600 font-bold">
                        <tr>
                          <th className="px-3 py-2">Ítem</th>
                          <th className="px-3 py-2 text-right">Costo total COP</th>
                          <th className="px-3 py-2 text-right">Costo unitario COP</th>
                          <th className="px-3 py-2 text-right">Dif. cambio COP</th>
                          <th className="px-3 py-2">Tipo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lote.costeos.map((c) => (
                          <tr key={c.id}>
                            <td className="px-3 py-2">{descripcionItem(c.itemId)}</td>
                            <td className="num px-3 py-2 text-right font-bold">{money(c.costoTotalCop, "COP")}</td>
                            <td className="num px-3 py-2 text-right">{money(c.costoUnitarioCop, "COP")}</td>
                            <td className="num px-3 py-2 text-right">{money(c.diferenciaCambioCop, "COP")}</td>
                            <td className="px-3 py-2">
                              <EstadoBadge estado={c.esProvisional ? "Pendiente" : "Aprobada"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR LOTE */}
      <Dialog open={modalLoteOpen} onOpenChange={(open) => { setModalLoteOpen(open); if (!open) setLoteForm({ ...loteVacio }); }}>
        <DialogContent className="sm:max-w-md bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Registrar Lote de Embarque</DialogTitle>
            <DialogDescription className="text-slate-500">Trazabilidad desde puerto de origen (BL/AWB, contenedor).</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAgregarLote} className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">BL / AWB *</Label>
              <Input required value={loteForm.blAwb} onChange={(e) => setLoteForm({ ...loteForm, blAwb: e.target.value })} className="h-9 text-xs border-slate-300" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Contenedor</Label>
                <Input value={loteForm.contenedor} onChange={(e) => setLoteForm({ ...loteForm, contenedor: e.target.value })} className="h-9 text-xs border-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Precinto</Label>
                <Input value={loteForm.precinto} onChange={(e) => setLoteForm({ ...loteForm, precinto: e.target.value })} className="h-9 text-xs border-slate-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Puerto de Origen *</Label>
                <Input required value={loteForm.puertoOrigen} onChange={(e) => setLoteForm({ ...loteForm, puertoOrigen: e.target.value })} className="h-9 text-xs border-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Puerto de Destino *</Label>
                <Input required value={loteForm.puertoDestino} onChange={(e) => setLoteForm({ ...loteForm, puertoDestino: e.target.value })} className="h-9 text-xs border-slate-300" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Naviera</Label>
              <Input value={loteForm.naviera} onChange={(e) => setLoteForm({ ...loteForm, naviera: e.target.value })} className="h-9 text-xs border-slate-300" />
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalLoteOpen(false)} disabled={guardandoLote}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-blue-800 text-white hover:bg-blue-900 font-bold" disabled={guardandoLote}>
                {guardandoLote ? "Guardando..." : "Registrar Lote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL LIQUIDAR COSTEO */}
      <Dialog open={!!loteLiquidando} onOpenChange={(open) => !open && setLoteLiquidando(null)}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">Liquidar Costeo de Importación</DialogTitle>
            <DialogDescription className="text-slate-500">
              Landed cost definitivo (NIC 2), prorrateado por ítem según su participación en el valor FOB. Lote {loteLiquidando?.blAwb}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleLiquidar} className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">TRM de Liquidación *</Label>
                <Input type="number" step="0.01" required value={liquidacionForm.trmLiquidacion} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, trmLiquidacion: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Valor CIF Total (USD) *</Label>
                <Input type="number" step="0.01" required value={liquidacionForm.valorCifTotalUsd} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, valorCifTotalUsd: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Arancel Total (COP) *</Label>
                <Input type="number" step="0.01" required value={liquidacionForm.arancelTotalCop} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, arancelTotalCop: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">IVA Total (COP) *</Label>
                <Input type="number" step="0.01" required value={liquidacionForm.ivaTotalCop} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, ivaTotalCop: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">IVA Descontable (COP)</Label>
              <Input type="number" step="0.01" value={liquidacionForm.ivaDescontableCop} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, ivaDescontableCop: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              <p className="text-[10px] text-slate-500">La diferencia (IVA total − descontable) se capitaliza como costo bajo NIC 2.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Fletes Nacionales</Label>
                <Input type="number" step="0.01" value={liquidacionForm.fletesNacionalesCop} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, fletesNacionalesCop: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Agenciamiento</Label>
                <Input type="number" step="0.01" value={liquidacionForm.agenciamientoCop} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, agenciamientoCop: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Otros Costos</Label>
                <Input type="number" step="0.01" value={liquidacionForm.otrosCostosCop} onChange={(e) => setLiquidacionForm({ ...liquidacionForm, otrosCostosCop: Number(e.target.value) })} className="h-9 text-xs border-slate-300" />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setLoteLiquidando(null)} disabled={liquidando}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-blue-800 text-white hover:bg-blue-900 font-bold" disabled={liquidando}>
                {liquidando ? "Liquidando..." : "Liquidar Costeo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
