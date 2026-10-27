import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Nombre de la cuenta (User.nombres / User.apellidos): validación del body y
 * lo que realmente se guarda en el alta administrativa y en el perfil propio.
 */
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    departamento: { findFirst: vi.fn() },
    rol: { findFirst: vi.fn() },
    auditoria: { create: vi.fn() },
  },
}));

vi.mock("../../config/prisma", () => ({ prisma: prismaMock }));

import { actualizarPerfilPropio, crearUsuario } from "./usuarios.controller";
import { actualizarPerfilPropioSchema, crearUsuarioSchema } from "./usuarios.schemas";

function respuestaFalsa() {
  const res: { statusCode: number; body: unknown } & Record<string, unknown> = {
    statusCode: 200,
    body: undefined,
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  return res;
}

const actor = {
  id: "admin-1",
  tenantId: "t1",
  nombre: "Admin Uno",
  nombres: null,
  apellidos: null,
  permisos: [] as string[],
  isSuperadmin: true,
};

describe("esquemas: nombre de la cuenta", () => {
  const base = { email: "ana@ricol.com.co", password: "Segura#2026x" };

  it("alta: acepta nombres + apellidos, o solo `nombre` (compatibilidad)", () => {
    expect(
      crearUsuarioSchema.safeParse({ ...base, nombres: "Ana", apellidos: "Ruiz" }).success,
    ).toBe(true);
    expect(crearUsuarioSchema.safeParse({ ...base, nombre: "Ana Ruiz" }).success).toBe(true);
  });

  it("alta: rechaza sin nombre, o con el par incompleto", () => {
    expect(crearUsuarioSchema.safeParse({ ...base }).success).toBe(false);
    const sinApellidos = crearUsuarioSchema.safeParse({ ...base, nombres: "Ana" });
    expect(sinApellidos.success).toBe(false);
    if (!sinApellidos.success) {
      expect(sinApellidos.error.issues[0].message).toBe("Los apellidos son obligatorios.");
    }
    expect(crearUsuarioSchema.safeParse({ ...base, apellidos: "Ruiz" }).success).toBe(false);
  });

  it("perfil: mismas reglas y límite de longitud", () => {
    expect(
      actualizarPerfilPropioSchema.safeParse({ nombres: "Ana", apellidos: "Ruiz" }).success,
    ).toBe(true);
    expect(actualizarPerfilPropioSchema.safeParse({ nombre: "Ana Ruiz" }).success).toBe(true);
    expect(actualizarPerfilPropioSchema.safeParse({}).success).toBe(false);
    expect(
      actualizarPerfilPropioSchema.safeParse({ nombres: "x".repeat(121), apellidos: "Ruiz" })
        .success,
    ).toBe(false);
  });
});

describe("crearUsuario: qué se guarda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }) => ({
      id: "nuevo",
      activo: true,
      departamentoId: null,
      departamento: null,
      rolId: null,
      rolRel: null,
      createdAt: new Date(),
      email: data.email,
      nombre: data.nombre,
      nombres: data.nombres,
      apellidos: data.apellidos,
    }));
    prismaMock.auditoria.create.mockResolvedValue({});
  });

  const llamar = async (body: Record<string, unknown>) => {
    const res = respuestaFalsa();
    await crearUsuario(
      {
        user: actor,
        body: { password: "Segura#2026x", email: "ana@ricol.com.co", ...body },
      } as never,
      res as never,
    );
    return res;
  };

  it("con nombres y apellidos guarda las dos columnas y deriva `nombre`; el tenant sale del actor", async () => {
    const res = await llamar({ nombres: "Ana María", apellidos: "Ruiz Soto", tenantId: "otro" });
    expect(res.statusCode).toBe(201);
    const data = prismaMock.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t1",
      nombre: "Ana María Ruiz Soto",
      nombres: "Ana María",
      apellidos: "Ruiz Soto",
    });
  });

  it("solo con `nombre` (cliente antiguo) lo guarda sin separar: nombres y apellidos en null", async () => {
    const res = await llamar({ nombre: "Ana María Ruiz Soto" });
    expect(res.statusCode).toBe(201);
    const data = prismaMock.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ nombre: "Ana María Ruiz Soto", nombres: null, apellidos: null });
  });

  it("sin nombre utilizable responde 400 y no crea nada", async () => {
    const res = await llamar({});
    expect(res.statusCode).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

describe("actualizarPerfilPropio: qué se guarda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.update.mockImplementation(async ({ data }) => ({
      id: "admin-1",
      email: "admin@ricol.com.co",
      telefono: null,
      nombre: data.nombre ?? "Admin Uno",
      nombres: data.nombres ?? null,
      apellidos: data.apellidos ?? null,
    }));
    prismaMock.auditoria.create.mockResolvedValue({});
  });

  const llamar = async (body: Record<string, unknown>) => {
    const res = respuestaFalsa();
    await actualizarPerfilPropio({ user: actor, body } as never, res as never);
    return res;
  };

  it("edita solo al usuario autenticado y guarda nombres y apellidos", async () => {
    await llamar({ nombres: "Admin", apellidos: "Uno", id: "otra-persona" });
    const llamada = prismaMock.user.update.mock.calls[0][0];
    expect(llamada.where).toEqual({ id: "admin-1" });
    expect(llamada.data).toMatchObject({ nombre: "Admin Uno", nombres: "Admin", apellidos: "Uno" });
  });

  it("un cliente antiguo con el mismo nombre no toca nombre, nombres ni apellidos", async () => {
    await llamar({ nombre: "Admin Uno", telefono: "3001234567" });
    const data = prismaMock.user.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("nombre");
    expect(data).not.toHaveProperty("nombres");
    expect(data).not.toHaveProperty("apellidos");
    expect(data.telefono).toBe("3001234567");
  });

  it("un cliente antiguo que cambia el nombre vacía nombres y apellidos", async () => {
    await llamar({ nombre: "Admin Dos" });
    const data = prismaMock.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ nombre: "Admin Dos", nombres: null, apellidos: null });
  });
});
