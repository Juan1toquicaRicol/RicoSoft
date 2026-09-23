import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Consecutivo de Proforma con BD REAL: el piso (3890) solo aplica a un tenant
 * SIN proformas; con proformas el sugerido es MAX(numero)+1. Cada caso usa
 * su propio tenant recién creado para controlar el estado "vacío".
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const item = {
  descripcion: "Producto",
  cantidad: 1,
  precioUnitario: 1000,
  descuentoPct: 0,
  ivaPct: 19,
};

describe.skipIf(!RUN)("Proformas — consecutivo MAX+1 con piso solo en tenant vacío", () => {
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

  const sugerido = async (token: string) =>
    (
      await request(app)
        .get("/api/proformas/siguiente-numero")
        .set("Authorization", `Bearer ${token}`)
    ).body.numero as number;

  const crear = (token: string, numero?: number) =>
    request(app)
      .post("/api/proformas")
      .set("Authorization", `Bearer ${token}`)
      .send({
        clienteRowId: 1,
        clienteNombre: "Cliente",
        items: [item],
        ...(numero ? { numero } : {}),
      });

  afterAll(async () => {
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("tenant vacío -> sugiere el piso 3890", async () => {
    const { token } = await crearTenantConToken("vacio");
    expect(await sugerido(token)).toBe(3890);
  });

  it("tenant vacío + creación manual 5 -> siguiente sugerido 6 (el piso ya no aplica)", async () => {
    const { token } = await crearTenantConToken("manual5");
    expect((await crear(token, 5)).status).toBe(201);
    expect(await sugerido(token)).toBe(6);
  });

  it("creación manual MAYOR al máximo -> siguiente = manual + 1", async () => {
    const { token } = await crearTenantConToken("mayor");
    expect((await crear(token, 10)).status).toBe(201);
    expect((await crear(token, 500)).status).toBe(201);
    expect(await sugerido(token)).toBe(501);
  });

  it("creación manual MENOR al máximo existente -> siguiente = MAX(numero) + 1", async () => {
    const { token } = await crearTenantConToken("menor");
    expect((await crear(token, 500)).status).toBe(201);
    expect((await crear(token, 20)).status).toBe(201);
    expect(await sugerido(token)).toBe(501);
  });

  it("secuencias independientes entre dos tenants", async () => {
    const a = await crearTenantConToken("secA");
    const b = await crearTenantConToken("secB");
    expect((await crear(a.token, 100)).status).toBe(201);

    expect(await sugerido(a.token)).toBe(101);
    expect(await sugerido(b.token)).toBe(3890); // B no ve el máximo de A
    expect((await crear(b.token, 100)).status).toBe(201); // mismo número, otro tenant: permitido
    expect(await sugerido(b.token)).toBe(101);
  });

  it("número duplicado en el mismo tenant -> 409", async () => {
    const { token } = await crearTenantConToken("dup");
    expect((await crear(token, 77)).status).toBe(201);
    const dup = await crear(token, 77);
    expect(dup.status).toBe(409);
    expect(dup.body.message).toMatch(/77/);
  });

  it("creaciones AUTOMÁTICAS concurrentes -> todas 201 con números distintos y consecutivos (nunca 500)", async () => {
    const { tenantId, token } = await crearTenantConToken("conc");
    const N = 6;

    const resultados = await Promise.all(Array.from({ length: N }, () => crear(token)));

    expect(resultados.map((r) => r.status)).toEqual(Array(N).fill(201));
    const numeros = resultados.map((r) => r.body.numero as number).sort((x, y) => x - y);
    expect(new Set(numeros).size).toBe(N);
    expect(numeros).toEqual(Array.from({ length: N }, (_, i) => 3890 + i));
    expect(await prisma.proforma.count({ where: { tenantId } })).toBe(N);
  });

  it("GET y creación automática dan el mismo número en cada estado (vacío, bajo el piso, sobre el piso)", async () => {
    const { token } = await crearTenantConToken("mismo");
    for (const manual of [undefined, 9, 4000]) {
      if (manual) expect((await crear(token, manual)).status).toBe(201);
      const esperado = await sugerido(token);
      const creada = await crear(token);
      expect(creada.status).toBe(201);
      expect(creada.body.numero).toBe(esperado);
    }
  });
});
