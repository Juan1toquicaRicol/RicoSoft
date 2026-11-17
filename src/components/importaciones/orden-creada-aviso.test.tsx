import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { copiarTexto, esMarcaOrdenCreada, sinMarcaOrdenCreada } from "./orden-creada";
import { OrdenCreadaAviso } from "./orden-creada-aviso";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrdenCreadaAviso", () => {
  it("destaca el número definitivo, ofrece copiar y anuncia con aria-live", () => {
    const html = renderToStaticMarkup(
      <OrdenCreadaAviso
        codigo="IMP-TEST-1"
        onCerrar={vi.fn()}
        onAdjuntarDocumentos={vi.fn()}
        onCrearLotes={vi.fn()}
      />,
    );
    expect(html).toContain("Orden creada");
    expect(html).toContain("IMP-TEST-1");
    expect(html).toContain("Copiar número");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Siguiente paso:");
    // Los documentos van primero: se suben después de persistir la orden.
    expect(html.indexOf("Adjuntar documentos")).toBeLessThan(
      html.indexOf("Crear lotes de embarque"),
    );
  });

  it("omite las acciones que no corresponden (sin permiso/estado)", () => {
    const html = renderToStaticMarkup(<OrdenCreadaAviso codigo="IMP-TEST-1" onCerrar={vi.fn()} />);
    expect(html).not.toContain("Siguiente paso:");
    expect(html).not.toContain("Adjuntar documentos");
    expect(html).not.toContain("Crear lotes de embarque");
  });
});

describe("copiarTexto", () => {
  it("usa navigator.clipboard cuando está disponible", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copiarTexto("IMP-TEST-1")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("IMP-TEST-1");
  });

  it("cae a execCommand si clipboard falla", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denegado")) },
    });
    const area = { value: "", setAttribute: vi.fn(), select: vi.fn(), style: {} };
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(area),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand,
    });
    await expect(copiarTexto("IMP-TEST-1")).resolves.toBe(true);
    expect(area.value).toBe("IMP-TEST-1");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("devuelve false si no hay ningún mecanismo disponible", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);
    await expect(copiarTexto("IMP-TEST-1")).resolves.toBe(false);
  });
});

describe("marca de orden creada en el historial (mostrar una sola vez, atada a la orden)", () => {
  it("detecta la marca solo si el id coincide con el de la ruta", () => {
    expect(esMarcaOrdenCreada({ ordenCreadaId: "ord-1" }, "ord-1")).toBe(true);
    expect(esMarcaOrdenCreada({ ordenCreadaId: "ord-1" }, "ord-2")).toBe(false);
    expect(esMarcaOrdenCreada({ ordenCreadaId: undefined }, "ord-1")).toBe(false);
    expect(esMarcaOrdenCreada({}, "ord-1")).toBe(false);
    expect(esMarcaOrdenCreada(null, "ord-1")).toBe(false);
    expect(esMarcaOrdenCreada(undefined, "ord-1")).toBe(false);
  });

  it("el estado consumido conserva el resto de claves y ya no tiene la marca", () => {
    const consumido = sinMarcaOrdenCreada({ __TSR_index: 3, ordenCreadaId: "ord-1" });
    expect(esMarcaOrdenCreada(consumido, "ord-1")).toBe(false);
    expect(consumido).toMatchObject({ __TSR_index: 3 });
  });
});
