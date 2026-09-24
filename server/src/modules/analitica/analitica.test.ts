import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

/**
 * RBAC de las rutas de Analítica (auditoría 2026-09, P1): GET /dashboard antes
 * solo exigía sesión. Se monta el router REAL con el middleware
 * requirePermission REAL; solo se sustituyen la autenticación JWT (por un
 * usuario inyectado por cabecera), el aislamiento tenantPrisma y el
 * controlador (para no tocar BD).
 */
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
vi.mock("./analitica.controller", () => {
  const handler = (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) =>
    res.status(200).json({ ok: true });
  return {
    obtenerResumenAnalitica: handler,
    obtenerDashboardResumen: handler,
    registrarProyeccion: handler,
    obtenerCuentasPorPagar: handler,
    obtenerResumenGerencial: handler,
    obtenerVentasGerencial: handler,
    obtenerVentasPorVendedorGerencial: handler,
    obtenerHistoricoVentasGerencial: handler,
    obtenerClientesVentaGerencial: handler,
    obtenerCatalogoAnalisis: handler,
    ejecutarAnalisisConstructor: handler,
    listarAnalisisGuardados: handler,
    obtenerAnalisisGuardado: handler,
    crearAnalisisGuardado: handler,
    eliminarAnalisisGuardado: handler,
  };
});

import analiticaRoutes from "./analitica.routes";

const app = express();
app.use(express.json());
app.use("/api/analitica", analiticaRoutes);

const usuario = (permisos: string[], isSuperadmin = false) =>
  JSON.stringify({ id: "u1", tenantId: "t1", isSuperadmin, permisos });

describe("GET /api/analitica/dashboard — exige analitica.ver", () => {
  it("sin sesión -> 401", async () => {
    expect((await request(app).get("/api/analitica/dashboard")).status).toBe(401);
  });

  it("autenticado SIN analitica.ver -> 403 (aunque tenga otros permisos de módulo)", async () => {
    const res = await request(app)
      .get("/api/analitica/dashboard")
      .set("x-test-user", usuario(["facturas.ver", "solicitudes.ver", "creditos.ver"]));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: "No tienes permiso para realizar esta acción." });
  });

  it("con analitica.ver -> 200", async () => {
    const res = await request(app)
      .get("/api/analitica/dashboard")
      .set("x-test-user", usuario(["analitica.ver"]));
    expect(res.status).toBe(200);
  });

  it("superadmin -> 200", async () => {
    const res = await request(app).get("/api/analitica/dashboard").set("x-test-user", usuario([], true));
    expect(res.status).toBe(200);
  });
});

describe("todas las rutas de Analítica exigen un permiso explícito", () => {
  it("cada ruta declara más de un handler (authenticateJWT global + requirePermission), sin excepciones", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const capas = (analiticaRoutes as any).stack as Array<{
      route?: { path: string; methods: Record<string, boolean>; stack: unknown[] };
    }>;
    const rutas = capas.filter((c) => c.route).map((c) => c.route!);
    expect(rutas.length).toBeGreaterThan(10);
    const sinPermiso = rutas.filter((r) => r.stack.length < 2).map((r) => r.path);
    expect(sinPermiso).toEqual([]);
  });

  it("una ruta cualquiera de analítica sin permiso también da 403", async () => {
    const res = await request(app)
      .get("/api/analitica/resumen")
      .set("x-test-user", usuario(["facturas.ver"]));
    expect(res.status).toBe(403);
  });
});
