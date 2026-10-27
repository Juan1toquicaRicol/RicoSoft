import { describe, expect, it } from "vitest";

import { formatoHoraReloj, hoyLocal } from "./hora-reloj";

describe("formatoHoraReloj", () => {
  it("distingue a. m. y p. m. en formato de 12 horas", () => {
    expect(formatoHoraReloj("2026-10-27T08:05:09.000Z")).toBe("27/10/2026 08:05:09 a. m.");
    expect(formatoHoraReloj("2026-10-27T15:30:00.000Z")).toBe("27/10/2026 03:30:00 p. m.");
    expect(formatoHoraReloj("2026-10-27T23:59:59.000Z")).toBe("27/10/2026 11:59:59 p. m.");
  });

  it("medianoche es 12 a. m. y mediodía es 12 p. m.", () => {
    expect(formatoHoraReloj("2026-10-27T00:00:00.000Z")).toBe("27/10/2026 12:00:00 a. m.");
    expect(formatoHoraReloj("2026-10-27T12:00:00.000Z")).toBe("27/10/2026 12:00:00 p. m.");
    expect(formatoHoraReloj("2026-10-27T12:59:00.000Z")).toBe("27/10/2026 12:59:00 p. m.");
    expect(formatoHoraReloj("2026-10-27T00:01:00.000Z")).toBe("27/10/2026 12:01:00 a. m.");
  });

  it("no desplaza la hora del reloj con la zona horaria del navegador (usa componentes UTC)", () => {
    // Una marcación de las 02:00 del 1 de noviembre no cae en el día anterior.
    expect(formatoHoraReloj("2026-11-01T02:00:00.000Z")).toBe("01/11/2026 02:00:00 a. m.");
  });
});

describe("hoyLocal", () => {
  it("usa el día local del navegador, no el UTC", () => {
    expect(hoyLocal(new Date(2026, 9, 27, 23, 30))).toBe("2026-10-27");
    expect(hoyLocal(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
  });
});
