import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * El nombre de un módulo se siembra una sola vez por tenant. Si la fila aún
 * tiene el nombre histórico ("Importaciones y Exportaciones") se actualiza al
 * vigente; un nombre personalizado por el administrador no se toca. Sin BD.
 */
const m = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: { modulo: { findMany: m.findMany, createMany: m.createMany, update: m.update } },
}));

const { listarModulosMenu } = await import("./modulos.controller");

const fila = (clave: string, nombre: string, extra: object = {}) => ({
  id: `id-${clave}`,
  tenantId: "ten-1",
  clave,
  nombre,
  ruta: `/${clave}`,
  icono: "Ship",
  permisoClave: null,
  activo: true,
  orden: 0,
  departamentoId: null,
  departamento: null,
  ...extra,
});

function respuesta() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: unknown) {
      res.body = b;
      return res;
    },
  };
  return res;
}
const peticion = () => ({ user: { tenantId: "ten-1", isSuperadmin: true, permisos: [] } }) as never;

beforeEach(() => {
  m.findMany.mockReset();
  m.createMany.mockReset();
  m.update.mockReset().mockResolvedValue({});
});

describe("módulos: nombre histórico", () => {
  it("renombra 'Importaciones y Exportaciones' a 'Importaciones' cuando nadie lo personalizó", async () => {
    m.findMany.mockResolvedValueOnce([fila("importaciones", "Importaciones y Exportaciones")]);
    m.findMany.mockResolvedValue([fila("importaciones", "Importaciones")]);
    const res = respuesta();
    await listarModulosMenu(peticion(), res as never);

    const llamadas = m.update.mock.calls.map((c) => c[0]);
    expect(llamadas).toContainEqual({
      where: { id: "id-importaciones" },
      data: { nombre: "Importaciones" },
    });
    const body = res.body as Array<{ clave: string; nombre: string }>;
    expect(body.find((x) => x.clave === "importaciones")?.nombre).toBe("Importaciones");
  });

  it("respeta un nombre personalizado por el administrador", async () => {
    m.findMany.mockResolvedValue([fila("importaciones", "Comercio exterior")]);
    const res = respuesta();
    await listarModulosMenu(peticion(), res as never);

    const cambiosDeNombre = m.update.mock.calls.filter((c) => c[0]?.data?.nombre !== undefined);
    expect(cambiosDeNombre).toHaveLength(0);
  });

  it("no toca filas de otro tenant (solo las propias)", async () => {
    m.findMany.mockResolvedValue([
      fila("importaciones", "Importaciones y Exportaciones", { tenantId: "ten-2" }),
    ]);
    const res = respuesta();
    await listarModulosMenu(peticion(), res as never);
    expect(m.update.mock.calls.filter((c) => c[0]?.data?.nombre !== undefined)).toHaveLength(0);
  });
});
