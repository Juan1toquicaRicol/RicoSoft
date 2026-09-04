import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app";

const app = createApp();

describe("GET /health", () => {
  it("responde 200 sin requerir autenticación", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("rutas protegidas", () => {
  it("rechaza con 401 una petición sin token", async () => {
    const res = await request(app).get("/api/usuarios");
    expect(res.status).toBe(401);
  });

  it("rechaza con 403 un token inválido", async () => {
    const res = await request(app)
      .get("/api/usuarios")
      .set("Authorization", "Bearer token-invalido");
    expect(res.status).toBe(403);
  });
});

describe("rutas no encontradas bajo /api", () => {
  it("responde 404 en vez de colgarse o tirar un error 500", async () => {
    const res = await request(app).get("/api/esto-no-existe");
    expect(res.status).toBe(404);
  });
});
