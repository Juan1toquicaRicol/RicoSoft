import { describe, expect, it } from "vitest";

import { componerNombre, datosActualizacionNombre, resolverNombreUsuario } from "./nombre-persona";

describe("resolverNombreUsuario", () => {
  it("con nombres y apellidos deriva el nombre completo de ellos", () => {
    expect(
      resolverNombreUsuario({ nombres: "  Juan   Carlos ", apellidos: " Pérez Gómez " }),
    ).toEqual({
      nombre: "Juan Carlos Pérez Gómez",
      nombres: "Juan Carlos",
      apellidos: "Pérez Gómez",
    });
  });

  it("nombres y apellidos mandan sobre un `nombre` que llegue a la vez", () => {
    expect(
      resolverNombreUsuario({ nombre: "Otro Nombre", nombres: "Ana", apellidos: "Ruiz" }),
    ).toEqual({ nombre: "Ana Ruiz", nombres: "Ana", apellidos: "Ruiz" });
  });

  it("solo con `nombre` (cliente antiguo) lo guarda tal cual y NO lo separa", () => {
    expect(resolverNombreUsuario({ nombre: "  María  Fernanda López " })).toEqual({
      nombre: "María Fernanda López",
      nombres: null,
      apellidos: null,
    });
  });

  it("un par incompleto no cuenta: cae a `nombre` o es inválido", () => {
    expect(resolverNombreUsuario({ nombre: "Ana Ruiz", nombres: "Ana" })).toEqual({
      nombre: "Ana Ruiz",
      nombres: null,
      apellidos: null,
    });
    expect(resolverNombreUsuario({ nombres: "Ana" })).toBeNull();
  });

  it("sin ningún nombre utilizable devuelve null", () => {
    expect(resolverNombreUsuario({})).toBeNull();
    expect(resolverNombreUsuario({ nombre: "   ", nombres: "", apellidos: "  " })).toBeNull();
    expect(resolverNombreUsuario({ nombre: null, nombres: null, apellidos: null })).toBeNull();
  });
});

describe("datosActualizacionNombre", () => {
  const actual = { nombre: "Juan Pérez" };

  it("con nombres y apellidos actualiza las tres columnas", () => {
    expect(datosActualizacionNombre({ nombres: "Juan", apellidos: "Pérez Gómez" }, actual)).toEqual(
      {
        nombre: "Juan Pérez Gómez",
        nombres: "Juan",
        apellidos: "Pérez Gómez",
      },
    );
  });

  it("un cliente antiguo que reenvía el mismo nombre no toca nada (conserva lo separado)", () => {
    expect(datosActualizacionNombre({ nombre: "Juan Pérez" }, actual)).toEqual({});
    expect(datosActualizacionNombre({ nombre: "  Juan   Pérez " }, actual)).toEqual({});
  });

  it("un cliente antiguo que cambia el nombre vacía lo separado (ya no coincidiría)", () => {
    expect(datosActualizacionNombre({ nombre: "Juan Andrés Pérez" }, actual)).toEqual({
      nombre: "Juan Andrés Pérez",
      nombres: null,
      apellidos: null,
    });
  });

  it("sin nombre utilizable devuelve null", () => {
    expect(datosActualizacionNombre({ nombre: "" }, actual)).toBeNull();
  });
});

describe("componerNombre", () => {
  it("une nombres y apellidos con un solo espacio", () => {
    expect(componerNombre("Ana ", " Ruiz")).toBe("Ana Ruiz");
  });
});
