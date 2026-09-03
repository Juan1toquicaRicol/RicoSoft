import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Hallazgos A-03 (autoaprobación), M-01 (rol desactivado sigue dando
 * permisos) y M-04 (auditoría incompleta), auditoría 2026-09-02. BD real,
 * sin mocks.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Solicitudes — autoaprobación, rol inactivo y auditoría (BD real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let rolAprobadorId: string;
  let usuarioAId: string;
  let tokenA: string; // crea Y tiene permiso de aprobar/rechazar (para probar autoaprobación)
  let tokenB: string; // solo tiene permiso de aprobar/rechazar, no crea la solicitud

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  const crearSolicitudComoA = async () => {
    const res = await request(app)
      .post("/api/solicitudes-compra")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        empresaId: "001",
        area: "Administración",
        solicitanteId: usuarioAId,
        item: `Item autoaprobación ${randomUUID().slice(0, 6)}`,
        cantidad: 1,
        valorEstimado: 100000,
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenant = await prisma.tenant.create({
      data: { nombre: `Solicitudes Hardening ${sufijo}`, subdomain: `test-sol-hard-${sufijo}` },
    });
    tenantId = tenant.id;

    const rolAprobador = await prisma.rol.create({
      data: {
        tenantId,
        nombre: `Aprobador ${sufijo}`,
        permisos: JSON.stringify([
          "solicitudes.ver",
          "solicitudes.crear",
          "solicitudes.aprobar",
          "solicitudes.rechazar",
        ]),
      },
    });
    rolAprobadorId = rolAprobador.id;

    const usuarioA = await prisma.user.create({
      data: {
        tenantId,
        email: `sol-hard-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario A",
        rolId: rolAprobadorId,
        isSuperadmin: false,
        activo: true,
      },
    });
    usuarioAId = usuarioA.id;
    await prisma.user.create({
      data: {
        tenantId,
        email: `sol-hard-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Usuario B",
        rolId: rolAprobadorId,
        isSuperadmin: false,
        activo: true,
      },
    });

    tokenA = await login(`sol-hard-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`sol-hard-b-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.cotizacionProveedor.deleteMany({ where: { solicitudCompra: { tenantId } } });
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.solicitudCompra.deleteMany({ where: { tenantId } });
    await prisma.notificacion.deleteMany({ where: { tenantId } });
    await prisma.inboxItem.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.rol.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("1. A-03 OBLIGATORIO: el solicitante NO puede rechazar su propia solicitud, aunque tenga el permiso (403)", async () => {
    const id = await crearSolicitudComoA();
    const res = await request(app)
      .patch(`/api/solicitudes-compra/${id}/estado`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ estado: "Rechazada", comentario: "Autoaprobación fraudulenta" });
    expect(res.status).toBe(403);

    const enDb = await prisma.solicitudCompra.findUnique({ where: { id } });
    expect(enDb?.estado).toBe("Pendiente");
  });

  it("2. A-03: otro usuario con permiso SÍ puede rechazar una solicitud que no creó él mismo", async () => {
    const id = await crearSolicitudComoA();
    const res = await request(app)
      .patch(`/api/solicitudes-compra/${id}/estado`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ estado: "Rechazada", comentario: "Rechazada por B, legítimo" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("Rechazada");
  });

  it("3. M-04: la auditoría de la resolución conserva entidadTipo/entidadId/datosAnteriores/datosNuevos/comentario reconstruibles", async () => {
    const id = await crearSolicitudComoA();
    await request(app)
      .patch(`/api/solicitudes-compra/${id}/estado`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ estado: "Rechazada", comentario: "Se rechaza por necesidad operativa urgente." });

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId, entidadTipo: "SolicitudCompra", entidadId: id },
      orderBy: { createdAt: "desc" },
    });
    expect(auditoria).not.toBeNull();
    expect(auditoria?.usuarioId).toBeDefined();
    const antes = JSON.parse(auditoria!.datosAnteriores!);
    const despues = JSON.parse(auditoria!.datosNuevos!);
    expect(antes.estado).toBe("Pendiente");
    expect(despues.estado).toBe("Rechazada");
    expect(despues.comentarioResolucion).toContain("necesidad operativa urgente");
  });

  it("4. M-01 OBLIGATORIO: al desactivar el rol del usuario (rolRel.activo=false), pierde el permiso de inmediato aunque el usuario siga activo", async () => {
    // Antes de desactivar: B puede rechazar (ya probado). Se desactiva el
    // ROL (no el usuario) y se prueba en la siguiente request — sin volver
    // a loguearse, porque los permisos se recalculan en cada request desde
    // BD (loadSessionUser), no se cachean en el JWT.
    await prisma.rol.update({ where: { id: rolAprobadorId }, data: { activo: false } });
    try {
      const id = await (async () => {
        // Crear la solicitud falla también porque solicitudes.crear viene
        // del mismo rol ahora inactivo — se crea directo en BD para poder
        // aislar específicamente el efecto sobre la transición de estado.
        const s = await prisma.solicitudCompra.create({
          data: {
            tenantId,
            empresaId: "001",
            area: "Administración",
            solicitanteId: usuarioAId,
            solicitante: "Usuario A",
            item: `Item rol inactivo ${sufijo}`,
            cantidad: 1,
            valorEstimado: 50000,
            estado: "Pendiente",
          },
        });
        return s.id;
      })();

      const intento = await request(app)
        .patch(`/api/solicitudes-compra/${id}/estado`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ estado: "Rechazada" });
      expect(intento.status).toBe(403);

      const listar = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenB}`);
      expect(listar.status).toBe(403);
    } finally {
      await prisma.rol.update({ where: { id: rolAprobadorId }, data: { activo: true } });
    }
  });

  it("5. M-01: tras reactivar el rol, el mismo usuario recupera el permiso sin necesidad de un nuevo login", async () => {
    const id = await crearSolicitudComoA();
    const res = await request(app)
      .patch(`/api/solicitudes-compra/${id}/estado`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ estado: "Rechazada" });
    expect(res.status).toBe(200);
  });
});
