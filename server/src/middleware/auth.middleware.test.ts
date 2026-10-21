import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";

/**
 * C1 (auditoría 2026-10): un fallo de BD al validar la sesión no debe
 * confundirse con un JWT inválido. Se usa el authenticateJWT REAL; solo se
 * sustituyen los helpers de sesión (sin tocar BD).
 */
// auth.middleware lee JWT_SECRET al cargarse: debe fijarse antes del import.
const { SECRET, verificarTokenVersion, loadSessionUser } = vi.hoisted(() => ({
  SECRET: (process.env.JWT_SECRET = "test-secret-auth-middleware"),
  verificarTokenVersion: vi.fn(),
  loadSessionUser: vi.fn(),
}));
vi.mock("../lib/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/permissions")>()),
  verificarTokenVersion,
  loadSessionUser,
}));
vi.mock("../config/prisma", () => ({ prisma: {} }));

import { authenticateJWT } from "./auth.middleware";

const errorBD = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("detalle interno: conexion sql://secreto", {
    code,
    clientVersion: "5.22.0",
  });

let erroresGlobales: unknown[];
const app = express();
app.get("/protegido", authenticateJWT, (req, res) => {
  res.json({ ok: true, user: (req as unknown as { user: unknown }).user });
});
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    erroresGlobales.push(err);
    res.status(500).json({ message: "Error interno" });
  },
);

const tokenValido = () => jwt.sign({ sub: "u1", tv: 1 }, SECRET);
const llamar = (token?: string) =>
  request(app)
    .get("/protegido")
    .set(token ? { Authorization: `Bearer ${token}` } : {});

beforeEach(() => {
  vi.clearAllMocks();
  erroresGlobales = [];
  verificarTokenVersion.mockResolvedValue(true);
  loadSessionUser.mockResolvedValue({ id: "u1", activo: true });
});

describe("authenticateJWT", () => {
  it("sin token responde 401", async () => {
    const res = await llamar();
    expect(res.status).toBe(401);
    expect(verificarTokenVersion).not.toHaveBeenCalled();
  });

  it("JWT inválido responde 403 y no consulta la BD", async () => {
    const res = await llamar("no-es-un-jwt");
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Token inválido o expirado.");
    expect(verificarTokenVersion).not.toHaveBeenCalled();
    expect(loadSessionUser).not.toHaveBeenCalled();
  });

  it("JWT vencido responde 403 y no consulta la BD", async () => {
    const vencido = jwt.sign({ sub: "u1", tv: 1 }, SECRET, { expiresIn: -10 });
    const res = await llamar(vencido);
    expect(res.status).toBe(403);
    expect(verificarTokenVersion).not.toHaveBeenCalled();
  });

  it("tokenVersion no vigente responde 403", async () => {
    verificarTokenVersion.mockResolvedValue(false);
    const res = await llamar(tokenValido());
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Token inválido o expirado.");
    expect(loadSessionUser).not.toHaveBeenCalled();
  });

  it("usuario inexistente responde 401", async () => {
    loadSessionUser.mockResolvedValue(null);
    const res = await llamar(tokenValido());
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Usuario inválido o inactivo.");
  });

  it("usuario inactivo responde 401", async () => {
    loadSessionUser.mockResolvedValue({ id: "u1", activo: false });
    const res = await llamar(tokenValido());
    expect(res.status).toBe(401);
  });

  it("sesión válida continúa y expone req.user", async () => {
    const res = await llamar(tokenValido());
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: "u1", activo: true });
  });

  it("BD no disponible al verificar tokenVersion responde 503 genérico (no 403)", async () => {
    verificarTokenVersion.mockRejectedValue(errorBD("P1001"));
    const res = await llamar(tokenValido());
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|sql:\/\/|P1001/);
    expect(loadSessionUser).not.toHaveBeenCalled();
  });

  it("BD no disponible al cargar el usuario responde 503 genérico", async () => {
    loadSessionUser.mockRejectedValue(errorBD("P2024"));
    const res = await llamar(tokenValido());
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/secreto|sql:\/\/|P2024/);
  });

  it("error de inicialización de Prisma responde 503", async () => {
    loadSessionUser.mockRejectedValue(
      new Prisma.PrismaClientInitializationError("no se pudo conectar", "5.22.0"),
    );
    const res = await llamar(tokenValido());
    expect(res.status).toBe(503);
  });

  it("error inesperado de programación llega al manejador global (500), no 503 ni 403", async () => {
    const bug = new TypeError("undefined is not a function");
    loadSessionUser.mockRejectedValue(bug);
    const res = await llamar(tokenValido());
    expect(res.status).toBe(500);
    expect(erroresGlobales).toEqual([bug]);
  });

  it("error Prisma que no es de disponibilidad (p. ej. P2022) llega al manejador global", async () => {
    const e = errorBD("P2022");
    verificarTokenVersion.mockRejectedValue(e);
    const res = await llamar(tokenValido());
    expect(res.status).toBe(500);
    expect(erroresGlobales).toEqual([e]);
  });
});
