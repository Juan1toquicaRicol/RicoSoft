import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  useBusquedaClientesProforma,
  useCrearProforma,
  useDatosFacturacionCliente,
  useBodegasProforma,
  useSiguienteNumeroProforma,
  useConfiguracionComercial,
  useBusquedaCotizaciones,
  useDetalleCotizacion,
  type ClienteBusquedaProforma,
  type ProformaItem,
  type CotizacionBusqueda,
} from "@/hooks/use-proformas";
import { useBusquedaProductos, useContextoProducto, type ItemBusqueda } from "@/hooks/use-ventas";
import { useCatalogo } from "@/hooks/use-catalogos";
import { calcularTotalesProformaPreview } from "@/lib/proforma-calculo";

function itemVacio(): ProformaItem {
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

/** Autocompletado de cliente por razón social/NIT — misma mecánica de debounce que AutocompletadoProducto en Ventas. */
function AutocompletadoCliente({
  onSeleccionar,
}: {
  onSeleccionar: (cliente: ClienteBusquedaProforma) => void;
}) {
  const { buscar, loading } = useBusquedaClientesProforma();
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
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="h-11 text-sm"
        placeholder="Ej. Sociedad Nariñense de Plásticos"
      />
      {abierto && (loading || sugerencias.length > 0) && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <p className="p-3 text-sm text-slate-400">Buscando...</p>}
          {!loading &&
            sugerencias.map((c) => (
              <button
                key={c.clienteRowId}
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSeleccionar(c);
                  setTexto(c.nombre ?? "");
                  setAbierto(false);
                }}
              >
                <span className="font-semibold text-slate-800">
                  {c.nombre ?? "Cliente sin nombre"}
                </span>
                {c.nit && <span className="text-slate-400"> · NIT {c.nit}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Autocompletado de producto para una línea de ítem — reutiliza los hooks de Ventas (¿Puedo vender esto?). */
function AutocompletadoItemProducto({
  onSeleccionar,
}: {
  onSeleccionar: (item: ItemBusqueda, precioSugerido: number | null) => void;
}) {
  const { buscar, loading } = useBusquedaProductos();
  const { consultar: consultarContexto } = useContextoProducto();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<ItemBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await buscar(texto);
      setSugerencias(res.disponible ? (res.items ?? []) : []);
      setAbierto(true);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <div className="relative">
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="h-10 w-full text-sm"
        placeholder="Buscar producto..."
      />
      {abierto && (loading || sugerencias.length > 0) && (
        <div className="absolute z-10 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <p className="p-3 text-sm text-slate-400">Buscando...</p>}
          {!loading &&
            sugerencias.map((item) => (
              <button
                key={item.itemRowId}
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setTexto(item.descripcion ?? item.referencia ?? "");
                  setAbierto(false);
                  const ctx = await consultarContexto(item.itemRowId);
                  onSeleccionar(item, ctx.disponible ? (ctx.precioPromedioVenta ?? null) : null);
                }}
              >
                <span className="font-semibold text-slate-800">{item.descripcion}</span>
                {item.referencia && <span className="text-slate-400"> · {item.referencia}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Buscador de cotización de origen (CRM/Siesa) — opcional, mismo patrón de
 * debounce que AutocompletadoCliente. Al seleccionar, el padre precarga
 * cliente/items/condición de pago desde el detalle completo. */
function BuscadorCotizacion({
  seleccionada,
  onSeleccionar,
  onQuitar,
}: {
  seleccionada: CotizacionBusqueda | null;
  onSeleccionar: (c: CotizacionBusqueda) => void;
  onQuitar: () => void;
}) {
  const { buscar, loading } = useBusquedaCotizaciones();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<CotizacionBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (texto.trim().length < 1) {
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

  if (seleccionada) {
    return (
      <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
        <span>
          Cotización <span className="font-semibold">{seleccionada.cotizacionNumero}</span>
          {seleccionada.erpDocumentoNumero && (
            <span className="text-slate-500"> · Doc. ERP {seleccionada.erpDocumentoNumero}</span>
          )}
          {seleccionada.clienteNombre && (
            <span className="text-slate-500"> · {seleccionada.clienteNombre}</span>
          )}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onQuitar} className="h-7 text-xs">
          Quitar
        </Button>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5">
      <Label className="text-xs font-semibold text-slate-500 uppercase">
        Cotización de origen (opcional)
      </Label>
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => sugerencias.length > 0 && setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="h-10 text-sm"
        placeholder="Buscar por número, ej. 34147"
      />
      {abierto && (loading || sugerencias.length > 0) && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          {loading && <p className="p-3 text-sm text-slate-400">Buscando...</p>}
          {!loading &&
            sugerencias.map((c) => (
              <button
                key={c.cotizacionIdExterno}
                type="button"
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSeleccionar(c);
                  setTexto("");
                  setAbierto(false);
                }}
              >
                <span className="font-semibold text-slate-800">{c.cotizacionNumero}</span>
                {c.clienteNombre && <span className="text-slate-400"> · {c.clienteNombre}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function ProformaDialog() {
  const navigate = useNavigate();
  const { consultar: consultarDatosFacturacion } = useDatosFacturacionCliente();
  const { crear, loading: guardando } = useCrearProforma();
  const { bodegas } = useBodegasProforma();
  const { consultar: consultarSiguienteNumero } = useSiguienteNumeroProforma();
  const { configuracion: configComercial } = useConfiguracionComercial();
  const { data: formasPagoVentas } = useCatalogo("FORMA_PAGO_VENTAS");
  const { consultar: consultarDetalleCotizacion } = useDetalleCotizacion();

  const [abierto, setAbierto] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(false);
  const [cotizacion, setCotizacion] = useState<CotizacionBusqueda | null>(null);
  const [numero, setNumero] = useState<number | "">("");
  const [clienteRowId, setClienteRowId] = useState<number | null>(null);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteNit, setClienteNit] = useState("");
  const [contacto, setContacto] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [telefono, setTelefono] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [vendedorNombre, setVendedorNombre] = useState("");
  const [ocNumero, setOcNumero] = useState("");
  const [documentoAlterno, setDocumentoAlterno] = useState("");
  const [remisiones, setRemisiones] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [aplicaRetencion, setAplicaRetencion] = useState(false);
  const [retencionPct, setRetencionPct] = useState(2.5);
  const [aplicaRetencionIva, setAplicaRetencionIva] = useState(false);
  const [retencionIvaPct, setRetencionIvaPct] = useState(15);
  const [aplicaIca, setAplicaIca] = useState(false);
  const [icaPct, setIcaPct] = useState(0.7);
  const [items, setItems] = useState<ProformaItem[]>([itemVacio()]);

  // Al abrir el diálogo: sugiere el siguiente consecutivo (editable, NO
  // reservado) y toma las tasas de retención vigentes del tenant — nunca
  // constantes duplicadas en el frontend.
  useEffect(() => {
    if (!abierto) return;
    consultarSiguienteNumero().then(setNumero);
    if (configComercial) {
      setRetencionPct(configComercial.retencionFuentePct);
      setRetencionIvaPct(configComercial.retencionIvaPct);
      setIcaPct(configComercial.retencionIcaPct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const resetForm = () => {
    setCotizacion(null);
    setNumero("");
    setClienteRowId(null);
    setClienteNombre("");
    setClienteNit("");
    setContacto("");
    setDireccion("");
    setCiudad("");
    setTelefono("");
    setFormaPago("");
    setFechaVencimiento("");
    setVendedorNombre("");
    setOcNumero("");
    setDocumentoAlterno("");
    setRemisiones("");
    setObservaciones("");
    setAplicaRetencion(false);
    setRetencionPct(configComercial?.retencionFuentePct ?? 2.5);
    setAplicaRetencionIva(false);
    setRetencionIvaPct(configComercial?.retencionIvaPct ?? 15);
    setAplicaIca(false);
    setIcaPct(configComercial?.retencionIcaPct ?? 0.7);
    setItems([itemVacio()]);
  };

  const handleSeleccionarCliente = async (cliente: ClienteBusquedaProforma) => {
    setClienteRowId(cliente.clienteRowId);
    setClienteNombre(cliente.nombre ?? "");
    setClienteNit(cliente.nit ?? "");
    setCargandoDatos(true);
    try {
      const res = await consultarDatosFacturacion(cliente.clienteRowId);
      if (res.disponible) {
        setClienteNit(res.cliente?.nit ?? cliente.nit ?? "");
        setVendedorNombre(res.cliente?.vendedorNombre ?? "");
        setContacto(res.facturacion?.contactoNombre ?? "");
        setDireccion(res.facturacion?.direccion ?? "");
        setTelefono(res.facturacion?.telefono ?? "");
        const ciudadTexto = [res.facturacion?.ciudad, res.facturacion?.departamento]
          .filter(Boolean)
          .join(" - ");
        setCiudad(ciudadTexto);
      } else {
        toast.warning(res.motivo ?? "No fue posible traer los datos del cliente desde Siesa.");
      }
    } finally {
      setCargandoDatos(false);
    }
  };

  /** Selección de cotización de origen: precarga cliente, items, condición
   * de pago y fecha de entrega desde el detalle completo — el usuario
   * puede revisar/editar todo después, igual que en el resto del formulario. */
  const handleSeleccionarCotizacion = async (c: CotizacionBusqueda) => {
    setCotizacion(c);
    setCargandoDatos(true);
    try {
      const res = await consultarDetalleCotizacion(c.cotizacionIdExterno);
      if (!res.disponible || !res.cotizacion) {
        toast.warning(res.motivo ?? "No fue posible traer el detalle de la cotización.");
        return;
      }
      const det = res.cotizacion;
      setClienteRowId(det.clienteRowId);
      setClienteNombre(det.clienteNombre ?? "");
      setClienteNit(det.clienteNit ?? "");
      setDireccion(det.direccion ?? "");
      setTelefono(det.telefono ?? "");
      setCiudad(det.ciudad ?? "");
      setVendedorNombre(det.vendedorNombre ?? "");
      if (det.condicionPagoDescripcion) setFormaPago(det.condicionPagoDescripcion);
      if (det.fechaEntrega) setFechaVencimiento(det.fechaEntrega.slice(0, 10));
      if (det.items.length > 0) {
        setItems(
          det.items.map((it) => ({
            itemRowId: it.itemRowId,
            referencia: it.referencia,
            descripcion: it.descripcion ?? it.referencia ?? "",
            bodegaRowId: null,
            bodega: null,
            unidadMedida: null,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            descuentoPct: it.descuentoPct ?? 0,
            ivaPct: it.ivaPct ?? 19,
          })),
        );
      }
    } finally {
      setCargandoDatos(false);
    }
  };

  const actualizarItem = (idx: number, cambios: Partial<ProformaItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...cambios } : it)));
  };

  const agregarItem = () => setItems((prev) => [...prev, itemVacio()]);
  const quitarItem = (idx: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  // Solo para preview mientras se arma la proforma — el backend recalcula y
  // persiste los totales reales al guardar (ver crearProforma/serializarProforma).
  const totales = calcularTotalesProformaPreview(items, {
    aplicaRetencion,
    retencionPct,
    aplicaRetencionIva,
    retencionIvaPct,
    aplicaIca,
    icaPct,
  });

  const handleGuardar = async () => {
    if (!clienteRowId || !clienteNombre.trim()) {
      toast.error("Selecciona un cliente antes de crear la proforma.");
      return;
    }
    if (!numero || numero <= 0) {
      toast.error("El número de proforma debe ser mayor a 0.");
      return;
    }
    if (items.some((it) => !it.descripcion.trim() || it.cantidad <= 0)) {
      toast.error("Cada ítem necesita descripción y cantidad mayor a 0.");
      return;
    }
    try {
      const creada = await crear({
        numero,
        cotizacionIdExterno: cotizacion?.cotizacionIdExterno ?? null,
        clienteRowId,
        clienteNombre: clienteNombre.trim(),
        clienteNit: clienteNit.trim() || null,
        contacto: contacto.trim() || null,
        direccion: direccion.trim() || null,
        ciudad: ciudad.trim() || null,
        telefono: telefono.trim() || null,
        formaPago: formaPago.trim() || null,
        fechaVencimiento: fechaVencimiento || null,
        vendedorNombre: vendedorNombre.trim() || null,
        ocNumero: ocNumero.trim() || null,
        documentoAlterno: documentoAlterno.trim() || null,
        remisiones: remisiones.trim() || null,
        moneda: "PESOS",
        observaciones: observaciones.trim() || null,
        aplicaRetencion,
        retencionPct,
        aplicaRetencionIva,
        retencionIvaPct,
        aplicaIca,
        icaPct,
        items,
      });
      toast.success(`Proforma ${creada.numero} creada correctamente.`);
      setAbierto(false);
      resetForm();
      navigate({ to: "/comercial/proformas/$id", params: { id: creada.id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear la proforma.");
    }
  };

  return (
    <Dialog
      open={abierto}
      onOpenChange={(open) => {
        setAbierto(open);
        if (!open) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Realizar proforma
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[95vh] w-[95vw] max-w-[1600px] overflow-y-auto p-10">
        <DialogHeader>
          <DialogTitle className="text-xl">Nueva proforma</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <BuscadorCotizacion
            seleccionada={cotizacion}
            onSeleccionar={handleSeleccionarCotizacion}
            onQuitar={() => setCotizacion(null)}
          />

          <AutocompletadoCliente onSeleccionar={handleSeleccionarCliente} />

          {cargandoDatos && <p className="text-sm text-slate-500">Trayendo datos del cliente...</p>}

          {clienteRowId && (
            <>
              {/* Primer dato propio de la proforma después del cliente: el consecutivo. */}
              <div className="w-48 space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase">
                  Número de proforma
                </Label>
                <Input
                  type="number"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-10 text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <Campo label="NIT" value={clienteNit} onChange={setClienteNit} />
                <Campo label="Contacto" value={contacto} onChange={setContacto} />
                <Campo label="Teléfono" value={telefono} onChange={setTelefono} />
                <Campo
                  label="Dirección"
                  value={direccion}
                  onChange={setDireccion}
                  className="sm:col-span-2"
                />
                <Campo label="Ciudad" value={ciudad} onChange={setCiudad} />
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500 uppercase">
                    Forma de pago
                  </Label>
                  <Select value={formaPago} onValueChange={setFormaPago}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder="Selecciona..." />
                    </SelectTrigger>
                    <SelectContent>
                      {formasPagoVentas.map((f) => (
                        <SelectItem key={f.id} value={f.etiqueta}>
                          {f.etiqueta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Campo label="Vendedor" value={vendedorNombre} onChange={setVendedorNombre} />
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-500 uppercase">
                    Fecha vcto.
                  </Label>
                  <Input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
                <Campo label="OC. Nro" value={ocNumero} onChange={setOcNumero} />
                <Campo
                  label="Docto. Alt."
                  value={documentoAlterno}
                  onChange={setDocumentoAlterno}
                />
                <Campo label="Remisiones" value={remisiones} onChange={setRemisiones} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-500 uppercase">Ítems</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={agregarItem}
                    className="h-8 gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar ítem
                  </Button>
                </div>
                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  {items.map((it, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[repeat(16,minmax(0,1fr))] items-end gap-3"
                    >
                      <div className="col-span-4">
                        <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                          Producto
                        </Label>
                        <AutocompletadoItemProducto
                          onSeleccionar={(item, precio) => {
                            if (precio == null) {
                              toast.warning(
                                `"${item.descripcion ?? item.referencia}" no tiene ventas recientes registradas — ingresa el precio manualmente.`,
                              );
                            }
                            actualizarItem(idx, {
                              itemRowId: item.itemRowId,
                              referencia: item.referencia,
                              descripcion: item.descripcion ?? item.referencia ?? "",
                              unidadMedida: item.unidadMedida,
                              precioUnitario: precio ?? 0,
                            });
                          }}
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[10px] font-semibold text-slate-400 uppercase">
                          Bodega
                        </Label>
                        <Select
                          value={it.bodegaRowId ? String(it.bodegaRowId) : ""}
                          onValueChange={(v) => {
                            const bodega = bodegas.find((b) => b.bodegaRowId === Number(v));
                            actualizarItem(idx, {
                              bodegaRowId: bodega?.bodegaRowId ?? null,
                              // Código (ej. "023"), igual que la columna BOD
                              // de la plantilla original — no el nombre largo.
                              bodega: bodega?.codigo ?? null,
                            });
                          }}
                        >
                          <SelectTrigger className="h-10 text-sm">
                            <SelectValue placeholder="Selecciona..." />
                          </SelectTrigger>
                          <SelectContent>
                            {bodegas.map((b) => (
                              <SelectItem key={b.bodegaRowId} value={String(b.bodegaRowId)}>
                                {b.codigo} — {b.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <NumeroCorto
                        label="Cant."
                        value={it.cantidad}
                        onChange={(v) => actualizarItem(idx, { cantidad: v })}
                      />
                      <NumeroCorto
                        label="Precio"
                        value={it.precioUnitario}
                        onChange={(v) => actualizarItem(idx, { precioUnitario: v })}
                      />
                      <NumeroCorto
                        label="Dscto %"
                        value={it.descuentoPct}
                        onChange={(v) => actualizarItem(idx, { descuentoPct: v })}
                      />
                      <NumeroCorto
                        label="IVA %"
                        value={it.ivaPct}
                        onChange={(v) => actualizarItem(idx, { ivaPct: v })}
                      />
                      <div className="col-span-1 flex justify-end pb-2">
                        <button
                          type="button"
                          onClick={() => quitarItem(idx)}
                          className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 rounded-lg border border-slate-200 p-4">
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={aplicaRetencion}
                    onCheckedChange={(v) => setAplicaRetencion(!!v)}
                  />
                  Retención fuente
                  <Input
                    type="number"
                    step="0.1"
                    value={retencionPct}
                    onChange={(e) => setRetencionPct(Number(e.target.value))}
                    className="h-9 w-20 text-sm"
                    disabled={!aplicaRetencion}
                  />
                  %
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={aplicaRetencionIva}
                    onCheckedChange={(v) => setAplicaRetencionIva(!!v)}
                  />
                  Retención IVA
                  <Input
                    type="number"
                    step="0.1"
                    value={retencionIvaPct}
                    onChange={(e) => setRetencionIvaPct(Number(e.target.value))}
                    className="h-9 w-20 text-sm"
                    disabled={!aplicaRetencionIva}
                  />
                  %
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox checked={aplicaIca} onCheckedChange={(v) => setAplicaIca(!!v)} />
                  Retención ICA
                  <Input
                    type="number"
                    step="0.1"
                    value={icaPct}
                    onChange={(e) => setIcaPct(Number(e.target.value))}
                    className="h-9 w-20 text-sm"
                    disabled={!aplicaIca}
                  />
                  %
                </label>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-500 uppercase">
                  Observaciones
                </Label>
                <Textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="text-sm"
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-slate-200 pt-4 text-sm">
                <span>
                  Total bruto:{" "}
                  <span className="num font-semibold">
                    {totales.totalBruto.toLocaleString("es-CO")}
                  </span>
                </span>
                <span>
                  Subtotal:{" "}
                  <span className="num font-semibold">
                    {totales.subtotal.toLocaleString("es-CO")}
                  </span>
                </span>
                <span>
                  IVA:{" "}
                  <span className="num font-semibold">{totales.iva.toLocaleString("es-CO")}</span>
                </span>
                {aplicaRetencion && (
                  <span>
                    Rete fuente:{" "}
                    <span className="num font-semibold">
                      -{totales.retencionFuente.toLocaleString("es-CO")}
                    </span>
                  </span>
                )}
                {aplicaRetencionIva && (
                  <span>
                    Rete IVA:{" "}
                    <span className="num font-semibold">
                      -{totales.retencionIva.toLocaleString("es-CO")}
                    </span>
                  </span>
                )}
                {aplicaIca && (
                  <span>
                    Rete ICA:{" "}
                    <span className="num font-semibold">
                      -{totales.retencionIca.toLocaleString("es-CO")}
                    </span>
                  </span>
                )}
                <span className="text-base font-bold text-slate-900">
                  Total: <span className="num">{totales.total.toLocaleString("es-CO")}</span>
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" size="lg" onClick={handleGuardar} disabled={guardando}>
                  {guardando ? "Creando..." : "Crear proforma"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-semibold text-slate-500 uppercase">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-10 text-sm" />
    </div>
  );
}

function NumeroCorto({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="col-span-2">
      <Label className="text-xs font-semibold text-slate-400 uppercase">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 text-sm"
      />
    </div>
  );
}
