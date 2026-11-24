import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TipoSeñalProveedor } from "./importaciones-bandeja-matching.service";

const { proveedorFindMany, ordenFindMany } = vi.hoisted(() => ({
  proveedorFindMany: vi.fn(),
  ordenFindMany: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    proveedor: { findMany: proveedorFindMany },
    ordenCompraIntl: { findMany: ordenFindMany },
  },
}));
vi.mock("../integraciones-siesa/siesa-inventario.service", () => ({ buscarItemsSiesa: vi.fn() }));

const {
  extraerEmail,
  hayConflictoIdentidadProveedor,
  identificarProveedor,
  identificarOrden,
  sugerirProveedores,
} = await import("./importaciones-bandeja-matching.service");

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

it("no usa una orden abierta cuando no coincide la referencia explícita", async () => {
  ordenFindMany.mockReset().mockResolvedValueOnce([]);
  expect(await identificarOrden("t1", "p1", "PO-26112401")).toEqual({ tipo: "NINGUNO" });
  expect(ordenFindMany).toHaveBeenCalledTimes(1);
});

it("presenta Hanotech por la razón social y conserva la evidencia del conflicto", async () => {
  proveedorFindMany.mockReset().mockResolvedValueOnce([
    {
      id: "han",
      tenantId: "ricol",
      nombre: "VIET NAM HANOTECH JOINT STOCK COMPANY",
      nit: "0104635981",
      email: null,
    },
    { id: "otro", tenantId: "ricol", nombre: "Proveedor de acero", nit: "555555", email: null },
  ]);
  const resultado = await sugerirProveedores("ricol", {
    remitenteEmail: "sistemas@example.test",
    campos: [
      { campo: "nombreProveedor", valor: "Viet Nam Hanotech Company" },
      { campo: "nitProveedor", valor: "12345" },
    ],
  });
  expect(proveedorFindMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { tenantId: "ricol", activo: true } }),
  );
  expect(resultado.map((x) => x.id)).toEqual(["han"]);
  expect(resultado[0].señales.map((x) => x.campo)).toEqual([
    "Razón social",
    "Identificador fiscal",
  ]);
});

describe("hayConflictoIdentidadProveedor", () => {
  const RICOL = "tenant-ricol";
  const FLEXIPACK = "tenant-flexipack";
  // Proveedor que el correo exacto del remitente identificó en Ricol.
  const remitente = { id: "prov-remitente", tenantId: RICOL };
  const sugerencia = (id: string, tenantId: string, ...tipos: TipoSeñalProveedor[]) => ({
    id,
    tenantId,
    señales: tipos.map((tipo) => ({ tipo, campo: "campo", detalle: "detalle" })),
  });

  it("NIT distinto: el documento trae un identificador diferente al del remitente", () => {
    expect(
      hayConflictoIdentidadProveedor(remitente, [
        sugerencia("prov-remitente", RICOL, "CORREO_EXACTO", "NOMBRE_EXACTO", "NIT_DISTINTO"),
      ]),
    ).toBe(true);
  });

  it("razón social exacta de otro proveedor de la misma empresa", () => {
    expect(
      hayConflictoIdentidadProveedor(remitente, [
        sugerencia("prov-remitente", RICOL, "CORREO_EXACTO"),
        sugerencia("prov-otro", RICOL, "NOMBRE_EXACTO"),
      ]),
    ).toBe(true);
  });

  it("mismo proveedor registrado en Ricol y Flexipack: el registro de Flexipack no bloquea", () => {
    // En Ricol el proveedor está con un nombre abreviado: el documento no lo
    // respalda. En Flexipack el mismo proveedor coincide en razón social y NIT.
    expect(
      hayConflictoIdentidadProveedor(remitente, [
        sugerencia("prov-remitente", RICOL, "CORREO_EXACTO"),
        sugerencia("prov-flexipack", FLEXIPACK, "NOMBRE_EXACTO", "NIT_EXACTO"),
      ]),
    ).toBe(false);
    // Tampoco cuando ambos registros coinciden con el documento.
    expect(
      hayConflictoIdentidadProveedor(remitente, [
        sugerencia("prov-flexipack", FLEXIPACK, "NOMBRE_EXACTO", "NIT_EXACTO"),
        sugerencia("prov-remitente", RICOL, "CORREO_EXACTO", "NOMBRE_EXACTO", "NIT_EXACTO"),
      ]),
    ).toBe(false);
  });

  it("no hay conflicto si el documento también identifica al proveedor del remitente", () => {
    expect(
      hayConflictoIdentidadProveedor(remitente, [
        sugerencia("prov-remitente", RICOL, "CORREO_EXACTO", "NOMBRE_EXACTO"),
        sugerencia("prov-homonimo", RICOL, "NOMBRE_EXACTO"),
      ]),
    ).toBe(false);
  });

  it("las señales débiles (dominio, nombre parecido) de otro proveedor no bloquean", () => {
    expect(
      hayConflictoIdentidadProveedor(remitente, [
        sugerencia("prov-remitente", RICOL, "CORREO_EXACTO"),
        sugerencia("prov-otro", RICOL, "DOMINIO", "NOMBRE_PARECIDO"),
      ]),
    ).toBe(false);
  });

  it("sin evidencia del documento no hay conflicto", () => {
    expect(hayConflictoIdentidadProveedor(remitente, [])).toBe(false);
  });

  it("si el remitente no figura entre las sugerencias, un NIT exacto de otro proveedor sí bloquea", () => {
    expect(
      hayConflictoIdentidadProveedor(remitente, [sugerencia("prov-otro", RICOL, "NIT_EXACTO")]),
    ).toBe(true);
  });
});

it("no trata un número más largo como si fuera la misma referencia", async () => {
  ordenFindMany
    .mockReset()
    .mockResolvedValueOnce([{ id: "otro", numeroOrden: "PO-1234", estado: "Confirmada" }]);
  expect(await identificarOrden("ricol", "proveedor", "PO-123")).toEqual({ tipo: "NINGUNO" });
});
