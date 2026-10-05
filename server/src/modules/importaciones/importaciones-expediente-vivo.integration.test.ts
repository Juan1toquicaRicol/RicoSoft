import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Importaciones — Expediente Vivo: actividades esperadas, motor de
 * seguimiento (novedades automáticas), pagos y cierre. BD real, sin mocks.
 * Sigue el mismo patrón de fixtures que importaciones.integration.test.ts
 * (orden + lote creados vía la API real, no directo en Prisma).
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — Expediente Vivo (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAAdmin: string;
  let tokenASinPermiso: string;
  let tokenBAdmin: string;
  let ordenAId: string;
  let loteAId: string;

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
      data: { nombre: `Expediente Vivo Tenant A ${sufijo}`, subdomain: `test-ev-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Expediente Vivo Tenant B ${sufijo}`, subdomain: `test-ev-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `ev-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `ev-sinpermiso-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso A",
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `ev-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAAdmin = await login(`ev-admin-a-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`ev-sinpermiso-a-${sufijo}@test.ricosoft.local`);
    tokenBAdmin = await login(`ev-admin-b-${sufijo}@test.ricosoft.local`);

    const ordenRes = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({
        numeroOrden: `ORD-EV-A-${sufijo}`,
        incoterm: "FOB",
        proveedorExtranjero: "Proveedor Expediente Vivo",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        items: [{ descripcion: "Ítem EV", cantidad: 10, valorUnitarioFob: 100 }],
      });
    if (ordenRes.status !== 201) {
      throw new Error(
        `No se pudo crear la orden fixture: ${ordenRes.status} ${JSON.stringify(ordenRes.body)}`,
      );
    }
    ordenAId = ordenRes.body.id;

    const loteRes = await request(app)
      .post(`/api/importaciones/${ordenAId}/lotes`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ blAwb: `BL-EV-A-${sufijo}`, puertoOrigen: "Shanghai", puertoDestino: "Cartagena" });
    if (loteRes.status !== 201) {
      throw new Error(
        `No se pudo crear el lote fixture: ${loteRes.status} ${JSON.stringify(loteRes.body)}`,
      );
    }
    loteAId = loteRes.body.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    // El cierre forzado (más abajo) ahora dispara notificarEventoImportacion
    // (Fase 11: EVENTO_ORDEN_CERRADA), que crea Notificacion/InboxItem con
    // FK a User — deben borrarse antes que los usuarios o el cleanup falla
    // con una violación de llave foránea.
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionNovedad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionPago.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.costeoImportacionDetalle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.loteImportacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("la orden creada tiene un código legible IMP-<año>-<consecutivo> y una actividad sembrada por defecto", async () => {
    const res = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    expect(res.status).toBe(200);
    expect(res.body.codigo).toMatch(/^IMP-\d{4}-\d{3}$/);
    expect(res.body.actividades.length).toBeGreaterThanOrEqual(1); // "Confirmar orden..." + las del lote
    expect(
      res.body.actividades.some((a: { nombre: string; etapa?: string }) =>
        a.nombre.includes("Confirmar orden"),
      ),
    ).toBe(true);
    expect(
      res.body.actividades.some(
        (a: { nombre: string; etapa?: string }) => a.etapa === "Documentación",
      ),
    ).toBe(true);
  });

  it("registra una actividad manual con fecha límite vencida y el motor de seguimiento genera una novedad automática al consultar el detalle", async () => {
    const crear = await request(app)
      .post(`/api/importaciones/${ordenAId}/actividades`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({
        nombre: "Actividad de prueba vencida",
        etapa: "Documentación",
        responsableTipo: "Proveedor",
        fechaLimite: "2020-01-01T00:00:00.000Z",
      });
    expect(crear.status).toBe(201);

    const detalle = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    expect(detalle.status).toBe(200);

    const novedadAutomatica = detalle.body.novedades.find(
      (n: { automatica: boolean; descripcion: string }) =>
        n.automatica && n.descripcion.includes("Actividad de prueba vencida"),
    );
    expect(novedadAutomatica).toBeTruthy();
    expect(novedadAutomatica.tipo).toBe("Retraso");
    // Una alerta no atribuye causa: responsableTipo = Proveedor es solo contexto.
    expect(novedadAutomatica.origen).toBe("PorDeterminar");
    expect(detalle.body.situacionActual.atencion).toContain("Actividad de prueba vencida");
  });

  it("consultar el detalle dos veces no duplica la novedad automática (idempotencia por reglaOrigen)", async () => {
    await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    const detalle = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    const coincidencias = detalle.body.novedades.filter((n: { descripcion: string }) =>
      n.descripcion.includes("Actividad de prueba vencida"),
    );
    expect(coincidencias).toHaveLength(1);
  });

  it("completar la actividad vencida resuelve automáticamente la novedad en la siguiente consulta", async () => {
    const detalleAntes = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    const actividad = detalleAntes.body.actividades.find(
      (a: { nombre: string; etapa?: string }) => a.nombre === "Actividad de prueba vencida",
    );
    expect(actividad).toBeTruthy();

    const completar = await request(app)
      .patch(`/api/importaciones/actividades/${actividad.id}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ estado: "Completada" });
    expect(completar.status).toBe(200);
    expect(completar.body.estado).toBe("Completada");

    const detalleDespues = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    const novedad = detalleDespues.body.novedades.find((n: { descripcion: string }) =>
      n.descripcion.includes("Actividad de prueba vencida"),
    );
    expect(novedad.estado).toBe("Resuelta");
  });

  it("una novedad automática no se puede resolver a mano (409); sigue Abierta mientras la condición esté vigente", async () => {
    const crear = await request(app)
      .post(`/api/importaciones/${ordenAId}/actividades`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({
        nombre: "Actividad vencida no resoluble",
        etapa: "Documentación",
        responsableTipo: "Proveedor",
        fechaLimite: "2020-01-01T00:00:00.000Z",
      });
    expect(crear.status).toBe(201);

    const antes = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    const automatica = antes.body.novedades.find((n: { descripcion: string }) =>
      n.descripcion.includes("Actividad vencida no resoluble"),
    );
    expect(automatica).toBeTruthy();

    const resolver = await request(app)
      .patch(`/api/importaciones/novedades/${automatica.id}/resolver`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ comentario: "intento manual" });
    expect(resolver.status).toBe(409);

    const despues = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    expect(despues.status).toBe(200);
    const fila = despues.body.novedades.find((n: { id: string }) => n.id === automatica.id);
    expect(fila.estado).toBe("Abierta");
  });

  it("fila automática heredada, resuelta a mano con la condición vigente: reaparece (200, sin duplicar) y el historial conserva quién y cuándo (sin copiar el comentario)", async () => {
    const crear = await request(app)
      .post(`/api/importaciones/${ordenAId}/actividades`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({
        nombre: "Actividad vencida heredada",
        etapa: "Documentación",
        responsableTipo: "Proveedor",
        fechaLimite: "2020-01-01T00:00:00.000Z",
      });
    expect(crear.status).toBe(201);
    const antes = await request(app)
      .get(`/api/importaciones/${ordenAId}`)
      .set("Authorization", `Bearer ${tokenAAdmin}`);
    const automatica = antes.body.novedades.find((n: { descripcion: string }) =>
      n.descripcion.includes("Actividad vencida heredada"),
    );

    // Simula el estado histórico: resuelta manualmente (con su evento) antes de este cambio.
    const resueltaEn = new Date();
    await prisma.importacionNovedad.update({
      where: { id: automatica.id },
      data: {
        estado: "Resuelta",
        fechaResolucion: resueltaEn,
        responsableResolucionId: randomUUID(),
        responsableResolucionNombre: "Ana Histórica",
      },
    });
    await prisma.importacionHistorial.create({
      data: {
        ordenCompraId: ordenAId,
        actor: "Ana Histórica",
        accion: "Novedad resuelta: Retraso",
        detalle: "Gestionado por teléfono",
        origen: "Manual",
      },
    });

    const [a, b] = await Promise.all([
      request(app)
        .get(`/api/importaciones/${ordenAId}`)
        .set("Authorization", `Bearer ${tokenAAdmin}`),
      request(app)
        .get(`/api/importaciones/${ordenAId}`)
        .set("Authorization", `Bearer ${tokenAAdmin}`),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const filas = a.body.novedades.filter((n: { descripcion: string }) =>
      n.descripcion.includes("Actividad vencida heredada"),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].estado).toBe("Abierta");

    const reapertura = a.body.historial.filter((h: { accion: string }) =>
      h.accion.startsWith("Novedad automática reabierta"),
    );
    expect(reapertura).toHaveLength(1); // la concurrencia no duplica el evento
    expect(reapertura[0].detalle).toContain("Ana Histórica");
    expect(reapertura[0].detalle).toContain(automatica.id);
    expect(reapertura[0].detalle).toContain("permanece en el historial de la orden");
    expect(reapertura[0].detalle).not.toContain("Gestionado por teléfono"); // no se copia por proximidad
    // El evento original de la resolución manual sigue intacto.
    expect(
      a.body.historial.some(
        (h: { accion: string; detalle: string }) =>
          h.accion === "Novedad resuelta: Retraso" && h.detalle === "Gestionado por teléfono",
      ),
    ).toBe(true);
  });

  it("registra una novedad manual y permite resolverla", async () => {
    const crear = await request(app)
      .post(`/api/importaciones/${ordenAId}/novedades`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ tipo: "DocumentoFaltante", descripcion: "Falta el packing list", prioridad: "Alta" });
    expect(crear.status).toBe(201);
    expect(crear.body.automatica).toBe(false);
    expect(crear.body.estado).toBe("Abierta");

    const resolver = await request(app)
      .patch(`/api/importaciones/novedades/${crear.body.id}/resolver`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ comentario: "Recibido por correo" });
    expect(resolver.status).toBe(200);
    expect(resolver.body.estado).toBe("Resuelta");
  });

  it("registra un pago y lo marca como pagado", async () => {
    const crear = await request(app)
      .post(`/api/importaciones/${ordenAId}/pagos`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ concepto: "Anticipo proveedor", valor: 5000000, moneda: "COP" });
    expect(crear.status).toBe(201);
    expect(crear.body.estado).toBe("Pendiente");

    const pagar = await request(app)
      .patch(`/api/importaciones/pagos/${crear.body.id}/estado`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ estado: "Pagado" });
    expect(pagar.status).toBe(200);
    expect(pagar.body.estado).toBe("Pagado");
    expect(pagar.body.fechaPago).toBeTruthy();
  });

  it("no se puede cerrar la orden si no se cumplen las condiciones (409 con faltantes)", async () => {
    const res = await request(app)
      .post(`/api/importaciones/${ordenAId}/cerrar`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({});
    expect(res.status).toBe(409);
    expect(Array.isArray(res.body.faltantes)).toBe(true);
    expect(res.body.faltantes.length).toBeGreaterThan(0);
  });

  it("forzar el cierre sin justificación se rechaza con 400", async () => {
    const res = await request(app)
      .post(`/api/importaciones/${ordenAId}/cerrar`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ forzar: true });
    expect(res.status).toBe(400);
  });

  it("forzar el cierre con justificación cierra la orden y queda en el historial", async () => {
    const res = await request(app)
      .post(`/api/importaciones/${ordenAId}/cerrar`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({ forzar: true, justificacion: "Cierre de prueba de integración" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("Cerrada");
    expect(res.body.fechaCierre).toBeTruthy();
    expect(
      res.body.historial.some(
        (h: { accion: string; detalle?: string | null }) =>
          h.accion.includes("cerrada") && h.detalle?.includes("Cierre de prueba"),
      ),
    ).toBe(true);

    const denuevo = await request(app)
      .post(`/api/importaciones/${ordenAId}/cerrar`)
      .set("Authorization", `Bearer ${tokenAAdmin}`)
      .send({});
    expect(denuevo.status).toBe(400); // ya está Cerrada
  });

  it("Tenant B nunca puede crear actividades, novedades ni pagos sobre la orden de Tenant A (404)", async () => {
    const actividad = await request(app)
      .post(`/api/importaciones/${ordenAId}/actividades`)
      .set("Authorization", `Bearer ${tokenBAdmin}`)
      .send({ nombre: "Intento cross-tenant", etapa: "Orden", responsableTipo: "Interno" });
    expect(actividad.status).toBe(404);

    const novedad = await request(app)
      .post(`/api/importaciones/${ordenAId}/novedades`)
      .set("Authorization", `Bearer ${tokenBAdmin}`)
      .send({ tipo: "Otro", descripcion: "Intento cross-tenant" });
    expect(novedad.status).toBe(404);

    const pago = await request(app)
      .post(`/api/importaciones/${ordenAId}/pagos`)
      .set("Authorization", `Bearer ${tokenBAdmin}`)
      .send({ concepto: "Intento cross-tenant", valor: 1000 });
    expect(pago.status).toBe(404);

    const cerrar = await request(app)
      .post(`/api/importaciones/${ordenAId}/cerrar`)
      .set("Authorization", `Bearer ${tokenBAdmin}`)
      .send({});
    expect(cerrar.status).toBe(404);
  });

  it("un usuario sin permiso IMPORTACIONES_GESTIONAR_TRANSITO recibe 403 al crear actividad/novedad, y sin IMPORTACIONES_LIQUIDAR al crear pago", async () => {
    const actividad = await request(app)
      .post(`/api/importaciones/${ordenAId}/actividades`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ nombre: "X", etapa: "Orden", responsableTipo: "Interno" });
    expect(actividad.status).toBe(403);

    const novedad = await request(app)
      .post(`/api/importaciones/${ordenAId}/novedades`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ tipo: "Otro", descripcion: "X" });
    expect(novedad.status).toBe(403);

    const pago = await request(app)
      .post(`/api/importaciones/${ordenAId}/pagos`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ concepto: "X", valor: 1000 });
    expect(pago.status).toBe(403);
  });
});
