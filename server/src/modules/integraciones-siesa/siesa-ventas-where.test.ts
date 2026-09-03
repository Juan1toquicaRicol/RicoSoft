import { describe, it, expect } from "vitest";
import { construirWhereHistorico } from "./siesa-ventas.service";

/**
 * construirWhereHistorico es una función pura (solo arma texto SQL
 * parametrizado, nunca lo ejecuta) — se prueba sin conexión a Siesa. La
 * consulta real ya está verificada en vivo (ver comentarios de
 * siesa-ventas.service.ts); esto solo cubre que los filtros nuevos
 * (vendedor/cliente/producto, drill-down de la analítica comercial) generen
 * las cláusulas esperadas y usen SIEMPRE parámetros (@algo), nunca
 * interpolación directa del valor — la defensa real contra inyección SQL.
 */
describe("construirWhereHistorico", () => {
  const base = { ciaId: 1, desde: new Date("2026-01-01"), hasta: new Date("2026-02-01") };

  it("con solo los filtros obligatorios, arma el WHERE base sin cláusulas opcionales", () => {
    const where = construirWhereHistorico(base);
    expect(where).toBe("f.f461_id_cia = @ciaId AND f.f461_id_fecha >= @desde AND f.f461_id_fecha < @hasta");
  });

  it("agrega la cláusula de search cuando se pasa texto libre", () => {
    const where = construirWhereHistorico({ ...base, search: "acme" });
    expect(where).toContain(
      "(tc.f200_razon_social LIKE @search OR tc.f200_nit LIKE @search OR tv.f200_razon_social LIKE @search)",
    );
  });

  it("agrega la cláusula de vendedorRowId parametrizada, no interpolada", () => {
    const where = construirWhereHistorico({ ...base, vendedorRowId: 42 });
    expect(where).toContain("f.f461_rowid_tercero_vendedor = @vendedorRowId");
    expect(where).not.toContain("42"); // nunca se interpola el valor directamente en el SQL
  });

  it("agrega la cláusula de clienteRowId parametrizada, no interpolada", () => {
    const where = construirWhereHistorico({ ...base, clienteRowId: 77 });
    expect(where).toContain("f.f461_rowid_tercero_fact = @clienteRowId");
    expect(where).not.toContain("77");
  });

  it("agrega el EXISTS de itemRowId contra v470_ventas, parametrizado", () => {
    const where = construirWhereHistorico({ ...base, itemRowId: 9 });
    expect(where).toContain("EXISTS (SELECT 1 FROM v470_ventas v");
    expect(where).toContain("v.v470_rowid_item_ext = @itemRowId");
    expect(where).not.toMatch(/= 9\b/);
  });

  it("combina todos los filtros a la vez con AND, sin perder ninguno", () => {
    const where = construirWhereHistorico({
      ...base,
      search: "acme",
      vendedorRowId: 1,
      clienteRowId: 2,
      itemRowId: 3,
    });
    expect(where).toContain("@search");
    expect(where).toContain("@vendedorRowId");
    expect(where).toContain("@clienteRowId");
    expect(where).toContain("@itemRowId");
    expect(where.split(" AND ").length).toBeGreaterThanOrEqual(6);
  });
});
