import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// El router real, con la autenticación sustituida por un superadmin de TENANT
// (el caso que antes abría el triage cross-tenant). Sin BD: el controller de
// triage ya no toca Prisma, y si algo lo hiciera el mock lo haría fallar.
const m = vi.hoisted(() => ({ prisma: vi.fn() }));

vi.mock("../../config/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: () => {
        m.prisma();
        throw new Error("El triage denegado no debe consultar la base de datos.");
      },
    },
  ),
}));
vi.mock("../../lib/tenant-prisma", () => ({ getTenantPrisma: vi.fn() }));
vi.mock("../../lib/inbox", () => ({ resolverItemDeTrabajo: vi.fn() }));
vi.mock("../../middleware/auth.middleware", () => ({
  authenticateJWT: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    req.user = {
      id: "u1",
      tenantId: "ten-A",
      nombre: "Super A",
      isSuperadmin: true,
      permisos: [],
    };
    next();
  },
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requireSuperadmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: router } = await import("./importaciones-bandeja.routes");

const app = express();
app.use(express.json());
app.use("/api/importaciones/bandeja", router);

describe("Bandeja: triage /sin-asignar denegado (isSuperadmin es por tenant)", () => {
  it("un superadmin de tenant no puede listar correos sin tenant", async () => {
    const res = await request(app).get("/api/importaciones/bandeja/sin-asignar");
    expect(res.status).toBe(403);
    expect(Array.isArray(res.body)).toBe(false);
    expect(m.prisma).not.toHaveBeenCalled();
  });

  it("un superadmin de tenant no puede asignar un correo a un proveedor", async () => {
    const res = await request(app)
      .post(
        "/api/importaciones/bandeja/sin-asignar/11111111-1111-4111-8111-111111111111/asignar-proveedor",
      )
      .send({ proveedorId: "22222222-2222-4222-8222-222222222222" });
    expect(res.status).toBe(403);
    expect(m.prisma).not.toHaveBeenCalled();
  });

  it("cualquier otro método/subruta bajo /sin-asignar también se deniega", async () => {
    const res = await request(app).delete("/api/importaciones/bandeja/sin-asignar/cualquiera");
    expect(res.status).toBe(403);
  });
});
