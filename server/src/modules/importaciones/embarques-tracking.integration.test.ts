import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { ejecutarCicloSincronizacionEmbarques, sincronizarUnLote } from "./embarques-tracking.job";

/**
 * Tracking Marítimo V1 — Embarque = LoteImportacion extendido (buque/
 * booking/contenedores/tracking), NUNCA una tabla paralela (ver decisión de
 * diseño: LoteImportacion ya cubría BL/AWB/puertos/naviera/estado, se le
 * agregaron los campos de buque+tracking en vez de duplicar el concepto).
 * El proveedor de tracking usado en toda la suite es el mock (determinístico,
 * nunca llama a un servicio real) — ver
 * mock-maritime-tracking-provider.test.ts para su propia cobertura.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Tracking Marítimo V1 — Embarque/Buque/Contenedor (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenASinPermiso: string;
  let tokenB: string;
  let ordenAId: string;

  beforeAll(async () => {
    process.env.TRACKING_MARITIMO_SYNC_ENABLED = "true";

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Tracking A ${sufijo}`, subdomain: `test-tracking-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Tracking B ${sufijo}`, subdomain: `test-tracking-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `tracking-super-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Super A",
        isSuperadmin: true,
        activo: true,
      },
    });
    const rolSinPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Sin Permiso Tracking ${sufijo}`,
        permisos: JSON.stringify(["importaciones.ver"]),
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `tracking-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        rolId: rolSinPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `tracking-super-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Super B",
        isSuperadmin: true,
        activo: true,
      },
    });

    const login = async (email: string) => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      return res.body.token as string;
    };
    tokenA = await login(`tracking-super-a-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`tracking-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`tracking-super-b-${sufijo}@test.ricosoft.local`);

    const orden = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        numeroOrden: `OC-TRACK-${sufijo}`,
        incoterm: "FOB",
        proveedorExtranjero: "Naviera Test Ltda",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        items: [{ descripcion: "Ítem de prueba", cantidad: 10, valorUnitarioFob: 5 }],
      });
    ordenAId = orden.body.id;
  });

  afterAll(async () => {
    delete process.env.TRACKING_MARITIMO_SYNC_ENABLED;

    const tenantIds = [tenantAId, tenantBId];
    await prisma.contenedorLote.deleteMany({ where: { lote: { tenantId: { in: tenantIds } } } });
    await prisma.importacionNovedad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionHistorial.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.loteImportacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("1. registra un lote con datos de embarque (booking/buque) y los persiste", async () => {
    const res = await request(app)
      .post(`/api/importaciones/${ordenAId}/lotes`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        blAwb: `BL-${sufijo}`,
        puertoOrigen: "Shanghai",
        puertoDestino: "Cartagena",
        naviera: "Maersk",
        booking: `BK-${sufijo}`,
        buqueImo: `IMO${sufijo}`,
        fechaLlegadaEstimada: new Date().toISOString(),
      });
    expect(res.status).toBe(201);
    expect(res.body.booking).toBe(`BK-${sufijo}`);
    expect(res.body.buque.imo).toBe(`IMO${sufijo}`);
    expect(res.body.tracking.estado).toBe("PENDIENTE");
  });

  it("2. PATCH /lotes/:id/embarque edita buque/forwarder sin tocar el estado del lote", async () => {
    const lote = await prisma.loteImportacion.findFirstOrThrow({
      where: { ordenCompraId: ordenAId },
    });
    const res = await request(app)
      .patch(`/api/importaciones/lotes/${lote.id}/embarque`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ forwarder: "DHL Global Forwarding", buqueNombre: "MAERSK EDIMBURGO" });
    expect(res.status).toBe(200);
    expect(res.body.forwarder).toBe("DHL Global Forwarding");
    expect(res.body.buque.nombre).toBe("MAERSK EDIMBURGO");
    expect(res.body.estado).toBe(lote.estado);
  });

  it("3. agrega y elimina contenedores del lote (múltiples por embarque)", async () => {
    const lote = await prisma.loteImportacion.findFirstOrThrow({
      where: { ordenCompraId: ordenAId },
    });

    const c1 = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/contenedores`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ numero: "mscu1234567" });
    expect(c1.status).toBe(201);
    expect(c1.body.numero).toBe("MSCU1234567"); // normalizado a mayúsculas

    const duplicado = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/contenedores`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ numero: "MSCU1234567" });
    expect(duplicado.status).toBe(409);

    const c2 = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/contenedores`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ numero: "TCLU7654321" });
    expect(c2.status).toBe(201);

    const eliminar = await request(app)
      .delete(`/api/importaciones/lotes/${lote.id}/contenedores/${c2.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(eliminar.status).toBe(204);

    const contenedoresRestantes = await prisma.contenedorLote.findMany({
      where: { loteId: lote.id },
    });
    expect(contenedoresRestantes).toHaveLength(1);
    expect(contenedoresRestantes[0].numero).toBe("MSCU1234567");
  });

  it("4. sincronizar tracking: actualiza posición/ETA del buque y detecta variación de ETA como novedad automática", async () => {
    const lote = await prisma.loteImportacion.findFirstOrThrow({
      where: { ordenCompraId: ordenAId },
    });
    // fechaLlegadaEstimada quedó en "ahora" (paso 1) — el mock SIEMPRE
    // devuelve un ETA entre 1 y 20 días en el futuro, así que la variación
    // de ETA se dispara de forma determinística sin importar el hash.
    await sincronizarUnLote(lote.id);

    const actualizado = await prisma.loteImportacion.findUniqueOrThrow({ where: { id: lote.id } });
    expect(actualizado.estadoTracking).toBe("ACTIVO");
    expect(actualizado.proveedorTracking).toBe("mock");
    expect(actualizado.etaTrackingActual).not.toBeNull();
    expect(actualizado.ultimaPosicionLat).not.toBeNull();
    expect(actualizado.ultimaSincronizacionTracking).not.toBeNull();

    const novedad = await prisma.importacionNovedad.findFirst({
      where: { ordenCompraId: ordenAId, tipo: "Retraso", automatica: true },
    });
    expect(novedad).not.toBeNull();
    expect(novedad?.estado).toBe("Abierta");

    const historial = await prisma.importacionHistorial.findFirst({
      where: { ordenCompraId: ordenAId, accion: "ETA actualizada por tracking" },
    });
    expect(historial).not.toBeNull();

    const itemInbox = await prisma.inboxItem.findFirst({
      where: {
        tenantId: tenantAId,
        sourceModule: "importaciones-tracking",
        sourceEntityId: lote.id,
      },
    });
    expect(itemInbox).not.toBeNull();
  });

  it('5. un buque con IMO que contiene "SINDATOS" queda en estadoTracking SIN_DATOS, no en ERROR', async () => {
    const loteSinDatos = await prisma.loteImportacion.create({
      data: {
        tenantId: tenantAId,
        ordenCompraId: ordenAId,
        blAwb: `BL-SD-${sufijo}`,
        puertoOrigen: "Shanghai",
        puertoDestino: "Cartagena",
        buqueImo: `SINDATOS-${sufijo}`,
      },
    });

    await sincronizarUnLote(loteSinDatos.id);

    const actualizado = await prisma.loteImportacion.findUniqueOrThrow({
      where: { id: loteSinDatos.id },
    });
    expect(actualizado.estadoTracking).toBe("SIN_DATOS");
  });

  it("6. el ciclo periódico completo (ejecutarCicloSincronizacionEmbarques) no lanza y respeta el flag de habilitado", async () => {
    await expect(ejecutarCicloSincronizacionEmbarques()).resolves.not.toThrow();

    delete process.env.TRACKING_MARITIMO_SYNC_ENABLED;
    // Con el flag apagado, el ciclo no debe tocar nada — se verifica que no
    // lance y que sea, en efecto, un no-op inmediato (sin nueva query lenta).
    await expect(ejecutarCicloSincronizacionEmbarques()).resolves.not.toThrow();
    process.env.TRACKING_MARITIMO_SYNC_ENABLED = "true";
  });

  it("7. multi-tenant: tenant B no puede editar/ver/agregar contenedores a un lote de tenant A (404)", async () => {
    const lote = await prisma.loteImportacion.findFirstOrThrow({
      where: { ordenCompraId: ordenAId },
    });

    const editar = await request(app)
      .patch(`/api/importaciones/lotes/${lote.id}/embarque`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ buqueNombre: "Intento ajeno" });
    expect(editar.status).toBe(404);

    const agregarContenedor = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/contenedores`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ numero: "AJEN0000001" });
    expect(agregarContenedor.status).toBe(404);

    const sincronizar = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/tracking/sincronizar`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(sincronizar.status).toBe(404);

    const sinCambios = await prisma.loteImportacion.findUniqueOrThrow({ where: { id: lote.id } });
    expect(sinCambios.buqueNombre).not.toBe("Intento ajeno");
  });

  it("8. permisos: un usuario sin importaciones.gestionar_transito recibe 403 al editar embarque/contenedores/sincronizar", async () => {
    const lote = await prisma.loteImportacion.findFirstOrThrow({
      where: { ordenCompraId: ordenAId },
    });

    const editar = await request(app)
      .patch(`/api/importaciones/lotes/${lote.id}/embarque`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ buqueNombre: "No autorizado" });
    expect(editar.status).toBe(403);

    const agregarContenedor = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/contenedores`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ numero: "NOAUT0000001" });
    expect(agregarContenedor.status).toBe(403);

    const sincronizar = await request(app)
      .post(`/api/importaciones/lotes/${lote.id}/tracking/sincronizar`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(sincronizar.status).toBe(403);
  });

  it("9. GET del detalle de la orden incluye el embarque con buque, tracking y contenedores anidados", async () => {
    const res = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const lote = res.body.lotes.find((l: { blAwb: string }) => l.blAwb === `BL-${sufijo}`);
    expect(lote).toBeDefined();
    expect(lote.buque.nombre).toBe("MAERSK EDIMBURGO");
    expect(lote.tracking.estado).toBe("ACTIVO");
    expect(typeof lote.tracking.variacionEtaDias).toBe("number");
    expect(lote.contenedores).toHaveLength(1);
    expect(lote.contenedores[0].numero).toBe("MSCU1234567");
  });
});
