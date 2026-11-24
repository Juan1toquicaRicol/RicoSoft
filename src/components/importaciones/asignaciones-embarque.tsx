import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchAuth } from "@/lib/session";
import { formatCantidad } from "@/lib/data";
import type { AsignacionEmbarque, ItemBusquedaSiesa, ItemOrdenCompraIntl, LoteImportacion } from "@/hooks/use-importaciones";

const campos = [
  ["cantidad", "Cantidad asignada"],
  ["recibida", "Recibida en planta"],
  ["conciliada", "Registrada en Siesa"],
] as const;
const evidencias = [
  ["documentoSiesa", "Documento de ingreso en Siesa"],
  ["fechaDisponibilidad", "Fecha prevista para venta"],
  ["evidenciaFecha", "Fuente de la fecha prevista"],
] as const;

function FilaAsignacion({ item, loteId, anterior, puedeRecibir, onGuardado }: {
  item: ItemOrdenCompraIntl;
  loteId: string;
  anterior: AsignacionEmbarque | undefined;
  puedeRecibir: boolean;
  onGuardado: () => Promise<void>;
}) {
  const [datos, setDatos] = useState<AsignacionEmbarque>(anterior ?? {
    itemId: item.id, cantidad: 0, recibida: 0, conciliada: 0, actualizadoEn: null,
    documentoSiesa: null, fechaDisponibilidad: null, evidenciaFecha: null,
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function guardar(event: FormEvent) {
    event.preventDefault();
    setGuardando(true);
    setMensaje("");
    try {
      await fetchAuth(`/importaciones/lotes/${loteId}/asignaciones/${item.id}`, {
        method: "PUT", body: JSON.stringify(datos),
      });
      await onGuardado();
      setMensaje("Asignación guardada.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No fue posible guardar la asignación.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-2 border-t border-slate-200 pt-3">
      <p className="text-xs font-semibold">{item.descripcion} · Ordenado {formatCantidad(item.cantidad, item.unidadMedida)}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {campos.map(([campo, etiqueta]) => (
          <label key={campo} className="space-y-1 text-xs">
            {etiqueta}
            <Input type="number" min="0" max={item.cantidad} step="0.0001" required
              value={Number.isNaN(datos[campo]) ? "" : datos[campo]}
              disabled={campo !== "cantidad" && !puedeRecibir}
              onChange={(event) => setDatos({ ...datos, [campo]: event.target.valueAsNumber })} />
          </label>
        ))}
        {evidencias.map(([campo, etiqueta]) => (
          <label key={campo} className="space-y-1 text-xs">
            {etiqueta}
            <Input type={campo === "fechaDisponibilidad" ? "date" : "text"} maxLength={255}
              value={datos[campo] ?? ""}
              disabled={campo === "documentoSiesa" && !puedeRecibir}
              onChange={(event) => setDatos({ ...datos, [campo]: event.target.value || null })} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={guardando}>Guardar asignación</Button>
        <span role="status" className="text-xs text-slate-600">{mensaje}</span>
      </div>
    </form>
  );
}

export function AsignacionesEmbarque({ lote, items, puedeEditar, puedeRecibir, onGuardado }: {
  lote: LoteImportacion;
  items: ItemOrdenCompraIntl[];
  puedeEditar: boolean;
  puedeRecibir: boolean;
  onGuardado: () => Promise<void>;
}) {
  const vinculados = items.filter((item) => item.itemRowId);
  if (!vinculados.length) return null;
  return (
    <details className="space-y-3 rounded-md border border-slate-200 p-3">
      <summary className="cursor-pointer text-xs font-semibold">Cantidades y disponibilidad del embarque</summary>
      {vinculados.map((item) => {
        const anterior = lote.asignacionesEmbarque?.find((fila) => fila.itemId === item.id);
        if (puedeEditar) return (
          <FilaAsignacion key={`${item.id}/${anterior?.actualizadoEn ?? "nueva"}`}
            item={item} loteId={lote.id} anterior={anterior} puedeRecibir={puedeRecibir} onGuardado={onGuardado} />
        );
        if (!anterior?.cantidad) return null;
        return (
          <p key={item.id} className="text-xs">
            {item.descripcion} · Asignada {formatCantidad(anterior.cantidad, item.unidadMedida)}
            {" · "}Recibida {formatCantidad(anterior.recibida, item.unidadMedida)}
            {" · "}En Siesa {formatCantidad(anterior.conciliada, item.unidadMedida)}
          </p>
        );
      })}
    </details>
  );
}

export function VincularItemSiesa({ item, onGuardado }: {
  item: ItemOrdenCompraIntl;
  onGuardado: () => Promise<void>;
}) {
  const [consulta, setConsulta] = useState(item.referencia || item.descripcion);
  const [opciones, setOpciones] = useState<ItemBusquedaSiesa[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function buscar() {
    setOcupado(true);
    setOpciones([]);
    setMensaje("");
    try {
      const respuesta = await fetchAuth(`/importaciones/items-siesa/buscar?search=${encodeURIComponent(consulta.trim())}`);
      const compatibles = (respuesta.items as ItemBusquedaSiesa[] | undefined)?.filter(
        (opcion) => opcion.unidadMedida?.toUpperCase() === item.unidadMedida?.toUpperCase(),
      ) ?? [];
      setOpciones(compatibles);
      if (!compatibles.length) setMensaje(respuesta.motivo || "No hay coincidencias con la unidad de esta línea.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudieron buscar ítems en Siesa.");
    } finally {
      setOcupado(false);
    }
  }

  async function vincular(itemRowId: number) {
    setOcupado(true);
    setMensaje("");
    try {
      await fetchAuth(`/importaciones/items/${item.id}/vinculo-siesa`, {
        method: "PUT", body: JSON.stringify({ itemRowId }),
      });
      await onGuardado();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo vincular el ítem.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <details className="mt-1 space-y-2">
      <summary className="cursor-pointer text-xs text-slate-700">Vincular ítem de Siesa</summary>
      <div className="flex min-w-48 items-center gap-2">
        <Input value={consulta} aria-label="Buscar referencia o descripción en Siesa"
          onChange={(event) => { setConsulta(event.target.value); setOpciones([]); }} />
        <Button type="button" size="sm" variant="outline" disabled={ocupado || consulta.trim().length < 2}
          onClick={buscar}>Buscar</Button>
      </div>
      {opciones.map((opcion) => (
        <Button key={opcion.itemRowId} type="button" size="sm" variant="outline" className="block h-auto w-full whitespace-normal text-left"
          disabled={ocupado} onClick={() => vincular(opcion.itemRowId)}>
          {opcion.referencia} {opcion.descripcion} · {opcion.unidadMedida}
        </Button>
      ))}
      {mensaje && <p role="status" className="text-xs">{mensaje}</p>}
    </details>
  );
}
