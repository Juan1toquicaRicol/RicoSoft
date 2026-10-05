import { describe, it, expect, vi, beforeEach } from "vitest";

const { proveedorFindMany } = vi.hoisted(() => ({ proveedorFindMany: vi.fn() }));

vi.mock("../../config/prisma", () => ({ prisma: { proveedor: { findMany: proveedorFindMany } } }));
vi.mock("../integraciones-siesa/siesa-inventario.service", () => ({ buscarItemsSiesa: vi.fn() }));

const { extraerEmail, identificarProveedor } =
  await import("./importaciones-bandeja-matching.service");

describe("extraerEmail", () => {
  it("extrae la dirección del formato 'Nombre <correo@dominio>'", () => {
    expect(extraerEmail('"Ventas Boreal" <Sales@BorealTech.example>')).toBe(
      "sales@borealtech.example",
    );
  });

  it("acepta una dirección simple y la normaliza", () => {
    expect(extraerEmail("  Sales@BorealTech.example ")).toBe("sales@borealtech.example");
  });
});

describe("identificarProveedor: remitente con nombre", () => {
  beforeEach(() => proveedorFindMany.mockReset());

  it("busca el email exacto sin el nombre visible", async () => {
    const candidato = { id: "p1", tenantId: "t1", nombre: "Boreal", nit: "900" };
    proveedorFindMany.mockResolvedValueOnce([candidato]);

    const resultado = await identificarProveedor(null, {
      remitenteEmail: "Boreal Tech <sales@borealtech.example>",
    });

    expect(resultado).toEqual({ tipo: "UNICO", valor: candidato });
    expect(proveedorFindMany.mock.calls[0][0].where.email).toBe("sales@borealtech.example");
  });
});
