import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

/**
 * POST /despachos — unicidad (tenantId, siesaDocRowId), concurrencia y
 * atomicidad, con BASE DE DATOS REAL. Lo único mockeado es la lectura del
 * documento de venta/líneas de Siesa (siesa-ventas.service): la unicidad, la
 * transacción despacho+líneas+auditoría y el manejo de P2002 se ejercitan
 * contra SQL Server de verdad (no son verificables con un mock de Prisma).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

// siesaCiaId es @unique en Tenant: valores altos propios de esta suite.
const CIA_A = 900971;
const CIA_B = 900972;

const BASE_DOC = 70_000_000 + Math.floor(Math.random() * 5_000_000) * 10;
let siguienteDoc = BASE_DOC;
const nuevoDocId = () => siguienteDoc++;

vi.mock("../integraciones-siesa/siesa-ventas.service", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    leerDocumentoVentaPorIdSiesa: vi.fn(async (_ciaId: number, docRowId: number) => ({
      id: docRowId,
      fecha: new Date("2026-09-20"),
      referencia: `FV-${docRowId}`,
      clienteNombre: "Cliente Concurrencia",
      clienteNit: "900111222-3",
      neto: 1500000,
    })),
    leerLineasDocumentoVentaSiesa: vi.fn(async () => [
      {
        itemRowId: 11,
        descripcion: "Producto uno",
        referencia: "P-1",
        unidadMedida: "KG",
        cantidad: 10,
      },
      {
        itemRowId: 12,
        descripcion: "Producto dos",
        referencia: "P-2",
        unidadMedida: "UND",
        cantidad: 5,
      },
    ]),
  };
});

import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

// Interruptor para el test de rollback; ver el razonamiento (prisma.$use sí
// alcanza al cliente `tx` de $transaction, un spy sobre prisma.auditoria no)
// en comercial/pedidos-asignar-erp.integration.test.ts (test 22).
let forzarFalloAuditoria = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$use(
  async (
    params: { model?: string; action: string },
    next: (params: unknown) => Promise<unknown>,
  ) => {
    if (forzarFalloAuditoria && params.model === "Auditoria" && params.action === "create") {
      throw new Error("boom inesperado");
    }
    return next(params);
  },
);

describe.skipIf(!RUN)("POST /despachos — unicidad y concurrencia", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenB: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  const crear = (siesaDocRowId: number, tok = tokenA) =>
    request(app)
      .post("/api/despachos")
      .set("Authorization", `Bearer ${tok}`)
      .send({ siesaDocRowId });

  const contarDespachos = (tenantId: string, siesaDocRowId: number) =>
    prisma.despacho.count({ where: { tenantId, siesaDocRowId } });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: {
        nombre: `Desp Concurrencia A ${sufijo}`,
        subdomain: `test-despconc-a-${sufijo}`,
        siesaCiaId: CIA_A,
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        nombre: `Desp Concurrencia B ${sufijo}`,
        subdomain: `test-despconc-b-${sufijo}`,
        siesaCiaId: CIA_B,
      },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    for (const [tid, etiqueta] of [
      [tenantAId, "a"],
      [tenantBId, "b"],
    ] as const) {
      await prisma.user.create({
        data: {
          tenantId: tid,
          email: `despconc-${etiqueta}-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: `Admin ${etiqueta}`,
          isSuperadmin: true,
          activo: true,
        },
      });
    }
    tokenA = await login(`despconc-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`despconc-b-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.despachoNovedad.deleteMany({
      where: { despacho: { tenantId: { in: tenantIds } } },
    });
    await prisma.despachoLinea.deleteMany({ where: { despacho: { tenantId: { in: tenantIds } } } });
    await prisma.despacho.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("creación exitosa: 201 con despacho + líneas + auditoría, atómicos", async () => {
    const doc = nuevoDocId();
    const res = await crear(doc);

    expect(res.status).toBe(201);
    expect(res.body.siesaDocRowId).toBe(doc);
    expect(res.body._count.lineas).toBe(2);

    const despacho = await prisma.despacho.findFirst({
      where: { tenantId: tenantAId, siesaDocRowId: doc },
      include: { lineas: true },
    });
    expect(despacho?.lineas).toHaveLength(2);
    const auditorias = await prisma.auditoria.findMany({
      where: { tenantId: tenantAId, entidadTipo: "Despacho", entidadId: despacho!.id },
    });
    expect(auditorias).toHaveLength(1);
  });

  it("segunda creación secuencial del mismo documento -> 409 (comprobación previa)", async () => {
    const doc = nuevoDocId();
    expect((await crear(doc)).status).toBe(201);

    const res = await crear(doc);

    expect(res.status).toBe(409);
    expect(await contarDespachos(tenantAId, doc)).toBe(1);
  });

  it("CONCURRENCIA: dos peticiones idénticas en paralelo -> exactamente un 201 y un 409, sin filas huérfanas", async () => {
    const doc = nuevoDocId();

    const [r1, r2] = await Promise.all([crear(doc), crear(doc)]);

    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await contarDespachos(tenantAId, doc)).toBe(1);

    const despacho = await prisma.despacho.findFirstOrThrow({
      where: { tenantId: tenantAId, siesaDocRowId: doc },
      include: { lineas: true },
    });
    // Consistencia: solo las líneas del ganador, y una sola auditoría.
    expect(despacho.lineas).toHaveLength(2);
    const auditorias = await prisma.auditoria.count({
      where: { tenantId: tenantAId, entidadTipo: "Despacho", entidadId: despacho.id },
    });
    expect(auditorias).toBe(1);
    const lineasTotales = await prisma.despachoLinea.count({
      where: { despacho: { tenantId: tenantAId, siesaDocRowId: doc } },
    });
    expect(lineasTotales).toBe(2);
  });

  it("CONCURRENCIA (ráfaga de 5): un solo 201, el resto 409, nunca 500", async () => {
    const doc = nuevoDocId();

    const resultados = await Promise.all(Array.from({ length: 5 }, () => crear(doc)));
    const estados = resultados.map((r) => r.status).sort();

    expect(estados).toEqual([201, 409, 409, 409, 409]);
    expect(await contarDespachos(tenantAId, doc)).toBe(1);
  });

  it("la unicidad es POR TENANT: el mismo documento puede originar un despacho en otro tenant", async () => {
    const doc = nuevoDocId();
    expect((await crear(doc, tokenA)).status).toBe(201);

    const res = await crear(doc, tokenB);

    expect(res.status).toBe(201);
    expect(await contarDespachos(tenantAId, doc)).toBe(1);
    expect(await contarDespachos(tenantBId, doc)).toBe(1);
  });

  it("el índice único de BD rechaza el duplicado aun sin pasar por la API (P2002)", async () => {
    const doc = nuevoDocId();
    expect((await crear(doc)).status).toBe(201);
    const existente = await prisma.despacho.findFirstOrThrow({
      where: { tenantId: tenantAId, siesaDocRowId: doc },
    });

    await expect(
      prisma.despacho.create({
        data: {
          tenantId: tenantAId,
          siesaDocRowId: doc,
          clienteNombre: "Duplicado directo",
          valorPedido: 1,
          responsableId: existente.responsableId,
          responsable: "x",
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rollback transaccional: si la auditoría falla -> 500 y NO queda despacho ni líneas", async () => {
    const doc = nuevoDocId();

    forzarFalloAuditoria = true;
    try {
      const res = await crear(doc);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/boom inesperado|stack|at Object/);
    } finally {
      forzarFalloAuditoria = false;
    }

    expect(await contarDespachos(tenantAId, doc)).toBe(0);
    const lineas = await prisma.despachoLinea.count({
      where: { despacho: { tenantId: tenantAId, siesaDocRowId: doc } },
    });
    expect(lineas).toBe(0);

    // El documento sigue libre: el reintento posterior funciona.
    expect((await crear(doc)).status).toBe(201);
  });
});
