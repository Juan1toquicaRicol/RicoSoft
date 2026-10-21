import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";

// authenticateJWT se sustituye por un doble que lee la sesión de un header de
// prueba; requirePermission/requireAllPermissions/requireAnyPermission son los
// REALES, así que se prueba la autorización verdadera de cada ruta.
vi.mock("../../middleware/auth.middleware", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../middleware/auth.middleware")>();
  return {
    ...real,
    authenticateJWT: (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const raw = req.header("x-test-user");
      if (!raw) return res.status(401).json({ message: "No autenticado." });
      (req as never as { user: unknown }).user = JSON.parse(raw);
      next();
    },
  };
});

const empleadoFindFirstMock = vi.fn();
const cargoFindManyMock = vi.fn();
const documentoCreateMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: {
    empleado: { findFirst: (...a: unknown[]) => empleadoFindFirstMock(...a) },
    cargoColaborador: { findMany: (...a: unknown[]) => cargoFindManyMock(...a) },
    catalogoSeguridadSocial: { findMany: vi.fn().mockResolvedValue([]) },
    empleadoDetalle: { findFirst: vi.fn().mockResolvedValue(null) },
    empleadoFamiliar: { findMany: vi.fn().mockResolvedValue([]) },
    empleadoEstudio: { findMany: vi.fn().mockResolvedValue([]) },
    empleadoDocumento: {
      findMany: vi.fn().mockResolvedValue([]),
      create: (...a: unknown[]) => documentoCreateMock(...a),
    },
    auditoria: { create: vi.fn() },
  },
}));

import gestionHumanaRouter from "./gestion-humana.routes";

const app = express();
app.use(express.json());
app.use("/gh", gestionHumanaRouter);

const EMP_ID = "11111111-1111-4111-8111-111111111111";
const TMP_DIR = path.join(__dirname, "..", "..", "..", "uploads", "_tmp");

function sesion(permisos: string[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "user-1",
    tenantId: "tenant-A",
    nombre: "Ana",
    isSuperadmin: false,
    permisos,
    ...extra,
  });
}

// uploads/_tmp es compartida con otras suites que corren en paralelo: solo se
// cuentan los archivos que contienen la marca de ESTAS pruebas.
const MARCA = Buffer.from("#EMP-ROUTES-TEST#");
function conMarca(buf: Buffer): Buffer {
  return Buffer.concat([buf, MARCA]);
}
function archivosTmp(): string[] {
  if (!fs.existsSync(TMP_DIR)) return [];
  return fs.readdirSync(TMP_DIR).filter((f) => {
    try {
      return fs.readFileSync(path.join(TMP_DIR, f)).includes(MARCA);
    } catch {
      return false;
    }
  });
}

const PDF = conMarca(Buffer.from("%PDF-1.4\n1 0 obj\n"));

beforeEach(() => {
  empleadoFindFirstMock.mockReset();
  cargoFindManyMock.mockReset().mockResolvedValue([]);
  documentoCreateMock.mockReset();
});

describe("sin autenticación => 401", () => {
  const rutas: Array<[string, string]> = [
    ["get", "/gh/cargos"],
    ["get", "/gh/cargos/opciones"],
    ["post", "/gh/cargos"],
    ["patch", "/gh/cargos/x"],
    ["patch", `/gh/empleados/${EMP_ID}`],
    ["get", `/gh/empleados/${EMP_ID}/detalles`],
    ["put", `/gh/empleados/${EMP_ID}/detalles`],
    ["post", `/gh/empleados/${EMP_ID}/familiares`],
    ["post", `/gh/empleados/${EMP_ID}/estudios`],
    ["post", `/gh/empleados/${EMP_ID}/documentos`],
    ["get", `/gh/empleados/${EMP_ID}/documentos/d1/archivo`],
    ["delete", `/gh/empleados/${EMP_ID}/documentos/d1`],
  ];
  for (const [metodo, url] of rutas) {
    it(`${metodo.toUpperCase()} ${url.replace(EMP_ID, ":id")}`, async () => {
      const res = await (request(app) as never as Record<string, (u: string) => request.Test>)[
        metodo
      ](url);
      expect(res.status).toBe(401);
    });
  }
});

describe("autenticado pero sin permiso => 403", () => {
  it("cargos: ver y gestionar son permisos distintos", async () => {
    const soloVer = sesion(["cargos.ver"]);
    expect((await request(app).get("/gh/cargos").set("x-test-user", soloVer)).status).toBe(200);
    expect(
      (await request(app).post("/gh/cargos").set("x-test-user", soloVer).send({ nombre: "X" }))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/gh/cargos")
          .set("x-test-user", sesion(["empleados.ver"]))
      ).status,
    ).toBe(403);
  });

  it("opciones de cargos: basta con poder registrar colaboradores, sin administrar el catálogo", async () => {
    const res = await request(app)
      .get("/gh/cargos/opciones")
      .set("x-test-user", sesion(["empleados.crear"]));
    expect(res.status).toBe(200);
    expect(
      (
        await request(app)
          .get("/gh/cargos/opciones")
          .set("x-test-user", sesion(["empleados.ver"]))
      ).status,
    ).toBe(403);
  });

  it("detalles: empleados.ver NO basta; se exige empleados.detalles_ver", async () => {
    const url = `/gh/empleados/${EMP_ID}/detalles`;
    expect(
      (
        await request(app)
          .get(url)
          .set("x-test-user", sesion(["empleados.ver"]))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(url)
          .set("x-test-user", sesion(["empleados.detalles_ver"]))
      ).status,
    ).toBe(403); // falta empleados.ver
    empleadoFindFirstMock.mockResolvedValue(null);
    expect(
      (
        await request(app)
          .get(url)
          .set("x-test-user", sesion(["empleados.ver", "empleados.detalles_ver"]))
      ).status,
    ).toBe(404); // autorizado: llega al controller (colaborador inexistente en el tenant)
  });

  it("editar detalles exige detalles_editar además de ver", async () => {
    const url = `/gh/empleados/${EMP_ID}/detalles`;
    const lector = sesion(["empleados.ver", "empleados.detalles_ver"]);
    expect((await request(app).put(url).set("x-test-user", lector).send({ eps: "X" })).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post(`/gh/empleados/${EMP_ID}/familiares`)
          .set("x-test-user", lector)
          .send({})
      ).status,
    ).toBe(403);
  });

  it("descargar soporte exige documentos_ver; gestionarlos exige documentos_gestionar", async () => {
    const urlDescarga = `/gh/empleados/${EMP_ID}/documentos/d1/archivo`;
    const sinDocs = sesion([
      "empleados.ver",
      "empleados.detalles_ver",
      "empleados.detalles_editar",
    ]);
    expect((await request(app).get(urlDescarga).set("x-test-user", sinDocs)).status).toBe(403);
    expect(
      (
        await request(app)
          .delete(`/gh/empleados/${EMP_ID}/documentos/d1`)
          .set("x-test-user", sinDocs)
      ).status,
    ).toBe(403);
  });

  it("editar cargo/correo del colaborador exige empleados.editar", async () => {
    const res = await request(app)
      .patch(`/gh/empleados/${EMP_ID}`)
      .set("x-test-user", sesion(["empleados.ver", "empleados.crear"]))
      .send({ cargoId: "x" });
    expect(res.status).toBe(403);
  });

  it("un superadmin pasa los permisos pero sigue acotado a su tenant (404 de otro tenant)", async () => {
    empleadoFindFirstMock.mockResolvedValue(null);
    const res = await request(app)
      .get(`/gh/empleados/${EMP_ID}/detalles`)
      .set("x-test-user", sesion([], { isSuperadmin: true }));
    expect(res.status).toBe(404);
    expect(empleadoFindFirstMock.mock.calls[0][0].where.tenantId).toBe("tenant-A");
  });
});

describe("subida de documentos (middleware real de multer)", () => {
  const permisos = sesion([
    "empleados.ver",
    "empleados.detalles_ver",
    "empleados.documentos_gestionar",
  ]);

  it("sin permiso: 403 y no se escribe nada en la carpeta temporal", async () => {
    const antes = archivosTmp();
    const res = await request(app)
      .post(`/gh/empleados/${EMP_ID}/documentos`)
      .set("x-test-user", sesion(["empleados.ver", "empleados.detalles_ver"]))
      .field("tipo", "CERTIFICADO_BANCARIO")
      .attach("archivo", PDF, { filename: "c.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(403);
    expect(archivosTmp()).toEqual(antes);
  });

  it("id que no es UUID => 400 (previene path traversal)", async () => {
    const res = await request(app)
      .post("/gh/empleados/..%2F..%2Fetc/documentos")
      .set("x-test-user", permisos)
      .field("tipo", "CERTIFICADO_BANCARIO")
      .attach("archivo", PDF, { filename: "c.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
  });

  it("rechaza un tipo de archivo no permitido (400)", async () => {
    const antes = archivosTmp();
    const res = await request(app)
      .post(`/gh/empleados/${EMP_ID}/documentos`)
      .set("x-test-user", permisos)
      .field("tipo", "CERTIFICADO_BANCARIO")
      .attach("archivo", conMarca(Buffer.from("MZ ejecutable")), {
        filename: "malware.exe",
        contentType: "application/x-msdownload",
      });
    expect(res.status).toBe(400);
    expect(archivosTmp()).toEqual(antes);
    expect(documentoCreateMock).not.toHaveBeenCalled();
  });

  it("rechaza un archivo cuyo contenido real no coincide con el tipo declarado (texto renombrado a .pdf)", async () => {
    const antes = archivosTmp();
    const res = await request(app)
      .post(`/gh/empleados/${EMP_ID}/documentos`)
      .set("x-test-user", permisos)
      .field("tipo", "CERTIFICADO_BANCARIO")
      .attach("archivo", conMarca(Buffer.from("esto es texto plano, no un PDF")), {
        filename: "falso.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);
    expect(archivosTmp()).toEqual(antes); // el temporal se borra
    expect(documentoCreateMock).not.toHaveBeenCalled();
  });

  it("rechaza un archivo que supera 10 MB (400)", async () => {
    const antes = archivosTmp();
    const grande = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024 + 1024)]);
    const res = await request(app)
      .post(`/gh/empleados/${EMP_ID}/documentos`)
      .set("x-test-user", permisos)
      .field("tipo", "CERTIFICADO_BANCARIO")
      .attach("archivo", grande, { filename: "grande.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(archivosTmp()).toEqual(antes);
  });

  it("un colaborador de otro tenant: 404 y el archivo recibido no queda en disco", async () => {
    empleadoFindFirstMock.mockResolvedValue(null);
    const antes = archivosTmp();
    const res = await request(app)
      .post(`/gh/empleados/${EMP_ID}/documentos`)
      .set("x-test-user", permisos)
      .field("tipo", "CERTIFICADO_BANCARIO")
      .attach("archivo", PDF, { filename: "c.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 50));
    expect(archivosTmp()).toEqual(antes);
    expect(documentoCreateMock).not.toHaveBeenCalled();
  });
});

describe("Gestión de información (catálogo EPS/ARL/fondos): autenticación y permisos", () => {
  it("sin sesión => 401 en todas las rutas", async () => {
    expect((await request(app).get("/gh/catalogo-seguridad-social")).status).toBe(401);
    expect((await request(app).get("/gh/catalogo-seguridad-social/opciones")).status).toBe(401);
    expect((await request(app).post("/gh/catalogo-seguridad-social")).status).toBe(401);
    expect((await request(app).patch("/gh/catalogo-seguridad-social/x")).status).toBe(401);
  });

  it("sin gestion_informacion.* => 403; ver no permite escribir", async () => {
    const sinPermiso = sesion(["empleados.ver"]);
    expect(
      (await request(app).get("/gh/catalogo-seguridad-social").set("x-test-user", sinPermiso))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get("/gh/catalogo-seguridad-social/opciones")
          .set("x-test-user", sinPermiso)
      ).status,
    ).toBe(403);
    const soloVer = sesion(["gestion_informacion.ver"]);
    expect(
      (
        await request(app)
          .post("/gh/catalogo-seguridad-social")
          .set("x-test-user", soloVer)
          .send({ tipo: "EPS", nombre: "X" })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch("/gh/catalogo-seguridad-social/x")
          .set("x-test-user", soloVer)
          .send({})
      ).status,
    ).toBe(403);
  });
});

describe("opciones de catálogo para quien registra colaboradores", () => {
  it("empleados.crear alcanza para leer las opciones (tipo de contrato) sin administrar el catálogo", async () => {
    const res = await request(app)
      .get("/gh/catalogo-seguridad-social/opciones")
      .set("x-test-user", sesion(["empleados.crear"]));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tiposContrato");
    expect(
      (
        await request(app)
          .post("/gh/catalogo-seguridad-social")
          .set("x-test-user", sesion(["empleados.crear"]))
          .send({ tipo: "TIPO_CONTRATO", nombre: "X" })
      ).status,
    ).toBe(403);
  });
});
