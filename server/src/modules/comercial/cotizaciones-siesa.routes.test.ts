import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * RBAC y cableado de POST /comercial/cotizaciones/siesa/sincronizar: router
 * REAL de comercial con requirePermission REAL; se sustituyen solo la
 * autenticación JWT, tenantPrisma y el servicio de ingesta.
 */
const servicio = vi.hoisted(() => ({ sincronizar: vi.fn() }));

vi.mock("../../middleware/auth.middleware", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../middleware/auth.middleware")>();
  return {
    ...original,
    authenticateJWT: (
      req: express.Request & { user?: unknown },
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const cabecera = req.header("x-test-user");
      if (!cabecera) return res.status(401).json({ message: "No autenticado." });
      req.user = JSON.parse(cabecera);
      return next();
    },
  };
});
vi.mock("../../middleware/tenant-prisma.middleware", () => ({
  attachTenantPrisma: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("./cotizaciones-siesa.service", async (importOriginal) => {
  const original = await importOriginal<typeof import("./cotizaciones-siesa.service")>();
  return { ...original, sincronizarCotizacionesSiesa: servicio.sincronizar };
});

import comercialRoutes from "./comercial.routes";
import { SiesaCiaNoConfiguradaError } from "./cotizaciones-siesa.service";

const app = express();
app.use(express.json());
app.use("/api/comercial", comercialRoutes);
// Manejador global equivalente al de app.ts (errores no capturados -> 502).
app.use(
  (_err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(502).json({ message: "No fue posible conectar con Siesa en este momento." });
  },
);

const usuario = (permisos: string[], isSuperadmin = false) =>
  JSON.stringify({
    id: "u1",
    nombre: "Ana Comercial",
    tenantId: "tenant-A",
    isSuperadmin,
    permisos,
  });
const RUTA = "/api/comercial/cotizaciones/siesa/sincronizar";

describe("POST /comercial/cotizaciones/siesa/sincronizar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servicio.sincronizar.mockResolvedValue({ modo: "SIMULACION", total: 0, cotizaciones: [] });
  });

  it("sin sesión -> 401", async () => {
    expect((await request(app).post(RUTA).send({})).status).toBe(401);
    expect(servicio.sincronizar).not.toHaveBeenCalled();
  });

  it("solo cotizaciones.ver (sin gestionar) -> 403 y el servicio NO se ejecuta", async () => {
    const res = await request(app)
      .post(RUTA)
      .set("x-test-user", usuario(["cotizaciones.ver"]))
      .send({});
    expect(res.status).toBe(403);
    expect(servicio.sincronizar).not.toHaveBeenCalled();
  });

  it("cotizaciones.gestionar (+ver) -> 200; superadmin -> 200", async () => {
    const ok = await request(app)
      .post(RUTA)
      .set("x-test-user", usuario(["cotizaciones.ver", "cotizaciones.gestionar"]))
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.modo).toBe("SIMULACION");
    const admin = await request(app).post(RUTA).set("x-test-user", usuario([], true)).send({});
    expect(admin.status).toBe(200);
  });

  it("el tenant sale de la sesión: ciaId/tenantId del body se IGNORAN", async () => {
    await request(app)
      .post(RUTA)
      .set("x-test-user", usuario([], true))
      .send({ ciaId: 999, tenantId: "tenant-B", limite: 20, desde: "2026-08-01" });

    expect(servicio.sincronizar).toHaveBeenCalledTimes(1);
    const [tenantId, opciones, actor] = servicio.sincronizar.mock.calls[0];
    expect(tenantId).toBe("tenant-A");
    expect(opciones).toEqual({ limite: 20, desde: new Date("2026-08-01"), guardar: false });
    expect(actor).toEqual({ id: "u1", nombre: "Ana Comercial" }); // el actor sale de la sesión
    expect(opciones).not.toHaveProperty("ciaId");
    expect(opciones).not.toHaveProperty("tenantId");
  });

  it("guardar=true se propaga (persistencia); por defecto NO guarda", async () => {
    await request(app).post(RUTA).set("x-test-user", usuario([], true)).send({ guardar: true });
    expect(servicio.sincronizar.mock.calls[0][1].guardar).toBe(true);
    await request(app).post(RUTA).set("x-test-user", usuario([], true)).send({});
    expect(servicio.sincronizar.mock.calls[1][1].guardar).toBe(false);
  });

  it("guardar=true sin cotizaciones.gestionar -> 403 y NO persiste", async () => {
    const res = await request(app)
      .post(RUTA)
      .set("x-test-user", usuario(["cotizaciones.ver"]))
      .send({ guardar: true });
    expect(res.status).toBe(403);
    expect(servicio.sincronizar).not.toHaveBeenCalled();
  });

  it("guardar con un valor no booleano -> 400", async () => {
    const res = await request(app)
      .post(RUTA)
      .set("x-test-user", usuario([], true))
      .send({ guardar: "si" });
    expect(res.status).toBe(400);
  });

  it("limite inválido (0, negativo o > 200) -> 400", async () => {
    for (const limite of [0, 201, -3]) {
      const res = await request(app)
        .post(RUTA)
        .set("x-test-user", usuario([], true))
        .send({ limite });
      expect(res.status).toBe(400);
    }
  });

  it("tenant sin siesaCiaId -> 400 con mensaje claro", async () => {
    servicio.sincronizar.mockRejectedValue(new SiesaCiaNoConfiguradaError());
    const res = await request(app).post(RUTA).set("x-test-user", usuario([], true)).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/siesaCiaId/);
  });

  it("un error inesperado llega al manejador global gracias a asyncHandler (no cuelga)", async () => {
    servicio.sincronizar.mockRejectedValue(new Error("ECONNRESET host-secreto"));
    const res = await request(app)
      .post(RUTA)
      .set("x-test-user", usuario([], true))
      .send({})
      .timeout(3000);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/host-secreto|ECONNRESET/);
  });
});
