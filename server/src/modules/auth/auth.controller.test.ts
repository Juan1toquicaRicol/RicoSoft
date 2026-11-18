import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  registerUserService: vi.fn(),
  loginUserService: vi.fn(),
  selectTenantService: vi.fn(),
  switchTenantService: vi.fn(),
  verificarCodigoCorreoService: vi.fn(),
  reenviarCodigoCorreoService: vi.fn(),
}));

vi.mock("./auth.service", async (importOriginal) => {
  const original = await importOriginal<typeof import("./auth.service")>();
  return { ...original, ...mocks };
});
vi.mock("./verificacion-correo.service", () => ({
  verificarCodigoCorreoService: mocks.verificarCodigoCorreoService,
  reenviarCodigoCorreoService: mocks.reenviarCodigoCorreoService,
}));
vi.mock("../../lib/permissions", () => ({ listarTenantsAccesibles: vi.fn() }));

import {
  MENSAJE_AUTH_INESPERADO,
  loginController,
  registerController,
  reenviarCodigoController,
  selectTenantController,
  switchTenantController,
  verificarCorreoController,
} from "./auth.controller";
import { AuthError } from "./auth.service";

function crearRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

// Errores "inesperados" reales: Prisma / infraestructura, con detalles que
// NUNCA deben llegar al cliente.
const ERROR_PRISMA = Object.assign(
  new Error(
    "Invalid `prisma.user.findUnique()` invocation in C:/srv/app/auth.service.ts:210 — Can't reach database server at `192.168.0.100:1433`",
  ),
  { code: "P1001", name: "PrismaClientInitializationError" },
);
const ERROR_INFRA = new Error("connect ECONNREFUSED 10.0.0.5:1433 (user=sa)");

const controladores = [
  {
    nombre: "registro",
    fn: registerController,
    servicio: mocks.registerUserService,
    statusControlado: 400,
  },
  { nombre: "login", fn: loginController, servicio: mocks.loginUserService, statusControlado: 401 },
  {
    nombre: "seleccionarTenant",
    fn: selectTenantController,
    servicio: mocks.selectTenantService,
    statusControlado: 401,
  },
  {
    nombre: "cambio de empresa",
    fn: switchTenantController,
    servicio: mocks.switchTenantService,
    statusControlado: 403,
  },
  {
    nombre: "verificar correo",
    fn: verificarCorreoController,
    servicio: mocks.verificarCodigoCorreoService,
    statusControlado: 400,
  },
  {
    nombre: "reenviar código",
    fn: reenviarCodigoController,
    servicio: mocks.reenviarCodigoCorreoService,
    statusControlado: 400,
  },
];

describe("controladores de autenticación — saneamiento de errores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  describe.each(controladores)("$nombre", ({ fn, servicio, statusControlado }) => {
    const req = { body: {}, user: { id: "u1", tenantId: "t1" } } as never;

    it.each([
      ["Prisma", ERROR_PRISMA],
      ["infraestructura", ERROR_INFRA],
    ])(
      "error inesperado de %s -> 500 genérico, sin filtrar el mensaje y con log interno",
      async (_n, error) => {
        servicio.mockRejectedValue(error);
        const res = crearRes();

        await fn(req, res as never);

        expect(res.statusCode).toBe(500);
        expect(res.body).toEqual({ message: MENSAJE_AUTH_INESPERADO });
        expect(JSON.stringify(res.body)).not.toMatch(
          /prisma|1433|192\.168|ECONNREFUSED|auth\.service|sa\)/i,
        );
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining("Error inesperado"),
          error,
        );
      },
    );

    it("AuthError (controlado) conserva su mensaje y el status propio del endpoint", async () => {
      servicio.mockRejectedValue(new AuthError("Credenciales inválidas."));
      const res = crearRes();

      await fn(req, res as never);

      expect(res.statusCode).toBe(statusControlado);
      expect(res.body).toEqual({ message: "Credenciales inválidas." });
      expect(console.error).not.toHaveBeenCalled();
    });

    it("AuthError con status propio (p. ej. 429) usa ese status en vez del del endpoint", async () => {
      servicio.mockRejectedValue(new AuthError("Espera un minuto.", 429));
      const res = crearRes();

      await fn(req, res as never);

      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ message: "Espera un minuto." });
    });
  });

  it("el mensaje genérico es el acordado", () => {
    expect(MENSAJE_AUTH_INESPERADO).toBe(
      "No fue posible procesar la autenticación. Por favor, intente más tarde.",
    );
  });
});
