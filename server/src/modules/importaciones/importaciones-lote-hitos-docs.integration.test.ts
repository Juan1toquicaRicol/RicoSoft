import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Importaciones — hitos reales del lote, documentos del lote (B/L-AWB, COA),
 * recepción y liquidación con prorrateo. BD real, sin mocks (solo se ejecuta
 * con RUN_DB_INTEGRATION_TESTS=true contra una base desechable/QA confirmada).
 * Verifica: aislamiento multi-tenant (IDOR), RBAC, atomicidad con el historial,
 * idempotencia/concurrencia de recepción y liquidación, y el método de prorrateo.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — hitos, documentos y prorrateo (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenAAdmin: string;
  let tokenASoloVer: string;
  let tokenBAdmin: string;
  let ordenAId: string;
  let loteAId: string;
  let loteLiquidarId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login de prueba falló para ${email}: ${res.status}`);
    }
    return res.body.token as string;
  };

  const crearOrdenYLote = async (token: string, etiqueta: string, items: object[]) => {
    const ordenRes = await request(app)
      .post("/api/importaciones")
      .set(auth(token))
      .send({
        incoterm: "FOB",
        proveedorExtranjero: `Proveedor ${etiqueta}`,
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        items,
      });
    if (ordenRes.status !== 201) {
      throw new Error(
        `Orden fixture ${etiqueta}: ${ordenRes.status} ${JSON.stringify(ordenRes.body)}`,
      );
    }
    const loteRes = await request(app)
      .post(`/api/importaciones/${ordenRes.body.id}/lotes`)
      .set(auth(token))
      .send({
        blAwb: `BL-${etiqueta}-${sufijo}`,
        puertoOrigen: "Shanghai",
        puertoDestino: "Cartagena",
      });
    if (loteRes.status !== 201) {
      throw new Error(
        `Lote fixture ${etiqueta}: ${loteRes.status} ${JSON.stringify(loteRes.body)}`,
      );
    }
    return { ordenId: ordenRes.body.id as string, loteId: loteRes.body.id as string };
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Lote Hitos A ${sufijo}`, subdomain: `test-lh-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Lote Hitos B ${sufijo}`, subdomain: `test-lh-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `lh-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    const rolSoloVer = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Solo ver importaciones ${sufijo}`,
        permisos: JSON.stringify(["importaciones.ver"]),
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `lh-solover-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Solo Ver A",
        rolId: rolSoloVer.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `lh-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenAAdmin = await login(`lh-admin-a-${sufijo}@test.ricosoft.local`);
    tokenASoloVer = await login(`lh-solover-a-${sufijo}@test.ricosoft.local`);
    tokenBAdmin = await login(`lh-admin-b-${sufijo}@test.ricosoft.local`);

    const principal = await crearOrdenYLote(tokenAAdmin, "HITOS", [
      { descripcion: "Ítem principal", cantidad: 10, valorUnitarioFob: 100 },
    ]);
    ordenAId = principal.ordenId;
    loteAId = principal.loteId;

    // Orden para liquidar con peso: A pesa 100 kg y B 300 kg; FOB 750 / 250.
    const liquidar = await crearOrdenYLote(tokenAAdmin, "LIQ", [
      { descripcion: "Resina A", cantidad: 100, valorUnitarioFob: 7.5, pesoKg: 100 },
      { descripcion: "Resina B", cantidad: 100, valorUnitarioFob: 2.5, pesoKg: 300 },
    ]);
    loteLiquidarId = liquidar.loteId;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionNovedad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.costeoImportacionDetalle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.expedienteAduanero.deleteMany({ where: { tenantId: { in: tenantIds } } });
    // Hitos y documentos del lote caen por ON DELETE CASCADE al borrar el lote.
    await prisma.loteImportacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("hitos reales del lote", () => {
    it("registra la llegada a puerto con origen Manual y aparece en el detalle de la orden y en el historial", async () => {
      const res = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/LLEGADA_PUERTO`)
        .set(auth(tokenAAdmin))
        .send({ fecha: "2026-10-10T00:00:00.000Z", nota: "Confirmado por el forwarder" });
      expect(res.status).toBe(200);

      const detalle = await request(app)
        .get(`/api/importaciones/${ordenAId}`)
        .set(auth(tokenAAdmin));
      const hitos = detalle.body.lotes[0].hitos as Array<{
        tipo: string;
        fecha: string | null;
        origen: string | null;
      }>;
      const puerto = hitos.find((h) => h.tipo === "LLEGADA_PUERTO")!;
      expect(puerto.origen).toBe("Manual");
      expect(puerto.fecha).toContain("2026-10-10");
      // La recepción en planta NO se confunde con la llegada a puerto.
      expect(hitos.find((h) => h.tipo === "RECEPCION_PLANTA")!.fecha).toBeNull();

      const historial = await prisma.importacionHistorial.findMany({
        where: { ordenCompraId: ordenAId, accion: { startsWith: "Hito registrado" } },
      });
      expect(historial).toHaveLength(1);
    });

    it("corregir el hito conserva el valor anterior en el historial (append-only)", async () => {
      const res = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/LLEGADA_PUERTO`)
        .set(auth(tokenAAdmin))
        .send({ fecha: "2026-10-12T00:00:00.000Z" });
      expect(res.status).toBe(200);
      const corregido = await prisma.importacionHistorial.findFirst({
        where: { ordenCompraId: ordenAId, accion: { startsWith: "Hito corregido" } },
      });
      expect(corregido?.detalle).toContain("antes: 2026-10-10");
      const filas = await prisma.loteImportacionHito.count({
        where: { loteId: loteAId, tipo: "LLEGADA_PUERTO" },
      });
      expect(filas).toBe(1);
    });

    it("la recepción en planta no se puede registrar a mano y las fechas inconsistentes se rechazan", async () => {
      const recepcion = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/RECEPCION_PLANTA`)
        .set(auth(tokenAAdmin))
        .send({ fecha: "2026-10-15T00:00:00.000Z" });
      expect(recepcion.status).toBe(400);

      const embarqueTardio = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/EMBARQUE_REAL`)
        .set(auth(tokenAAdmin))
        .send({ fecha: "2026-10-20T00:00:00.000Z" }); // posterior a la llegada a puerto (12-oct)
      expect(embarqueTardio.status).toBe(400);
    });

    it("RBAC: solo importaciones.ver no puede registrar ni eliminar hitos (403)", async () => {
      const put = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/INSPECCION_ADUANERA`)
        .set(auth(tokenASoloVer))
        .send({ fecha: "2026-10-13T00:00:00.000Z" });
      expect(put.status).toBe(403);
      const del = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/hitos/LLEGADA_PUERTO`)
        .set(auth(tokenASoloVer));
      expect(del.status).toBe(403);
    });

    it("IDOR: otro tenant recibe 404 al registrar o eliminar un hito del lote ajeno y el dato no cambia", async () => {
      const antes = await prisma.loteImportacionHito.findFirst({
        where: { loteId: loteAId, tipo: "LLEGADA_PUERTO" },
      });
      const put = await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/LLEGADA_PUERTO`)
        .set(auth(tokenBAdmin))
        .send({ fecha: "2026-10-14T00:00:00.000Z" });
      expect(put.status).toBe(404);
      const del = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/hitos/LLEGADA_PUERTO`)
        .set(auth(tokenBAdmin));
      expect(del.status).toBe(404);
      const despues = await prisma.loteImportacionHito.findFirst({
        where: { loteId: loteAId, tipo: "LLEGADA_PUERTO" },
      });
      expect(despues?.fecha.toISOString()).toBe(antes?.fecha.toISOString());
    });

    it("eliminar un hito manual lo retira y lo deja en el historial; repetir devuelve 404", async () => {
      await request(app)
        .put(`/api/importaciones/lotes/${loteAId}/hitos/INSPECCION_ADUANERA`)
        .set(auth(tokenAAdmin))
        .send({ fecha: "2026-10-13T00:00:00.000Z" });
      const del = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/hitos/INSPECCION_ADUANERA`)
        .set(auth(tokenAAdmin));
      expect(del.status).toBe(204);
      const otra = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/hitos/INSPECCION_ADUANERA`)
        .set(auth(tokenAAdmin));
      expect(otra.status).toBe(404);
      const hist = await prisma.importacionHistorial.count({
        where: { ordenCompraId: ordenAId, accion: { startsWith: "Hito eliminado" } },
      });
      expect(hist).toBe(1);
    });
  });

  describe("documentos del lote (B/L-AWB, COA)", () => {
    let documentoId: string;

    it("sube un COA, lo descarga con el mismo contenido y deja rastro en el historial", async () => {
      const subida = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/documentos/certificado-analisis`)
        .set(auth(tokenAAdmin))
        .attach("archivo", Buffer.from("%PDF-1.4 coa de prueba"), {
          filename: "coa.pdf",
          contentType: "application/pdf",
        });
      expect(subida.status).toBe(201);
      expect(subida.body.tipo).toBe("Certificado de análisis (COA)");
      documentoId = subida.body.id;

      const descarga = await request(app)
        .get(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenAAdmin));
      expect(descarga.status).toBe(200);
      expect(Buffer.from(descarga.body).toString().includes("%PDF-1.4 coa de prueba")).toBe(true);

      const hist = await prisma.importacionHistorial.count({
        where: { ordenCompraId: ordenAId, accion: { startsWith: "Documento de lote adjuntado" } },
      });
      expect(hist).toBe(1);
    });

    it("rechaza tipo inválido, archivo que no es lo que declara, y a quien solo puede ver", async () => {
      const tipo = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/documentos/factura-falsa`)
        .set(auth(tokenAAdmin))
        .attach("archivo", Buffer.from("%PDF-1.4 x"), {
          filename: "x.pdf",
          contentType: "application/pdf",
        });
      expect(tipo.status).toBe(400);

      const falso = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/documentos/bl-awb`)
        .set(auth(tokenAAdmin))
        .attach("archivo", Buffer.from("MZ ejecutable disfrazado"), {
          filename: "bl.pdf",
          contentType: "application/pdf",
        });
      expect(falso.status).toBe(400);

      const soloVer = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/documentos/bl-awb`)
        .set(auth(tokenASoloVer))
        .attach("archivo", Buffer.from("%PDF-1.4 x"), {
          filename: "bl.pdf",
          contentType: "application/pdf",
        });
      expect(soloVer.status).toBe(403);
    });

    it("solo importaciones.ver puede descargar pero no eliminar", async () => {
      const descarga = await request(app)
        .get(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenASoloVer));
      expect(descarga.status).toBe(200);
      const del = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenASoloVer));
      expect(del.status).toBe(403);
    });

    it("IDOR: otro tenant no puede descargar, eliminar ni subir al lote ajeno (404) y el documento sigue intacto", async () => {
      const get = await request(app)
        .get(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenBAdmin));
      expect(get.status).toBe(404);
      const del = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenBAdmin));
      expect(del.status).toBe(404);
      const subir = await request(app)
        .post(`/api/importaciones/lotes/${loteAId}/documentos/bl-awb`)
        .set(auth(tokenBAdmin))
        .attach("archivo", Buffer.from("%PDF-1.4 hostil"), {
          filename: "hostil.pdf",
          contentType: "application/pdf",
        });
      expect(subir.status).toBe(404);
      expect(await prisma.loteImportacionDocumento.count({ where: { loteId: loteAId } })).toBe(1);
    });

    it("eliminar quita la fila y registra el historial; una segunda eliminación devuelve 404", async () => {
      const del = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenAAdmin));
      expect(del.status).toBe(200);
      const otra = await request(app)
        .delete(`/api/importaciones/lotes/${loteAId}/documentos/${documentoId}`)
        .set(auth(tokenAAdmin));
      expect(otra.status).toBe(404);
    });
  });

  describe("recepción en planta y liquidación con prorrateo", () => {
    it("recibir sella el hito RECEPCION_PLANTA (Sistema); recibir dos veces a la vez no duplica el costeo provisional", async () => {
      const [r1, r2] = await Promise.all([
        request(app)
          .patch(`/api/importaciones/lotes/${loteLiquidarId}/recibir-pre-compra`)
          .set(auth(tokenAAdmin)),
        request(app)
          .patch(`/api/importaciones/lotes/${loteLiquidarId}/recibir-pre-compra`)
          .set(auth(tokenAAdmin)),
      ]);
      const estados = [r1.status, r2.status].sort();
      expect(estados[0]).toBe(200);
      expect([400, 409]).toContain(estados[1]);

      expect(
        await prisma.costeoImportacionDetalle.count({
          where: { loteId: loteLiquidarId, esProvisional: true },
        }),
      ).toBe(2); // un costeo por ítem, una sola vez
      const hito = await prisma.loteImportacionHito.findFirst({
        where: { loteId: loteLiquidarId, tipo: "RECEPCION_PLANTA" },
      });
      expect(hito?.origen).toBe("Sistema");
    });

    it("PESO no está aprobado (400, sin cambios); liquidar por FOB guarda el método y dos liquidaciones simultáneas no duplican", async () => {
      const exp = await request(app)
        .put(`/api/importaciones/lotes/${loteLiquidarId}/expediente`)
        .set(auth(tokenAAdmin))
        .send({ estado: "Levantado", fechaLevante: "2026-10-20T00:00:00.000Z" });
      expect(exp.status).toBe(200);

      const cuerpo = {
        trmLiquidacion: 4200,
        valorCifTotalUsd: 1000,
        arancelTotalCop: 100000,
        ivaTotalCop: 190000,
        fletesNacionalesCop: 1000,
        agenciamientoCop: 400,
        metodoProrrateoGastos: "FOB",
      };
      // Un método sin aprobar se rechaza y no deja costeo definitivo.
      const rechazado = await request(app)
        .post(`/api/importaciones/lotes/${loteLiquidarId}/liquidar-costeo`)
        .set(auth(tokenAAdmin))
        .send({ ...cuerpo, metodoProrrateoGastos: "PESO" });
      expect(rechazado.status).toBe(400);
      expect(
        await prisma.costeoImportacionDetalle.count({
          where: { loteId: loteLiquidarId, esProvisional: false },
        }),
      ).toBe(0);
      const [l1, l2] = await Promise.all([
        request(app)
          .post(`/api/importaciones/lotes/${loteLiquidarId}/liquidar-costeo`)
          .set(auth(tokenAAdmin))
          .send(cuerpo),
        request(app)
          .post(`/api/importaciones/lotes/${loteLiquidarId}/liquidar-costeo`)
          .set(auth(tokenAAdmin))
          .send(cuerpo),
      ]);
      const estados = [l1.status, l2.status].sort();
      expect(estados[0]).toBe(200);
      expect([400, 409]).toContain(estados[1]);

      const definitivos = await prisma.costeoImportacionDetalle.findMany({
        where: { loteId: loteLiquidarId, esProvisional: false },
        include: { item: true },
      });
      expect(definitivos).toHaveLength(2);
      const a = definitivos.find((c) => c.item.descripcion === "Resina A")!;
      const b = definitivos.find((c) => c.item.descripcion === "Resina B")!;
      expect(a.metodoProrrateoGastos).toBe("FOB");
      expect(Number(a.fletesNacionalesCop)).toBeCloseTo(750, 2); // 75 % por FOB
      expect(Number(b.fletesNacionalesCop)).toBeCloseTo(250, 2);
      expect(Number(a.arancelCop)).toBeCloseTo(75000, 2); // el arancel sigue por FOB
      // El costeo provisional se conserva (trazabilidad estimado frente a definitivo).
      expect(
        await prisma.costeoImportacionDetalle.count({
          where: { loteId: loteLiquidarId, esProvisional: true },
        }),
      ).toBe(2);
    });

    it("IDOR: otro tenant no puede recibir ni liquidar el lote ajeno (404)", async () => {
      const recibir = await request(app)
        .patch(`/api/importaciones/lotes/${loteAId}/recibir-pre-compra`)
        .set(auth(tokenBAdmin));
      expect(recibir.status).toBe(404);
      const liquidar = await request(app)
        .post(`/api/importaciones/lotes/${loteLiquidarId}/liquidar-costeo`)
        .set(auth(tokenBAdmin))
        .send({ trmLiquidacion: 4000, valorCifTotalUsd: 1, arancelTotalCop: 0, ivaTotalCop: 0 });
      expect(liquidar.status).toBe(404);
    });
  });
});
