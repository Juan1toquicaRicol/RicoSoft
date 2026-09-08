import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import {
  ejecutarCicloRenovacionesServicios,
  EVENTO_SERVICIO_RENOVACION_PROXIMA,
} from "./servicios-renovacion.service";

/**
 * Fase 5.4 — primer caso real conectado al motor de destinatarios (Fase
 * 5.3). Todas las pruebas requieren DB real: la ventana de 7 días, la
 * idempotencia (crearItemDeTrabajo) y la resolución de destinatarios
 * (resolverDestinatarios) solo tienen sentido contra datos persistidos.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const DIA_MS = 24 * 60 * 60 * 1000;
const enDias = (n: number) => new Date(Date.now() + n * DIA_MS);

describe.skipIf(!RUN)("ejecutarCicloRenovacionesServicios (DB real)", () => {
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let deptoAId: string;
  let perfilTesoreriaAId: string;
  let tesoreroAId: string;
  let responsableAId: string;
  let tenantBUsuarioId: string;
  let perfilTesoreriaBId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Renov Tenant A ${sufijo}`, subdomain: `test-renov-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Renov Tenant B ${sufijo}`, subdomain: `test-renov-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    const deptoA = await prisma.departamento.create({
      data: { tenantId: tenantAId, nombre: `Tesorería Depto ${sufijo}` },
    });
    deptoAId = deptoA.id;
    const deptoB = await prisma.departamento.create({
      data: { tenantId: tenantBId, nombre: `Tesorería Depto B ${sufijo}` },
    });

    const perfilTesoreriaA = await prisma.perfilFuncional.create({
      data: { tenantId: tenantAId, departamentoId: deptoAId, nombre: "Tesorería" },
    });
    perfilTesoreriaAId = perfilTesoreriaA.id;
    const perfilTesoreriaB = await prisma.perfilFuncional.create({
      data: { tenantId: tenantBId, departamentoId: deptoB.id, nombre: "Tesorería" },
    });
    perfilTesoreriaBId = perfilTesoreriaB.id;

    const tesoreroA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `renov-tesorero-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Tesorero A",
        activo: true,
      },
    });
    tesoreroAId = tesoreroA.id;
    const responsableA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `renov-responsable-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Responsable A",
        activo: true,
      },
    });
    responsableAId = responsableA.id;
    const usuarioB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `renov-tesorero-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Tesorero B",
        activo: true,
      },
    });
    tenantBUsuarioId = usuarioB.id;

    await prisma.usuarioPerfilFuncional.createMany({
      data: [
        { tenantId: tenantAId, userId: tesoreroAId, perfilId: perfilTesoreriaAId },
        { tenantId: tenantBId, userId: tenantBUsuarioId, perfilId: perfilTesoreriaBId },
      ],
    });

    // Regla SERVICIO_RENOVACION_PROXIMA solo en tenant A → PERFIL Tesorería.
    await prisma.reglaDestinatarios.create({
      data: {
        tenantId: tenantAId,
        evento: EVENTO_SERVICIO_RENOVACION_PROXIMA,
        activa: true,
        destinatarios: { create: [{ tipo: "PERFIL", perfilId: perfilTesoreriaAId }] },
      },
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.servicioSuscripcion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.reglaDestinatario.deleteMany({
      where: { regla: { tenantId: { in: tenantIds } } },
    });
    await prisma.reglaDestinatarios.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.usuarioPerfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.perfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.departamento.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.inboxItem.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.servicioSuscripcion.deleteMany({
      where: { tenantId: { in: [tenantAId, tenantBId] } },
    });
  });

  function crearServicio(
    overrides: Partial<Parameters<typeof prisma.servicioSuscripcion.create>[0]["data"]> = {},
  ) {
    return prisma.servicioSuscripcion.create({
      data: {
        tenantId: tenantAId,
        empresaId: "RC",
        area: "Contabilidad",
        nombreServicio: `Servicio Test ${randomUUID().slice(0, 6)}`,
        proveedor: "Proveedor Demo",
        periodicidad: "Mensual",
        costo: 100000,
        fechaRenovacion: enDias(5),
        estado: "Activo",
        responsableArea: "Contabilidad",
        responsableId: responsableAId,
        ...overrides,
      },
    });
  }

  it("1. notifica un servicio cuya renovación cae dentro de la ventana de 7 días", async () => {
    const servicio = await crearServicio({ fechaRenovacion: enDias(3) });

    await ejecutarCicloRenovacionesServicios();

    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].usuarioId).toBe(tesoreroAId);

    const items = await prisma.inboxItem.findMany({
      where: { tenantId: tenantAId, sourceEntityTipo: "ServicioSuscripcion" },
    });
    expect(items).toHaveLength(1);
    expect(items[0].sourceEntityId).toContain(servicio.id);
  });

  it("2. NO notifica un servicio fuera de la ventana (renovación en 10 días)", async () => {
    await crearServicio({ fechaRenovacion: enDias(10) });
    await ejecutarCicloRenovacionesServicios();
    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifs).toHaveLength(0);
  });

  it("3. NO notifica un servicio ya vencido (renovación ayer)", async () => {
    await crearServicio({ fechaRenovacion: enDias(-1) });
    await ejecutarCicloRenovacionesServicios();
    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifs).toHaveLength(0);
  });

  it("4. incluye el límite exacto de 7 días", async () => {
    const limite = new Date();
    limite.setHours(0, 0, 0, 0);
    limite.setDate(limite.getDate() + 7);
    await crearServicio({ fechaRenovacion: limite });
    await ejecutarCicloRenovacionesServicios();
    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifs).toHaveLength(1);
  });

  it("5. ignora servicios inactivos", async () => {
    await crearServicio({ fechaRenovacion: enDias(2), estado: "Inactivo" });
    await ejecutarCicloRenovacionesServicios();
    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifs).toHaveLength(0);
  });

  it("6. ignora servicios eliminados (soft delete)", async () => {
    await crearServicio({ fechaRenovacion: enDias(2), eliminado: true });
    await ejecutarCicloRenovacionesServicios();
    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifs).toHaveLength(0);
  });

  it("7. tenant sin ReglaDestinatarios activa no genera ninguna notificación ni item (Set vacío no es error)", async () => {
    await prisma.servicioSuscripcion.create({
      data: {
        tenantId: tenantBId,
        empresaId: "RC",
        area: "Contabilidad",
        nombreServicio: "Servicio Tenant B",
        proveedor: "Proveedor Demo",
        periodicidad: "Mensual",
        costo: 50000,
        fechaRenovacion: enDias(2),
        estado: "Activo",
        responsableArea: "Contabilidad",
      },
    });
    await ejecutarCicloRenovacionesServicios();
    const notifs = await prisma.notificacion.findMany({ where: { tenantId: tenantBId } });
    const items = await prisma.inboxItem.findMany({ where: { tenantId: tenantBId } });
    expect(notifs).toHaveLength(0);
    expect(items).toHaveLength(0);
  });

  it("8. aislamiento multi-tenant: la regla del tenant A nunca notifica al usuario del tenant B", async () => {
    await crearServicio({ fechaRenovacion: enDias(2) });
    await prisma.servicioSuscripcion.create({
      data: {
        tenantId: tenantBId,
        empresaId: "RC",
        area: "Contabilidad",
        nombreServicio: "Servicio Tenant B",
        proveedor: "Proveedor Demo",
        periodicidad: "Mensual",
        costo: 50000,
        fechaRenovacion: enDias(2),
        estado: "Activo",
        responsableArea: "Contabilidad",
      },
    });
    await ejecutarCicloRenovacionesServicios();
    const notifsB = await prisma.notificacion.findMany({ where: { tenantId: tenantBId } });
    expect(notifsB).toHaveLength(0);
    const notifsA = await prisma.notificacion.findMany({ where: { tenantId: tenantAId } });
    expect(notifsA.every((n) => n.usuarioId !== tenantBUsuarioId)).toBe(true);
  });

  it("9. idempotencia (Fase 5.4.1): correr el ciclo dos veces seguidas no duplica NI la notificación NI el item de trabajo", async () => {
    await crearServicio({ fechaRenovacion: enDias(2) });
    await ejecutarCicloRenovacionesServicios();
    await ejecutarCicloRenovacionesServicios();

    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    const items = await prisma.inboxItem.findMany({
      where: { tenantId: tenantAId, sourceEntityTipo: "ServicioSuscripcion" },
    });
    // Antes de la Fase 5.4.1, crearNotificacion no deduplicaba: correr el
    // ciclo dos veces producía 2 notificaciones. El índice único filtrado
    // [Notificacion_dedupe_entidad_uq] (tenantId+usuarioId+tipo+entidadTipo+
    // entidadId) ahora lo impide.
    expect(items).toHaveLength(1);
    expect(notifs).toHaveLength(1);
  });

  it("10. reset automático por fecha: al cambiar fechaRenovacion se genera un item de trabajo Y una notificación nuevos (clave distinta)", async () => {
    const servicio = await crearServicio({ fechaRenovacion: enDias(2) });
    await ejecutarCicloRenovacionesServicios();
    const itemsCiclo1 = await prisma.inboxItem.findMany({
      where: { tenantId: tenantAId, sourceEntityTipo: "ServicioSuscripcion" },
    });
    expect(itemsCiclo1).toHaveLength(1);

    await prisma.servicioSuscripcion.update({
      where: { id: servicio.id },
      data: { fechaRenovacion: enDias(6) },
    });
    await ejecutarCicloRenovacionesServicios();

    const itemsCiclo2 = await prisma.inboxItem.findMany({
      where: { tenantId: tenantAId, sourceEntityTipo: "ServicioSuscripcion" },
    });
    expect(itemsCiclo2).toHaveLength(2);
    expect(itemsCiclo2[0].sourceEntityId).not.toBe(itemsCiclo2[1].sourceEntityId);

    const notifsCiclo2 = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    expect(notifsCiclo2).toHaveLength(2);
    expect(notifsCiclo2[0].entidadId).not.toBe(notifsCiclo2[1].entidadId);
  });

  it("11. RESPONSABLE_REGISTRO (si la regla lo incluyera) resolvería al responsableId del servicio", async () => {
    await prisma.reglaDestinatario.create({
      data: {
        reglaId: (
          await prisma.reglaDestinatarios.findFirstOrThrow({
            where: { tenantId: tenantAId, evento: EVENTO_SERVICIO_RENOVACION_PROXIMA },
          })
        ).id,
        tipo: "RESPONSABLE_REGISTRO",
      },
    });

    await crearServicio({ fechaRenovacion: enDias(2) });
    await ejecutarCicloRenovacionesServicios();

    const notifs = await prisma.notificacion.findMany({
      where: { tenantId: tenantAId, tipo: EVENTO_SERVICIO_RENOVACION_PROXIMA },
    });
    const usuarioIds = new Set(notifs.map((n) => n.usuarioId));
    expect(usuarioIds.has(tesoreroAId)).toBe(true);
    expect(usuarioIds.has(responsableAId)).toBe(true);

    // Limpieza del destinatario agregado para no afectar los demás tests.
    await prisma.reglaDestinatario.deleteMany({
      where: { regla: { tenantId: tenantAId }, tipo: "RESPONSABLE_REGISTRO" },
    });
  });
});
