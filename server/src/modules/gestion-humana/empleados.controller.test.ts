import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware";
import type { Response } from "express";

const cargoFindFirstMock = vi.fn();
const catalogoFindFirstMock = vi.fn();
const empleadoCreateMock = vi.fn();
const empleadoFindFirstMock = vi.fn();
const empleadoUpdateMock = vi.fn();
const auditoriaCreateMock = vi.fn();
const tenantFindUniqueMock = vi.fn();
const vinculoUpdateManyMock = vi.fn();
const permisoUpdateManyMock = vi.fn();
// Profundidad de $transaction en curso: permite afirmar que una escritura ocurrió DENTRO de la transacción.
const estadoTx = { profundidad: 0 };

vi.mock("../../config/prisma", () => {
  const modelos = {
    cargoColaborador: { findFirst: (...a: unknown[]) => cargoFindFirstMock(...a) },
    catalogoSeguridadSocial: { findFirst: (...a: unknown[]) => catalogoFindFirstMock(...a) },
    empleado: {
      create: (...a: unknown[]) => empleadoCreateMock(...a),
      findFirst: (...a: unknown[]) => empleadoFindFirstMock(...a),
      update: (...a: unknown[]) => empleadoUpdateMock(...a),
    },
    auditoria: { create: (...a: unknown[]) => auditoriaCreateMock(...a) },
    tenant: { findUnique: (...a: unknown[]) => tenantFindUniqueMock(...a) },
    empleadoBiometrico: { updateMany: (...a: unknown[]) => vinculoUpdateManyMock(...a) },
    permisoLaboral: { updateMany: (...a: unknown[]) => permisoUpdateManyMock(...a) },
  };
  return {
    prisma: {
      ...modelos,
      $transaction: async (fn: (tx: typeof modelos) => unknown) => {
        estadoTx.profundidad++;
        try {
          return await fn(modelos);
        } finally {
          estadoTx.profundidad--;
        }
      },
    },
  };
});

// Por defecto el tenant autenticado es Ricol (dominio corporativo ricol.com.co).
beforeEach(() => {
  tenantFindUniqueMock.mockReset();
  tenantFindUniqueMock.mockResolvedValue({ dominioCorporativo: "ricol.com.co" });
  vinculoUpdateManyMock.mockReset();
  vinculoUpdateManyMock.mockResolvedValue({ count: 0 });
  permisoUpdateManyMock.mockReset();
  permisoUpdateManyMock.mockResolvedValue({ count: 0 });
});

function fakeRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

function fakeReq(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    user: {
      id: "user-1",
      tenantId: "tenant-A",
      nombre: "Ana Admin",
      isSuperadmin: false,
      permisos: [],
    } as never,
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as AuthenticatedRequest;
}

const BODY_BASE = {
  empresaId: "RC",
  documento: "123",
  nombres: "Juan",
  apellidos: "Pérez",
  fechaContratacion: "2026-01-01",
  salarioActual: 1000000,
  area: "Operaciones",
};

const CARGO_CORREO_REQ = {
  id: "cargo-1",
  nombre: "Analista",
  activo: true,
  correoCorporativoRequerido: true,
};
const CARGO_CORREO_OPC = {
  id: "cargo-2",
  nombre: "Operario",
  activo: true,
  correoCorporativoRequerido: false,
};

function empleadoCreado(extra: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    tenantId: "tenant-A",
    salarioActual: 1000000,
    historicoSalario: [],
    ...extra,
  };
}

describe("crearEmpleado (cargo + correo)", () => {
  beforeEach(() => {
    [
      cargoFindFirstMock,
      empleadoCreateMock,
      empleadoFindFirstMock,
      empleadoUpdateMock,
      auditoriaCreateMock,
    ].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
    empleadoCreateMock.mockImplementation(async ({ data }) => empleadoCreado(data));
  });

  it("cargo que exige correo: sin correo => 400 y no crea nada", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_REQ);
    const res = fakeRes();
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE, cargoId: "cargo-1" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("cargo que exige correo: correo corporativo válido => crea con cargoId y nombre del cargo", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_REQ);
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, cargoId: "cargo-1", correo: "Juan@Ricol.com.co" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(empleadoCreateMock.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-A",
      cargoId: "cargo-1",
      cargo: "Analista",
      correo: "juan@ricol.com.co",
    });
    expect(auditoriaCreateMock).toHaveBeenCalledTimes(1);
  });

  it("cargo con correo opcional: sin correo => guarda null", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_OPC);
    const res = fakeRes();
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE, cargoId: "cargo-2", correo: "" } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(empleadoCreateMock.mock.calls[0][0].data.correo).toBeNull();
  });

  it("cargo con correo opcional: si se envía un correo personal => 400", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_OPC);
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, cargoId: "cargo-2", correo: "x@gmail.com" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("no permite un cargo inactivo para un colaborador nuevo", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    cargoFindFirstMock.mockResolvedValue({ ...CARGO_CORREO_OPC, activo: false });
    const res = fakeRes();
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE, cargoId: "cargo-2" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("un cargo de OTRO tenant se busca acotado al tenant autenticado y responde como inexistente (IDOR)", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    cargoFindFirstMock.mockResolvedValue(null); // existe en tenant-B, pero la consulta es por tenant-A
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({
        body: {
          ...BODY_BASE,
          cargoId: "cargo-de-B",
          correo: "a@ricol.com.co",
          tenantId: "tenant-B",
        },
      }),
      res,
    );
    expect(cargoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "cargo-de-B",
      tenantId: "tenant-A",
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("sin cargoId (compatibilidad histórica) conserva la regla anterior: correo corporativo obligatorio", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    const sinCorreo = fakeRes();
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE } }), sinCorreo);
    expect(sinCorreo.status).toHaveBeenCalledWith(400);

    const conCorreo = fakeRes();
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE, correo: "a@ricol.com.co" } }), conCorreo);
    expect(conCorreo.status).toHaveBeenCalledWith(201);
    expect(empleadoCreateMock.mock.calls[0][0].data).toMatchObject({
      cargoId: null,
      cargo: "Colaborador",
    });
    expect(cargoFindFirstMock).not.toHaveBeenCalled();
  });

  it("el tenant del colaborador sale de la sesión, no del body", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, correo: "a@ricol.com.co", tenantId: "tenant-B" } }),
      fakeRes(),
    );
    expect(empleadoCreateMock.mock.calls[0][0].data.tenantId).toBe("tenant-A");
  });

  it("si la auditoría falla, no queda colaborador sin rastro (misma transacción): responde 500", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    vi.spyOn(console, "error").mockImplementation(() => {});
    auditoriaCreateMock.mockRejectedValue(new Error("auditoria caída"));
    const res = fakeRes();
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE, correo: "a@ricol.com.co" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("editarEmpleado (revalidación al cambiar cargo / correo)", () => {
  const EMPLEADO = {
    id: "emp-1",
    tenantId: "tenant-A",
    nombres: "Juan",
    apellidos: "Pérez",
    correo: null as string | null,
    cargo: "Operario",
    cargoId: "cargo-2",
    salarioActual: 1,
    eliminado: false,
  };

  beforeEach(() => {
    [
      cargoFindFirstMock,
      empleadoCreateMock,
      empleadoFindFirstMock,
      empleadoUpdateMock,
      auditoriaCreateMock,
    ].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
    empleadoUpdateMock.mockImplementation(async ({ data }) => ({
      ...EMPLEADO,
      ...data,
      historicoSalario: [],
    }));
  });

  it("busca el colaborador por id + tenant; de otro tenant => 404 (IDOR)", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await editarEmpleado(
      fakeReq({ params: { id: "emp-de-B" }, body: { cargoId: "cargo-1" } }),
      res,
    );
    expect(empleadoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "emp-de-B",
      tenantId: "tenant-A",
      eliminado: false,
    });
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("cambiar a un cargo que exige correo sin tener correo => 400", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_REQ);
    const res = fakeRes();
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: { cargoId: "cargo-1" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoUpdateMock).not.toHaveBeenCalled();
  });

  it("cambiar a un cargo que exige correo enviando un correo corporativo => actualiza cargo, snapshot y correo", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_REQ);
    const res = fakeRes();
    await editarEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { cargoId: "cargo-1", correo: "juan@ricol.com.co" },
      }),
      res,
    );
    expect(empleadoUpdateMock.mock.calls[0][0].data).toEqual({
      cargoId: "cargo-1",
      cargo: "Analista",
      correo: "juan@ricol.com.co",
    });
    const detalle = auditoriaCreateMock.mock.calls[0][0].data.detalle as string;
    expect(detalle).toContain("cargo, correo");
    expect(detalle).not.toContain("juan@ricol.com.co");
  });

  it("no se puede cambiar hacia un cargo inactivo", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    cargoFindFirstMock.mockResolvedValue({ ...CARGO_CORREO_REQ, activo: false });
    const res = fakeRes();
    await editarEmpleado(
      fakeReq({
        params: { id: "emp-1" },
        body: { cargoId: "cargo-1", correo: "juan@ricol.com.co" },
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("un cargo de otro tenant se resuelve acotado al tenant autenticado", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    cargoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { cargoId: "cargo-de-B" } }),
      res,
    );
    expect(cargoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "cargo-de-B",
      tenantId: "tenant-A",
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("editar solo el correo conserva un cargo YA inactivo (colaborador histórico) y revalida con ese cargo", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({ ...EMPLEADO, cargoId: "cargo-1", cargo: "Analista" });
    cargoFindFirstMock.mockResolvedValue({ ...CARGO_CORREO_REQ, activo: false });
    const sinCorreo = fakeRes();
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: { correo: "" } }), sinCorreo);
    expect(sinCorreo.status).toHaveBeenCalledWith(400); // el cargo (aunque inactivo) lo exige

    const conCorreo = fakeRes();
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { correo: "nuevo@ricol.com.co" } }),
      conCorreo,
    );
    expect(empleadoUpdateMock.mock.calls[0][0].data).toEqual({ correo: "nuevo@ricol.com.co" });
  });

  it("colaborador histórico sin cargo del catálogo: se puede editar el correo con la regla histórica (obligatorio)", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({
      ...EMPLEADO,
      cargoId: null,
      correo: "a@ricol.com.co",
    });
    const res = fakeRes();
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: { correo: "" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(cargoFindFirstMock).not.toHaveBeenCalled();
  });

  it("cargo con correo opcional permite dejar el correo en null", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({ ...EMPLEADO, correo: "a@ricol.com.co" });
    cargoFindFirstMock.mockResolvedValue(CARGO_CORREO_OPC);
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: { correo: "" } }), fakeRes());
    expect(empleadoUpdateMock.mock.calls[0][0].data).toEqual({ correo: null });
  });

  it("un colaborador que ya tiene cargo del catálogo no puede quedar sin cargo", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    const res = fakeRes();
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: { cargoId: null } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("body vacío => 400", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMPLEADO);
    const res = fakeRes();
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("dominio del correo según la empresa del colaborador", () => {
  beforeEach(() => {
    [
      cargoFindFirstMock,
      empleadoCreateMock,
      empleadoFindFirstMock,
      empleadoUpdateMock,
      auditoriaCreateMock,
    ].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
    empleadoCreateMock.mockImplementation(async ({ data }) => empleadoCreado(data));
  });

  it("crear: correo de otra empresa => 400", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    tenantFindUniqueMock.mockResolvedValue({ dominioCorporativo: "greensolutions.com.co" });
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, empresaId: "GR", correo: "juan@ricol.com.co" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("crear: correo del dominio de la empresa (Green: greensolutions.com.co) => 201", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    tenantFindUniqueMock.mockResolvedValue({ dominioCorporativo: "greensolutions.com.co" });
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, empresaId: "GR", correo: "juan@greensolutions.com.co" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(empleadoCreateMock.mock.calls[0][0].data.correo).toBe("juan@greensolutions.com.co");
  });

  it("editar solo el cargo NO revalida el dominio de un correo ya guardado (anterior a la regla)", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({
      id: "emp-1",
      tenantId: "tenant-A",
      empresaId: "GR",
      nombres: "Juan",
      apellidos: "Pérez",
      correo: "juan@greesolutions.com.co",
      cargo: "Operario",
      cargoId: null,
      salarioActual: 1,
    });
    cargoFindFirstMock.mockResolvedValue({
      id: "cargo-1",
      nombre: "Analista",
      activo: true,
      correoCorporativoRequerido: true,
    });
    empleadoUpdateMock.mockImplementation(async ({ data }) => ({
      id: "emp-1",
      salarioActual: 1,
      historicoSalario: [],
      ...data,
    }));
    const res = fakeRes();
    await editarEmpleado(fakeReq({ params: { id: "emp-1" }, body: { cargoId: "cargo-1" } }), res);
    expect(empleadoUpdateMock.mock.calls[0][0].data).toEqual({
      cargoId: "cargo-1",
      cargo: "Analista",
    });
  });

  it("editar el correo valida contra la empresa del colaborador", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({
      id: "emp-1",
      tenantId: "tenant-A",
      empresaId: "FL",
      nombres: "Juan",
      apellidos: "Pérez",
      correo: null,
      cargo: "Operario",
      cargoId: null,
      salarioActual: 1,
    });
    const res = fakeRes();
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { correo: "juan@ricol.com.co" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoUpdateMock).not.toHaveBeenCalled();
  });
});

describe("tipo de contrato del colaborador", () => {
  const EMP = {
    id: "emp-1",
    tenantId: "tenant-A",
    empresaId: "RC",
    nombres: "Juan",
    apellidos: "Pérez",
    correo: "juan@ricol.com.co",
    cargo: "Operario",
    cargoId: null,
    tipoContrato: null as string | null,
    salarioActual: 1,
  };

  beforeEach(() => {
    [
      cargoFindFirstMock,
      catalogoFindFirstMock,
      empleadoCreateMock,
      empleadoFindFirstMock,
      empleadoUpdateMock,
      auditoriaCreateMock,
    ].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
    empleadoCreateMock.mockImplementation(async ({ data }) => empleadoCreado(data));
    empleadoUpdateMock.mockImplementation(async ({ data }) => ({
      ...EMP,
      historicoSalario: [],
      ...data,
    }));
  });

  it("crear: valida contra el catálogo ACTIVO del tenant y guarda el nombre canónico", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    catalogoFindFirstMock.mockResolvedValue({ nombre: "Término indefinido" });
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({
        body: {
          ...BODY_BASE,
          correo: "a@ricol.com.co",
          tipoContrato: "termino INDEFINIDO",
          tenantId: "tenant-B",
        },
      }),
      res,
    );
    expect(catalogoFindFirstMock.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-A",
      tipo: "TIPO_CONTRATO",
      activo: true,
      nombreNormalizado: "termino indefinido",
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(empleadoCreateMock.mock.calls[0][0].data.tipoContrato).toBe("Término indefinido");
  });

  it("crear: tipo de contrato fuera del catálogo (o inactivo / de otro tenant) => 400", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    catalogoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, correo: "a@ricol.com.co", tipoContrato: "Inventado" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("crear: sin tipo de contrato se guarda null (opcional)", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    await crearEmpleado(fakeReq({ body: { ...BODY_BASE, correo: "a@ricol.com.co" } }), fakeRes());
    expect(empleadoCreateMock.mock.calls[0][0].data.tipoContrato).toBeNull();
    expect(catalogoFindFirstMock).not.toHaveBeenCalled();
  });

  it("editar: cambia el tipo de contrato y audita solo el nombre del campo", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(EMP);
    catalogoFindFirstMock.mockResolvedValue({ nombre: "Obra o labor" });
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { tipoContrato: "obra o labor" } }),
      fakeRes(),
    );
    expect(empleadoUpdateMock.mock.calls[0][0].data).toEqual({ tipoContrato: "Obra o labor" });
    const detalle = auditoriaCreateMock.mock.calls[0][0].data.detalle as string;
    expect(detalle).toContain("tipo de contrato");
    expect(detalle).not.toContain("Obra o labor");
  });

  it("editar: conservar el valor ya guardado no consulta el catálogo ni escribe", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({ ...EMP, tipoContrato: "Vigente desactivado" });
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { tipoContrato: "Vigente desactivado" } }),
      fakeRes(),
    );
    expect(catalogoFindFirstMock).not.toHaveBeenCalled();
    expect(empleadoUpdateMock).not.toHaveBeenCalled();
  });

  it("editar: vaciarlo lo deja en null y uno inválido da 400", async () => {
    const { editarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue({ ...EMP, tipoContrato: "Obra o labor" });
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { tipoContrato: "" } }),
      fakeRes(),
    );
    expect(empleadoUpdateMock.mock.calls[0][0].data).toEqual({ tipoContrato: null });

    catalogoFindFirstMock.mockResolvedValue(null);
    const res = fakeRes();
    await editarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { tipoContrato: "No existe" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("empresa del colaborador derivada del tenant (D-02)", () => {
  beforeEach(() => {
    [cargoFindFirstMock, empleadoCreateMock, auditoriaCreateMock].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
    empleadoCreateMock.mockImplementation(async ({ data }) => empleadoCreado(data));
  });

  it("ignora el empresaId del cliente y usa el del dominio corporativo del tenant de la sesión", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    tenantFindUniqueMock.mockResolvedValue({ dominioCorporativo: "flexipackdecolombia.com" });
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({
        body: { ...BODY_BASE, empresaId: "RC", correo: "juan@flexipackdecolombia.com" },
      }),
      res,
    );
    expect(tenantFindUniqueMock.mock.calls[0][0].where).toEqual({ id: "tenant-A" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(empleadoCreateMock.mock.calls[0][0].data.empresaId).toBe("FL");
  });

  it("el correo se valida contra la empresa del tenant, no contra la que mande el cliente", async () => {
    const { crearEmpleado } = await import("./empleados.controller");
    tenantFindUniqueMock.mockResolvedValue({ dominioCorporativo: "flexipackdecolombia.com" });
    const res = fakeRes();
    await crearEmpleado(
      fakeReq({ body: { ...BODY_BASE, empresaId: "RC", correo: "juan@ricol.com.co" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });

  it("tenant sin dominio corporativo, o con uno que no es del grupo: 409 y no crea (falla cerrado, sin empresa por defecto)", async () => {
    const { crearEmpleado, MENSAJE_EMPRESA_NO_CONFIGURADA } =
      await import("./empleados.controller");
    for (const tenant of [{ dominioCorporativo: null }, { dominioCorporativo: "otra.com" }, null]) {
      tenantFindUniqueMock.mockResolvedValue(tenant);
      const res = fakeRes();
      await crearEmpleado(fakeReq({ body: { ...BODY_BASE, correo: "juan@ricol.com.co" } }), res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: MENSAJE_EMPRESA_NO_CONFIGURADA });
    }
    expect(empleadoCreateMock).not.toHaveBeenCalled();
  });
});

describe("liquidar y eliminar desactivan los vínculos biométricos (D-04)", () => {
  const EMP = {
    id: "emp-1",
    tenantId: "tenant-A",
    empresaId: "RC",
    nombres: "Juan",
    apellidos: "Pérez",
    estado: "Activo",
    salarioActual: 1,
  };

  beforeEach(() => {
    [empleadoFindFirstMock, empleadoUpdateMock, auditoriaCreateMock].forEach((m) => m.mockReset());
    auditoriaCreateMock.mockResolvedValue({});
    empleadoFindFirstMock.mockResolvedValue(EMP);
    empleadoUpdateMock.mockImplementation(async ({ data }) => ({
      ...EMP,
      historicoSalario: [],
      ...data,
    }));
  });

  it("atomicidad: el cambio, la desactivación de vínculos y la auditoría se escriben DENTRO de la transacción", async () => {
    const { liquidarEmpleado, eliminarEmpleado } = await import("./empleados.controller");
    const dentro: Record<string, boolean[]> = {
      update: [],
      vinculos: [],
      permisos: [],
      auditoria: [],
    };
    empleadoUpdateMock.mockImplementation(async ({ data }) => {
      dentro.update.push(estadoTx.profundidad > 0);
      return { ...EMP, historicoSalario: [], ...data };
    });
    vinculoUpdateManyMock.mockImplementation(async () => {
      dentro.vinculos.push(estadoTx.profundidad > 0);
      return { count: 1 };
    });
    permisoUpdateManyMock.mockImplementation(async () => {
      dentro.permisos.push(estadoTx.profundidad > 0);
      return { count: 1 };
    });
    auditoriaCreateMock.mockImplementation(async () => {
      dentro.auditoria.push(estadoTx.profundidad > 0);
      return {};
    });

    await liquidarEmpleado(fakeReq({ params: { id: "emp-1" }, body: {} }), fakeRes());
    await eliminarEmpleado(fakeReq({ params: { id: "emp-1" } }), fakeRes());

    // Con el código anterior (update y auditoría sueltos con `prisma`) esto sería [false, false].
    expect(dentro).toEqual({
      update: [true, true],
      vinculos: [true, true],
      permisos: [true, true],
      auditoria: [true, true],
    });
  });

  it("liquidar: marca Liquidado, desactiva solo los vínculos ACTIVOS del colaborador y tenant, y audita", async () => {
    const { liquidarEmpleado } = await import("./empleados.controller");
    vinculoUpdateManyMock.mockResolvedValue({ count: 2 });
    const res = fakeRes();
    await liquidarEmpleado(
      fakeReq({ params: { id: "emp-1" }, body: { fechaLiquidacion: "2026-11-20" } }),
      res,
    );
    expect(empleadoFindFirstMock.mock.calls[0][0].where).toEqual({
      id: "emp-1",
      tenantId: "tenant-A",
      eliminado: false,
    });
    expect(empleadoUpdateMock.mock.calls[0][0].data.estado).toBe("Liquidado");
    expect(vinculoUpdateManyMock).toHaveBeenCalledWith({
      where: { tenantId: "tenant-A", empleadoId: "emp-1", activo: true },
      data: { activo: false },
    });
    expect(auditoriaCreateMock.mock.calls[0][0].data).toMatchObject({
      accion: "EMPLEADO_LIQUIDADO",
    });
    expect(auditoriaCreateMock.mock.calls[0][0].data.detalle).toContain(
      "2 vínculo(s) biométrico(s)",
    );
  });

  it("eliminar: soft-delete (conserva datos), desactiva vínculos y audita, todo en la misma transacción", async () => {
    const { eliminarEmpleado } = await import("./empleados.controller");
    const res = fakeRes();
    await eliminarEmpleado(fakeReq({ params: { id: "emp-1" } }), res);
    expect(empleadoUpdateMock.mock.calls[0][0]).toEqual({
      where: { id: "emp-1" },
      data: { eliminado: true },
    });
    expect(vinculoUpdateManyMock).toHaveBeenCalledWith({
      where: { tenantId: "tenant-A", empleadoId: "emp-1", activo: true },
      data: { activo: false },
    });
    expect(auditoriaCreateMock.mock.calls[0][0].data).toMatchObject({
      accion: "EMPLEADO_ELIMINADO",
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("si falla la auditoría responde 500 (el cambio va en la misma $transaction, que en la BD real se revierte)", async () => {
    const { liquidarEmpleado, eliminarEmpleado } = await import("./empleados.controller");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    auditoriaCreateMock.mockRejectedValue(new Error("BD caída"));
    const resL = fakeRes();
    await liquidarEmpleado(fakeReq({ params: { id: "emp-1" }, body: {} }), resL);
    expect(resL.status).toHaveBeenCalledWith(500);
    const resE = fakeRes();
    await eliminarEmpleado(fakeReq({ params: { id: "emp-1" } }), resE);
    expect(resE.status).toHaveBeenCalledWith(500);
  });

  it("IDOR: un colaborador de otro tenant (o eliminado) responde 404 y no toca vínculos", async () => {
    const { liquidarEmpleado, eliminarEmpleado } = await import("./empleados.controller");
    empleadoFindFirstMock.mockResolvedValue(null);
    const resL = fakeRes();
    await liquidarEmpleado(fakeReq({ params: { id: "emp-B" }, body: {} }), resL);
    const resE = fakeRes();
    await eliminarEmpleado(fakeReq({ params: { id: "emp-B" } }), resE);
    expect(resL.status).toHaveBeenCalledWith(404);
    expect(resE.status).toHaveBeenCalledWith(404);
    expect(vinculoUpdateManyMock).not.toHaveBeenCalled();
    expect(permisoUpdateManyMock).not.toHaveBeenCalled();
    expect(empleadoUpdateMock).not.toHaveBeenCalled();
  });

  it("liquidar y eliminar cierran como Rechazado solo los permisos PENDIENTES del colaborador y tenant (sin borrarlos) y lo auditan", async () => {
    const { liquidarEmpleado, eliminarEmpleado } = await import("./empleados.controller");
    permisoUpdateManyMock.mockResolvedValue({ count: 3 });
    await liquidarEmpleado(fakeReq({ params: { id: "emp-1" }, body: {} }), fakeRes());
    await eliminarEmpleado(fakeReq({ params: { id: "emp-1" } }), fakeRes());
    const esperado = {
      where: { tenantId: "tenant-A", empleadoId: "emp-1", estado: "Pendiente" },
      data: { estado: "Rechazado" },
    };
    expect(permisoUpdateManyMock.mock.calls).toEqual([[esperado], [esperado]]);
    for (const [llamada] of auditoriaCreateMock.mock.calls) {
      expect(llamada.data.detalle).toContain(
        '3 permiso(s) laboral(es) pendiente(s) quedaron como "Rechazado"',
      );
    }
  });

  it("sin permisos pendientes la auditoría no menciona permisos", async () => {
    const { liquidarEmpleado } = await import("./empleados.controller");
    await liquidarEmpleado(fakeReq({ params: { id: "emp-1" }, body: {} }), fakeRes());
    expect(auditoriaCreateMock.mock.calls[0][0].data.detalle).not.toMatch(/permiso/);
  });
});
