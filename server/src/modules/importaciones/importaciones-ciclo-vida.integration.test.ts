import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Importaciones — ciclo de vida: guardas de negocio nuevas sobre
 * `liquidarCosteoImportacion` (Decisión #13 de ARCHITECTURAL_DECISIONS_PENDING.md:
 * la liquidación DEFINITIVA exige expediente "Levantado" + vistos buenos
 * aprobados) y `anularOrdenCompraIntl` (no se puede anular una orden Cerrada,
 * ya Anulada, ni con lotes ya Nacionalizados), más las notificaciones de
 * hito del ciclo de vida (`notificarEventoImportacion`, Fase 11) que ambos
 * endpoints disparan, junto con el cierre. BD real, sin mocks — mismo patrón
 * de fixtures que importaciones-expediente-vivo.integration.test.ts.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Importaciones — ciclo de vida (liquidación/anulación/notificaciones)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenAAdmin: string;
    let tokenBAdmin: string;
    let responsableAId: string;

    const login = async (email: string): Promise<string> => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200 || !res.body.token) {
        throw new Error(
          `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
      return res.body.token as string;
    };

    /** Crea una orden con un lote y, opcionalmente, un responsable asignado
     * (distinto del actor que ejecuta las acciones, para poder verificar que
     * la notificación realmente llega a un destinatario y no se autoexcluye
     * por ser el propio actor). */
    const crearOrdenConLote = async (
      token: string,
      opts?: { responsableId?: string },
    ): Promise<{ ordenId: string; loteId: string; numeroOrden: string }> => {
      const numeroOrden = `ORD-CV-${randomUUID().slice(0, 8)}`;
      const ordenRes = await request(app)
        .post("/api/importaciones")
        .set("Authorization", `Bearer ${token}`)
        .send({
          numeroOrden,
          incoterm: "FOB",
          proveedorExtranjero: "Proveedor Ciclo de Vida",
          paisOrigen: "China",
          moneda: "USD",
          trmPactada: 4000,
          responsableId: opts?.responsableId ?? undefined,
          items: [{ descripcion: "Ítem CV", cantidad: 10, valorUnitarioFob: 100 }],
        });
      if (ordenRes.status !== 201) {
        throw new Error(
          `No se pudo crear la orden: ${ordenRes.status} ${JSON.stringify(ordenRes.body)}`,
        );
      }
      const ordenId = ordenRes.body.id;

      const loteRes = await request(app)
        .post(`/api/importaciones/${ordenId}/lotes`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          blAwb: `BL-CV-${randomUUID().slice(0, 8)}`,
          puertoOrigen: "Shanghai",
          puertoDestino: "Cartagena",
        });
      if (loteRes.status !== 201) {
        throw new Error(
          `No se pudo crear el lote: ${loteRes.status} ${JSON.stringify(loteRes.body)}`,
        );
      }
      return { ordenId, loteId: loteRes.body.id, numeroOrden };
    };

    /** Lleva un lote recién creado hasta "Nacionalizado": tránsito manual →
     * expediente Levantado → visto bueno Aprobado → liquidación definitiva. */
    const nacionalizarLote = async (token: string, loteId: string) => {
      const transito = await request(app)
        .patch(`/api/importaciones/lotes/${loteId}/estado`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estado: "En puerto" });
      expect(transito.status).toBe(200);

      const expediente = await request(app)
        .put(`/api/importaciones/lotes/${loteId}/expediente`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estado: "Levantado" });
      expect(expediente.status).toBe(200);

      const visto = await request(app)
        .post(`/api/importaciones/lotes/${loteId}/expediente/vistos-buenos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ entidad: "INVIMA" });
      expect(visto.status).toBe(201);

      const aprobar = await request(app)
        .patch(`/api/importaciones/vistos-buenos/${visto.body.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ estado: "Aprobado" });
      expect(aprobar.status).toBe(200);

      const liquidar = await request(app)
        .post(`/api/importaciones/lotes/${loteId}/liquidar-costeo`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          trmLiquidacion: 4000,
          valorCifTotalUsd: 1000,
          arancelTotalCop: 100000,
          ivaTotalCop: 190000,
        });
      expect(liquidar.status).toBe(200);
      return liquidar;
    };

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const tenantA = await prisma.tenant.create({
        data: { nombre: `Ciclo Vida Tenant A ${sufijo}`, subdomain: `test-cv-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Ciclo Vida Tenant B ${sufijo}`, subdomain: `test-cv-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `cv-admin-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin A",
          isSuperadmin: true,
          activo: true,
        },
      });
      const responsableA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `cv-responsable-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Responsable A",
          isSuperadmin: false,
          activo: true,
        },
      });
      responsableAId = responsableA.id;
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `cv-admin-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin B",
          isSuperadmin: true,
          activo: true,
        },
      });

      tokenAAdmin = await login(`cv-admin-a-${sufijo}@test.ricosoft.local`);
      tokenBAdmin = await login(`cv-admin-b-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.importacionNovedad.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.importacionPago.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.costeoImportacionDetalle.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.vistoBuenoAduanero.deleteMany({
        where: { expediente: { tenantId: { in: tenantIds } } },
      });
      await prisma.expedienteAduanero.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.loteImportacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    describe("Liquidación definitiva exige levante aduanero + vistos buenos aprobados", () => {
      it("rechaza liquidar sin expediente y sin expediente 'Levantado'", async () => {
        const { loteId } = await crearOrdenConLote(tokenAAdmin);
        const transito = await request(app)
          .patch(`/api/importaciones/lotes/${loteId}/estado`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ estado: "En puerto" });
        expect(transito.status).toBe(200);

        const sinExpediente = await request(app)
          .post(`/api/importaciones/lotes/${loteId}/liquidar-costeo`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({
            trmLiquidacion: 4000,
            valorCifTotalUsd: 1000,
            arancelTotalCop: 0,
            ivaTotalCop: 0,
          });
        expect(sinExpediente.status).toBe(400);
        expect(sinExpediente.body.message).toContain("Levantado");

        const enTramite = await request(app)
          .put(`/api/importaciones/lotes/${loteId}/expediente`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ estado: "En trámite" });
        expect(enTramite.status).toBe(200);

        const conExpedienteEnTramite = await request(app)
          .post(`/api/importaciones/lotes/${loteId}/liquidar-costeo`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({
            trmLiquidacion: 4000,
            valorCifTotalUsd: 1000,
            arancelTotalCop: 0,
            ivaTotalCop: 0,
          });
        expect(conExpedienteEnTramite.status).toBe(400);
        expect(conExpedienteEnTramite.body.message).toContain("Levantado");
      });

      it("rechaza liquidar con expediente Levantado pero vistos buenos sin aprobar", async () => {
        const { loteId } = await crearOrdenConLote(tokenAAdmin);
        await request(app)
          .patch(`/api/importaciones/lotes/${loteId}/estado`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ estado: "En puerto" });
        await request(app)
          .put(`/api/importaciones/lotes/${loteId}/expediente`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ estado: "Levantado" });
        const visto = await request(app)
          .post(`/api/importaciones/lotes/${loteId}/expediente/vistos-buenos`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ entidad: "INVIMA" });
        expect(visto.status).toBe(201);
        expect(visto.body.estado).toBe("Pendiente");

        const liquidar = await request(app)
          .post(`/api/importaciones/lotes/${loteId}/liquidar-costeo`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({
            trmLiquidacion: 4000,
            valorCifTotalUsd: 1000,
            arancelTotalCop: 0,
            ivaTotalCop: 0,
          });
        expect(liquidar.status).toBe(400);
        expect(liquidar.body.message).toContain("visto");
        expect(liquidar.body.message).toContain("INVIMA");
      });

      it("permite liquidar cuando el expediente está Levantado y todos los vistos buenos están Aprobados, y notifica al responsable (no al actor)", async () => {
        const { ordenId, loteId, numeroOrden } = await crearOrdenConLote(tokenAAdmin, {
          responsableId: responsableAId,
        });
        const liquidar = await nacionalizarLote(tokenAAdmin, loteId);
        expect(liquidar.body.estado).toBe("Nacionalizado");

        const inboxItem = await prisma.inboxItem.findFirst({
          where: {
            tenantId: tenantAId,
            sourceModule: "importaciones",
            sourceEntityTipo: "LoteImportacion",
            sourceEntityId: loteId,
            tipo: "IMPORTACION_LOTE_NACIONALIZADO",
          },
        });
        expect(inboxItem).toBeTruthy();
        expect(inboxItem?.enlace).toBe(`/importaciones/${ordenId}`);

        const notificacion = await prisma.notificacion.findFirst({
          where: {
            tenantId: tenantAId,
            usuarioId: responsableAId,
            tipo: "IMPORTACION_LOTE_NACIONALIZADO",
          },
        });
        expect(notificacion).toBeTruthy();
        expect(notificacion?.mensaje).toContain(numeroOrden);

        // El actor (Admin A, que ejecutó la liquidación) no se autonotifica.
        const notificacionActor = await prisma.notificacion.findFirst({
          where: {
            tenantId: tenantAId,
            tipo: "IMPORTACION_LOTE_NACIONALIZADO",
            mensaje: { contains: numeroOrden },
            usuarioId: { not: responsableAId },
          },
        });
        expect(notificacionActor).toBeFalsy();
      });
    });

    describe("Anulación bloqueada tras Cerrada/Anulada/lote Nacionalizado", () => {
      it("anula una orden vigente, guarda el motivo en el historial y notifica al responsable", async () => {
        const { ordenId, numeroOrden } = await crearOrdenConLote(tokenAAdmin, {
          responsableId: responsableAId,
        });

        const anular = await request(app)
          .delete(`/api/importaciones/${ordenId}`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ motivo: "El proveedor no pudo cumplir el pedido." });
        expect(anular.status).toBe(204);

        const ordenDb = await prisma.ordenCompraIntl.findUnique({ where: { id: ordenId } });
        expect(ordenDb?.estado).toBe("Anulada");
        expect(ordenDb?.eliminado).toBe(true);

        const historial = await prisma.importacionHistorial.findFirst({
          where: { ordenCompraId: ordenId, accion: "Orden anulada" },
        });
        expect(historial?.detalle).toBe("El proveedor no pudo cumplir el pedido.");
        expect(historial?.etapa).toBe("Cierre");

        const notificacion = await prisma.notificacion.findFirst({
          where: {
            tenantId: tenantAId,
            usuarioId: responsableAId,
            tipo: "IMPORTACION_ORDEN_ANULADA",
          },
        });
        expect(notificacion).toBeTruthy();
        expect(notificacion?.mensaje).toContain(numeroOrden);

        // Anular una orden ya anulada: el lookup del endpoint filtra
        // eliminado:false (igual que el resto del módulo), y anular ya puso
        // eliminado:true junto con estado:Anulada en la misma actualización —
        // así que una segunda anulación ya no encuentra la orden (404). La
        // guarda explícita de "estado === Anulada" en el controlador cubre el
        // caso, hoy inalcanzable en este endpoint, de que alguna vía futura
        // deje estado=Anulada sin eliminado=true.
        const anularDeNuevo = await request(app)
          .delete(`/api/importaciones/${ordenId}`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({});
        expect(anularDeNuevo.status).toBe(404);
      });

      it("no permite anular una orden ya Cerrada", async () => {
        const { ordenId } = await crearOrdenConLote(tokenAAdmin);
        const cerrar = await request(app)
          .post(`/api/importaciones/${ordenId}/cerrar`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({ forzar: true, justificacion: "Cierre de prueba ciclo de vida" });
        expect(cerrar.status).toBe(200);
        expect(cerrar.body.estado).toBe("Cerrada");

        const anular = await request(app)
          .delete(`/api/importaciones/${ordenId}`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({});
        expect(anular.status).toBe(400);
        expect(anular.body.message).toContain("cerrada");
      });

      it("no permite anular una orden con un lote ya Nacionalizado (sugiere registrar novedad en su lugar)", async () => {
        const { ordenId, loteId } = await crearOrdenConLote(tokenAAdmin);
        await nacionalizarLote(tokenAAdmin, loteId);

        const anular = await request(app)
          .delete(`/api/importaciones/${ordenId}`)
          .set("Authorization", `Bearer ${tokenAAdmin}`)
          .send({});
        expect(anular.status).toBe(400);
        expect(anular.body.message).toContain("nacionalizado");
        expect(anular.body.message.toLowerCase()).toContain("novedad");

        // La orden sigue activa (no quedó a medio anular).
        const ordenDb = await prisma.ordenCompraIntl.findUnique({ where: { id: ordenId } });
        expect(ordenDb?.estado).not.toBe("Anulada");
        expect(ordenDb?.eliminado).toBe(false);
      });
    });

    describe("Aislamiento multi-tenant sobre los endpoints nuevos/afectados", () => {
      it("Tenant B nunca puede anular ni liquidar sobre entidades de Tenant A (404)", async () => {
        const { ordenId, loteId } = await crearOrdenConLote(tokenAAdmin);

        const anular = await request(app)
          .delete(`/api/importaciones/${ordenId}`)
          .set("Authorization", `Bearer ${tokenBAdmin}`)
          .send({});
        expect(anular.status).toBe(404);

        const expediente = await request(app)
          .put(`/api/importaciones/lotes/${loteId}/expediente`)
          .set("Authorization", `Bearer ${tokenBAdmin}`)
          .send({ estado: "Levantado" });
        expect(expediente.status).toBe(404);

        const liquidar = await request(app)
          .post(`/api/importaciones/lotes/${loteId}/liquidar-costeo`)
          .set("Authorization", `Bearer ${tokenBAdmin}`)
          .send({
            trmLiquidacion: 4000,
            valorCifTotalUsd: 1000,
            arancelTotalCop: 0,
            ivaTotalCop: 0,
          });
        expect(liquidar.status).toBe(404);

        // La orden de Tenant A sigue intacta.
        const ordenDb = await prisma.ordenCompraIntl.findUnique({ where: { id: ordenId } });
        expect(ordenDb?.estado).not.toBe("Anulada");
      });
    });
  },
);
