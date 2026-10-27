import { describe, expect, it } from "vitest";

import { crearGuardaSolicitudes } from "./solicitud-vigente";

describe("crearGuardaSolicitudes", () => {
  it("descarta la respuesta tardía del colaborador anterior (llega fuera de orden)", () => {
    const guarda = crearGuardaSolicitudes<string>();

    guarda.activar("A");
    const tokenA = guarda.iniciar("A");
    expect(tokenA).not.toBeNull();

    // El usuario cambia a B antes de que A responda.
    guarda.activar("B");
    const tokenB = guarda.iniciar("B");
    expect(tokenB).not.toBeNull();

    // B responde primero y A después: solo B es vigente.
    expect(guarda.esVigente(tokenB!)).toBe(true);
    expect(guarda.esVigente(tokenA!)).toBe(false);
  });

  it("descarta la respuesta de A aunque B aún no haya respondido", () => {
    const guarda = crearGuardaSolicitudes<string>();
    guarda.activar("A");
    const tokenA = guarda.iniciar("A")!;
    guarda.activar("B");
    guarda.iniciar("B");
    expect(guarda.esVigente(tokenA)).toBe(false);
  });

  it("no inicia una solicitud con la clave de un colaborador que ya no está activo", () => {
    const guarda = crearGuardaSolicitudes<string>();
    guarda.activar("A");
    guarda.activar("B");
    // Un refresco (p. ej. tras guardar) del cierre de A no debe invalidar la carga de B.
    expect(guarda.iniciar("A")).toBeNull();
    const tokenB = guarda.iniciar("B")!;
    expect(guarda.iniciar("A")).toBeNull();
    expect(guarda.esVigente(tokenB)).toBe(true);
  });

  it("una solicitud posterior del mismo colaborador reemplaza a la anterior", () => {
    const guarda = crearGuardaSolicitudes<string>();
    guarda.activar("A");
    const primera = guarda.iniciar("A")!;
    const segunda = guarda.iniciar("A")!;
    expect(guarda.esVigente(primera)).toBe(false);
    expect(guarda.esVigente(segunda)).toBe(true);
  });

  it("cerrar el diálogo (clave nula) invalida lo que sigue en vuelo", () => {
    const guarda = crearGuardaSolicitudes<string>();
    guarda.activar("A");
    const token = guarda.iniciar("A")!;
    guarda.activar(null);
    expect(guarda.esVigente(token)).toBe(false);
  });
});
