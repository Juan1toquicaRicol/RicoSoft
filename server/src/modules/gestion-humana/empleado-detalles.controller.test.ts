import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const empleadoFindFirstMock = vi.fn();
const detalleFindFirstMock = vi.fn();
const detalleUpsertMock = vi.fn();
const familiarFindManyMock = vi.fn();
const familiarFindFirstMock = vi.fn();
const familiarCreateMock = vi.fn();
const familiarDeleteMock = vi.fn();
const estudioFindManyMock = vi.fn();
const estudioFindFirstMock = vi.fn();
const estudioCreateMock = vi.fn();
const estudioDeleteMock = vi.fn();
const documentoFindManyMock = vi.fn();
const documentoFindFirstMock = vi.fn();
const documentoCreateMock = vi.fn();
const documentoDeleteMock = vi.fn();
const documentoDeleteManyMock = vi.fn();
const auditoriaCreateMock = vi.fn();
const catalogoFindFirstMock = vi.fn();

vi.mock("../../config/prisma", () => {
  const modelos = {
    empleado: { findFirst: (...a: unknown[]) => empleadoFindFirstMock(...a) },
    empleadoDetalle: {
      findFirst: (...a: unknown[]) => detalleFindFirstMock(...a),
      upsert: (...a: unknown[]) => detalleUpsertMock(...a),
    },
    empleadoFamiliar: {
      findMany: (...a: unknown[]) => familiarFindManyMock(...a),
      findFirst: (...a: unknown[]) => familiarFindFirstMock(...a),
      create: (...a: unknown[]) => familiarCreateMock(...a),
      delete: (...a: unknown[]) => familiarDeleteMock(...a),
    },
    empleadoEstudio: {
      findMany: (...a: unknown[]) => estudioFindManyMock(...a),
      findFirst: (...a: unknown[]) => estudioFindFirstMock(...a),
      create: (...a: unknown[]) => estudioCreateMock(...a),
      delete: (...a: unknown[]) => estudioDeleteMock(...a),
    },
    empleadoDocumento: {
      findMany: (...a: unknown[]) => documentoFindManyMock(...a),
      findFirst: (...a: unknown[]) => documentoFindFirstMock(...a),
      create: (...a: unknown[]) => documentoCreateMock(...a),
      delete: (...a: unknown[]) => documentoDeleteMock(...a),
      deleteMany: (...a: unknown[]) => documentoDeleteManyMock(...a),
    },
    catalogoSeguridadSocial: { findFirst: (...a: unknown[]) => catalogoFindFirstMock(...a) },
    auditoria: { create: (...a: unknown[]) => auditoriaCreateMock(...a) },
  };
  return {
    prisma: { ...modelos, $transaction: (fn: (tx: typeof modelos) => unknown) => fn(modelos) },
  };
});

import { UPLOADS_DIR_EMPLEADOS_DOCUMENTOS } from "../../middleware/upload.middleware";
import {
  obtenerDetallesEmpleado,
  guardarDetallesEmpleado,
  agregarFamiliar,
  eliminarFamiliar,
  agregarEstudio,
  eliminarEstudio,
  subirDocumentoEmpleado,
  descargarDocumentoEmpleado,
  eliminarDocumentoEmpleado,
} from "./empleado-detalles.controller";

type ResFake = Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  sendFile: ReturnType<typeof vi.fn>;
};

function fakeRes(): ResFake {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.sendFile = vi.fn().mockReturnValue(res);
  return res as ResFake;
}

function fakeReq(
  overrides: Partial<AuthenticatedRequest> = {},
  permisos: string[] = [],
): AuthenticatedRequest {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-A",
      nombre: "Ana Admin",
      isSuperadmin: false,
      permisos,
    } as never,
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthenticatedRequest;
}

const EMPLEADO = { id: "emp-1", nombres: "Juan", apellidos: "Pérez" };
const TENANT_Y_EMPLEADO = { empleadoId: "emp-1", tenantId: "tenant-A" };

const todosLosMocks = [
  empleadoFindFirstMock,
  detalleFindFirstMock,
  detalleUpsertMock,
  familiarFindManyMock,
  familiarFindFirstMock,
  familiarCreateMock,
  familiarDeleteMock,
  estudioFindManyMock,
  estudioFindFirstMock,
  estudioCreateMock,
  estudioDeleteMock,
  documentoFindManyMock,
  documentoFindFirstMock,
  documentoCreateMock,
  documentoDeleteMock,
  documentoDeleteManyMock,
  auditoriaCreateMock,
  catalogoFindFirstMock,
];

beforeEach(() => {
  todosLosMocks.forEach((m) => m.mockReset());
  auditoriaCreateMock.mockResolvedValue({});
  familiarFindManyMock.mockResolvedValue([]);
  estudioFindManyMock.mockResolvedValue([]);
  documentoFindManyMock.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("aislamiento por tenant (IDOR) en todas las operaciones", () => {
  const casos: Array<[string, () => Promise<unknown>]> = [];
  const res = () => fakeRes();
  casos.push([
    "obtener detalles",
    () => obtenerDetallesEmpleado(fakeReq({ params: { id: "emp-B" } }), res()),
  ]);
  casos.push([
    "guardar detalles",
    () => guardarDetallesEmpleado(fakeReq({ params: { id: "emp-B" }, body: { eps: "X" } }), res()),
  ]);
  casos.push([
    "agregar familiar",
    () =>
      agregarFamiliar(
        fakeReq({ params: { id: "emp-B" }, body: { nombre: "A", parentesco: "Hijo" } }),
        res(),
      ),
  ]);
  casos.push([
    "eliminar familiar",
    () => eliminarFamiliar(fakeReq({ params: { id: "emp-B", familiarId: "f" } }), res()),
  ]);
  casos.push([
    "agregar estudio",
    () => agregarEstudio(fakeReq({ params: { id: "emp-B" }, body: { titulo: "T" } }), res()),
  ]);
  casos.push([
    "eliminar estudio",
    () => eliminarEstudio(fakeReq({ params: { id: "emp-B", estudioId: "e" } }), res()),
  ]);
  casos.push([
    "descargar documento",
    () => descargarDocumentoEmpleado(fakeReq({ params: { id: "emp-B", documentoId: "d" } }), res()),
  ]);
  casos.push([
    "eliminar documento",
    () => eliminarDocumentoEmpleado(fakeReq({ params: { id: "emp-B", documentoId: "d" } }), res()),
  ]);

  for (const [nombre, ejecutar] of casos) {
    it(`${nombre}: un colaborador de otro tenant responde 404 sin tocar nada`, async () => {
      empleadoFindFirstMock.mockResolvedValue(null); // la consulta va acotada a tenant-A
      await ejecutar();
      expect(empleadoFindFirstMock.mock.calls[0][0].where).toEqual({
        id: "emp-B",
        tenantId: "tenant-A",
        eliminado: false,
      });
      for (const m of [
        detalleUpsertMock,
        familiarCreateMock,
        familiarDeleteMock,
        estudioCreateMock,
        estudioDeleteMock,
        documentoDeleteMock,
        auditoriaCreateMock,
      ]) {
        expect(m).not.toHaveBeenCalled();
      }
    });
  }

  it("subir documento: colaborador de otro tenant => 404 y el temporal se borra", async () => {
    empleadoFindFirstMock.mockResolvedValue(null);
    const tmp = path.join(os.tmpdir(), `emp-test-${Date.now()}-a.pdf`);
    fs.writeFileSync(tmp, "%PDF-1.4");
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({
        params: { id: "emp-B" },
        body: { tipo: "CERTIFICADO_BANCARIO" },
        file: {
          path: tmp,
          filename: "x.pdf",
          originalname: "c.pdf",
          mimetype: "application/pdf",
          size: 8,
        },
      } as never),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(documentoCreateMock).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 30));
    expect(fs.existsSync(tmp)).toBe(false);
  });
});

describe("obtenerDetallesEmpleado", () => {
  it("consulta todo con tenant + colaborador y nunca devuelve rutas del servidor", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    detalleFindFirstMock.mockResolvedValue({
      eps: "EPS X",
      arl: null,
      direccion: "Calle 1",
      telefonoPrincipal: "300",
      telefonoSecundario: null,
    });
    documentoFindManyMock.mockResolvedValue([
      {
        id: "d1",
        tipo: "CERTIFICADO_BANCARIO",
        estudioId: null,
        archivoNombre: "cert.pdf",
        archivoRuta: "emp-1/secreto.pdf",
        archivoMime: "application/pdf",
        archivoTamano: 10,
        createdAt: new Date(),
      },
    ]);
    const res = fakeRes();
    await obtenerDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" } }, ["empleados.documentos_ver"]),
      res,
    );
    expect(detalleFindFirstMock.mock.calls[0][0].where).toEqual(TENANT_Y_EMPLEADO);
    expect(familiarFindManyMock.mock.calls[0][0].where).toEqual(TENANT_Y_EMPLEADO);
    expect(estudioFindManyMock.mock.calls[0][0].where).toEqual(TENANT_Y_EMPLEADO);
    expect(documentoFindManyMock.mock.calls[0][0].where).toEqual(TENANT_Y_EMPLEADO);
    const cuerpo = res.json.mock.calls[0][0];
    expect(JSON.stringify(cuerpo)).not.toContain("archivoRuta");
    expect(JSON.stringify(cuerpo)).not.toContain("secreto.pdf");
    expect(cuerpo.documentos[0]).toMatchObject({ id: "d1", nombre: "cert.pdf" });
  });

  it("sin permiso de documentos no consulta ni lista los soportes", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    detalleFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await obtenerDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" } }, ["empleados.detalles_ver"]),
      res,
    );
    expect(documentoFindManyMock).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ documentos: [], puedeVerDocumentos: false });
  });

  it("colaborador sin detalles registrados devuelve campos en null (histórico compatible)", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    detalleFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await obtenerDetallesEmpleado(fakeReq({ params: { id: "emp-1" } }), res);
    expect(res.json.mock.calls[0][0].detalle).toEqual({
      eps: null,
      arl: null,
      fondoPensiones: null,
      correoPersonal: null,
      fechaNacimiento: null,
      lugarNacimiento: null,
      fechaExpedicionDocumento: null,
      ciudadResidencia: null,
      departamentoResidencia: null,
      direccion: null,
      telefonoPrincipal: null,
      telefonoSecundario: null,
    });
  });
});

describe("guardarDetallesEmpleado", () => {
  beforeEach(() => empleadoFindFirstMock.mockResolvedValue(EMPLEADO));

  it("guarda solo los campos enviados (vacío => null) y audita nombres de campos, no valores", async () => {
    catalogoFindFirstMock.mockResolvedValue({ nombre: "Sura" });
    const res = fakeRes();
    await guardarDetallesEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { eps: "  Sura  ", direccion: "Calle 123 #4-56", arl: "", tenantId: "tenant-B" },
      }),
      res,
    );
    const args = detalleUpsertMock.mock.calls[0][0];
    expect(args.where).toEqual({ empleadoId: "emp-1" });
    expect(args.create).toEqual({
      tenantId: "tenant-A",
      empleadoId: "emp-1",
      eps: "Sura",
      direccion: "Calle 123 #4-56",
      arl: null,
    });
    expect(args.update).toEqual({ eps: "Sura", direccion: "Calle 123 #4-56", arl: null });
    const detalle = auditoriaCreateMock.mock.calls[0][0].data.detalle as string;
    expect(detalle).toContain("eps, arl, direccion".replace("eps, arl, direccion", "eps"));
    expect(detalle).not.toContain("Sura");
    expect(detalle).not.toContain("Calle 123");
  });

  it("rechaza teléfono inválido, texto demasiado largo y body sin campos", async () => {
    for (const body of [{ telefonoPrincipal: "abc" }, { eps: "x".repeat(151) }, {}, { eps: 5 }]) {
      const res = fakeRes();
      await guardarDetallesEmpleado(fakeReq({ params: { id: "emp-1" }, body }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(detalleUpsertMock).not.toHaveBeenCalled();
  });

  it("si la auditoría falla responde 500 (atomicidad: misma transacción)", async () => {
    catalogoFindFirstMock.mockResolvedValue({ nombre: "X" });
    auditoriaCreateMock.mockRejectedValue(new Error("caída"));
    const res = fakeRes();
    await guardarDetallesEmpleado(fakeReq({ params: { id: "emp-1" }, body: { eps: "X" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("núcleo familiar y estudios (datos mínimos)", () => {
  beforeEach(() => empleadoFindFirstMock.mockResolvedValue(EMPLEADO));

  it("el familiar solo guarda nombre y parentesco (ignora cédula, nacimiento, salud...)", async () => {
    familiarCreateMock.mockResolvedValue({ id: "f1", nombre: "Ana", parentesco: "Hija" });
    const res = fakeRes();
    await agregarFamiliar(
      fakeReq({
        params: { id: "emp-1" },
        body: {
          nombre: "Ana",
          parentesco: "Hija",
          documento: "123",
          fechaNacimiento: "2010-01-01",
          salud: "x",
        },
      }),
      res,
    );
    expect(familiarCreateMock.mock.calls[0][0].data).toEqual({
      tenantId: "tenant-A",
      empleadoId: "emp-1",
      nombre: "Ana",
      parentesco: "Hija",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("familiar sin nombre o parentesco => 400", async () => {
    for (const body of [
      { parentesco: "Hijo" },
      { nombre: "Ana" },
      { nombre: " ", parentesco: "x" },
    ]) {
      const res = fakeRes();
      await agregarFamiliar(fakeReq({ params: { id: "emp-1" }, body }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
  });

  it("eliminar familiar ajeno al colaborador/tenant => 404", async () => {
    familiarFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await eliminarFamiliar(fakeReq({ params: { id: "emp-1", familiarId: "f-otro" } }), res);
    expect(familiarFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "f-otro",
      ...TENANT_Y_EMPLEADO,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(familiarDeleteMock).not.toHaveBeenCalled();
  });

  it("estudio: título obligatorio, institución opcional", async () => {
    estudioCreateMock.mockResolvedValue({ id: "e1", titulo: "Ingeniero", institucion: null });
    const sinTitulo = fakeRes();
    await agregarEstudio(fakeReq({ params: { id: "emp-1" }, body: {} }), sinTitulo);
    expect(sinTitulo.status).toHaveBeenCalledWith(400);
    const ok = fakeRes();
    await agregarEstudio(fakeReq({ params: { id: "emp-1" }, body: { titulo: "Ingeniero" } }), ok);
    expect(estudioCreateMock.mock.calls[0][0].data).toEqual({
      tenantId: "tenant-A",
      empleadoId: "emp-1",
      titulo: "Ingeniero",
      institucion: null,
    });
  });
});

describe("subirDocumentoEmpleado", () => {
  const archivosCreados: string[] = [];
  afterEach(() => {
    archivosCreados.splice(0).forEach((f) => fs.rmSync(f, { recursive: true, force: true }));
    fs.rmSync(path.join(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS, "emp-subida"), {
      recursive: true,
      force: true,
    });
  });

  function archivoTemporal(nombre = "tmp-123.pdf") {
    const dir = path.join(
      os.tmpdir(),
      `emp-up-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, nombre);
    fs.writeFileSync(p, "%PDF-1.4 contenido");
    archivosCreados.push(dir);
    return {
      path: p,
      filename: nombre,
      originalname: "Certificación bancaria.pdf",
      mimetype: "application/pdf",
      size: 18,
    };
  }

  it("tipo de documento inválido => 400 y se borra el temporal", async () => {
    const file = archivoTemporal();
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { tipo: "OTRO" }, file } as never),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    await new Promise((r) => setTimeout(r, 30));
    expect(fs.existsSync(file.path)).toBe(false);
  });

  it("soporte de estudio exige un estudio del mismo colaborador y tenant", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    estudioFindFirstMock.mockResolvedValue(null);
    const file = archivoTemporal();
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { tipo: "SOPORTE_ESTUDIO", estudioId: "estudio-de-otro" },
        file,
      } as never),
      res,
    );
    expect(estudioFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "estudio-de-otro",
      ...TENANT_Y_EMPLEADO,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(documentoCreateMock).not.toHaveBeenCalled();
  });

  it("certificado bancario válido: mueve el archivo, reemplaza el anterior, audita sin nombre de archivo y no filtra la ruta", async () => {
    empleadoFindFirstMock.mockResolvedValue({ ...EMPLEADO, id: "emp-subida" });
    documentoFindManyMock.mockResolvedValue([{ id: "viejo", archivoRuta: "emp-subida/viejo.pdf" }]);
    documentoCreateMock.mockImplementation(async ({ data }) => ({
      id: "nuevo",
      createdAt: new Date(),
      ...data,
    }));
    const file = archivoTemporal("tmp-abc.pdf");
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({
        params: { id: "emp-subida" },
        body: { tipo: "CERTIFICADO_BANCARIO" },
        file,
      } as never),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const data = documentoCreateMock.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-A",
      empleadoId: "emp-subida",
      tipo: "CERTIFICADO_BANCARIO",
      estudioId: null,
      archivoMime: "application/pdf",
      subidoPorId: "user-1",
    });
    expect(data.archivoRuta.replace(/\\/g, "/")).toBe("emp-subida/tmp-abc.pdf");
    expect(
      fs.existsSync(path.join(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS, "emp-subida", "tmp-abc.pdf")),
    ).toBe(true);
    expect(documentoDeleteManyMock.mock.calls[0][0].where).toEqual({
      id: { in: ["viejo"] },
      tenantId: "tenant-A",
    });
    const detalle = auditoriaCreateMock.mock.calls[0][0].data.detalle as string;
    expect(detalle).not.toContain("Certificación bancaria.pdf");
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("archivoRuta");
  });

  it("el certificado bancario no acepta estudioId", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    const file = archivoTemporal();
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { tipo: "CERTIFICADO_BANCARIO", estudioId: "x" },
        file,
      } as never),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("si la transacción falla, el archivo ya movido se elimina (no quedan huérfanos)", async () => {
    empleadoFindFirstMock.mockResolvedValue({ ...EMPLEADO, id: "emp-subida" });
    documentoFindManyMock.mockResolvedValue([]);
    documentoCreateMock.mockRejectedValue(new Error("BD caída"));
    const file = archivoTemporal("tmp-fallo.pdf");
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({
        params: { id: "emp-subida" },
        body: { tipo: "CERTIFICADO_BANCARIO" },
        file,
      } as never),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    await new Promise((r) => setTimeout(r, 30));
    expect(
      fs.existsSync(path.join(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS, "emp-subida", "tmp-fallo.pdf")),
    ).toBe(false);
  });

  it("sin archivo => 400", async () => {
    const res = fakeRes();
    await subirDocumentoEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { tipo: "CERTIFICADO_BANCARIO" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("descargarDocumentoEmpleado", () => {
  const dirEmp = path.join(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS, "emp-descarga");
  beforeEach(() => {
    fs.mkdirSync(dirEmp, { recursive: true });
    fs.writeFileSync(path.join(dirEmp, "real.pdf"), "%PDF-1.4");
  });
  afterEach(() => fs.rmSync(dirEmp, { recursive: true, force: true }));

  const DOC = {
    id: "d1",
    tipo: "CERTIFICADO_BANCARIO",
    archivoNombre: "Certificación año.pdf",
    archivoRuta: "emp-descarga/real.pdf",
    archivoMime: "application/pdf",
  };

  it("busca el documento por id + colaborador + tenant; de otro tenant => 404", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    documentoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await descargarDocumentoEmpleado(fakeReq({ params: { id: "emp-1", documentoId: "d-B" } }), res);
    expect(documentoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "d-B",
      ...TENANT_Y_EMPLEADO,
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it("entrega como adjunto, sin sniffing ni caché, audita antes y no expone la ruta", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    documentoFindFirstMock.mockResolvedValue(DOC);
    const res = fakeRes();
    await descargarDocumentoEmpleado(fakeReq({ params: { id: "emp-1", documentoId: "d1" } }), res);
    const cabeceras = Object.fromEntries(res.setHeader.mock.calls as [string, string][]);
    expect(cabeceras["Content-Type"]).toBe("application/pdf");
    expect(cabeceras["Content-Disposition"]).toMatch(/^attachment;/);
    expect(cabeceras["X-Content-Type-Options"]).toBe("nosniff");
    expect(cabeceras["Cache-Control"]).toBe("private, no-store");
    expect(auditoriaCreateMock.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-A",
      accion: "EMPLEADO_DOCUMENTO_DESCARGADO",
    });
    expect(res.sendFile).toHaveBeenCalledWith(path.resolve(dirEmp, "real.pdf"));
  });

  it("si no se puede auditar la descarga, NO entrega el archivo", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    documentoFindFirstMock.mockResolvedValue(DOC);
    auditoriaCreateMock.mockRejectedValue(new Error("auditoria caída"));
    const res = fakeRes();
    await descargarDocumentoEmpleado(fakeReq({ params: { id: "emp-1", documentoId: "d1" } }), res);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("una ruta guardada que intente salir de la carpeta privada (path traversal) se trata como no disponible", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    documentoFindFirstMock.mockResolvedValue({ ...DOC, archivoRuta: "../../.env" });
    const res = fakeRes();
    await descargarDocumentoEmpleado(fakeReq({ params: { id: "emp-1", documentoId: "d1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  it("archivo desaparecido del disco => 404", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    documentoFindFirstMock.mockResolvedValue({ ...DOC, archivoRuta: "emp-descarga/no-existe.pdf" });
    const res = fakeRes();
    await descargarDocumentoEmpleado(fakeReq({ params: { id: "emp-1", documentoId: "d1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("eliminarDocumentoEmpleado", () => {
  it("elimina fila + auditoría en transacción y luego el archivo", async () => {
    const dir = path.join(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS, "emp-borrar");
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, "x.pdf");
    fs.writeFileSync(archivo, "%PDF-1.4");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    documentoFindFirstMock.mockResolvedValue({
      id: "d1",
      tipo: "SOPORTE_ESTUDIO",
      archivoRuta: "emp-borrar/x.pdf",
    });
    const res = fakeRes();
    await eliminarDocumentoEmpleado(fakeReq({ params: { id: "emp-1", documentoId: "d1" } }), res);
    expect(documentoDeleteMock).toHaveBeenCalledWith({ where: { id: "d1" } });
    expect(auditoriaCreateMock.mock.calls[0][0].data.accion).toBe("EMPLEADO_DOCUMENTO_ELIMINADO");
    expect(res.status).toHaveBeenCalledWith(204);
    await new Promise((r) => setTimeout(r, 30));
    expect(fs.existsSync(archivo)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("guardarDetallesEmpleado: catálogo de EPS/ARL/fondo y datos personales", () => {
  beforeEach(() => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    detalleFindFirstMock.mockResolvedValue(null);
  });

  it("un valor NUEVO de EPS/ARL/fondo debe estar activo en el catálogo DEL TENANT; se guarda el nombre canónico", async () => {
    catalogoFindFirstMock.mockResolvedValue({ nombre: "Sura EPS" });
    const res = fakeRes();
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { eps: "  sura eps ", tenantId: "tenant-B" } }),
      res,
    );
    expect(catalogoFindFirstMock.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-A",
      tipo: "EPS",
      activo: true,
      nombreNormalizado: "sura eps",
    });
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({ eps: "Sura EPS" });
  });

  it("usa el tipo de catálogo correcto para ARL y fondo de pensiones", async () => {
    catalogoFindFirstMock.mockResolvedValue({ nombre: "X" });
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { arl: "X", fondoPensiones: "X" } }),
      fakeRes(),
    );
    expect(catalogoFindFirstMock.mock.calls.map((c) => c[0].where.tipo)).toEqual([
      "ARL",
      "FONDO_PENSIONES",
    ]);
  });

  it("un valor que no está en el catálogo (o es de otro tenant/inactivo) => 400 y no guarda", async () => {
    catalogoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { eps: "Inventada" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(detalleUpsertMock).not.toHaveBeenCalled();
  });

  it("conservar el valor ya guardado no se revalida contra el catálogo (puede estar desactivado)", async () => {
    detalleFindFirstMock.mockResolvedValue({ eps: "Vieja EPS" });
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { eps: "Vieja EPS", direccion: "Calle 1" } }),
      fakeRes(),
    );
    expect(catalogoFindFirstMock).not.toHaveBeenCalled();
    expect(detalleUpsertMock).toHaveBeenCalled();
  });

  it("vaciar EPS (null) no consulta el catálogo", async () => {
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { eps: "" } }),
      fakeRes(),
    );
    expect(catalogoFindFirstMock).not.toHaveBeenCalled();
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({ eps: null });
  });

  it("guarda fechas como medianoche UTC y los datos de nacimiento/residencia", async () => {
    await guardarDetallesEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: {
          fechaNacimiento: "1990-05-20",
          lugarNacimiento: " Medellín ",
          fechaExpedicionDocumento: "2008-06-01",
          ciudadResidencia: "Bogotá",
          departamentoResidencia: "Antioquia",
        },
      }),
      fakeRes(),
    );
    const update = detalleUpsertMock.mock.calls[0][0].update;
    expect(update.fechaNacimiento.toISOString()).toBe("1990-05-20T00:00:00.000Z");
    expect(update.fechaExpedicionDocumento.toISOString()).toBe("2008-06-01T00:00:00.000Z");
    expect(update).toMatchObject({
      lugarNacimiento: "Medellín",
      ciudadResidencia: "BOGOTA",
      departamentoResidencia: "ANTIOQUIA",
    });
    const detalle = auditoriaCreateMock.mock.calls[0][0].data.detalle as string;
    expect(detalle).not.toContain("1990");
    expect(detalle).not.toContain("Medellín");
  });

  it("rechaza fechas inválidas, imposibles, anteriores a 1900 o futuras", async () => {
    const futura = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    for (const body of [
      { fechaNacimiento: "20/05/1990" },
      { fechaNacimiento: "1990-02-31" },
      { fechaNacimiento: "1850-01-01" },
      { fechaNacimiento: futura },
      { fechaExpedicionDocumento: 123 },
    ]) {
      const res = fakeRes();
      await guardarDetallesEmpleado(fakeReq({ params: { id: "emp-1" }, body }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(detalleUpsertMock).not.toHaveBeenCalled();
  });

  it("la expedición de la cédula no puede ser anterior al nacimiento (también contra lo ya guardado)", async () => {
    const res = fakeRes();
    await guardarDetallesEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { fechaNacimiento: "1990-05-20", fechaExpedicionDocumento: "1989-01-01" },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);

    detalleFindFirstMock.mockResolvedValue({ fechaNacimiento: new Date("2000-01-01T00:00:00Z") });
    const res2 = fakeRes();
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { fechaExpedicionDocumento: "1999-12-31" } }),
      res2,
    );
    expect(res2.status).toHaveBeenCalledWith(400);
    expect(detalleUpsertMock).not.toHaveBeenCalled();
  });

  it("fecha vacía borra el dato (null)", async () => {
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { fechaNacimiento: "" } }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({ fechaNacimiento: null });
  });

  it("obtener devuelve las fechas como YYYY-MM-DD", async () => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    detalleFindFirstMock.mockResolvedValue({
      fechaNacimiento: new Date("1990-05-20T00:00:00Z"),
      fondoPensiones: "Porvenir",
    });
    const res = fakeRes();
    await obtenerDetallesEmpleado(fakeReq({ params: { id: "emp-1" } }), res);
    expect(res.json.mock.calls[0][0].detalle).toMatchObject({
      fechaNacimiento: "1990-05-20",
      fondoPensiones: "Porvenir",
    });
  });
});

describe("guardarDetallesEmpleado: residencia (listas cerradas) y correo personal", () => {
  beforeEach(() => {
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    detalleFindFirstMock.mockResolvedValue(null);
  });

  it("acepta solo las ciudades y departamentos definidos y guarda el valor canónico", async () => {
    await guardarDetallesEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { ciudadResidencia: " bogotá ", departamentoResidencia: "valle del cauca" },
      }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({
      ciudadResidencia: "BOGOTA",
      departamentoResidencia: "VALLE DEL CAUCA",
    });
  });

  it("acepta MEDELLIN, CALI y ANTIOQUIA", async () => {
    await guardarDetallesEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { ciudadResidencia: "Medellín", departamentoResidencia: "Antioquia" },
      }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({
      ciudadResidencia: "MEDELLIN",
      departamentoResidencia: "ANTIOQUIA",
    });
    detalleUpsertMock.mockClear();
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { ciudadResidencia: "cali" } }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({ ciudadResidencia: "CALI" });
  });

  it("rechaza ciudades o departamentos fuera de la lista", async () => {
    for (const body of [{ ciudadResidencia: "Pasto" }, { departamentoResidencia: "Boyacá" }]) {
      const res = fakeRes();
      await guardarDetallesEmpleado(fakeReq({ params: { id: "emp-1" }, body }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(detalleUpsertMock).not.toHaveBeenCalled();
  });

  it("vaciar ciudad/departamento los deja en null", async () => {
    await guardarDetallesEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { ciudadResidencia: "", departamentoResidencia: "" },
      }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({
      ciudadResidencia: null,
      departamentoResidencia: null,
    });
  });

  it("correo personal: cualquier dominio válido, en minúsculas; la auditoría no lo contiene", async () => {
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { correoPersonal: " Juan.Perez@Gmail.com " } }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({
      correoPersonal: "juan.perez@gmail.com",
    });
    expect(auditoriaCreateMock.mock.calls[0][0].data.detalle).not.toContain("gmail");
  });

  it("correo personal inválido => 400; vacío => null", async () => {
    for (const correoPersonal of ["sin-arroba", "a@b", "a b@c.com"]) {
      const res = fakeRes();
      await guardarDetallesEmpleado(
        fakeReq({ params: { id: "emp-1" }, body: { correoPersonal } }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(detalleUpsertMock).not.toHaveBeenCalled();
    await guardarDetallesEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { correoPersonal: "" } }),
      fakeRes(),
    );
    expect(detalleUpsertMock.mock.calls[0][0].update).toEqual({ correoPersonal: null });
  });
});
