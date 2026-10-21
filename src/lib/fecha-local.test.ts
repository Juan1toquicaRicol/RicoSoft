import { describe, expect, it } from "vitest";
import { formatearFechaDia, hoyLocalISO } from "./fecha-local";

describe("formatearFechaDia", () => {
  it("una fecha guardada como medianoche UTC se muestra con el mismo día (sin retroceder)", () => {
    expect(formatearFechaDia("2026-10-06T00:00:00.000Z")).toBe("6/10/2026");
  });
});

describe("hoyLocalISO", () => {
  it("usa los componentes locales de la fecha", () => {
    expect(hoyLocalISO(new Date(2026, 9, 6, 23, 30))).toBe("2026-10-06");
    expect(hoyLocalISO(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });
});
