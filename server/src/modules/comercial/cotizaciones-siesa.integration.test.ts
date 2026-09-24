import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

/**
 * Ingesta de cotizaciones desde Siesa con BASE DE DATOS REAL de RicoSoft y
 * Siesa mockeado (../../config/siesa::getSiesaPool), mismo patrón que
 * pedidos-compromiso.integration.test.ts. Verifica la persistencia ATÓMICA:
 * cotización + ítems + auditoría en una transacción, actualización solo de
 * BORRADOR, aislamiento por tenant y rollback si falla la auditoría.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const CIA_A = 900990;
const CIA_B = 900991;

interface DocFake {
  rowId: number;
  cia: number;
  consec: number;
  cliente?: string;
  vencimiento?: Date;
  lineas: { cantidad: number; precio: number; descuento?: number; impuesto?: number }[];
}
const DOCS: DocFake[] = [];
const BASE_ROWID = 92_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
let siguienteRowId = BASE_ROWID;
const nuevoDoc = (over: Partial<DocFake> = {}): DocFake => {
  const rowId = siguienteRowId++;
  const doc: DocFake = {
    rowId,
    cia: CIA_A,
    consec: 50000 + (rowId % 10000),
    lineas: [
      { cantidad: 10, precio: 1000, descuento: 500, impuesto: 1710 },
      { cantidad: 4, precio: 2500 },
    ],
    ...over,
  };
  DOCS.push(doc);
  return doc;
};

function crearRequestFake() {
  const inputs: Record<string, unknown> = {};
  const req = {
    input(nombre: string, valor: unknown) {
      inputs[nombre] = valor;
      return req;
    },
    async query(sql: string) {
      if (/f431_rowid_pv_docto IN/.test(sql)) {
        const rowIds = Object.entries(inputs)
          .filter(([k]) => /^r\d+$/.test(k))
          .map(([, v]) => v as number);
        const recordset = DOCS.filter((d) => d.cia === inputs.ciaId && rowIds.includes(d.rowId)).flatMap(
          (d) =>
            d.lineas.map((l, i) => ({
              docRowId: d.rowId,
              lineaRowId: d.rowId * 10 + i,
              itemRowId: 700 + i,
              referencia: `REF-${i + 1}`,
              descripcion: `Producto ${i + 1}`,
              unidadMedida: "KG  ",
              listaPrecio: "001",
              bodegaRowId: 1,
              tasaImpuesto: l.impuesto ? 19 : null,
              cantidad: l.cantidad,
              precioUnitario: l.precio,
              descuentoLinea: l.descuento ?? 0,
              descuentoGlobal: 0,
              impuesto: l.impuesto ?? 0,
              valorNeto: l.impuesto ? l.impuesto / 0.19 : l.cantidad * l.precio,
            })),
        );
        return { recordset };
      }
      // Encabezados: solo los documentos del rango de esta corrida y de la compañía.
      const recordset = DOCS.filter((d) => d.cia === inputs.ciaId)
        .slice(-(inputs.limite as number))
        .map((d) => ({
          erpRowId: d.rowId,
          consec: d.consec,
          clienteRowId: 3001,
          clienteNombre: d.cliente ?? "Cliente Siesa",
          clienteNit: "900111222-3",
          fecha: new Date("2026-09-10"),
          moneda: "COP ",
          vencimiento: d.vencimiento ?? null,
          condicionPagoId: "30D",
          condicionPagoDescripcion: "CREDITO A 30 DIAS",
          tasaDsctoGlobalCap: 0,
          vendedorRowId: 55,
          vendedorNombre: "Vendedor Siesa",
        }));
      return { recordset };
    },
  };
  return req;
}

const poolFake = { request: vi.fn(() => crearRequestFake()) };
const getSiesaPoolMock = vi.fn(async () => poolFake);
vi.mock("../../config/siesa", () => ({
  getSiesaPool: (...args: unknown[]) => getSiesaPoolMock(...args),
}));

import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

// Interruptor de fallo de auditoría (prisma.$use alcanza al cliente `tx`).
let fallarAuditoria = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$use(
  async (
    params: { model?: string; action: string },
    next: (params: unknown) => Promise<unknown>,
  ) => {
    if (fallarAuditoria && params.model === "Auditoria" && params.action === "create") {
      throw new Error("boom auditoria");
    }
    return next(params);
  },
);

describe.skipIf(!RUN)("POST /comercial/cotizaciones/siesa/sincronizar — persistencia (BD real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];

  let tenantA: string;
  let tenantB: string;
  let tenantSinSiesa: string;
  let tokenA: string;
  let tokenB: string;
  let tokenSinSiesa: string;
  let tokenSoloVer: string;

  const sincronizar = (body: object, tok = tokenA) =>
    request(app)
      .post("/api/comercial/cotizaciones/siesa/sincronizar")
      .set("Authorization", `Bearer ${tok}`)
      .send(body);

  const cotizacionesDe = (tenantId: string, erpRowId: number) =>
    prisma.cotizacion.findMany({ where: { tenantId, erpRowId }, include: { items: true } });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const mk = async (etiqueta: string, siesaCiaId?: number) => {
      const t = await prisma.tenant.create({
        data: {
          nombre: `Test CotSiesa ${etiqueta} ${sufijo}`,
          subdomain: `test-cotsiesa-${etiqueta}-${sufijo}`,
          ...(siesaCiaId ? { siesaCiaId } : {}),
        },
      });
      tenantIds.push(t.id);
      return t.id;
    };
    tenantA = await mk("a", CIA_A);
    tenantB = await mk("b", CIA_B);
    tenantSinSiesa = await mk("nosiesa");

    const mkUser = async (tid: string, etiqueta: string, extra: object = {}) => {
      const email = `cotsiesa-${etiqueta}-${sufijo}@test.ricosoft.local`;
      await prisma.user.create({
        data: {
          tenantId: tid,
          email,
          passwordHash,
          nombre: `Usuario ${etiqueta}`,
          isSuperadmin: true,
          activo: true,
          ...extra,
        },
      });
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200) throw new Error(`Login falló ${etiqueta}: ${res.status}`);
      return res.body.token as string;
    };
    tokenA = await mkUser(tenantA, "a");
    tokenB = await mkUser(tenantB, "b");
    tokenSinSiesa = await mkUser(tenantSinSiesa, "nosiesa");

    const rol = await prisma.rol.create({
      data: {
        tenantId: tenantA,
        nombre: `Solo ver ${sufijo}`,
        permisos: JSON.stringify([PERMISOS_SISTEMA.COTIZACIONES_VER]),
      },
    });
    tokenSoloVer = await mkUser(tenantA, "ver", { isSuperadmin: false, rolId: rol.id });
  });

  afterAll(async () => {
    await prisma.cotizacionItem.deleteMany({ where: { cotizacion: { tenantId: { in: tenantIds } } } });
    await prisma.cotizacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("simulación (guardar por defecto): clasifica pero NO escribe nada", async () => {
    const doc = nuevoDoc();
    const res = await sincronizar({ limite: 1 });

    expect(res.status).toBe(200);
    expect(res.body.modo).toBe("SIMULACION");
    expect(res.body.cotizaciones[0]).toMatchObject({ erpRowId: doc.rowId, estadoSincronizacion: "NUEVA" });
    expect(await cotizacionesDe(tenantA, doc.rowId)).toHaveLength(0);
  });

  it("guardar=true: crea ATÓMICAMENTE la cotización BORRADOR con ítems, campos de Siesa y auditoría", async () => {
    const doc = nuevoDoc({ cliente: "Cliente Persistido" });
    const res = await sincronizar({ guardar: true, limite: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ modo: "GUARDADO", creadas: 1, actualizadas: 0, errores: [] });

    const [c] = await cotizacionesDe(tenantA, doc.rowId);
    expect(c).toMatchObject({
      tenantId: tenantA,
      estado: "BORRADOR",
      erpTipoDocumento: "CDV",
      erpNumero: `COT-${doc.consec}`,
      erpEstadoSincronizacion: "VINCULADO",
      moneda: "COP",
      clienteRowId: 3001,
      clienteNombre: "Cliente Persistido",
      clienteNit: "900111222-3",
      vendedorNombre: "Vendedor Siesa",
    });
    // vencimiento = fecha (2026-09-10) + 15 días
    expect(c.fechaVencimiento?.toISOString().slice(0, 10)).toBe("2026-09-25");
    expect(c.items).toHaveLength(2);
    const it0 = c.items.find((i) => i.orden === 0)!;
    expect(it0).toMatchObject({ referencia: "REF-1", itemRowId: 700, descripcion: "Producto 1" });
    expect(Number(it0.cantidad)).toBe(10);
    expect(Number(it0.precioUnitario)).toBe(1000);
    expect(Number(it0.descuentoPct)).toBe(5); // 500 / (10 x 1000)
    expect(Number(it0.ivaPct)).toBe(19);

    const auditoria = await prisma.auditoria.findMany({
      where: { tenantId: tenantA, entidadId: c.id, accion: "COTIZACION_SIESA_CREADA" },
    });
    expect(auditoria).toHaveLength(1);
  });

  it("guardar=true con f430_fecha_vcto_cotizacion presente: usa ESE vencimiento (no fecha + 15)", async () => {
    const doc = nuevoDoc({ vencimiento: new Date("2026-10-30") });
    const res = await sincronizar({ guardar: true, limite: 1 });
    expect(res.body.creadas).toBe(1);

    const [c] = await cotizacionesDe(tenantA, doc.rowId);
    expect(c.fechaVencimiento?.toISOString().slice(0, 10)).toBe("2026-10-30");
    expect(c.items[0]).toMatchObject({ unidadMedida: "KG", bodegaRowId: 1 });
  });

  it("re-sincronizar una vinculada en BORRADOR la ACTUALIZA (sin duplicar) y reemplaza los ítems", async () => {
    const doc = nuevoDoc();
    await sincronizar({ guardar: true, limite: 1 });
    const [antes] = await cotizacionesDe(tenantA, doc.rowId);

    doc.lineas = [{ cantidad: 3, precio: 9000 }]; // Siesa cambió
    const res = await sincronizar({ guardar: true, limite: 1 });

    expect(res.body).toMatchObject({ creadas: 0, actualizadas: 1, yaVinculadas: 1 });
    const despues = await cotizacionesDe(tenantA, doc.rowId);
    expect(despues).toHaveLength(1); // no duplicó
    expect(despues[0].id).toBe(antes.id);
    expect(despues[0].numero).toBe(antes.numero); // el consecutivo interno no cambia
    expect(despues[0].items).toHaveLength(1);
    expect(Number(despues[0].items[0].precioUnitario)).toBe(9000);
  });

  it("una vinculada que YA NO es BORRADOR no se toca (omitida)", async () => {
    const doc = nuevoDoc();
    await sincronizar({ guardar: true, limite: 1 });
    const [c] = await cotizacionesDe(tenantA, doc.rowId);
    await prisma.cotizacion.update({ where: { id: c.id }, data: { estado: "ENVIADA" } });

    doc.lineas = [{ cantidad: 1, precio: 1 }];
    const res = await sincronizar({ guardar: true, limite: 1 });

    expect(res.body).toMatchObject({ creadas: 0, actualizadas: 0, omitidas: 1 });
    expect(res.body.cotizaciones[0].resultado).toBe("OMITIDA_NO_BORRADOR");
    const [despues] = await cotizacionesDe(tenantA, doc.rowId);
    expect(despues.estado).toBe("ENVIADA");
    expect(despues.items).toHaveLength(2); // ítems intactos
  });

  it("ROLLBACK: si la auditoría falla NO queda cotización ni ítems huérfanos, y se reporta el error", async () => {
    const doc = nuevoDoc();
    fallarAuditoria = true;
    let res;
    try {
      res = await sincronizar({ guardar: true, limite: 1 });
    } finally {
      fallarAuditoria = false;
    }

    expect(res.status).toBe(200);
    expect(res.body.errores).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/boom/);
    expect(await cotizacionesDe(tenantA, doc.rowId)).toHaveLength(0);
    // el reintento posterior funciona (nada quedó a medias)
    const ok = await sincronizar({ guardar: true, limite: 1 });
    expect(ok.body.creadas).toBe(1);
  });

  it("carrera: dos sincronizaciones simultáneas -> UNA sola cotización local por erpRowId", async () => {
    const doc = nuevoDoc();
    const [r1, r2] = await Promise.all([
      sincronizar({ guardar: true, limite: 1 }),
      sincronizar({ guardar: true, limite: 1 }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(await cotizacionesDe(tenantA, doc.rowId)).toHaveLength(1);
    const creadas = r1.body.creadas + r2.body.creadas;
    expect(creadas).toBe(1);
  });

  it("aislamiento multi-tenant: cada tenant lee su compañía Siesa y crea SUS cotizaciones", async () => {
    const docB = nuevoDoc({ cia: CIA_B });
    const res = await sincronizar({ guardar: true, limite: 1, ciaId: CIA_A, tenantId: tenantA }, tokenB);

    expect(res.status).toBe(200);
    expect(res.body.creadas).toBe(1);
    expect(await cotizacionesDe(tenantB, docB.rowId)).toHaveLength(1);
    expect(await cotizacionesDe(tenantA, docB.rowId)).toHaveLength(0); // no cruza tenants
  });

  it("permisos: solo cotizaciones.ver -> 403 sin escribir; tenant sin siesaCiaId -> 400", async () => {
    const doc = nuevoDoc();
    const denegado = await sincronizar({ guardar: true, limite: 1 }, tokenSoloVer);
    expect(denegado.status).toBe(403);
    expect(await cotizacionesDe(tenantA, doc.rowId)).toHaveLength(0);

    const sinCia = await sincronizar({ guardar: true }, tokenSinSiesa);
    expect(sinCia.status).toBe(400);
  });
});
