import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { crearNotificacion } from "../../lib/notificaciones";

/**
 * Regresión permanente de H-01 (fuga de notificaciones entre tenants).
 *
 * Escenario real: un usuario U con Membresia en Tenant A (su tenant hogar) Y
 * Tenant B. Antes de esta corrección, listarNotificaciones/contarNoLeidas/
 * marcarTodasLeidas filtraban solo por usuarioId — una notificación creada
 * en Tenant B era visible, contable y marcable mientras U operaba con el JWT
 * de Tenant A (y viceversa). Este archivo reproduce exactamente ese
 * escenario usando el flujo real de cambio de empresa (POST
 * /api/auth/switch-tenant), no un JWT fabricado a mano.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Notificaciones — aislamiento multi-tenant real (H-01)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tenantCId: string; // tenant al que U NO tiene acceso
  let usuarioUId: string;
  let usuarioSoloAId: string;

  // Usuario U tiene acceso a más de un tenant (A hogar + membresía en B), así
  // que /api/auth/login responde con requiresTenantSelection=true en vez de
  // un token directo — hay que completar el paso 2 real del login
  // (POST /api/auth/select-tenant) eligiendo el tenant hogar (A), igual que
  // haría el frontend.
  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    if (res.body.token) {
      return res.body.token as string;
    }
    if (res.body.requiresTenantSelection) {
      const seleccion = await request(app)
        .post("/api/auth/select-tenant")
        .send({ selectionToken: res.body.selectionToken, tenantId: tenantAId });
      if (seleccion.status !== 200 || !seleccion.body.token) {
        throw new Error(
          `select-tenant falló para ${email}: ${seleccion.status} ${JSON.stringify(seleccion.body)}`,
        );
      }
      return seleccion.body.token as string;
    }
    throw new Error(
      `Login de prueba sin token ni selección para ${email}: ${JSON.stringify(res.body)}`,
    );
  };

  const switchTenant = async (token: string, tenantId: string) => {
    return request(app)
      .post("/api/auth/switch-tenant")
      .set("Authorization", `Bearer ${token}`)
      .send({ tenantId });
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Notif Tenant A ${sufijo}`, subdomain: `test-notif-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Notif Tenant B ${sufijo}`, subdomain: `test-notif-b-${sufijo}` },
    });
    const tenantC = await prisma.tenant.create({
      data: { nombre: `Notif Tenant C ${sufijo}`, subdomain: `test-notif-c-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    tenantCId = tenantC.id;

    // Usuario U: tenant hogar = A, además Membresia activa en B.
    // No tiene ninguna membresía en C (se usa para probar "tenant al que no
    // tiene acceso").
    const usuarioU = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `notif-u-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario Multi-Tenant",
        activo: true,
      },
    });
    usuarioUId = usuarioU.id;
    await prisma.membresia.create({
      data: { userId: usuarioUId, tenantId: tenantBId, activo: true },
    });

    // Usuario de control: solo tiene acceso a A, para probar que
    // marcarTodasLeidas de otro usuario nunca toca las notificaciones de U.
    const usuarioSoloA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `notif-solo-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Solo Tenant A",
        activo: true,
      },
    });
    usuarioSoloAId = usuarioSoloA.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId, tenantCId];
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membresia.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("escenario completo: notificación de Tenant B invisible/no contable/no modificable desde Tenant A, y visible al cambiar a B", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);

    const notifB = await prisma.notificacion.create({
      data: {
        tenantId: tenantBId,
        usuarioId: usuarioUId,
        tipo: "TEST",
        titulo: "Evento en Tenant B",
        mensaje: "No debe verse desde Tenant A",
      },
    });

    // --- Operando en Tenant A (JWT activo = A) ---
    const listaA = await request(app)
      .get("/api/notificaciones")
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(listaA.status).toBe(200);
    expect(listaA.body.data.some((n: { id: string }) => n.id === notifB.id)).toBe(false);
    expect(listaA.body.noLeidas).toBe(0);

    const contadorA = await request(app)
      .get("/api/notificaciones/no-leidas/contador")
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(contadorA.status).toBe(200);
    expect(contadorA.body.noLeidas).toBe(0);

    const marcarTodasA = await request(app)
      .patch("/api/notificaciones/leer-todas")
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(marcarTodasA.status).toBe(204);

    // La notificación de B sigue sin leer: la operación en A no debió tocarla.
    const notifBTrasIntentoA = await prisma.notificacion.findUnique({
      where: { id: notifB.id },
    });
    expect(notifBTrasIntentoA?.leida).toBe(false);

    // marcarLeida individual (IDOR): con JWT de A, el id de la notificación
    // de B "existe" (mismo usuarioId) pero no pertenece al tenant activo.
    const marcarIndividualA = await request(app)
      .patch(`/api/notificaciones/${notifB.id}/leida`)
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(marcarIndividualA.status).toBe(404);
    const notifBTrasIndividualA = await prisma.notificacion.findUnique({
      where: { id: notifB.id },
    });
    expect(notifBTrasIndividualA?.leida).toBe(false);

    // --- Cambia a Tenant B (flujo real: POST /api/auth/switch-tenant) ---
    const cambio = await switchTenant(tokenHomeA, tenantBId);
    expect(cambio.status).toBe(200);
    const tokenB = cambio.body.token as string;

    const listaB = await request(app)
      .get("/api/notificaciones")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.status).toBe(200);
    expect(listaB.body.data.some((n: { id: string }) => n.id === notifB.id)).toBe(true);
    expect(listaB.body.noLeidas).toBe(1);

    const contadorB = await request(app)
      .get("/api/notificaciones/no-leidas/contador")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(contadorB.body.noLeidas).toBe(1);

    const marcarIndividualB = await request(app)
      .patch(`/api/notificaciones/${notifB.id}/leida`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(marcarIndividualB.status).toBe(204);
    const notifBLeida = await prisma.notificacion.findUnique({ where: { id: notifB.id } });
    expect(notifBLeida?.leida).toBe(true);
  });

  it("inverso: notificación de Tenant A invisible/no contable/no modificable desde Tenant B, y marcarTodasLeidas en B no toca A", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);
    const cambio = await switchTenant(tokenHomeA, tenantBId);
    const tokenB = cambio.body.token as string;

    const notifA1 = await prisma.notificacion.create({
      data: {
        tenantId: tenantAId,
        usuarioId: usuarioUId,
        tipo: "TEST",
        titulo: "Evento en Tenant A #1",
        mensaje: "No debe verse desde Tenant B",
      },
    });
    const notifA2 = await prisma.notificacion.create({
      data: {
        tenantId: tenantAId,
        usuarioId: usuarioUId,
        tipo: "TEST",
        titulo: "Evento en Tenant A #2",
        mensaje: "No debe verse desde Tenant B",
      },
    });

    const listaB = await request(app)
      .get("/api/notificaciones")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.body.data.some((n: { id: string }) => n.id === notifA1.id)).toBe(false);
    expect(listaB.body.data.some((n: { id: string }) => n.id === notifA2.id)).toBe(false);

    const marcarTodasB = await request(app)
      .patch("/api/notificaciones/leer-todas")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(marcarTodasB.status).toBe(204);

    const a1TrasB = await prisma.notificacion.findUnique({ where: { id: notifA1.id } });
    const a2TrasB = await prisma.notificacion.findUnique({ where: { id: notifA2.id } });
    expect(a1TrasB?.leida).toBe(false);
    expect(a2TrasB?.leida).toBe(false);

    // De vuelta en A, sí las ve y sí las puede marcar (control positivo).
    const tokenA2 = await login(`notif-u-${sufijo}@test.ricosoft.local`);
    const listaA = await request(app)
      .get("/api/notificaciones")
      .set("Authorization", `Bearer ${tokenA2}`);
    expect(listaA.body.data.some((n: { id: string }) => n.id === notifA1.id)).toBe(true);
    expect(listaA.body.data.some((n: { id: string }) => n.id === notifA2.id)).toBe(true);
    expect(listaA.body.noLeidas).toBeGreaterThanOrEqual(2);

    const marcarTodasA = await request(app)
      .patch("/api/notificaciones/leer-todas")
      .set("Authorization", `Bearer ${tokenA2}`);
    expect(marcarTodasA.status).toBe(204);
    const a1TrasA = await prisma.notificacion.findUnique({ where: { id: notifA1.id } });
    const a2TrasA = await prisma.notificacion.findUnique({ where: { id: notifA2.id } });
    expect(a1TrasA?.leida).toBe(true);
    expect(a2TrasA?.leida).toBe(true);
  });

  it("un usuario sin membresía al tenant no puede cambiarse a él", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);
    const cambio = await switchTenant(tokenHomeA, tenantCId);
    expect(cambio.status).toBe(403);
  });

  it("switch-tenant a un tenant inexistente falla de forma segura", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);
    const cambio = await switchTenant(tokenHomeA, randomUUID());
    expect(cambio.status).toBe(403);
  });

  it("marcarTodasLeidas nunca toca notificaciones de OTRO usuario del mismo tenant", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);

    const notifOtro = await prisma.notificacion.create({
      data: {
        tenantId: tenantAId,
        usuarioId: usuarioSoloAId,
        tipo: "TEST",
        titulo: "Notificación de otro usuario",
        mensaje: "No debe ser tocada por U",
      },
    });

    const marcarTodas = await request(app)
      .patch("/api/notificaciones/leer-todas")
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(marcarTodas.status).toBe(204);

    const sigueNoLeida = await prisma.notificacion.findUnique({ where: { id: notifOtro.id } });
    expect(sigueNoLeida?.leida).toBe(false);
  });

  it("varias notificaciones: orden por más reciente primero, leídas y no leídas, respeta el límite", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);

    // Limpia notificaciones previas de A/U de este usuario para un conteo
    // determinista en este test puntual.
    await prisma.notificacion.deleteMany({ where: { tenantId: tenantAId, usuarioId: usuarioUId } });

    const creadas: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const n = await prisma.notificacion.create({
        data: {
          tenantId: tenantAId,
          usuarioId: usuarioUId,
          tipo: "TEST",
          titulo: `Orden ${i}`,
          mensaje: "x",
          leida: i % 2 === 0, // alterna leída/no leída
        },
      });
      creadas.push(n.id);
      // Pequeña pausa para que createdAt difiera de forma determinista en
      // SQL Server (datetime2 de alta resolución ya lo garantiza, pero se
      // fuerza el orden de inserción de todos modos).
      await new Promise((r) => setTimeout(r, 5));
    }

    const listado = await request(app)
      .get("/api/notificaciones?limite=3")
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(listado.status).toBe(200);
    expect(listado.body.data).toHaveLength(3);
    // Las 3 más recientes son las últimas 3 creadas, en orden descendente.
    expect(listado.body.data.map((n: { id: string }) => n.id)).toEqual([
      creadas[4],
      creadas[3],
      creadas[2],
    ]);
    // 5 creadas, alternando leida=(i%2===0): índices 0,2,4 leídas (3),
    // índices 1,3 no leídas (2).
    expect(listado.body.noLeidas).toBe(2);
  });

  it("notificaciones generadas por un proceso automático (crearNotificacion) respetan el mismo aislamiento por tenant", async () => {
    const tokenHomeA = await login(`notif-u-${sufijo}@test.ricosoft.local`);
    const cambio = await switchTenant(tokenHomeA, tenantBId);
    const tokenB = cambio.body.token as string;

    // Simula un job/servicio automático (igual que servicios-renovacion.service.ts
    // o facturas.controller.ts) que crea una notificación para el tenant B.
    await crearNotificacion({
      tenantId: tenantBId,
      usuarioId: usuarioUId,
      tipo: "AUTOMATICO",
      titulo: "Generado por job automático",
      mensaje: "Debe quedar aislado igual que una notificación manual",
    });

    const listaA = await request(app)
      .get("/api/notificaciones")
      .set("Authorization", `Bearer ${tokenHomeA}`);
    expect(
      listaA.body.data.some((n: { titulo: string }) => n.titulo === "Generado por job automático"),
    ).toBe(false);

    const listaB = await request(app)
      .get("/api/notificaciones")
      .set("Authorization", `Bearer ${tokenB}`);
    expect(
      listaB.body.data.some((n: { titulo: string }) => n.titulo === "Generado por job automático"),
    ).toBe(true);
  });
});
