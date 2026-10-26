import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useBusquedaClientesProforma,
  useDatosFacturacionCliente,
  type ClienteBusquedaProforma,
} from "@/hooks/use-proformas";
import { useCrearCotizacion, type ItemComercial } from "@/hooks/use-comercial";
import { calcularTotalesProformaPreview } from "@/lib/proforma-calculo";

function itemVacio(): ItemComercial {
  return {
    itemRowId: null,
    referencia: null,
    descripcion: "",
    bodegaRowId: null,
    bodega: null,
    unidadMedida: null,
    cantidad: 1,
    precioUnitario: 0,
    descuentoPct: 0,
    ivaPct: 19,
  };
}

function AutocompletadoCliente({
  onSeleccionar,
}: {
  onSeleccionar: (cliente: ClienteBusquedaProforma) => void;
}) {
  const { buscar } = useBusquedaClientesProforma();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<ClienteBusquedaProforma[]>([]);
  const [abierto, setAbierto] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSugerencias(await buscar(texto));
      setAbierto(true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="relative space-y-1.5">
      <Label className="text-xs font-semibold text-slate-500 uppercase">
        Cliente (busca por nombre o NIT)
      </Label>
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribe para buscar..."
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
      />
      {abierto && sugerencias.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {sugerencias.map((c) => (
            <button
              key={c.clienteRowId}
              type="button"
              className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
              onMouseDown={() => {
                onSeleccionar(c);
                setTexto(c.nombre ?? "");
                setAbierto(false);
              }}
            >
              <p className="font-medium">{c.nombre}</p>
              <p className="text-slate-500">{c.nit}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Controlado por el padre (NuevoDocumentoMenu): ya no lleva su propio botón
 * disparador — el punto de entrada único a "crear cotización" es el menú
 * "Nuevo documento" de Gestión Comercial. */
export function CotizacionDialog({
  open,
  onOpenChange: setOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { crear, loading } = useCrearCotizacion();
  const { consultar } = useDatosFacturacionCliente();

  const [clienteRowId, setClienteRowId] = useState<number | null>(null);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteNit, setClienteNit] = useState("");
  const [contacto, setContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [vendedorNombre, setVendedorNombre] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState<ItemComercial[]>([itemVacio()]);

  const totales = calcularTotalesProformaPreview(items, {
    aplicaRetencion: false,
    retencionPct: 0,
    aplicaRetencionIva: false,
    retencionIvaPct: 0,
    aplicaIca: false,
    icaPct: 0,
  });

  const actualizarItem = (idx: number, cambios: Partial<ItemComercial>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...cambios } : it)));
  };

  const seleccionarCliente = async (c: ClienteBusquedaProforma) => {
    setClienteRowId(c.clienteRowId);
    setClienteNombre(c.nombre ?? "");
    setClienteNit(c.nit ?? "");
    const datos = await consultar(c.clienteRowId);
    if (datos.disponible) {
      setVendedorNombre(datos.cliente?.vendedorNombre ?? "");
      setContacto(datos.facturacion?.contactoNombre ?? "");
      setDireccion(datos.facturacion?.direccion ?? "");
      setCiudad(datos.facturacion?.ciudad ?? "");
      setTelefono(datos.facturacion?.telefono ?? "");
    }
  };

  const resetear = () => {
    setClienteRowId(null);
    setClienteNombre("");
    setClienteNit("");
    setContacto("");
    setDireccion("");
    setCiudad("");
    setTelefono("");
    setVendedorNombre("");
    setFechaVencimiento("");
    setObservaciones("");
    setItems([itemVacio()]);
  };

  const guardar = async () => {
    if (!clienteRowId || !clienteNombre) {
      toast.error("Selecciona un cliente.");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.descripcion || it.cantidad <= 0)) {
      toast.error("Revisa los ítems: cada uno necesita descripción y cantidad mayor a 0.");
      return;
    }
    try {
      const creada = await crear({
        clienteRowId,
        clienteNombre,
        clienteNit: clienteNit || null,
        contacto: contacto || null,
        direccion: direccion || null,
        ciudad: ciudad || null,
        telefono: telefono || null,
        vendedorNombre: vendedorNombre || null,
        fechaVencimiento: fechaVencimiento || null,
        observaciones: observaciones || null,
        items,
      });
      toast.success(`Cotización ${creada.numeroFormateado} creada.`);
      setOpen(false);
      resetear();
      navigate({ to: `/comercial/cotizaciones/${creada.id}` });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear la cotización.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <AutocompletadoCliente onSeleccionar={seleccionarCliente} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase">Vendedor</Label>
              <Input value={vendedorNombre} onChange={(e) => setVendedorNombre(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-500 uppercase">
                Fecha de vencimiento
              </Label>
              <Input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-500 uppercase">Ítems</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => setItems((prev) => [...prev, itemVacio()])}
              >
                <Plus className="h-3.5 w-3.5" /> Agregar ítem
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-end gap-2 rounded-md border border-slate-200 p-2"
                >
                  <div className="col-span-4 space-y-1">
                    <Label className="text-[10px] text-slate-500">Descripción</Label>
                    <Input
                      value={it.descripcion}
                      onChange={(e) => actualizarItem(idx, { descripcion: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] text-slate-500">Cantidad</Label>
                    <Input
                      type="number"
                      value={it.cantidad}
                      onChange={(e) => actualizarItem(idx, { cantidad: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] text-slate-500">Precio</Label>
                    <Input
                      type="number"
                      value={it.precioUnitario}
                      onChange={(e) =>
                        actualizarItem(idx, { precioUnitario: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-[10px] text-slate-500">Dcto%</Label>
                    <Input
                      type="number"
                      value={it.descuentoPct}
                      onChange={(e) =>
                        actualizarItem(idx, { descuentoPct: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="col-span-1 space-y-1">
                    <Label className="text-[10px] text-slate-500">IVA%</Label>
                    <Input
                      type="number"
                      value={it.ivaPct}
                      onChange={(e) => actualizarItem(idx, { ivaPct: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={items.length === 1}
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase">Observaciones</Label>
            <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>

          <div className="ml-auto w-full max-w-xs rounded-md border border-slate-200 p-3 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-500">Subtotal (preview)</span>
              <span>{totales.subtotal.toLocaleString("es-CO")}</span>
            </div>
            <div className="flex justify-between py-0.5 font-semibold">
              <span>Total (preview)</span>
              <span>{totales.total.toLocaleString("es-CO")}</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Los totales reales los calcula el backend al guardar.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={loading} onClick={() => void guardar()}>
              Guardar cotización
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
