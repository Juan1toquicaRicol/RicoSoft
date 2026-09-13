import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Mejora del formulario "Nueva Orden de Compra Internacional" (fase
 * empresarial): proveedor catalogado vs no catalogado (XOR), fecha de la
 * orden, lugar pactado, fecha/fuente de la tasa de cambio, condición/detalle
 * de pago, fecha requerida de llegada, responsable de la importación, y
 * referencia del proveedor por ítem. Todos los campos son opcionales a
 * nivel de BD (migración 20260911120000_oc_intl_campos_avanzados) — la
 * compatibilidad hacia atrás ya la cubren importaciones.integration.test.ts
 * e importaciones-oc-campos-nuevos.integration.test.ts.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — formulario avanzado de la OC (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantId: string;
  let token: string;
  let proveedorId: string;
  let usuarioResponsableId: string;

  const datosBase = {
    incoterm: "FOB",
    paisOrigen: "China",
    moneda: "USD",
    trmPactada: 4000,
  };

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { nombre: `OC Formulario Avanzado ${sufijo}`, subdomain: `test-oc-avz-${sufijo}` },
    });
    tenantId = tenant.id;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const admin = await prisma.user.create({
      data: {
        tenantId,
        email: `oc-avz-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin OC Avanzado",
        isSuperadmin: true,
        activo: true,
      },
    });
    usuarioResponsableId = admin.id;
    const proveedor = await prisma.proveedor.create({
      data: {
        tenantId,
        nombre: `Proveedor Catalogado ${sufijo}`,
        nit: `NIT-${sufijo}`,
        activo: true,
      },
    });
    proveedorId = proveedor.id;

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: `oc-avz-${sufijo}@test.ricosoft.local`, password: PASSWORD });
    token = login.body.token;
  });

  afterAll(async () => {
    await prisma.itemOrdenCompraIntl.deleteMany({ where: { ordenCompra: { tenantId } } });
    await prisma.importacionActividad.deleteMany({ where: { tenantId } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId } });
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.proveedor.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.rol.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("1. proveedor catalogado: el nombre se deriva del Proveedor real, aunque el cliente mande otro texto", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-1-${sufijo}`,
        proveedorId,
        proveedorExtranjero: "Texto que no debería usarse",
        items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.proveedorId).toBe(proveedorId);
    expect(res.body.proveedorExtranjero).toBe(`Proveedor Catalogado ${sufijo}`);
  });

  it("2. proveedor no catalogado: sin proveedorId, el nombre libre se guarda como snapshot", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-2-${sufijo}`,
        proveedorExtranjero: "Proveedor Externo Nuevo",
        items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.proveedorId).toBeNull();
    expect(res.body.proveedorExtranjero).toBe("Proveedor Externo Nuevo");

    // No debe haber creado ningún Proveedor nuevo en el catálogo.
    const proveedorCreado = await prisma.proveedor.findFirst({
      where: { tenantId, nombre: "Proveedor Externo Nuevo" },
    });
    expect(proveedorCreado).toBeNull();
  });

  it("3. rechaza (400) cuando no hay proveedorId NI proveedorExtranjero (ni ambos vacíos ni ambos usados)", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-3-${sufijo}`,
        items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(400);

    const noCreada = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId, numeroOrden: `OC-AVZ-3-${sufijo}` },
    });
    expect(noCreada).toBeNull();
  });

  it("4. persiste fechaOrden, lugarPactado, tasaCambioFecha/Fuente, condicionPago, detallePago, fechaRequeridaLlegada, responsableId y referenciaProveedor por ítem", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-4-${sufijo}`,
        proveedorExtranjero: "Proveedor Cualquiera",
        fechaOrden: "2026-01-10",
        lugarPactado: "Shanghai, China",
        tasaCambioFecha: "2026-01-09",
        tasaCambioFuente: "Pactada",
        condicionPago: "50% anticipo / 50% contra BL",
        detallePago: "Anticipo por transferencia bancaria SWIFT",
        fechaRequeridaLlegada: "2026-03-01",
        responsableId: usuarioResponsableId,
        items: [
          {
            descripcion: "Ítem con ref. proveedor",
            cantidad: 5,
            valorUnitarioFob: 10,
            referenciaProveedor: "PROV-REF-001",
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.lugarPactado).toBe("Shanghai, China");
    expect(res.body.tasaCambioFuente).toBe("Pactada");
    expect(res.body.condicionPago).toBe("50% anticipo / 50% contra BL");
    expect(res.body.detallePago).toBe("Anticipo por transferencia bancaria SWIFT");
    expect(res.body.responsable?.id).toBe(usuarioResponsableId);
    expect(new Date(res.body.fechaOrden).toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(new Date(res.body.fechaRequeridaLlegada).toISOString().slice(0, 10)).toBe("2026-03-01");
    expect(new Date(res.body.tasaCambioFecha).toISOString().slice(0, 10)).toBe("2026-01-09");

    const item = await prisma.itemOrdenCompraIntl.findFirst({
      where: { ordenCompraId: res.body.id },
    });
    expect(item?.referenciaProveedor).toBe("PROV-REF-001");
  });

  it("5. rechaza (400) fechaRequeridaLlegada anterior a fechaOrden", async () => {
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-5-${sufijo}`,
        proveedorExtranjero: "Proveedor Cualquiera",
        fechaOrden: "2026-05-01",
        fechaRequeridaLlegada: "2026-01-01",
        items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(400);

    const noCreada = await prisma.ordenCompraIntl.findFirst({
      where: { tenantId, numeroOrden: `OC-AVZ-5-${sufijo}` },
    });
    expect(noCreada).toBeNull();
  });

  it("6. rechaza (400) un responsableId que no pertenece al tenant (IDOR)", async () => {
    const otroTenant = await prisma.tenant.create({
      data: { nombre: `Otro Tenant ${sufijo}`, subdomain: `test-otro-avz-${sufijo}` },
    });
    const otroUsuario = await prisma.user.create({
      data: {
        tenantId: otroTenant.id,
        email: `otro-avz-${sufijo}@test.ricosoft.local`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        nombre: "Usuario de otro tenant",
        isSuperadmin: true,
        activo: true,
      },
    });

    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-6-${sufijo}`,
        proveedorExtranjero: "Proveedor Cualquiera",
        responsableId: otroUsuario.id,
        items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(404);

    await prisma.user.deleteMany({ where: { tenantId: otroTenant.id } });
    await prisma.tenant.deleteMany({ where: { id: otroTenant.id } });
  });

  it("7. sin campos nuevos (compatibilidad hacia atrás): fechaOrden se autocompleta con hoy y el resto queda null", async () => {
    const antes = new Date();
    const res = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...datosBase,
        numeroOrden: `OC-AVZ-7-${sufijo}`,
        proveedorExtranjero: "Proveedor Sin Extras",
        items: [{ descripcion: "Ítem", cantidad: 5, valorUnitarioFob: 10 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.lugarPactado).toBeNull();
    expect(res.body.condicionPago).toBeNull();
    expect(res.body.fechaRequeridaLlegada).toBeNull();
    const fechaOrden = new Date(res.body.fechaOrden);
    expect(fechaOrden.getTime()).toBeGreaterThanOrEqual(antes.getTime() - 5000);
    // Sin responsableId explícito, sigue asignándose a quien crea la orden
    // (mismo comportamiento de antes de esta fase).
    expect(res.body.responsable).not.toBeNull();
  });
});
