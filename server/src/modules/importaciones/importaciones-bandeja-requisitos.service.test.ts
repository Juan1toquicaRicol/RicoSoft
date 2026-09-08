import { describe, it, expect } from "vitest";
import { evaluarRequisitos, requisitosFaltantes } from "./importaciones-bandeja-requisitos.service";

const REQUISITOS = [
  { id: "1", nombre: "Factura comercial", tipo: "DOCUMENTO", obligatorio: true },
  { id: "2", nombre: "Certificado de origen", tipo: "DOCUMENTO", obligatorio: true },
  { id: "3", nombre: "Foto del embalaje", tipo: "DOCUMENTO", obligatorio: false },
];

describe("evaluarRequisitos / requisitosFaltantes", () => {
  it("un requisito 'Factura comercial' se marca cubierto si llegó un correo clasificado FACTURA", () => {
    const estados = evaluarRequisitos(REQUISITOS, ["FACTURA"]);
    expect(estados.find((e) => e.id === "1")?.cubierto).toBe(true);
    expect(estados.find((e) => e.id === "2")?.cubierto).toBe(false);
  });

  it("proveedor sin ningún correo clasificado -> todos los requisitos activos quedan sin cubrir", () => {
    const estados = evaluarRequisitos(REQUISITOS, []);
    expect(estados.every((e) => !e.cubierto)).toBe(true);
  });

  it("requisitosFaltantes solo incluye obligatorios no cubiertos (ignora el opcional)", () => {
    const estados = evaluarRequisitos(REQUISITOS, ["FACTURA"]);
    const faltantes = requisitosFaltantes(estados);
    expect(faltantes.map((f) => f.nombre)).toEqual(["Certificado de origen"]);
  });

  it("con todos los correos relevantes ya vistos, no queda ningún requisito faltante", () => {
    const estados = evaluarRequisitos(REQUISITOS, ["FACTURA", "CERTIFICADO"]);
    expect(requisitosFaltantes(estados)).toEqual([]);
  });

  it("un proveedor sin requisitos activos nunca genera faltantes", () => {
    const estados = evaluarRequisitos([], ["FACTURA"]);
    expect(requisitosFaltantes(estados)).toEqual([]);
  });

  it("un requisito inactivo no entra siquiera a la evaluación (el llamador ya filtra activo:true)", () => {
    // evaluarRequisitos recibe la lista YA filtrada por activo=true (ver
    // evaluarRequisitosDeOrden) — este test documenta ese contrato: si algo
    // inactivo se colara, igual sería evaluado (la función en sí no filtra),
    // así que la responsabilidad de excluir inactivos es de quien arma la
    // lista de entrada.
    const soloActivos = REQUISITOS.filter((r) => r.id !== "3");
    const estados = evaluarRequisitos(soloActivos, []);
    expect(estados).toHaveLength(2);
  });
});
