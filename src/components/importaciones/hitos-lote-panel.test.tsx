import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { HitosLotePanel } from "./hitos-lote-panel";
import type { HitoLote, LoteImportacion } from "@/hooks/use-importaciones";

const hito = (over: Partial<HitoLote> & Pick<HitoLote, "tipo" | "etiqueta">): HitoLote => ({
  fecha: null,
  origen: null,
  fuente: null,
  registradoPor: null,
  nota: null,
  ...over,
});

const HITOS: HitoLote[] = [
  hito({ tipo: "EMBARQUE_REAL", etiqueta: "Embarque (real)" }),
  hito({
    tipo: "LLEGADA_PUERTO",
    etiqueta: "Llegada a puerto (real)",
    fecha: "2026-10-10T00:00:00.000Z",
    origen: "Manual",
    fuente: "LoteImportacionHito",
    registradoPor: "Ana Gómez",
  }),
  hito({ tipo: "INSPECCION_ADUANERA", etiqueta: "Inspección aduanera" }),
  hito({
    tipo: "LEVANTE",
    etiqueta: "Levante aduanero",
    fecha: "2026-10-14T00:00:00.000Z",
    origen: "Manual",
    fuente: "ExpedienteAduanero.fechaLevante",
  }),
  hito({
    tipo: "RECEPCION_PLANTA",
    etiqueta: "Recepción física en planta",
    fecha: "2026-10-20T00:00:00.000Z",
    origen: "Sistema",
    fuente: "LoteImportacionHito",
  }),
];

function lote(over: Partial<LoteImportacion> = {}): LoteImportacion {
  return {
    id: "lote-1",
    ordenCompraId: "ord-1",
    blAwb: "BL-1",
    contenedor: null,
    precinto: null,
    puertoOrigen: "Shanghai",
    puertoDestino: "Cartagena",
    naviera: null,
    forwarder: null,
    booking: null,
    fechaEmbarque: null,
    fechaLlegadaEstimada: "2026-10-01T00:00:00.000Z",
    fechaLlegadaReal: "2026-10-20T00:00:00.000Z",
    estado: "Liberado pre-compra",
    buque: null,
    tracking: {
      estado: "ACTIVO",
      proveedor: "vesselfinder",
      ultimoError: null,
      ultimaSincronizacion: null,
      etaActual: "2026-10-05T00:00:00.000Z",
      variacionEtaDias: 4,
      posicion: null,
    },
    contenedores: [],
    hitos: HITOS,
    expediente: null,
    costeos: [],
    ...over,
  } as LoteImportacion;
}

const noop = vi.fn(async () => undefined);

describe("HitosLotePanel", () => {
  it("muestra las estimaciones aparte de los hitos reales y no confunde la recepción en planta con la llegada a puerto", () => {
    const html = renderToStaticMarkup(
      <HitosLotePanel lote={lote()} canManage={false} onRegistrar={noop} onEliminar={noop} />,
    );
    expect(html).toContain("ETA informada por el proveedor (estimación)");
    expect(html).toContain("ETA del tracking marítimo (estimación)");
    // Cada hito conserva su etiqueta propia y su fuente.
    expect(html).toContain("Llegada a puerto (real)");
    expect(html).toContain("Recepción física en planta");
    expect(html).toContain("Levante aduanero");
    expect(html).toContain("ExpedienteAduanero.fechaLevante");
    expect(html).toContain("Manual · Ana Gómez · LoteImportacionHito");
    expect(html).toContain("Sistema");
  });

  it("un hito sin fecha se muestra 'Sin registrar' y no se completa con una estimación", () => {
    const html = renderToStaticMarkup(
      <HitosLotePanel lote={lote()} canManage={false} onRegistrar={noop} onEliminar={noop} />,
    );
    expect(html.match(/Sin registrar/g)?.length).toBe(2); // embarque e inspección
  });

  it("sin permiso de gestión no hay controles de registro; con permiso solo para los hitos manuales", () => {
    const sinPermiso = renderToStaticMarkup(
      <HitosLotePanel lote={lote()} canManage={false} onRegistrar={noop} onEliminar={noop} />,
    );
    expect(sinPermiso).not.toContain('type="date"');
    expect(sinPermiso).not.toContain("Registrar");

    const conPermiso = renderToStaticMarkup(
      <HitosLotePanel lote={lote()} canManage onRegistrar={noop} onEliminar={noop} />,
    );
    // Embarque, llegada a puerto e inspección: tres selectores de fecha.
    expect(conPermiso.match(/type="date"/g)?.length).toBe(3);
    // La llegada a puerto ya tiene fecha → "Corregir"; los otros dos → "Registrar".
    expect(conPermiso).toContain("Corregir");
    expect(conPermiso.match(/Registrar/g)?.length).toBe(2);
  });

  it("una respuesta sin hitos informa la ausencia en vez de inventar fechas", () => {
    const html = renderToStaticMarkup(
      <HitosLotePanel
        lote={lote({ hitos: undefined })}
        canManage={false}
        onRegistrar={noop}
        onEliminar={noop}
      />,
    );
    expect(html).toContain("Sin información de hitos.");
  });
});
