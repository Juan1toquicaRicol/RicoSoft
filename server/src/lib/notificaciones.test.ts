import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { crearNotificacion, resolverPlantillaNotificacion } from "./notificaciones";

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

describe.skipIf(!RUN)("resolverPlantillaNotificacion — BD real", () => {
  const sufijo = randomUUID().slice(0, 8);
  const tipoEventoConPlantilla = `TEST_TIPO_EVENTO_${sufijo}`;
  const tipoEventoSinPlantilla = `TEST_SIN_PLANTILLA_${sufijo}`;
  let tenantAId: string;
  let tenantBId: string;
  let plantillaGeneralId: string;
  let plantillaTenantAId: string;

  beforeAll(async () => {
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Plantillas Notif A ${sufijo}`, subdomain: `test-plnotif-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Plantillas Notif B ${sufijo}`, subdomain: `test-plnotif-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    plantillaGeneralId = (
      await prisma.plantillaNotificacion.create({
        data: {
          tipoEvento: tipoEventoConPlantilla,
          titulo: "General: {{nombre}}",
          mensaje: "Mensaje general para {{nombre}} ({{codigo}}).",
          tenantId: null,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.plantillaNotificacion.deleteMany({
      where: {
        OR: [
          { id: plantillaGeneralId },
          { id: plantillaTenantAId },
          { tipoEvento: tipoEventoConPlantilla },
          { tipoEvento: tipoEventoSinPlantilla },
        ],
      },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.$disconnect();
  });

  it("con plantilla GENERAL existente, interpola los placeholders", async () => {
    const resultado = await resolverPlantillaNotificacion(
      tenantBId,
      tipoEventoConPlantilla,
      { nombre: "Juan", codigo: "ABC-1" },
      { titulo: "fallback titulo", mensaje: "fallback mensaje" },
    );
    expect(resultado.titulo).toBe("General: Juan");
    expect(resultado.mensaje).toBe("Mensaje general para Juan (ABC-1).");
  });

  it("sin ninguna plantilla para el tipoEvento, usa el fallback exacto", async () => {
    const resultado = await resolverPlantillaNotificacion(
      tenantAId,
      tipoEventoSinPlantilla,
      { nombre: "Juan" },
      { titulo: "Título de respaldo", mensaje: "Mensaje de respaldo para Juan." },
    );
    expect(resultado.titulo).toBe("Título de respaldo");
    expect(resultado.mensaje).toBe("Mensaje de respaldo para Juan.");
  });

  it("prioriza la plantilla específica del tenant sobre la GENERAL cuando ambas existen", async () => {
    plantillaTenantAId = (
      await prisma.plantillaNotificacion.create({
        data: {
          tipoEvento: tipoEventoConPlantilla,
          titulo: "Tenant A: {{nombre}}",
          mensaje: "Mensaje específico de tenant A para {{nombre}}.",
          tenantId: tenantAId,
        },
      })
    ).id;

    const resultadoTenantA = await resolverPlantillaNotificacion(
      tenantAId,
      tipoEventoConPlantilla,
      { nombre: "Ana" },
      { titulo: "fallback", mensaje: "fallback" },
    );
    expect(resultadoTenantA.titulo).toBe("Tenant A: Ana");

    // Otro tenant sin plantilla propia sigue viendo la GENERAL.
    const resultadoTenantB = await resolverPlantillaNotificacion(
      tenantBId,
      tipoEventoConPlantilla,
      { nombre: "Ana", codigo: "X" },
      { titulo: "fallback", mensaje: "fallback" },
    );
    expect(resultadoTenantB.titulo).toBe("General: Ana");
  });

  it("una plantilla inactiva no se usa — cae al fallback", async () => {
    const tipoInactivo = `TEST_INACTIVO_${sufijo}`;
    await prisma.plantillaNotificacion.create({
      data: {
        tipoEvento: tipoInactivo,
        titulo: "No debería usarse",
        mensaje: "No debería usarse",
        tenantId: null,
        activo: false,
      },
    });
    const resultado = await resolverPlantillaNotificacion(
      tenantAId,
      tipoInactivo,
      {},
      { titulo: "Fallback activo", mensaje: "Fallback activo mensaje" },
    );
    expect(resultado.titulo).toBe("Fallback activo");
    await prisma.plantillaNotificacion.deleteMany({ where: { tipoEvento: tipoInactivo } });
  });

  it("un placeholder sin valor provisto se deja intacto en el texto", async () => {
    const resultado = await resolverPlantillaNotificacion(
      tenantBId,
      tipoEventoConPlantilla,
      { nombre: "Solo Nombre" },
      { titulo: "fallback", mensaje: "fallback" },
    );
    expect(resultado.mensaje).toBe("Mensaje general para Solo Nombre ({{codigo}}).");
  });
});
