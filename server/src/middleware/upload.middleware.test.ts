import { describe, it, expect } from "vitest";
import { detectarTipoRealPorMagicBytes } from "./upload.middleware";

/**
 * M-03 (hardening 2026-09-02): el mimetype declarado por el cliente no es
 * evidencia suficiente del contenido real. Estas pruebas validan el
 * detector de magic bytes de forma aislada (sin HTTP ni disco) para los 4
 * tipos que RicoSoft permite hoy — la cobertura end-to-end (subida real
 * rechazada/aceptada) vive en las suites de integración de
 * Facturas/Importaciones, que ya ejercitan este middleware.
 */
describe("detectarTipoRealPorMagicBytes", () => {
  it("reconoce un PDF real por su firma %PDF-", () => {
    const buffer = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj");
    expect(detectarTipoRealPorMagicBytes(buffer)).toBe("application/pdf");
  });

  it("reconoce un PNG real por su firma de 8 bytes", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    expect(detectarTipoRealPorMagicBytes(buffer)).toBe("image/png");
  });

  it("reconoce un JPEG real por su firma FF D8 FF", () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectarTipoRealPorMagicBytes(buffer)).toBe("image/jpeg");
  });

  it("reconoce un WEBP real por RIFF....WEBP", () => {
    const buffer = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP"),
    ]);
    expect(detectarTipoRealPorMagicBytes(buffer)).toBe("image/webp");
  });

  it("un archivo de texto plano renombrado con extensión .pdf NO se reconoce como ningún tipo permitido", () => {
    const buffer = Buffer.from("esto es texto plano, no un PDF real");
    expect(detectarTipoRealPorMagicBytes(buffer)).toBeNull();
  });

  it("un ejecutable/script (firma MZ, típica de .exe) no se reconoce como ninguno de los 4 tipos permitidos", () => {
    const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]);
    expect(detectarTipoRealPorMagicBytes(buffer)).toBeNull();
  });

  it("un buffer vacío o demasiado corto no se reconoce como ningún tipo (sin lanzar excepción)", () => {
    expect(detectarTipoRealPorMagicBytes(Buffer.alloc(0))).toBeNull();
    expect(detectarTipoRealPorMagicBytes(Buffer.from([0xff]))).toBeNull();
  });
});
