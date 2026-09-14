import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Control de Despachos — multi-tenant real, máquina de estados, novedades y
 * aislamiento. `crearDespacho` en sí depende de un documento de venta REAL
 * de Siesa y de un `siesaCiaId` único por tenant (no se puede usar la
 * misma compañía real que ya tiene el tenant de producción) — por eso esta
 * suite inserta los despachos de prueba directamente vía Prisma (mismo
 * patrón ya usado en plan-produccion/gestion-liquidacion.integration.test.ts)
 * y ejercita las transiciones/novedades/aislamiento contra la API real. El
 * flujo "disponible:false sin siesaCiaId" de crearDespacho sí se prueba
 * end-to-end, porque no depende de datos reales de Siesa.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Despachos — multi-tenant real", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAdminA: string;
  let tokenSinPermisoA: string;
  let tokenAdminB: string;
  let despachoAId: string;
  let despachoBId: string;

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
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Despachos Tenant A ${sufijo}`, subdomain: `test-despachos-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Despachos Tenant B ${sufijo}`, subdomain: `test-despachos-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const adminA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `desp-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `desp-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `desp-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAdminA = await login(`desp-admin-a-${sufijo}@test.ricosoft.local`);
    tokenSinPermisoA = await login(`desp-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenAdminB = await login(`desp-admin-b-${sufijo}@test.ricosoft.local`);

    const despachoA = await prisma.despacho.create({
      data: {
        tenantId: tenantAId,
        siesaDocRowId: 900001,
        siesaDocReferencia: `TEST-A-${sufijo}`,
        clienteNombre: "Cliente de prueba A",
        valorPedido: 1_000_000,
        responsableId: adminA.id,
        responsable: "Admin A",
        lineas: {
          create: [
            {
              itemRowId: 1,
              descripcion: "Producto X",
              cantidadSolicitada: 100,
              unidadMedida: "KG",
            },
          ],
        },
      },
    });
    despachoAId = despachoA.id;

    const despachoB = await prisma.despacho.create({
      data: {
        tenantId: tenantBId,
        siesaDocRowId: 900002,
        siesaDocReferencia: `TEST-B-${sufijo}`,
        clienteNombre: "Cliente de prueba B",
        valorPedido: 500_000,
        responsableId: adminB.id,
        responsable: "Admin B",
        lineas: {
          create: [
            {
              itemRowId: 2,
              descripcion: "Producto Y",
              cantidadSolicitada: 50,
              unidadMedida: "UNID",
            },
          ],
        },
      },
    });
    despachoBId = despachoB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.despachoNovedad.deleteMany({
      where: { despacho: { tenantId: { in: tenantIds } } },
    });
    await prisma.despachoLinea.deleteMany({ where: { despacho: { tenantId: { in: tenantIds } } } });
    await prisma.despacho.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("POST /despachos responde 400 (no 500) cuando el tenant no tiene siesaCiaId configurado", async () => {
    const res = await request(app)
      .post("/api/despachos")
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ siesaDocRowId: 123456 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("siesaCiaId");
  });

  it("un usuario sin permiso despachos.gestionar no puede crear un despacho ni cambiar su estado", async () => {
    const crear = await request(app)
      .post("/api/despachos")
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ siesaDocRowId: 1 });
    expect(crear.status).toBe(403);

    const estado = await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenSinPermisoA}`)
      .send({ estado: "PREPARANDO" });
    expect(estado.status).toBe(403);
  });

  it("respeta la máquina de estados: RECIBIDO -> PREPARANDO es válido; RECIBIDO -> ENTREGADO no", async () => {
    const invalido = await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "ENTREGADO", recibidoPor: "Juan" });
    expect(invalido.status).toBe(400);

    const valido = await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "PREPARANDO" });
    expect(valido.status).toBe(200);
    expect(valido.body.estado).toBe("PREPARANDO");
  });

  it("exige los campos requeridos por la transición (CARGANDO sin vehículo/conductor se rechaza)", async () => {
    // Avanza hasta PENDIENTE_CARGUE primero.
    await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "PREPARADO" });
    await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "PENDIENTE_CARGUE" });

    const sinDatos = await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "CARGANDO" });
    expect(sinDatos.status).toBe(400);

    const conDatos = await request(app)
      .patch(`/api/despachos/${despachoAId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "CARGANDO", vehiculoPlaca: "ABC123", conductorNombre: "Pedro Pérez" });
    expect(conDatos.status).toBe(200);
    expect(conDatos.body.vehiculoPlaca).toBe("ABC123");
    expect(conDatos.body.fechaCargue).toBeTruthy();
  });

  it("registra el historial de transiciones vía Auditoria — visible en el detalle del despacho", async () => {
    const detalle = await request(app)
      .get(`/api/despachos/${despachoAId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.eventos.length).toBeGreaterThanOrEqual(3); // PREPARANDO, PREPARADO, PENDIENTE_CARGUE, CARGANDO
    expect(
      detalle.body.eventos.some((e: { accion: string }) => e.accion === "ESTADO_CARGANDO"),
    ).toBe(true);
  });

  it("registra y resuelve una novedad", async () => {
    const creada = await request(app)
      .post(`/api/despachos/${despachoAId}/novedades`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ tipo: "PRODUCTO_FALTANTE", descripcion: "Faltan 5kg del producto X" });
    expect(creada.status).toBe(201);
    expect(creada.body.estado).toBe("ABIERTA");

    const resuelta = await request(app)
      .patch(`/api/despachos/${despachoAId}/novedades/${creada.body.id}/resolver`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ observacionResolucion: "Se completó con otro lote." });
    expect(resuelta.status).toBe(200);
    expect(resuelta.body.estado).toBe("RESUELTA");

    // No se puede resolver dos veces.
    const denuevo = await request(app)
      .patch(`/api/despachos/${despachoAId}/novedades/${creada.body.id}/resolver`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({});
    expect(denuevo.status).toBe(400);
  });

  it("Tenant A NUNCA puede ver ni modificar el despacho de Tenant B (aislamiento verificado también contra Prisma base)", async () => {
    const detalle = await request(app)
      .get(`/api/despachos/${despachoBId}`)
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(detalle.status).toBe(404);

    const cambioEstado = await request(app)
      .patch(`/api/despachos/${despachoBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ estado: "PREPARANDO" });
    expect(cambioEstado.status).toBe(404);

    const novedad = await request(app)
      .post(`/api/despachos/${despachoBId}/novedades`)
      .set("Authorization", `Bearer ${tokenAdminA}`)
      .send({ tipo: "OTRA", descripcion: "intento cross-tenant" });
    expect(novedad.status).toBe(404);

    const listado = await request(app)
      .get("/api/despachos")
      .set("Authorization", `Bearer ${tokenAdminA}`);
    expect(listado.status).toBe(200);
    expect(listado.body.items.some((d: { id: string }) => d.id === despachoBId)).toBe(false);

    // Confirmación independiente contra el cliente Prisma base — el despacho de B sigue intacto.
    const enDb = await prisma.despacho.findUnique({ where: { id: despachoBId } });
    expect(enDb?.estado).toBe("RECIBIDO");
    expect(enDb?.tenantId).toBe(tenantBId);
  });

  it("Tenant B sigue viendo y operando correctamente sobre su propio despacho", async () => {
    const res = await request(app)
      .patch(`/api/despachos/${despachoBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ estado: "PREPARANDO" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("PREPARANDO");
  });

  it("no permite marcar ENTREGADO sin confirmar la cantidad entregada de todas las líneas (hallazgo QA)", async () => {
    const avanzar = async (estado: string, extra: Record<string, string> = {}) => {
      const res = await request(app)
        .patch(`/api/despachos/${despachoBId}/estado`)
        .set("Authorization", `Bearer ${tokenAdminB}`)
        .send({ estado, ...extra });
      expect(res.status).toBe(200);
      return res;
    };

    await avanzar("PREPARADO");
    await avanzar("PENDIENTE_CARGUE");
    await avanzar("CARGANDO", { vehiculoPlaca: "XYZ789", conductorNombre: "María Gómez" });
    await avanzar("CARGADO");
    await avanzar("DESPACHADO");
    await avanzar("EN_TRANSITO");

    const sinCantidad = await request(app)
      .patch(`/api/despachos/${despachoBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ estado: "ENTREGADO", recibidoPor: "Recepcionista" });
    expect(sinCantidad.status).toBe(409);
    expect(sinCantidad.body.message).toMatch(/cantidad entregada/i);

    const detalle = await request(app)
      .get(`/api/despachos/${despachoBId}`)
      .set("Authorization", `Bearer ${tokenAdminB}`);
    const lineaId = detalle.body.lineas[0].id as string;

    const confirmarCantidad = await request(app)
      .patch(`/api/despachos/${despachoBId}/lineas/${lineaId}`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ cantidadEntregada: 50 });
    expect(confirmarCantidad.status).toBe(200);

    const conCantidad = await request(app)
      .patch(`/api/despachos/${despachoBId}/estado`)
      .set("Authorization", `Bearer ${tokenAdminB}`)
      .send({ estado: "ENTREGADO", recibidoPor: "Recepcionista" });
    expect(conCantidad.status).toBe(200);
    expect(conCantidad.body.estado).toBe("ENTREGADO");
  });
});
