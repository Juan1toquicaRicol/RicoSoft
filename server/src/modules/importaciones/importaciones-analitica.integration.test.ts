import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Analítica de Importaciones V1 — Lead Time, Tiempo de desaduanamiento y
 * Factor de incremento logístico. Los datos de prueba se crean directamente
 * vía Prisma (no a través de los endpoints de flujo) para poder fijar
 * fechas y montos exactos y así verificar la aritmética real de cada KPI,
 * no solo que el endpoint responde 200.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Analítica de Importaciones — /importaciones/analitica (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenASinPermiso: string;
  let tokenB: string;

  // Orden 1: datos completos (lead time, desaduanamiento y factor
  // logístico calculables).
  let ordenCompletaId: string;
  // Orden 2: sin ningún lote/fecha real → debe excluirse de todos los
  // promedios, sin fallar.
  let ordenSinDatosId: string;
  // Orden en otro tenant — nunca debe aparecer.
  let ordenOtroTenantId: string;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Analitica Imp A ${sufijo}`, subdomain: `test-analimp-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Analitica Imp B ${sufijo}`, subdomain: `test-analimp-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `analimp-admin-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    const rolSinPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Sin Permiso Analitica ${sufijo}`,
        permisos: JSON.stringify([]),
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `analimp-sinpermiso-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Permiso",
        rolId: rolSinPermiso.id,
        isSuperadmin: false,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `analimp-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenA = await login(`analimp-admin-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`analimp-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`analimp-admin-b-${sufijo}@test.ricosoft.local`);

    const fechaOrden = new Date("2026-01-01T00:00:00Z");
    const fechaLlegadaReal = new Date("2026-01-21T00:00:00Z"); // +20 días → lead time / puerto
    const fechaLevante = new Date("2026-01-31T00:00:00Z"); // +10 días desde llegada → desaduanamiento

    const ordenCompleta = await prisma.ordenCompraIntl.create({
      data: {
        tenantId: tenantAId,
        numeroOrden: `ANL-${sufijo}-1`,
        incoterm: "FOB",
        proveedorExtranjero: "Proveedor Analitica Test",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        valorEstimadoTotal: 4000000,
        estado: "Confirmada",
        fechaOrden,
        items: {
          create: [{ descripcion: "Item Analitica", cantidad: 100, valorUnitarioFob: 10 }], // FOB USD 1000
        },
      },
      include: { items: true },
    });
    ordenCompletaId = ordenCompleta.id;

    const lote = await prisma.loteImportacion.create({
      data: {
        tenantId: tenantAId,
        ordenCompraId: ordenCompletaId,
        blAwb: `BL-${sufijo}`,
        puertoOrigen: "Shanghai",
        puertoDestino: "Cartagena",
        fechaLlegadaReal,
        estado: "Nacionalizado",
      },
    });

    await prisma.expedienteAduanero.create({
      data: { tenantId: tenantAId, loteId: lote.id, fechaLevante },
    });

    // Landed cost real: FOB USD 1000 * TRM liquidación 4200 = COP 4,200,000
    // (base FOB en COP), costo total definitivo COP 5,460,000 → factor de
    // incremento = (5,460,000 - 4,200,000) / 4,200,000 * 100 = 30%.
    await prisma.costeoImportacionDetalle.create({
      data: {
        tenantId: tenantAId,
        loteId: lote.id,
        itemId: ordenCompleta.items[0].id,
        valorCifUsd: 1050,
        trmLiquidacion: 4200,
        valorCifCop: 4410000,
        arancelCop: 630000,
        ivaTotalCop: 420000,
        cantidad: 100,
        costoTotalCop: 5460000,
        costoUnitarioCop: 54600,
        esProvisional: false,
        fechaLiquidacion: fechaLevante,
      },
    });

    const ordenSinDatos = await prisma.ordenCompraIntl.create({
      data: {
        tenantId: tenantAId,
        numeroOrden: `ANL-${sufijo}-2`,
        incoterm: "FOB",
        proveedorExtranjero: "Proveedor Sin Datos",
        paisOrigen: "México",
        moneda: "USD",
        trmPactada: 4000,
        valorEstimadoTotal: 400000,
        estado: "Confirmada",
        fechaOrden,
        items: {
          create: [{ descripcion: "Item sin liquidar", cantidad: 5, valorUnitarioFob: 20 }],
        },
      },
    });
    ordenSinDatosId = ordenSinDatos.id;

    const ordenOtroTenant = await prisma.ordenCompraIntl.create({
      data: {
        tenantId: tenantBId,
        numeroOrden: `ANL-${sufijo}-OTRO`,
        incoterm: "FOB",
        proveedorExtranjero: "Proveedor Otro Tenant",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        valorEstimadoTotal: 400000,
        estado: "Confirmada",
        fechaOrden,
        items: { create: [{ descripcion: "Item otro tenant", cantidad: 5, valorUnitarioFob: 20 }] },
      },
    });
    ordenOtroTenantId = ordenOtroTenant.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.costeoImportacionDetalle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.expedienteAduanero.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.loteImportacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  // Ambas órdenes de prueba comparten la misma fechaOrden — sin un filtro
  // desde/hasta explícito, la partición automática actual/referencia (ver
  // partirEnPeriodos) dividiría por mitad de la lista y podría dejar la
  // orden completa del lado de "referencia". Se fija un rango explícito que
  // cubre ambas para que el promedio "actual" las incluya a las dos.
  const rangoQuery = "desde=2025-12-01&hasta=2026-02-01";

  it("1. resumen calcula Lead Time real (20 días) usando fechaOrden y fechaLlegadaReal", async () => {
    const res = await request(app)
      .get(`/api/importaciones/analitica/resumen?${rangoQuery}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.leadTime.agregado.promedio).toBeCloseTo(20, 3);
    expect(res.body.leadTime.agregado.cantidadAnalizada).toBe(1);
    // La orden sin lote/fecha queda excluida del promedio pero contada.
    expect(res.body.leadTime.agregado.cantidadExcluida).toBeGreaterThanOrEqual(1);
  });

  it("2. resumen calcula Tiempo de desaduanamiento real (10 días) usando fechaLlegadaReal y fechaLevante", async () => {
    const res = await request(app)
      .get(`/api/importaciones/analitica/resumen?${rangoQuery}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.tiempoDesaduanamiento.agregado.promedio).toBeCloseTo(10, 3);
  });

  it("3. resumen calcula el Factor de incremento logístico real (30%) contra el Landed Cost ya liquidado", async () => {
    const res = await request(app)
      .get(`/api/importaciones/analitica/resumen?${rangoQuery}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.factorIncrementoLogistico.agregado.promedio).toBeCloseTo(30, 3);
  });

  it("4. operaciones sin liquidación quedan excluidas del factor logístico, no fallan", async () => {
    const res = await request(app)
      .get("/api/importaciones/analitica/operaciones")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const sinDatos = res.body.operaciones.find(
      (o: { ordenCompraId: string }) => o.ordenCompraId === ordenSinDatosId,
    );
    expect(sinDatos).toBeDefined();
    expect(sinDatos.excluidoFactorLogistico).toBe(true);
    expect(sinDatos.excluidoLeadTime).toBe(true);
    expect(sinDatos.factorIncrementoLogisticoPct).toBeNull();

    const completa = res.body.operaciones.find(
      (o: { ordenCompraId: string }) => o.ordenCompraId === ordenCompletaId,
    );
    expect(completa.excluidoFactorLogistico).toBe(false);
    expect(completa.leadTimeDias).toBeCloseTo(20, 3);
  });

  it("5. filtro por proveedor limita las operaciones devueltas", async () => {
    const res = await request(app)
      .get("/api/importaciones/analitica/operaciones?paisOrigen=México")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.operaciones).toHaveLength(1);
    expect(res.body.operaciones[0].ordenCompraId).toBe(ordenSinDatosId);
  });

  it("6. tenant isolation: nunca aparecen operaciones de otro tenant", async () => {
    const res = await request(app)
      .get("/api/importaciones/analitica/operaciones")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const ids = res.body.operaciones.map((o: { ordenCompraId: string }) => o.ordenCompraId);
    expect(ids).not.toContain(ordenOtroTenantId);

    const resB = await request(app)
      .get("/api/importaciones/analitica/operaciones")
      .set("Authorization", `Bearer ${tokenB}`);
    const idsB = resB.body.operaciones.map((o: { ordenCompraId: string }) => o.ordenCompraId);
    expect(idsB).toContain(ordenOtroTenantId);
    expect(idsB).not.toContain(ordenCompletaId);
  });

  it("7. un usuario sin el permiso importaciones.ver recibe 403", async () => {
    const res = await request(app)
      .get("/api/importaciones/analitica/resumen")
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(res.status).toBe(403);
  });

  it("8. un tenant sin ninguna importación (nunca creada) devuelve 'datos insuficientes', no error 500", async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantVacio = await prisma.tenant.create({
      data: { nombre: `Analitica Vacio ${sufijo}`, subdomain: `test-analimp-vacio-${sufijo}` },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantVacio.id,
        email: `analimp-vacio-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Vacio",
        isSuperadmin: true,
        activo: true,
      },
    });
    const tokenVacio = await login(`analimp-vacio-${sufijo}@test.ricosoft.local`);

    const res = await request(app)
      .get("/api/importaciones/analitica/resumen")
      .set("Authorization", `Bearer ${tokenVacio}`);
    expect(res.status).toBe(200);
    expect(res.body.leadTime.agregado.promedio).toBeNull();
    expect(res.body.totalOperacionesConsideradas).toBe(0);

    await prisma.auditoria.deleteMany({ where: { tenantId: tenantVacio.id } });
    await prisma.user.deleteMany({ where: { tenantId: tenantVacio.id } });
    await prisma.tenant.delete({ where: { id: tenantVacio.id } });
  });
});
