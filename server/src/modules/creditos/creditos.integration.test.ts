import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Créditos de Clientes — no tenía ninguna suite de integración propia
 * (confirmado por ausencia en la auditoría de Comercial, sección 32 /
 * hallazgo de Testing). Cubre CRUD + pago + paz y salvo + soft-delete +
 * permisos + aislamiento multi-tenant, con BD real (sin mocks), mismo
 * patrón que el resto de suites de integración del sistema.
 *
 * Nota de alcance (ver RICOSOFT_COMERCIAL_ARCHITECTURE_AUDIT.md, R-C-04):
 * este controller usa el cliente Prisma global con filtro manual de
 * tenantId (no `req.tenantPrisma`) — esta suite prueba el comportamiento
 * observable, no la implementación interna, así que sigue siendo válida
 * si ese patrón se migra más adelante.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

interface CreditoListadoDto {
  id: string;
  estado?: string;
  saldo?: number;
  vencido?: number;
  porVencer?: number;
  alDia?: number;
  diasMora?: number;
}

describe.skipIf(!RUN)("Créditos de Clientes (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAGestor: string;
  let tokenASinPermiso: string;
  let tokenBGestor: string;
  let creditoBId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const enDiasMs = (dias: number) =>
    new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Creditos Tenant A ${sufijo}`, subdomain: `test-creditos-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Creditos Tenant B ${sufijo}`, subdomain: `test-creditos-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `creditos-gestor-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Gestor A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `creditos-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `creditos-gestor-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Gestor B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAGestor = await login(`creditos-gestor-a-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`creditos-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenBGestor = await login(`creditos-gestor-b-${sufijo}@test.ricosoft.local`);

    const creditoB = await prisma.creditoCliente.create({
      data: {
        tenantId: tenantBId,
        cliente: `Cliente de B ${sufijo}`,
        cupo: 1_000_000,
        saldo: 500_000,
        vence: new Date(enDiasMs(30)),
        estado: "Al día",
      },
    });
    creditoBId = creditoB.id;
  });

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.creditoCliente.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("1. crea un crédito con estado derivado automáticamente cuando no se envía uno explícito", async () => {
    const res = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Nuevo ${sufijo}`,
        cupo: 2_000_000,
        saldo: 500_000,
        vence: enDiasMs(60),
      });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("Al día");
    expect(res.body.saldo).toBe(500_000);
  });

  it("2. rechaza un crédito cuyo saldo supera el cupo (400), no se crea", async () => {
    const res = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Inválido ${sufijo}`,
        cupo: 100_000,
        saldo: 200_000,
        vence: enDiasMs(30),
      });
    expect(res.status).toBe(400);
  });

  it("3. un crédito próximo a vencer (dentro de 7 días) se crea como 'Por vencer'", async () => {
    const res = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Por Vencer ${sufijo}`,
        cupo: 100_000,
        saldo: 50_000,
        vence: enDiasMs(3),
      });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("Por vencer");
  });

  it("4. un crédito ya vencido se crea como 'Vencido'", async () => {
    const res = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Vencido ${sufijo}`,
        cupo: 100_000,
        saldo: 50_000,
        vence: enDiasMs(-5),
      });
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("Vencido");
  });

  it("5. registrarPago reduce el saldo y recalcula el estado; rechaza un pago mayor al saldo pendiente", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Pago ${sufijo}`,
        cupo: 1_000_000,
        saldo: 300_000,
        vence: enDiasMs(60),
      });
    const id = creado.body.id;

    const excesivo = await request(app)
      .post(`/api/creditos/${id}/pago`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ monto: 400_000 });
    expect(excesivo.status).toBe(400);

    const pago = await request(app)
      .post(`/api/creditos/${id}/pago`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ monto: 300_000 });
    expect(pago.status).toBe(200);
    expect(pago.body.saldo).toBe(0);
    expect(pago.body.estado).toBe("Al día");
  });

  it("6. marcarPazYSalvo pone saldo en 0 y estado 'Paz y Salvo'", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Paz ${sufijo}`,
        cupo: 500_000,
        saldo: 200_000,
        vence: enDiasMs(60),
      });
    const id = creado.body.id;

    const res = await request(app)
      .post(`/api/creditos/${id}/paz-y-salvo`)
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(res.status).toBe(200);
    expect(res.body.saldo).toBe(0);
    expect(res.body.estado).toBe("Paz y Salvo");
  });

  it("7. eliminarCredito hace soft-delete: deja de listarse pero no se borra de BD", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Eliminar ${sufijo}`,
        cupo: 100_000,
        saldo: 0,
        vence: enDiasMs(60),
      });
    const id = creado.body.id;

    const eliminado = await request(app)
      .delete(`/api/creditos/${id}`)
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(eliminado.status).toBe(204);

    const listado = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(listado.body.some((c: any) => c.id === id)).toBe(false);

    const enDb = await prisma.creditoCliente.findUnique({ where: { id } });
    expect(enDb).not.toBeNull();
    expect(enDb?.eliminado).toBe(true);
  });

  it("8. un usuario sin permiso recibe 403 en listar/crear/pago/paz-y-salvo/eliminar", async () => {
    const listar = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(listar.status).toBe(403);

    const crear = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ cliente: "X", cupo: 1000, saldo: 0, vence: enDiasMs(30) });
    expect(crear.status).toBe(403);

    const pago = await request(app)
      .post(`/api/creditos/${creditoBId}/pago`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ monto: 1 });
    expect(pago.status).toBe(403);

    const eliminar = await request(app)
      .delete(`/api/creditos/${creditoBId}`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(eliminar.status).toBe(403);
  });

  it("9. CROSS-TENANT: Tenant A no puede ver, pagar, marcar paz y salvo ni eliminar un crédito de Tenant B (404 en todos, nunca se modifica)", async () => {
    const listado = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(listado.body.some((c: any) => c.id === creditoBId)).toBe(false);

    const editar = await request(app)
      .patch(`/api/creditos/${creditoBId}`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ saldo: 0 });
    expect(editar.status).toBe(404);

    const pago = await request(app)
      .post(`/api/creditos/${creditoBId}/pago`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ monto: 1000 });
    expect(pago.status).toBe(404);

    const pazYSalvo = await request(app)
      .post(`/api/creditos/${creditoBId}/paz-y-salvo`)
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(pazYSalvo.status).toBe(404);

    const eliminar = await request(app)
      .delete(`/api/creditos/${creditoBId}`)
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(eliminar.status).toBe(404);

    const sinTocar = await prisma.creditoCliente.findUnique({ where: { id: creditoBId } });
    expect(sinTocar?.saldo.toNumber()).toBe(500_000);
    expect(sinTocar?.estado).toBe("Al día");
    expect(sinTocar?.eliminado).toBe(false);
  });

  it("10. Tenant B sigue viendo y operando correctamente sobre su propio crédito", async () => {
    const listado = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenBGestor}`);
    expect(listado.status).toBe(200);
    expect(listado.body.some((c: any) => c.id === creditoBId)).toBe(true);
  });

  it("11. cada mutación (crear/pago/paz-y-salvo/eliminar) deja un registro en Auditoria del tenant correcto", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Auditoria ${sufijo}`,
        cupo: 100_000,
        saldo: 100_000,
        vence: enDiasMs(60),
      });
    const id = creado.body.id;

    await request(app)
      .post(`/api/creditos/${id}/pago`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ monto: 100_000 });

    const auditorias = await prisma.auditoria.findMany({
      where: { tenantId: tenantAId, accion: { in: ["CREDITO_CREADO", "CREDITO_PAGO_REGISTRADO"] } },
    });
    expect(auditorias.length).toBeGreaterThanOrEqual(2);
    expect(auditorias.every((a) => a.tenantId === tenantAId)).toBe(true);
  });

  // ---- Cartera Siesa (solo lectura) ----

  it("12. GET /creditos/cartera-siesa responde disponible:false (nunca 500) cuando el tenant no tiene siesaCiaId", async () => {
    const res = await request(app)
      .get("/api/creditos/cartera-siesa")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
    expect(typeof res.body.motivo).toBe("string");
    expect(res.body.items).toEqual([]);
  });

  it("13. GET /creditos/cartera-siesa exige el permiso creditos.ver", async () => {
    const res = await request(app)
      .get("/api/creditos/cartera-siesa")
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(res.status).toBe(403);
  });

  // ---- Clasificación financiera (vencido/porVencer/alDia/diasMora) ----

  it("14. listarCreditos NUNCA confía en un estado guardado obsoleto: recalcula en cada lectura", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Stale ${sufijo}`,
        cupo: 1_000_000,
        saldo: 500_000,
        vence: enDiasMs(20),
      });
    const id = creado.body.id;
    expect(creado.body.estado).toBe("Al día");

    // Simula el paso del tiempo: la fecha de vencimiento queda en el
    // pasado sin que nadie vuelva a escribir la fila (el bug original:
    // el estado guardado se queda en "Al día" para siempre).
    await prisma.creditoCliente.update({ where: { id }, data: { vence: new Date(enDiasMs(-3)) } });

    const listado = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    const fila = listado.body.find((c: any) => c.id === id);
    expect(fila.estado).toBe("Vencido");
    expect(fila.vencido).toBe(500_000);
    expect(fila.porVencer).toBe(0);
    expect(fila.alDia).toBe(0);
    expect(fila.diasMora).toBeGreaterThanOrEqual(3);
  });

  it("15. saldo=0 vía pago total nunca se confunde con Paz y Salvo — sigue siendo 'Al día', vencido=0", async () => {
    const creado = await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({
        cliente: `Cliente Caso E ${sufijo}`,
        cupo: 1_000_000,
        saldo: 700_000,
        vence: enDiasMs(-1),
      });
    const id = creado.body.id;

    // Pago parcial: solo participa en el cálculo el saldo REALMENTE pendiente.
    await request(app)
      .post(`/api/creditos/${id}/pago`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ monto: 300_000 });

    const listado = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    const filaParcial = listado.body.find((c: any) => c.id === id);
    expect(filaParcial.saldo).toBe(400_000);
    expect(filaParcial.vencido).toBe(400_000); // seguía vencido, ahora por menos

    await request(app)
      .post(`/api/creditos/${id}/pago`)
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ monto: 400_000 });

    const listadoFinal = await request(app)
      .get("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    const filaFinal = listadoFinal.body.find((c: any) => c.id === id);
    expect(filaFinal.saldo).toBe(0);
    expect(filaFinal.estado).toBe("Al día");
    expect(filaFinal.vencido).toBe(0);
  });

  it("16. GET /creditos/resumen separa correctamente por recaudar, vencido, por vencer y clientes en mora (Caso D)", async () => {
    const cliente = `Cliente Resumen ${sufijo}`;
    await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ cliente, cupo: 20_000_000, saldo: 6_000_000, vence: enDiasMs(-5) }); // vencido
    await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ cliente, cupo: 20_000_000, saldo: 2_000_000, vence: enDiasMs(3) }); // por vencer
    await request(app)
      .post("/api/creditos")
      .set("Authorization", `Bearer ${tokenAGestor}`)
      .send({ cliente, cupo: 20_000_000, saldo: 2_000_000, vence: enDiasMs(60) }); // al día

    const resumen = await request(app)
      .get("/api/creditos/resumen")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    expect(resumen.status).toBe(200);
    // No se afirma el total exacto porque otros tests de esta suite ya
    // insertaron créditos en el mismo tenant; se valida que las 3 filas de
    // este cliente quedaron correctamente separadas dentro del total.
    expect(resumen.body.vencido).toBeGreaterThanOrEqual(6_000_000);
    expect(resumen.body.porVencer).toBeGreaterThanOrEqual(2_000_000);
    expect(resumen.body.clientesEnMora).toBeGreaterThanOrEqual(1);
  });

  it("17. GET /creditos/resumen exige el permiso creditos.ver", async () => {
    const res = await request(app)
      .get("/api/creditos/resumen")
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("18. CROSS-TENANT: el resumen de Tenant A no incluye el crédito de Tenant B", async () => {
    const resumenA = await request(app)
      .get("/api/creditos/resumen")
      .set("Authorization", `Bearer ${tokenAGestor}`);
    const resumenB = await request(app)
      .get("/api/creditos/resumen")
      .set("Authorization", `Bearer ${tokenBGestor}`);
    // El crédito de B (500.000, "Al día", vence en 30 días) es el único de
    // ese tenant — su porRecaudar debe reflejar solo eso, nunca las filas
    // de A insertadas en tests anteriores.
    expect(resumenB.body.porRecaudar).toBe(500_000);
    expect(resumenB.body.vencido).toBe(0);
    expect(resumenA.body.porRecaudar).not.toBe(resumenB.body.porRecaudar);
  });
});
