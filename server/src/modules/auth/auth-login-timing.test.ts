import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

/**
 * Enumeración de cuentas por tiempo de respuesta (auditoría de seguridad
 * 2026-10-20): un correo inexistente debe ejecutar la misma comparación bcrypt
 * que uno existente con contraseña incorrecta.
 */
const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  auditoriaCreate: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    auditoria: { create: db.auditoriaCreate },
  },
}));

import { AuthError, loginUserService } from "./auth.service";

describe("loginUserService — igualdad de costo ante correo inexistente", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    db.auditoriaCreate.mockResolvedValue({});
  });

  it("compara con bcrypt aunque el correo no exista y responde el mismo error genérico", async () => {
    db.userFindUnique.mockResolvedValue(null);
    const compare = vi.spyOn(bcrypt, "compare");

    const fallo = await loginUserService({
      email: "nadie@ricol.com.co",
      password: "Clave1234",
    }).catch((e) => e);

    expect(compare).toHaveBeenCalledTimes(1);
    expect(fallo).toBeInstanceOf(AuthError);
    expect((fallo as AuthError).message).toBe(
      "Credenciales inválidas. Correo o contraseña incorrectos.",
    );
    // No se audita (no hay usuario/tenant reales a quien atribuirlo).
    expect(db.auditoriaCreate).not.toHaveBeenCalled();
  });

  it("devuelve el mismo mensaje que una contraseña incorrecta de un usuario existente", async () => {
    const passwordHash = await bcrypt.hash("OtraClave1234", 10);
    db.userFindUnique.mockResolvedValue({
      id: "u1",
      email: "ana@ricol.com.co",
      tenantId: "t1",
      passwordHash,
      activo: true,
      tokenVersion: 0,
    });

    const fallo = await loginUserService({
      email: "ana@ricol.com.co",
      password: "Incorrecta123",
    }).catch((e) => e);

    expect(fallo).toBeInstanceOf(AuthError);
    expect((fallo as AuthError).message).toBe(
      "Credenciales inválidas. Correo o contraseña incorrectos.",
    );
  });
});
