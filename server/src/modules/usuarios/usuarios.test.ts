import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Atomicidad de la auditoría en eliminarUsuario (auditoría 2026-09, ISO 27001):
 * el evento USUARIO_ELIMINADO debe viajar DENTRO de la misma transacción que el
 * borrado. Aquí se simula una transacción con rollback: si cualquier operación
 * del lote falla (p. ej. el insert en Auditoria), el borrado del usuario se
 * revierte.
 */
const estado = vi.hoisted(() => ({
  usuarios: new Set<string>(),
  auditoria: [] as string[],
  fallarAuditoria: false,
}));

vi.mock("../../config/prisma", () => {
  const noop = () => ({ op: async () => undefined });
  const lote = () => noop().op;
  const modelo = () => ({ updateMany: lote, deleteMany: lote });
  const prisma = {
    user: {
      findFirst: vi.fn(async () => ({
        id: "u-2",
        tenantId: "t1",
        isSuperadmin: false,
        nombre: "Ana",
        email: "ana@ricol.com",
        activo: true,
      })),
      count: vi.fn(),
      delete: () => async () => {
        estado.usuarios.delete("u-2");
      },
    },
    auditoria: {
      updateMany: lote,
      create: () => async () => {
        if (estado.fallarAuditoria) throw new Error("fallo insert Auditoria");
        estado.auditoria.push("USUARIO_ELIMINADO");
      },
    },
    sincronizacionSiesaLog: modelo(),
    pago: modelo(),
    cotizacionProveedor: modelo(),
    factura: modelo(),
    solicitudCompra: modelo(),
    servicioSuscripcion: modelo(),
    ordenCompraIntl: modelo(),
    importacionExcepcion: modelo(),
    costeoImportacionDetalle: modelo(),
    inboxItem: modelo(),
    notificacion: modelo(),
    analisisGuardado: modelo(),
    usuarioPerfilFuncional: modelo(),
    codigoVerificacionCorreo: modelo(),
    // Transacción simulada: ejecuta el lote y, si algo falla, restaura el
    // estado previo (rollback) y propaga el error.
    $transaction: async (ops: Array<() => Promise<unknown>>) => {
      const antesUsuarios = new Set(estado.usuarios);
      const antesAuditoria = [...estado.auditoria];
      try {
        for (const op of ops) await op();
      } catch (e) {
        estado.usuarios = antesUsuarios;
        estado.auditoria = antesAuditoria;
        throw e;
      }
    },
  };
  return { prisma };
});

import { eliminarUsuario } from "./usuarios.controller";

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

const req = () =>
  ({
    params: { id: "u-2" },
    user: { id: "u-1", tenantId: "t1", nombre: "Admin" },
  }) as never;

describe("eliminarUsuario — atomicidad de auditoría", () => {
  beforeEach(() => {
    estado.usuarios = new Set(["u-2"]);
    estado.auditoria = [];
    estado.fallarAuditoria = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("elimina al usuario y registra USUARIO_ELIMINADO en la misma transacción", async () => {
    const res = respuesta();
    await eliminarUsuario(req(), res as never);
    expect(res.statusCode).toBe(200);
    expect(estado.usuarios.has("u-2")).toBe(false);
    expect(estado.auditoria).toEqual(["USUARIO_ELIMINADO"]);
  });

  it("revierte el borrado si falla el insert de auditoría", async () => {
    estado.fallarAuditoria = true;
    const res = respuesta();
    await eliminarUsuario(req(), res as never);
    expect(res.statusCode).toBe(500);
    expect(estado.usuarios.has("u-2")).toBe(true);
    expect(estado.auditoria).toEqual([]);
  });
});
