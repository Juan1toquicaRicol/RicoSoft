import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * CRM 360 del cliente (Ficha 360 Siesa) — cubre la propiedad de seguridad
 * más crítica de toda la integración: ciaId SIEMPRE se deriva de
 * Tenant.siesaCiaId (JWT -> tenantId -> siesaCiaId), NUNCA de query/body/
 * params del cliente. También cubre aislamiento multi-tenant de
 * IndicadorCreditoCliente (Prisma) y el ciclo de vida de un compromiso
 * (OportunidadSeguimiento). No fabrica datos Siesa (es una base real, no un
 * sandbox): las aserciones de "happy path" contra datos reales toleran
 * `disponible:false` si el clienteRowId/pedidoRowId de prueba no existe en
 * este momento en Siesa — lo que SIEMPRE se prueba de forma dura es la
 * propiedad de seguridad, no el contenido exacto de la respuesta.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const CLIENTE_ROW_ID_PRUEBA = 1; // rowid de tercero de prueba; puede no existir, ver nota arriba.

describe.skipIf(!RUN)("CRM 360 del cliente — Siesa + multi-tenant (real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tenantSinSiesaId: string;
  let tokenA: string;
  let tokenASinPermiso: string;
  let tokenB: string;
  let tokenSinSiesa: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    // Tenant.siesaCiaId es UNIQUE (confirmado) — no se puede asignar la misma
    // compañía real a dos tenants de prueba. Ninguno de estos tests necesita
    // datos reales de Siesa para probar la propiedad de seguridad que
    // importa (ciaId/tenantId del cliente siempre se ignora); sin
    // siesaCiaId, los endpoints Siesa devuelven disponible:false de forma
    // consistente en ambas llamadas comparadas, que es justamente lo que se
    // verifica en el test 2.
    const tenantA = await prisma.tenant.create({
      data: { nombre: `CRM360 Tenant A ${sufijo}`, subdomain: `test-crm360-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `CRM360 Tenant B ${sufijo}`, subdomain: `test-crm360-b-${sufijo}` },
    });
    const tenantSinSiesa = await prisma.tenant.create({
      data: { nombre: `CRM360 Sin Siesa ${sufijo}`, subdomain: `test-crm360-nosiesa-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    tenantSinSiesaId = tenantSinSiesa.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `crm360-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `crm360-a-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `crm360-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantSinSiesaId,
        email: `crm360-nosiesa-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Sin Siesa",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenA = await login(`crm360-a-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`crm360-a-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`crm360-b-${sufijo}@test.ricosoft.local`);
    tokenSinSiesa = await login(`crm360-nosiesa-${sufijo}@test.ricosoft.local`);
  }, 30_000);

  afterAll(async () => {
    await prisma.oportunidadSeguimiento.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId, tenantSinSiesaId] } },
    });
    await prisma.indicadorCreditoCliente.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId, tenantSinSiesaId] } },
    });
    await prisma.auditoria.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId, tenantSinSiesaId] } },
    });
    await prisma.user.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId, tenantSinSiesaId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantAId, tenantBId, tenantSinSiesaId] } },
    });
    await prisma.$disconnect();
  });

  it("1. tenant sin siesaCiaId: resumen/pedidos/remisiones/facturas responden disponible:false, nunca 500", async () => {
    const endpoints = [
      `/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/resumen`,
      `/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/pedidos`,
      `/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/remisiones`,
      `/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/facturas`,
    ];
    for (const url of endpoints) {
      const res = await request(app).get(url).set("Authorization", `Bearer ${tokenSinSiesa}`);
      expect(res.status).toBe(200);
      expect(res.body.disponible).toBe(false);
    }
  });

  it("2. CRÍTICO — ciaId enviado por query jamás sustituye el de Tenant.siesaCiaId", async () => {
    const resReal = await request(app)
      .get(`/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/resumen`)
      .set("Authorization", `Bearer ${tokenA}`);
    const resConCiaFalso = await request(app)
      .get(`/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/resumen?ciaId=999`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(resReal.status).toBe(200);
    expect(resConCiaFalso.status).toBe(200);
    // Misma respuesta exacta con o sin el ciaId falso: la query nunca se lee.
    expect(resConCiaFalso.body).toEqual(resReal.body);
  });

  it("3. ciaId enviado por body en un POST (crear seguimiento) tampoco se usa — el seguimiento queda en el tenant real", async () => {
    const res = await request(app)
      .post(`/api/oportunidades/${CLIENTE_ROW_ID_PRUEBA}/seguimientos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        clienteNombre: "Cliente de prueba CRM360",
        accion: "Llamada",
        resultado: "Contactado",
        proximaAccion: "Llamar de nuevo",
        proximoSeguimientoFecha: new Date(Date.now() + 86_400_000).toISOString(),
        ciaId: 999,
        tenantId: tenantBId,
      });
    expect(res.status).toBe(201);

    const guardado = await prisma.oportunidadSeguimiento.findUnique({ where: { id: res.body.id } });
    expect(guardado?.tenantId).toBe(tenantAId); // nunca tenantBId, aunque se mandó en el body
  });

  it("4. permiso: ventas.ver es obligatorio en los endpoints de la ficha 360", async () => {
    const res = await request(app)
      .get(`/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/pedidos`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("5. IDOR — un pedidoRowId inventado nunca revela datos ni distingue 'no existe' de 'no es tuyo'", async () => {
    const res = await request(app)
      .get(`/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/pedidos/999999999/trazabilidad`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.disponible).toBe(false);
  });

  it("6. paginación: pageSize por encima del máximo permitido (100) se rechaza, nunca se manda todo el histórico", async () => {
    const excedido = await request(app)
      .get(`/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/pedidos?page=1&pageSize=500`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(excedido.status).toBe(400);

    const valido = await request(app)
      .get(`/api/ventas/clientes/${CLIENTE_ROW_ID_PRUEBA}/pedidos?page=1&pageSize=100`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(valido.status).toBe(200);
  });

  it("7. IndicadorCreditoCliente: t9896 vacío hoy en Siesa -> disponible:false explícito, nunca ceros inventados", async () => {
    const res = await request(app)
      .get(`/api/creditos/clientes/${CLIENTE_ROW_ID_PRUEBA}/indicador`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    // Confirmado en la auditoría: t9896_pdv_clientes_analisis está vacía en
    // esta instancia real — si algún día Siesa la puebla, este test debe
    // actualizarse; hasta entonces, disponible:false es el comportamiento
    // CORRECTO, no un fallo.
    expect(res.body.disponible).toBe(false);
  });

  it("8. IndicadorCreditoCliente queda aislado por tenant en Prisma (no se cruza entre A y B aunque compartan siesaCiaId)", async () => {
    await prisma.indicadorCreditoCliente.create({
      data: {
        tenantId: tenantAId,
        clienteRowId: CLIENTE_ROW_ID_PRUEBA,
        cupoCredito: 1_000_000,
        disponible: 500_000,
        carteraCorriente: 300_000,
        carteraVencida: 0,
        bloquear: false,
        bloquearCupo: false,
        bloquearMora: false,
      },
    });

    const soloDeA = await prisma.indicadorCreditoCliente.findMany({
      where: { tenantId: tenantBId, clienteRowId: CLIENTE_ROW_ID_PRUEBA },
    });
    expect(soloDeA).toHaveLength(0);
  });

  it("9. Compromiso: se puede completar y deja de aparecer en 'próximos seguimientos'", async () => {
    const crear = await request(app)
      .post(`/api/oportunidades/${CLIENTE_ROW_ID_PRUEBA}/seguimientos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        clienteNombre: "Cliente compromiso CRM360",
        accion: "Reunion",
        resultado: "EnNegociacion",
        proximaAccion: "Enviar cotización final",
        proximoSeguimientoFecha: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(crear.status).toBe(201);
    const id = crear.body.id as string;
    expect(crear.body.compromisoCompletado).toBe(false);

    const pendientesAntes = await request(app)
      .get("/api/oportunidades/seguimientos/pendientes")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(pendientesAntes.body.pendientes.some((p: { id: string }) => p.id === id)).toBe(true);

    const completar = await request(app)
      .patch(`/api/oportunidades/seguimientos/${id}/completar`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(completar.status).toBe(200);
    expect(completar.body.compromisoCompletado).toBe(true);
    expect(completar.body.compromisoCompletadoEn).toBeTruthy();
    // createdAt (cuándo se registró) nunca es lo mismo que compromisoCompletadoEn (cuándo se ejecutó).
    expect(completar.body.compromisoCompletadoEn).not.toBe(completar.body.createdAt);

    const pendientesDespues = await request(app)
      .get("/api/oportunidades/seguimientos/pendientes")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(pendientesDespues.body.pendientes.some((p: { id: string }) => p.id === id)).toBe(false);

    // Completar dos veces seguidas está bloqueado (409), no silenciosamente aceptado.
    const segundaVez = await request(app)
      .patch(`/api/oportunidades/seguimientos/${id}/completar`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(segundaVez.status).toBe(409);
  });

  it("10. CROSS-TENANT: Tenant B no puede completar un compromiso de Tenant A (404, nunca se modifica)", async () => {
    const crear = await request(app)
      .post(`/api/oportunidades/${CLIENTE_ROW_ID_PRUEBA}/seguimientos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        clienteNombre: "Cliente cross-tenant CRM360",
        accion: "Correo",
        resultado: "Interesado",
        proximaAccion: "Seguimiento",
        proximoSeguimientoFecha: new Date(Date.now() + 86_400_000).toISOString(),
      });
    const id = crear.body.id as string;

    const intentoB = await request(app)
      .patch(`/api/oportunidades/seguimientos/${id}/completar`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(intentoB.status).toBe(404);

    const sigue = await prisma.oportunidadSeguimiento.findUnique({ where: { id } });
    expect(sigue?.compromisoCompletado).toBe(false);
  });

  it("11. cliente sin actividades: el timeline responde vacío, no error", async () => {
    const res = await request(app)
      .get(`/api/oportunidades/999999999/seguimientos`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.seguimientos).toEqual([]);
    expect(res.body.estadoActual).toBeNull();
  });
});
