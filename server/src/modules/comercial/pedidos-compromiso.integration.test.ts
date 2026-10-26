import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

/**
 * Compromiso de inventario de un PedidoComercial en Siesa, con BD REAL de
 * RicoSoft y Siesa mockeado (../../config/siesa::getSiesaPool), mismo patrón
 * que pedidos-asignar-erp.integration.test.ts. El fake de Siesa cuenta las
 * consultas (prueba de "en lote, sin N+1") y guarda los parámetros recibidos
 * (prueba de que la compañía sale del tenant y no del cliente).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const CIA_ID = 900980;
const OTRA_CIA_ID = 900981;

interface DocSiesa {
  rowId: number;
  cia: number;
  tipo: "PDV" | "CDV";
  numero: number;
  comprometida: number;
  pedida?: number;
}
const TABLA: DocSiesa[] = [];
let siguienteRowId = 81_000_000 + Math.floor(Math.random() * 1_000_000) * 10;
const nuevoDoc = (over: Partial<DocSiesa> = {}): DocSiesa => {
  const rowId = siguienteRowId++;
  const doc: DocSiesa = {
    rowId,
    cia: CIA_ID,
    tipo: "PDV",
    numero: rowId,
    comprometida: 0,
    ...over,
  };
  TABLA.push(doc);
  return doc;
};

const llamadas: Array<{ ciaId: unknown; rowIds: number[]; sql: string }> = [];

function crearRequestFake() {
  const inputs: Record<string, unknown> = {};
  const req = {
    input(nombre: string, valor: unknown) {
      inputs[nombre] = valor;
      return req;
    },
    async query(sql: string) {
      // Consulta de LÍNEAS del PDV (Estado del Pedido UnoEE): 2 líneas por documento.
      if (/AS lineaRowId/.test(sql)) {
        llamadas.push({ ciaId: inputs.ciaId, rowIds: [inputs.rowId as number], sql });
        const docs = TABLA.filter(
          (d) => d.cia === inputs.ciaId && d.tipo === "PDV" && d.rowId === inputs.rowId,
        );
        return {
          recordset: docs.flatMap((d) => [
            {
              lineaRowId: d.rowId * 10 + 1,
              itemRowId: 500,
              referencia: "REF-1",
              descripcion: "Producto uno",
              cantidadPedida: 6,
              cantidadComprometida: d.comprometida,
              cantidadRemisionada: 2,
              cantidadFacturada: 0,
              precioUnitario: 1000,
              descuentoLinea: 100,
              descuentoGlobal: 0,
              impuesto: 190,
              valorNeto: 6000,
              backorder: 0,
            },
            {
              lineaRowId: d.rowId * 10 + 2,
              itemRowId: 501,
              referencia: "REF-2",
              descripcion: "Producto dos",
              cantidadPedida: 4,
              cantidadComprometida: 0,
              cantidadRemisionada: 4,
              cantidadFacturada: 0,
              precioUnitario: 500,
              descuentoLinea: 0,
              descuentoGlobal: 0,
              impuesto: 380,
              valorNeto: 2000,
              backorder: 0,
            },
          ]),
        };
      }
      const rowIds = Object.entries(inputs)
        .filter(([k]) => /^r\d+$/.test(k))
        .map(([, v]) => v as number);
      llamadas.push({ ciaId: inputs.ciaId, rowIds, sql });
      const filas = TABLA.filter(
        (d) => d.cia === inputs.ciaId && d.tipo === "PDV" && rowIds.includes(d.rowId),
      );
      return {
        recordset: filas.map((d) => ({
          pdvRowId: d.rowId,
          pdvNumero: d.numero,
          indUltEstadoAprobado: true,
          indBackorderDocto: false,
          indBackorderLinea: 0,
          indRetenidoMargen: false,
          indRetenidoCupo: false,
          indRetenidoMora: false,
          indRetenidoBloqueo: false,
          indRetenidoAnticipo: false,
          indRemisionado: false,
          indFacturado: false,
          cantidadPedida: d.pedida ?? 10,
          cantidadComprometida: d.comprometida,
          cantidadRemisionada: 0,
          cantidadFacturada: 0,
          lineas: 2,
          lineasComprometidas: d.comprometida > 0 ? 2 : 0,
        })),
      };
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

describe.skipIf(!RUN)("GET /comercial/pedidos/:id/compromiso-inventario", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);
  let numeroBase = 810000;

  let tenantId: string;
  let otroTenantId: string;
  let sinSiesaId: string;
  let token: string;
  let otroToken: string;
  let tokenSinSiesa: string;
  let tokenSoloVer: string;
  let tokenSinPermiso: string;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`Login falló ${email}: ${res.status}`);
    return res.body.token as string;
  };

  const crearPedido = (tid: string, erpRowId: number | null = null, extra: object = {}) => {
    numeroBase += 1;
    return prisma.pedidoComercial.create({
      data: {
        tenantId: tid,
        numero: numeroBase,
        clienteRowId: 1,
        clienteNombre: "Cliente Compromiso",
        creadoPorNombre: "Suite",
        estado: "LISTO_PARA_ERP",
        erpRowId,
        erpEstadoSincronizacion: erpRowId === null ? null : "VINCULADO",
        ...extra,
      },
    });
  };

  const consultar = (id: string, tok = token, query = "") =>
    request(app)
      .get(`/api/comercial/pedidos/${id}/compromiso-inventario${query}`)
      .set("Authorization", `Bearer ${tok}`);

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const mk = (etiqueta: string, siesaCiaId?: number) =>
      prisma.tenant.create({
        data: {
          nombre: `Test Compromiso ${etiqueta} ${sufijo}`,
          subdomain: `test-compromiso-${etiqueta}-${sufijo}`,
          ...(siesaCiaId ? { siesaCiaId } : {}),
        },
      });
    const [a, b, c] = [await mk("a", CIA_ID), await mk("b", OTRA_CIA_ID), await mk("nosiesa")];
    tenantId = a.id;
    otroTenantId = b.id;
    sinSiesaId = c.id;

    const mkUser = (tid: string, etiqueta: string, extra: object = {}) =>
      prisma.user.create({
        data: {
          tenantId: tid,
          email: `comp-${etiqueta}-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: `U ${etiqueta}`,
          isSuperadmin: true,
          activo: true,
          ...extra,
        },
      });
    await mkUser(tenantId, "a");
    await mkUser(otroTenantId, "b");
    await mkUser(sinSiesaId, "nosiesa");

    const rolVer = await prisma.rol.create({
      data: {
        tenantId,
        nombre: `Solo ver ${sufijo}`,
        permisos: JSON.stringify([PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER]),
      },
    });
    const rolOtro = await prisma.rol.create({
      data: {
        tenantId,
        nombre: `Otro permiso ${sufijo}`,
        permisos: JSON.stringify([PERMISOS_SISTEMA.COTIZACIONES_VER]),
      },
    });
    await mkUser(tenantId, "ver", { isSuperadmin: false, rolId: rolVer.id });
    await mkUser(tenantId, "sinperm", { isSuperadmin: false, rolId: rolOtro.id });

    token = await login(`comp-a-${sufijo}@test.ricosoft.local`);
    otroToken = await login(`comp-b-${sufijo}@test.ricosoft.local`);
    tokenSinSiesa = await login(`comp-nosiesa-${sufijo}@test.ricosoft.local`);
    tokenSoloVer = await login(`comp-ver-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`comp-sinperm-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const ids = [tenantId, otroTenantId, sinSiesaId];
    await prisma.pedidoComercialItem.deleteMany({ where: { pedido: { tenantId: { in: ids } } } });
    await prisma.pedidoComercial.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it("sin vínculo ERP -> 200 SIN_VINCULO_ERP y NO consulta Siesa", async () => {
    const p = await crearPedido(tenantId);
    llamadas.length = 0;

    const res = await consultar(p.id);

    expect(res.status).toBe(200);
    expect(res.body.compromiso).toBe("SIN_VINCULO_ERP");
    expect(res.body.estadoSincronizacion).toBe("NO_VINCULADO");
    expect(res.body.erpRowId).toBeNull();
    expect(res.body.siesa).toBeNull();
    expect(llamadas).toHaveLength(0);
  });

  it("vinculado y con comprometido > 0 -> COMPROMETIDO con cantidades y estados separados", async () => {
    const doc = nuevoDoc({ comprometida: 7 });
    const p = await crearPedido(tenantId, doc.rowId);

    const res = await consultar(p.id);

    expect(res.status).toBe(200);
    expect(res.body.compromiso).toBe("COMPROMETIDO");
    expect(res.body.estadoComercial).toBe("LISTO_PARA_ERP");
    expect(res.body.estadoSincronizacion).toBe("VINCULADO");
    expect(res.body.siesa.estadoOperativo).toBe("Aprobado");
    expect(res.body.siesa).toMatchObject({
      pdvRowId: doc.rowId,
      cantidadPedida: 10,
      cantidadComprometida: 7,
      cantidadRemisionada: 0,
      cantidadFacturada: 0,
    });
  });

  it("existe en Siesa con comprometido 0 -> NO_COMPROMETIDO", async () => {
    const p = await crearPedido(tenantId, nuevoDoc({ comprometida: 0 }).rowId);
    expect((await consultar(p.id)).body.compromiso).toBe("NO_COMPROMETIDO");
  });

  it("erpRowId que Siesa no devuelve -> SIESA_NO_ENCONTRADO", async () => {
    const p = await crearPedido(tenantId, 999_999_999);
    expect((await consultar(p.id)).body.compromiso).toBe("SIESA_NO_ENCONTRADO");
  });

  it("NUNCA une por número visible: un PDV de Siesa con el mismo número pero otro rowid no cuenta", async () => {
    const p = await crearPedido(tenantId, 888_888_888);
    // Documento comprometido cuyo NÚMERO coincide con el del pedido y con el erpNumero.
    nuevoDoc({ numero: p.numero, comprometida: 50 });
    nuevoDoc({ numero: 888_888_888, comprometida: 50 });

    expect((await consultar(p.id)).body.compromiso).toBe("SIESA_NO_ENCONTRADO");
  });

  it("un CDV (cotización) homónimo por rowid no cuenta: solo PDV", async () => {
    const cdv = nuevoDoc({ tipo: "CDV", comprometida: 9 });
    const p = await crearPedido(tenantId, cdv.rowId);
    expect((await consultar(p.id)).body.compromiso).toBe("SIESA_NO_ENCONTRADO");
  });

  it("la compañía sale del tenant autenticado: ciaId/tenantId del querystring se IGNORAN", async () => {
    const doc = nuevoDoc({ comprometida: 3 });
    const p = await crearPedido(tenantId, doc.rowId);
    llamadas.length = 0;

    const res = await consultar(p.id, token, `?ciaId=${OTRA_CIA_ID}&tenantId=${otroTenantId}`);

    expect(res.status).toBe(200);
    expect(res.body.compromiso).toBe("COMPROMETIDO");
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].ciaId).toBe(CIA_ID);
  });

  it("aislamiento: pedido de otro tenant -> 404 sin consultar Siesa ni revelar datos", async () => {
    const doc = nuevoDoc({ comprometida: 5 });
    const p = await crearPedido(tenantId, doc.rowId);
    llamadas.length = 0;

    const res = await consultar(p.id, otroToken);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Pedido no encontrado.");
    expect(JSON.stringify(res.body)).not.toContain(String(doc.rowId));
    expect(llamadas).toHaveLength(0);
  });

  it("pedido inexistente -> 404; id inválido -> 400", async () => {
    expect((await consultar(randomUUID())).status).toBe(404);
    expect((await consultar("no-es-uuid")).status).toBe(400);
  });

  it("permisos: sin token 401; sin pedidos_comerciales.ver 403; con solo VER 200", async () => {
    const p = await crearPedido(tenantId);
    const sinToken = await request(app).get(`/api/comercial/pedidos/${p.id}/compromiso-inventario`);
    expect(sinToken.status).toBe(401);
    expect((await consultar(p.id, tokenSinPermiso)).status).toBe(403);
    expect((await consultar(p.id, tokenSoloVer)).status).toBe(200);
  });

  it("Siesa caído -> 502 con mensaje fijo, sin filtrar detalles internos", async () => {
    const p = await crearPedido(tenantId, nuevoDoc({ comprometida: 1 }).rowId);
    getSiesaPoolMock.mockRejectedValueOnce(new Error("simulated ECONNREFUSED host-secreto"));

    const res = await consultar(p.id);

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|host-secreto|SIESA_DB_|stack/i);
  });

  it("tenant sin siesaCiaId con pedido vinculado -> 400 sin conectar a Siesa", async () => {
    const p = await crearPedido(sinSiesaId, 12345);
    getSiesaPoolMock.mockClear();

    const res = await consultar(p.id, tokenSinSiesa);

    expect(res.status).toBe(400);
    expect(getSiesaPoolMock).not.toHaveBeenCalled();
  });

  describe("GET /comercial/pedidos?incluirCompromiso=true (lote)", () => {
    const listar = (query: string, tok = token) =>
      request(app).get(`/api/comercial/pedidos${query}`).set("Authorization", `Bearer ${tok}`);

    it("enriquece TODA la página con UNA sola consulta a Siesa (sin N+1)", async () => {
      const cliente = 777_001;
      const docs = [
        nuevoDoc({ comprometida: 4 }),
        nuevoDoc({ comprometida: 0 }),
        nuevoDoc({ comprometida: 9 }),
      ];
      for (const d of docs) await crearPedido(tenantId, d.rowId, { clienteRowId: cliente });
      await crearPedido(tenantId, null, { clienteRowId: cliente });
      llamadas.length = 0;

      const res = await listar(`?incluirCompromiso=true&clienteRowId=${cliente}&pageSize=50`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(4);
      expect(res.body.compromisoDisponible).toBe(true);
      expect(llamadas).toHaveLength(1);
      expect(llamadas[0].rowIds.sort()).toEqual(docs.map((d) => d.rowId).sort());
      const porEstado = res.body.items
        .map((i: { compromiso: { compromiso: string } }) => i.compromiso.compromiso)
        .sort();
      expect(porEstado).toEqual([
        "COMPROMETIDO",
        "COMPROMETIDO",
        "NO_COMPROMETIDO",
        "SIN_VINCULO_ERP",
      ]);
    });

    it("sin incluirCompromiso el listado no consulta Siesa ni agrega el campo", async () => {
      await crearPedido(tenantId, nuevoDoc({ comprometida: 1 }).rowId);
      llamadas.length = 0;

      const res = await listar("?pageSize=5");

      expect(res.status).toBe(200);
      expect(llamadas).toHaveLength(0);
      expect(res.body.items[0]).not.toHaveProperty("compromiso");
      expect(res.body).not.toHaveProperty("compromisoDisponible");
    });

    it("solo ve pedidos de su tenant aunque otro tenant tenga vínculos", async () => {
      const doc = nuevoDoc({ cia: OTRA_CIA_ID, comprometida: 2 });
      await crearPedido(otroTenantId, doc.rowId);

      const res = await listar("?incluirCompromiso=true&pageSize=100");

      const ids = res.body.items.map((i: { erpRowId: number | null }) => i.erpRowId);
      expect(ids).not.toContain(doc.rowId);
    });

    it("Siesa caído: el listado responde 200 con compromisoDisponible=false", async () => {
      await crearPedido(tenantId, nuevoDoc({ comprometida: 1 }).rowId);
      getSiesaPoolMock.mockRejectedValueOnce(new Error("simulated ECONNREFUSED"));

      const res = await listar("?incluirCompromiso=true&pageSize=5");

      expect(res.status).toBe(200);
      expect(res.body.compromisoDisponible).toBe(false);
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED/);
    });
  });

  describe("GET /comercial/pedidos/:id/estado-unoee (Estado del Pedido UnoEE)", () => {
    const estadoUnoee = (id: string, tok = token, query = "") =>
      request(app)
        .get(`/api/comercial/pedidos/${id}/estado-unoee${query}`)
        .set("Authorization", `Bearer ${tok}`);

    it("Caso B: sin vínculo ERP -> vinculado=false y NO consulta Siesa", async () => {
      const p = await crearPedido(tenantId);
      llamadas.length = 0;

      const res = await estadoUnoee(p.id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ vinculado: false, cabecera: null, items: [] });
      expect(llamadas).toHaveLength(0);
    });

    it("Caso A: cabecera (consecutivo PDV-########, estado, totales) e ítems con pendiente/remisionada", async () => {
      const doc = nuevoDoc({ comprometida: 6, numero: 55444 });
      const p = await crearPedido(tenantId, doc.rowId);
      llamadas.length = 0;

      const res = await estadoUnoee(p.id);

      expect(res.status).toBe(200);
      expect(res.body.vinculado).toBe(true);
      expect(res.body.encontradoEnSiesa).toBe(true);
      expect(res.body.cabecera).toMatchObject({
        consecutivo: "PDV-00055444",
        estado: "Comprometido",
        valorTotal: 8000,
        descuentos: 100,
        impuestos: 570,
      });
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0]).toMatchObject({
        referencia: "REF-1",
        itemRowId: 500,
        descripcion: "Producto uno",
        cantidad: 6,
        precioUnitario: 1000,
        subtotal: 6000,
        descuentos: 100,
        estado: "Parcialmente remisionado",
        cantidadRemisionada: 2,
        cantidadPendiente: 4,
      });
      // 2 consultas (resumen + líneas), acotadas a la compañía del tenant, unidas por rowid.
      expect(llamadas).toHaveLength(2);
      expect(llamadas.every((l) => l.ciaId === CIA_ID)).toBe(true);
      expect(llamadas.every((l) => l.rowIds.includes(doc.rowId))).toBe(true);
    });

    it("vinculado pero inexistente en Siesa -> encontradoEnSiesa=false", async () => {
      const p = await crearPedido(tenantId, 777_777_777);
      const res = await estadoUnoee(p.id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ vinculado: true, encontradoEnSiesa: false, items: [] });
    });

    it("aislamiento: pedido de otro tenant -> 404; ciaId del querystring ignorado; sin token 401; sin permiso 403", async () => {
      const doc = nuevoDoc({ comprometida: 1 });
      const p = await crearPedido(tenantId, doc.rowId);
      llamadas.length = 0;

      const ajeno = await estadoUnoee(p.id, otroToken);
      expect(ajeno.status).toBe(404);
      expect(JSON.stringify(ajeno.body)).not.toContain(String(doc.rowId));
      expect(llamadas).toHaveLength(0);

      const conCia = await estadoUnoee(p.id, token, `?ciaId=${OTRA_CIA_ID}`);
      expect(conCia.status).toBe(200);
      expect(llamadas.every((l) => l.ciaId === CIA_ID)).toBe(true);

      const sinToken = await request(app).get(`/api/comercial/pedidos/${p.id}/estado-unoee`);
      expect(sinToken.status).toBe(401);
      expect((await estadoUnoee(p.id, tokenSinPermiso)).status).toBe(403);
      expect((await estadoUnoee(p.id, tokenSoloVer)).status).toBe(200);
    });

    it("Siesa caído -> 502 con mensaje fijo; tenant sin siesaCiaId -> 400", async () => {
      const p = await crearPedido(tenantId, nuevoDoc({ comprometida: 1 }).rowId);
      getSiesaPoolMock.mockRejectedValueOnce(new Error("simulated ECONNREFUSED host-secreto"));
      const caido = await estadoUnoee(p.id);
      expect(caido.status).toBe(502);
      expect(JSON.stringify(caido.body)).not.toMatch(/ECONNREFUSED|host-secreto/);

      const sin = await crearPedido(sinSiesaId, 4321);
      expect((await estadoUnoee(sin.id, tokenSinSiesa)).status).toBe(400);
    });
  });

  describe("GET /comercial/documentos?tipo=pedido&incluirCompromiso=true (bandeja de Pedidos)", () => {
    const bandeja = (query: string, tok = token) =>
      request(app).get(`/api/comercial/documentos${query}`).set("Authorization", `Bearer ${tok}`);

    it("enriquece los pedidos de la página con su estado en Siesa en UNA consulta; sin vínculo queda SIN_VINCULO_ERP", async () => {
      const cliente = 888_001;
      const comprometido = nuevoDoc({ comprometida: 4 });
      const sinComprometer = nuevoDoc({ comprometida: 0 });
      await crearPedido(tenantId, comprometido.rowId, { clienteNombre: `Bandeja ${cliente}` });
      await crearPedido(tenantId, sinComprometer.rowId, { clienteNombre: `Bandeja ${cliente}` });
      await crearPedido(tenantId, null, { clienteNombre: `Bandeja ${cliente}` });
      llamadas.length = 0;

      const res = await bandeja(`?tipo=pedido&incluirCompromiso=true&search=Bandeja%20${cliente}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(3);
      expect(res.body.compromisoDisponible).toBe(true);
      expect(llamadas).toHaveLength(1); // un solo lote
      const etiquetas = res.body.items
        .map((i: { compromiso: { compromiso: string; siesa: { estadoUnoee: string } | null } }) =>
          i.compromiso.compromiso === "SIN_VINCULO_ERP"
            ? "SIN_VINCULO"
            : i.compromiso.siesa?.estadoUnoee,
        )
        .sort();
      expect(etiquetas).toEqual(["Comprometido", "No comprometido", "SIN_VINCULO"]);
    });

    it("sin incluirCompromiso no consulta Siesa; con Siesa caído la bandeja responde 200 y compromisoDisponible=false", async () => {
      await crearPedido(tenantId, nuevoDoc({ comprometida: 1 }).rowId, {
        clienteNombre: "Bandeja caída",
      });
      llamadas.length = 0;
      const sin = await bandeja("?tipo=pedido&search=Bandeja%20ca%C3%ADda");
      expect(sin.status).toBe(200);
      expect(llamadas).toHaveLength(0);

      getSiesaPoolMock.mockRejectedValueOnce(new Error("simulated ECONNREFUSED"));
      const caido = await bandeja(
        "?tipo=pedido&incluirCompromiso=true&search=Bandeja%20ca%C3%ADda",
      );
      expect(caido.status).toBe(200);
      expect(caido.body.compromisoDisponible).toBe(false);
    });
  });
});
