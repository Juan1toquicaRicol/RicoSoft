import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Consecutivo MONOTÓNICO de Proforma con BD REAL. Siguiente efectivo =
 * max(ConfiguracionComercial.siguienteConsecutivoProforma (default 3890),
 * MAX(Proforma.numero) + 1). Cada caso usa su propio tenant recién creado
 * para controlar el estado "vacío".
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const item = {
  descripcion: "Producto",
  cantidad: 1,
  precioUnitario: 1000,
  descuentoPct: 0,
  ivaPct: 19,
};
const RETENCIONES = { retencionFuentePct: 2.5, retencionIvaPct: 15, retencionIcaPct: 0.7 };

// Interruptores de fallo (prisma.$use se registra una sola vez y sí alcanza al
// cliente `tx` de $transaction; ver pedidos-asignar-erp.integration.test.ts).
let fallarAuditoria = false;
let fallarContador = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$use(
  async (
    params: { model?: string; action: string },
    next: (params: unknown) => Promise<unknown>,
  ) => {
    if (fallarAuditoria && params.model === "Auditoria" && params.action === "create") {
      throw new Error("boom auditoria");
    }
    if (
      fallarContador &&
      params.model === "ConfiguracionComercial" &&
      params.action === "updateMany"
    ) {
      throw new Error("boom contador");
    }
    return next(params);
  },
);

describe.skipIf(!RUN)("Proformas — consecutivo monotónico (ConfiguracionComercial)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];

  const crearTenantConToken = async (etiqueta: string) => {
    const tenant = await prisma.tenant.create({
      data: {
        nombre: `Consec ${etiqueta} ${sufijo}`,
        subdomain: `test-consec-${etiqueta}-${sufijo}`,
      },
    });
    tenantIds.push(tenant.id);
    const email = `consec-${etiqueta}-${sufijo}@test.ricosoft.local`;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        nombre: `Admin ${etiqueta}`,
        isSuperadmin: true,
        activo: true,
      },
    });
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`Login falló: ${res.status}`);
    return { tenantId: tenant.id, token: res.body.token as string };
  };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const sugerido = async (token: string) =>
    (await request(app).get("/api/proformas/siguiente-numero").set(auth(token))).body
      .numero as number;

  const crear = (token: string, numero?: number) =>
    request(app)
      .post("/api/proformas")
      .set(auth(token))
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente",
        items: [item],
        ...(numero ? { numero } : {}),
      });

  const getConfig = (token: string) =>
    request(app).get("/api/proformas/configuracion-comercial").set(auth(token));

  const putConfig = (token: string, siguienteConsecutivoProforma?: number) =>
    request(app)
      .put("/api/proformas/configuracion-comercial")
      .set(auth(token))
      .send({
        ...RETENCIONES,
        ...(siguienteConsecutivoProforma !== undefined ? { siguienteConsecutivoProforma } : {}),
      });

  const contadorEnBd = async (tenantId: string) =>
    (await prisma.configuracionComercial.findUnique({ where: { tenantId } }))
      ?.siguienteConsecutivoProforma ?? null;

  afterAll(async () => {
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.configuracionComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("cálculo monotónico", () => {
    it("default inicial: tenant vacío -> 3890 (GET siguiente-numero y GET configuración)", async () => {
      const { token } = await crearTenantConToken("vacio");
      expect(await sugerido(token)).toBe(3890);
      const config = await getConfig(token);
      expect(config.status).toBe(200);
      expect(config.body.siguienteConsecutivoProforma).toBe(3890);
    });

    it("manual BAJO el contador (5) -> el contador NO retrocede: siguiente sigue en 3890", async () => {
      const { tenantId, token } = await crearTenantConToken("manual5");
      const creada = await crear(token, 5);
      expect(creada.status).toBe(201);
      expect(creada.body.numero).toBe(5);
      expect(await sugerido(token)).toBe(3890);
      expect(await contadorEnBd(tenantId)).toBe(3890);
    });

    it("manual SUPERIOR al contador -> contador = numero + 1", async () => {
      const { tenantId, token } = await crearTenantConToken("mayor");
      expect((await crear(token, 4000)).status).toBe(201);
      expect(await contadorEnBd(tenantId)).toBe(4001);
      expect(await sugerido(token)).toBe(4001);
    });

    it("manual MENOR al máximo existente -> no reduce el contador (max(contador, MAX+1))", async () => {
      const { tenantId, token } = await crearTenantConToken("menor");
      expect((await crear(token, 4500)).status).toBe(201);
      expect((await crear(token, 4100)).status).toBe(201);
      expect(await contadorEnBd(tenantId)).toBe(4501);
      expect(await sugerido(token)).toBe(4501);
    });

    it("creación AUTOMÁTICA consume el número y deja el contador en numero + 1", async () => {
      const { tenantId, token } = await crearTenantConToken("auto");
      const a = await crear(token);
      expect(a.body.numero).toBe(3890);
      expect(await contadorEnBd(tenantId)).toBe(3891);
      const b = await crear(token);
      expect(b.body.numero).toBe(3891);
      expect(await contadorEnBd(tenantId)).toBe(3892);
    });

    it("GET y creación automática dan el mismo número en cada estado", async () => {
      const { token } = await crearTenantConToken("mismo");
      for (const manual of [undefined, 9, 4000]) {
        if (manual) expect((await crear(token, manual)).status).toBe(201);
        const esperado = await sugerido(token);
        const creada = await crear(token);
        expect(creada.status).toBe(201);
        expect(creada.body.numero).toBe(esperado);
      }
    });

    it("número duplicado en el mismo tenant -> 409 y no altera el contador", async () => {
      const { tenantId, token } = await crearTenantConToken("dup");
      expect((await crear(token, 4200)).status).toBe(201);
      const dup = await crear(token, 4200);
      expect(dup.status).toBe(409);
      expect(dup.body.message).toMatch(/4200/);
      expect(await contadorEnBd(tenantId)).toBe(4201);
    });

    it("creaciones AUTOMÁTICAS concurrentes (sin fila de contador previa) -> 201 con números distintos consecutivos y contador final coherente", async () => {
      const { tenantId, token } = await crearTenantConToken("conc");
      const N = 6;

      const resultados = await Promise.all(Array.from({ length: N }, () => crear(token)));

      expect(resultados.map((r) => r.status)).toEqual(Array(N).fill(201));
      const numeros = resultados.map((r) => r.body.numero as number).sort((x, y) => x - y);
      expect(numeros).toEqual(Array.from({ length: N }, (_, i) => 3890 + i));
      expect(await prisma.proforma.count({ where: { tenantId } })).toBe(N);
      expect(await contadorEnBd(tenantId)).toBe(3890 + N);
      expect(await prisma.configuracionComercial.count({ where: { tenantId } })).toBe(1);
    });
  });

  describe("PUT /proformas/configuracion-comercial", () => {
    it("valor INFERIOR al siguiente efectivo -> 400 con mensaje claro, sin cambios ni auditoría", async () => {
      const { tenantId, token } = await crearTenantConToken("putbajo");
      expect((await crear(token, 4000)).status).toBe(201); // efectivo = 4001

      const res = await putConfig(token, 3900);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/4001/);
      expect(await contadorEnBd(tenantId)).toBe(4001);
      const eventos = await prisma.auditoria.count({
        where: { tenantId, accion: "CONFIGURACION_COMERCIAL_ACTUALIZADA" },
      });
      expect(eventos).toBe(0);
    });

    it("valor igual o superior al vigente -> 200; el siguiente automático usa ese valor", async () => {
      const { tenantId, token } = await crearTenantConToken("putok");
      expect((await putConfig(token, 3890)).status).toBe(200); // igual al vigente

      const res = await putConfig(token, 5000);
      expect(res.status).toBe(200);
      expect(res.body.siguienteConsecutivoProforma).toBe(5000);
      expect(await contadorEnBd(tenantId)).toBe(5000);
      expect((await getConfig(token)).body.siguienteConsecutivoProforma).toBe(5000);

      const creada = await crear(token);
      expect(creada.body.numero).toBe(5000);
      expect(await contadorEnBd(tenantId)).toBe(5001);
    });

    it("no permite bajar el contador después de haberlo subido (monotónico por PUT)", async () => {
      const { tenantId, token } = await crearTenantConToken("putmono");
      expect((await putConfig(token, 6000)).status).toBe(200);
      expect((await putConfig(token, 5999)).status).toBe(400);
      expect(await contadorEnBd(tenantId)).toBe(6000);
    });

    it("sin siguienteConsecutivoProforma (solo retenciones) deja el contador intacto", async () => {
      const { tenantId, token } = await crearTenantConToken("putsin");
      expect((await crear(token, 4300)).status).toBe(201);

      const res = await putConfig(token);

      expect(res.status).toBe(200);
      expect(res.body.siguienteConsecutivoProforma).toBe(4301);
      expect(await contadorEnBd(tenantId)).toBe(4301);
    });

    it("valores inválidos (0, negativo, decimal) -> 400 por Zod", async () => {
      const { token } = await crearTenantConToken("putzod");
      for (const v of [0, -5, 3890.5]) {
        expect((await putConfig(token, v)).status).toBe(400);
      }
    });

    it("registra auditoría con valores anterior y nuevo", async () => {
      const { tenantId, token } = await crearTenantConToken("putaud");
      expect((await putConfig(token, 4444)).status).toBe(200);

      const evento = await prisma.auditoria.findFirstOrThrow({
        where: { tenantId, accion: "CONFIGURACION_COMERCIAL_ACTUALIZADA" },
      });
      expect(evento.entidadTipo).toBe("ConfiguracionComercial");
      expect(JSON.parse(evento.datosAnteriores!).siguienteConsecutivoProforma).toBe(3890);
      expect(JSON.parse(evento.datosNuevos!).siguienteConsecutivoProforma).toBe(4444);
      expect(evento.detalle).toMatch(/3890.*4444/);
    });

    it("ROLLBACK completo si falla la auditoría: ni contador ni retenciones cambian", async () => {
      const { tenantId, token } = await crearTenantConToken("putroll");
      expect((await putConfig(token, 4000)).status).toBe(200);

      fallarAuditoria = true;
      try {
        const res = await request(app)
          .put("/api/proformas/configuracion-comercial")
          .set(auth(token))
          .send({
            retencionFuentePct: 9,
            retencionIvaPct: 9,
            retencionIcaPct: 9,
            siguienteConsecutivoProforma: 8000,
          });
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/boom/);
      } finally {
        fallarAuditoria = false;
      }

      const enBd = await prisma.configuracionComercial.findUniqueOrThrow({ where: { tenantId } });
      expect(enBd.siguienteConsecutivoProforma).toBe(4000);
      expect(Number(enBd.retencionFuentePct)).toBe(2.5);
    });
  });

  describe("aislamiento multi-tenant y atomicidad de la creación", () => {
    it("secuencias y contadores independientes entre tenants; PUT de A no afecta a B", async () => {
      const a = await crearTenantConToken("aisA");
      const b = await crearTenantConToken("aisB");
      expect((await crear(a.token, 7000)).status).toBe(201);
      expect((await putConfig(a.token, 9000)).status).toBe(200);

      expect(await sugerido(a.token)).toBe(9000);
      expect(await sugerido(b.token)).toBe(3890);
      expect((await getConfig(b.token)).body.siguienteConsecutivoProforma).toBe(3890);
      expect(await contadorEnBd(b.tenantId)).toBeNull(); // B ni siquiera tiene fila
      expect((await crear(b.token, 7000)).status).toBe(201); // mismo número, otro tenant
      expect(await contadorEnBd(b.tenantId)).toBe(7001);
      expect(await contadorEnBd(a.tenantId)).toBe(9000);
    });

    it("si falla el avance del contador, la creación se revierte por completo (sin proforma huérfana)", async () => {
      const { tenantId, token } = await crearTenantConToken("crearroll");

      fallarContador = true;
      try {
        const res = await crear(token);
        expect(res.status).toBe(500);
      } finally {
        fallarContador = false;
      }

      expect(await prisma.proforma.count({ where: { tenantId } })).toBe(0);
      expect((await crear(token)).body.numero).toBe(3890); // el número sigue libre
    });
  });
});
