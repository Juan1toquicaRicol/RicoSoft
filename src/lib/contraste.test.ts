import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { razonContraste } from "./contraste";
import { CLASES_TONO_ESTADO, TONOS_ESTADO, tonoDeEstado } from "./estado-tono";

const css = readFileSync(join(__dirname, "..", "styles.css"), "utf8");
const token = (nombre: string): string => {
  const m = new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`Falta el token --${nombre} en styles.css`);
  return m[1];
};

/** Paleta oficial del semáforo (dictamen de auditoría visual). */
const PALETA = {
  success: { bg: "#ecfdf3", fg: "#166534" },
  warning: { bg: "#fffaeb", fg: "#92400e" },
  danger: { bg: "#fef3f2", fg: "#b42318" },
  info: { bg: "#eff6ff", fg: "#1d4ed8" },
  neutral: { bg: "#f1f5f9", fg: "#475569" },
} as const;

describe("tokens del semáforo de estado (styles.css)", () => {
  it.each(TONOS_ESTADO)("%s: fondo/texto oficiales y contraste WCAG AA (>= 4.5:1)", (tono) => {
    const bg = token(`estado-${tono}-bg`);
    const fg = token(`estado-${tono}-fg`);
    expect(bg.toLowerCase()).toBe(PALETA[tono].bg);
    expect(fg.toLowerCase()).toBe(PALETA[tono].fg);
    expect(razonContraste(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("cada tono tiene también el token de borde y está expuesto a Tailwind (--color-estado-*)", () => {
    for (const tono of TONOS_ESTADO) {
      expect(() => token(`estado-${tono}-border`)).not.toThrow();
      for (const parte of ["bg", "fg", "border"]) {
        expect(css).toContain(`--color-estado-${tono}-${parte}: var(--estado-${tono}-${parte})`);
      }
    }
  });

  it("las clases de cada tono usan solo los tokens de su tono (sin colores sueltos)", () => {
    for (const tono of TONOS_ESTADO) {
      expect(CLASES_TONO_ESTADO[tono]).toBe(
        `border-estado-${tono}-border bg-estado-${tono}-bg text-estado-${tono}-fg`,
      );
    }
  });

  it("texto secundario del sistema (slate-500) sobre blanco cumple AA; slate-400 NO (no usar para texto)", () => {
    expect(razonContraste("#64748b", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(razonContraste("#94a3b8", "#ffffff")).toBeLessThan(4.5);
  });
});

describe("semántica del semáforo para el flujo comercial y la integración Siesa", () => {
  it("Comprometido = success; Pendiente de envío a ERP = warning; No enviado = danger; Vinculado = info; Sin vínculo = neutral", () => {
    expect(tonoDeEstado("Comprometido")).toBe("success");
    expect(tonoDeEstado("Pendiente de envío a ERP")).toBe("warning");
    expect(tonoDeEstado("El pedido no ha sido enviado")).toBe("danger");
    expect(tonoDeEstado("No encontrado en Siesa")).toBe("danger");
    expect(tonoDeEstado("Vinculado")).toBe("info");
    expect(tonoDeEstado("Sin vínculo")).toBe("neutral");
    expect(tonoDeEstado("No comprometido")).toBe("neutral");
  });

  it("estados de Proforma y de otros módulos siguen el mismo semáforo (sin divergencias)", () => {
    expect(tonoDeEstado("ENVIADA")).toBe("warning");
    expect(tonoDeEstado("ACEPTADA")).toBe("success");
    expect(tonoDeEstado("PEDIDO_CREADO")).toBe("success");
    expect(tonoDeEstado("ANULADA")).toBe("danger");
    expect(tonoDeEstado("Aprobado")).toBe("success");
    expect(tonoDeEstado("Vencido")).toBe("danger");
    expect(tonoDeEstado("Estado desconocido")).toBe("neutral");
  });
});
