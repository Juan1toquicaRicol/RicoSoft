import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { crearNotificacion } from "./notificaciones";

/**
 * Fase 5.4.1 — hardening de idempotencia de crearNotificacion(). La
 * deduplicación depende del índice único FILTRADO
 * [Notificacion_dedupe_entidad_uq] (migración
 * 20260908160000_notificacion_dedupe_entidad), así que todas las pruebas de
 * este comportamiento requieren DB real — no tiene sentido mockear Prisma
 * para probar una garantía que vive en el motor de base de datos.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("crearNotificacion — deduplicación por entidad/ciclo (DB real)", () => {
  const sufijo = randomUUID().slice(0, 8);
  let tenantAId: string;
  let tenantBId: string;
  let usuario1Id: string;
  let usuario2Id: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("TestPassword123", 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Notif Dedupe Tenant A ${sufijo}`, subdomain: `test-notif-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Notif Dedupe Tenant B ${sufijo}`, subdomain: `test-notif-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    const u1 = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `notif-u1-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario 1",
        activo: true,
      },
    });
    usuario1Id = u1.id;
    const u2 = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `notif-u2-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario 2",
        activo: true,
      },
    });
    usuario2Id = u2.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
  });

  it("1. primera creación con entidad → crea 1", async () => {
    await crearNotificacion({
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
      entidadId: "srv-123:2026-09-15",
    });
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(1);
  });

  it("2. segunda creación idéntica → continúa en 1 (no duplica)", async () => {
    const datos = {
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
      entidadId: "srv-123:2026-09-15",
    };
    await crearNotificacion(datos);
    await crearNotificacion(datos);
    await crearNotificacion(datos);
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(1);
  });

  it("3. dos usuarios diferentes → 1 notificación para cada uno", async () => {
    const base = {
      tenantId: tenantAId,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
      entidadId: "srv-123:2026-09-15",
    };
    await crearNotificacion({ ...base, usuarioId: usuario1Id });
    await crearNotificacion({ ...base, usuarioId: usuario2Id });
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(2);
  });

  it("4. dos servicios (entidadId) diferentes → 1 notificación para cada uno", async () => {
    const base = {
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
    };
    await crearNotificacion({ ...base, entidadId: "srv-123:2026-09-15" });
    await crearNotificacion({ ...base, entidadId: "srv-456:2026-09-15" });
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(2);
  });

  it("5. misma entidad, ciclo (fecha) diferente → permite nueva notificación legítima", async () => {
    const base = {
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
    };
    await crearNotificacion({ ...base, entidadId: "srv-123:2026-09-15" });
    await crearNotificacion({ ...base, entidadId: "srv-123:2026-10-15" });
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(2);
  });

  it("6. tenants diferentes con la misma entidad/usuario no colisionan", async () => {
    // usuario1 pertenece al tenant A; se reutiliza el mismo id de entidad
    // para un usuario ficticio del tenant B, ya que la clave incluye
    // tenantId — dos tenants nunca comparten fila.
    const u3 = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `notif-u3-${sufijo}@test.ricosoft.local`,
        passwordHash: await bcrypt.hash("TestPassword123", 10),
        nombre: "Usuario Tenant B",
        activo: true,
      },
    });
    const base = {
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
      entidadId: "srv-123:2026-09-15",
    };
    await crearNotificacion({ ...base, tenantId: tenantAId });
    await crearNotificacion({ ...base, tenantId: tenantBId, usuarioId: u3.id });
    const notifsA = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    const notifsB = await prisma.notificacion.findMany({ where: { tenantId: tenantBId } });
    expect(notifsA).toHaveLength(1);
    expect(notifsB).toHaveLength(1);
  });

  it("7. notificación sin entidad sigue funcionando exactamente como antes (sin deduplicar)", async () => {
    const datos = {
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "FACTURA_PENDIENTE",
      titulo: "t",
      mensaje: "m",
    };
    await crearNotificacion(datos);
    await crearNotificacion(datos);
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    // Sin entidadTipo/entidadId no hay clave de deduplicación — el
    // comportamiento histórico (cada llamada crea una fila) se preserva.
    expect(notifs).toHaveLength(2);
  });

  it("8. ejecuciones concurrentes para la misma entidad/usuario producen una sola fila", async () => {
    const datos = {
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
      entidadId: "srv-123:2026-09-15",
    };
    // Dos llamadas disparadas al mismo tiempo (sin esperar la primera):
    // el índice único filtrado en la BD arbitra la carrera, no una
    // consulta previa en JS (que sí sería vulnerable a esta condición).
    await Promise.all([crearNotificacion(datos), crearNotificacion(datos)]);
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(1);
  });

  it("9. mezcla de eventos con y sin entidad para el mismo usuario no interfieren entre sí", async () => {
    await crearNotificacion({
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "SERVICIO_RENOVACION_PROXIMA",
      titulo: "t",
      mensaje: "m",
      entidadTipo: "ServicioSuscripcion",
      entidadId: "srv-123:2026-09-15",
    });
    await crearNotificacion({
      tenantId: tenantAId,
      usuarioId: usuario1Id,
      tipo: "FACTURA_PENDIENTE",
      titulo: "t2",
      mensaje: "m2",
    });
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifs).toHaveLength(2);
  });
});
