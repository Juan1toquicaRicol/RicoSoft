import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  eventos: vi.fn(),
}));

vi.mock("../config/prisma", () => ({
  prisma: { user: { findMany: mocks.users }, auditoria: { findMany: mocks.eventos } },
}));

import { adjuntarActores } from "./auditoria-usuarios";

describe("adjuntarActores", () => {
  it("resuelve usuarios vigentes y, si fueron eliminados, usa el snapshot USUARIO_ELIMINADO del tenant", async () => {
    mocks.users.mockResolvedValue([{ id: "u1", nombre: "Ana", email: "ana@x.com" }]);
    mocks.eventos.mockResolvedValue([
      {
        entidadId: "u2",
        datosAnteriores: JSON.stringify({ nombre: "Beto", email: "beto@x.com", activo: true }),
      },
    ]);

    const r = await adjuntarActores("t1", [
      { usuarioId: "u1" },
      { usuarioId: "u2" },
      { usuarioId: "u3" },
      { usuarioId: null },
    ]);

    expect(r.map((e) => e.usuario)).toEqual([
      { nombre: "Ana", email: "ana@x.com" },
      { nombre: "Beto", email: "beto@x.com" },
      null,
      null,
    ]);
    expect(mocks.eventos).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", accion: "USUARIO_ELIMINADO", entidadId: { in: ["u2", "u3"] } },
      }),
    );
  });
});
