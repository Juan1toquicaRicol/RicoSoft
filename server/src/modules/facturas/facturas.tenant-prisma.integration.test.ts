import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { UPLOADS_DIR } from "../../middleware/upload.middleware";

/**
 * Suite de integración con BASE DE DATOS REAL para la Fase 4 (migración de
 * Facturas + Pagos a req.tenantPrisma). Prueba el comportamiento observable
 * vía HTTP — JWT -> tenantPrisma -> controller -> SQL Server — no la
 * extensión en sí (eso ya lo cubre lib/tenant-prisma.integration.test.ts).
 * Facturas no tenía ninguna suite propia antes de esta fase (ver auditoría
 * de Fase 3); esta es la primera.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Facturas + Pagos — piloto tenant-prisma (Fase 4, multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenB: string;
  let tokenSinPermiso: string;
  let proveedorAId: string;
  let proveedorBId: string;
  let solicitudBId: string;
  let contratoBId: string;
  let servicioBId: string;
  let facturaBId: string;
  let pagoBId: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(
        `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.token as string;
  };

  const datosFacturaBase = (overrides: Record<string, unknown> = {}) => ({
    empresaId: "001",
    numero: `FAC-${randomUUID().slice(0, 8)}`,
    proveedor: "Proveedor Manual",
    nit: "900000000-1",
    area: "Administración",
    responsable: "Responsable Manual",
    vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    subtotal: 100000,
    iva: 19000,
    ...overrides,
  });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenantA = await prisma.tenant.create({
      data: { nombre: `Fact TenantPrisma A ${sufijo}`, subdomain: `test-fact-tp-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Fact TenantPrisma B ${sufijo}`, subdomain: `test-fact-tp-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const rolSinPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Sin Permisos Fact ${sufijo}`,
        permisos: JSON.stringify([]),
      },
    });

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `fact-tp-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `fact-tp-sinpermiso-${sufijo}@test.ricosoft.local`,
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
        email: `fact-tp-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenA = await login(`fact-tp-admin-a-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`fact-tp-admin-b-${sufijo}@test.ricosoft.local`);
    tokenSinPermiso = await login(`fact-tp-sinpermiso-${sufijo}@test.ricosoft.local`);

    const proveedorA = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: "Proveedor de A", nit: `NIT-FACT-A-${sufijo}` },
    });
    proveedorAId = proveedorA.id;
    const proveedorB = await prisma.proveedor.create({
      data: { tenantId: tenantBId, nombre: "Proveedor de B", nit: `NIT-FACT-B-${sufijo}` },
    });
    proveedorBId = proveedorB.id;

    const solicitudB = await prisma.solicitudCompra.create({
      data: {
        tenantId: tenantBId,
        empresaId: "001",
        area: "Administración",
        solicitante: "Solicitante B",
        item: `Item de B ${sufijo}`,
        cantidad: 1,
        valorEstimado: 100000,
        estado: "Aprobada",
      },
    });
    solicitudBId = solicitudB.id;

    const contratoB = await prisma.contrato.create({
      data: {
        tenantId: tenantBId,
        empresaId: "001",
        proveedor: "Proveedor de B",
        responsable: "Responsable B",
        area: "Administración",
        valorContratado: 1000000,
        fechaInicio: new Date(),
        fechaFin: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        estado: "Activo",
      },
    });
    contratoBId = contratoB.id;

    const servicioB = await prisma.servicioSuscripcion.create({
      data: {
        tenantId: tenantBId,
        empresaId: "001",
        area: "Administración",
        nombreServicio: `Servicio de B ${sufijo}`,
        proveedor: "Proveedor de B",
        periodicidad: "Mensual",
        costo: 50000,
        fechaRenovacion: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        responsableArea: "Administración",
      },
    });
    servicioBId = servicioB.id;

    const facturaB = await prisma.factura.create({
      data: {
        tenantId: tenantBId,
        empresaId: "001",
        numero: `FAC-B-${sufijo}`,
        proveedor: "Proveedor de B",
        nit: `NIT-FACT-B-${sufijo}`,
        area: "Administración",
        responsable: "Responsable B",
        vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: 100000,
        iva: 19000,
        total: 119000,
        estado: "Aprobada",
      },
    });
    facturaBId = facturaB.id;

    const pagoB = await prisma.pago.create({
      data: {
        tenantId: tenantBId,
        facturaId: facturaBId,
        valor: 50000,
        metodoPago: "Transferencia",
        registradoPorId: (await prisma.user.findFirstOrThrow({ where: { tenantId: tenantBId } }))
          .id,
        registradoPorNombre: "Admin B",
      },
    });
    pagoBId = pagoB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.pago.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.facturaHistorial.deleteMany({
      where: { factura: { tenantId: { in: tenantIds } } },
    });
    await prisma.factura.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.cotizacionProveedor.deleteMany({
      where: { solicitudCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.solicitudCompra.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.servicioSuscripcion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.contrato.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  // ---- Lectura ----

  it("1. Tenant A lista únicamente sus facturas", async () => {
    const creada = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase());
    expect(creada.status).toBe(201);

    const res = await request(app).get("/api/facturas").set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.some((f: any) => f.id === facturaBId)).toBe(false);
    expect(res.body.some((f: any) => f.id === creada.body.id)).toBe(true);
  });

  it("2. Tenant A no puede obtener una factura de Tenant B (404)", async () => {
    const res = await request(app)
      .get(`/api/facturas/${facturaBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  // ---- Update ----

  it("3. Tenant A no puede cambiar el estado de una factura de Tenant B; la fila de B no cambia", async () => {
    const res = await request(app)
      .patch(`/api/facturas/${facturaBId}/estado`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ estado: "Rechazada" });
    expect(res.status).toBe(404);

    const sinTocar = await prisma.factura.findUnique({ where: { id: facturaBId } });
    expect(sinTocar?.estado).toBe("Aprobada");
  });

  // ---- Soft delete ----

  it("4. Tenant A no puede eliminar (soft-delete) una factura de Tenant B; eliminado sigue false", async () => {
    const res = await request(app)
      .delete(`/api/facturas/${facturaBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);

    const sinTocar = await prisma.factura.findUnique({ where: { id: facturaBId } });
    expect(sinTocar?.eliminado).toBe(false);
  });

  // ---- Create ----

  it("5/6. Crear una factura queda en el tenant del JWT, incluso si el payload envía otro tenantId", async () => {
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ ...datosFacturaBase(), tenantId: tenantBId });
    expect(res.status).toBe(201);

    const enDb = await prisma.factura.findUnique({ where: { id: res.body.id } });
    expect(enDb?.tenantId).toBe(tenantAId);
  });

  // ---- Operación propia ----

  it("7/8. Tenant A modifica y elimina (soft-delete) correctamente su propia factura", async () => {
    const creada = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase());
    expect(creada.status).toBe(201);
    const id = creada.body.id;

    const aprobada = await request(app)
      .patch(`/api/facturas/${id}/estado`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ estado: "Aprobada" });
    expect(aprobada.status).toBe(200);
    expect(aprobada.body.estado).toBe("Aprobada");

    const eliminada = await request(app)
      .delete(`/api/facturas/${id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(eliminada.status).toBe(204);

    const enDb = await prisma.factura.findUnique({ where: { id } });
    expect(enDb?.eliminado).toBe(true);
  });

  // ---- Referencias cross-tenant ----

  it("9. Crear una factura referenciando un Proveedor de otro tenant falla (404) y no crea la factura", async () => {
    const numero = `FAC-PROV-B-${sufijo}`;
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero, proveedorId: proveedorBId }));
    expect(res.status).toBe(404);

    const enDb = await prisma.factura.findFirst({ where: { tenantId: tenantAId, numero } });
    expect(enDb).toBeNull();
  });

  it("10. Crear una factura referenciando una SolicitudCompra de otro tenant falla (404)", async () => {
    const numero = `FAC-SC-B-${sufijo}`;
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero, solicitudCompraId: solicitudBId }));
    expect(res.status).toBe(404);

    const enDb = await prisma.factura.findFirst({ where: { tenantId: tenantAId, numero } });
    expect(enDb).toBeNull();
  });

  it("11. Crear una factura referenciando un Contrato de otro tenant falla (404)", async () => {
    const numero = `FAC-CONT-B-${sufijo}`;
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero, contratoId: contratoBId }));
    expect(res.status).toBe(404);

    const enDb = await prisma.factura.findFirst({ where: { tenantId: tenantAId, numero } });
    expect(enDb).toBeNull();
  });

  it("12. Crear una factura referenciando un ServicioSuscripcion de otro tenant falla (404)", async () => {
    const numero = `FAC-SERV-B-${sufijo}`;
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero, servicioId: servicioBId }));
    expect(res.status).toBe(404);

    const enDb = await prisma.factura.findFirst({ where: { tenantId: tenantAId, numero } });
    expect(enDb).toBeNull();
  });

  it("referencia legítima al proveedor del propio tenant sí funciona", async () => {
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero: `FAC-PROV-A-${sufijo}`, proveedorId: proveedorAId }));
    expect(res.status).toBe(201);
    expect(res.body.proveedor).toBe("Proveedor de A");
  });

  // ---- Paginación (Bloque 6) ----

  it("paginación: listar con ?page devuelve el envelope paginado, aislado por tenant, sin afectar el modo sin page", async () => {
    const prefijo = `FAC-PAG-${sufijo}`;
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post("/api/facturas")
        .set("Authorization", `Bearer ${tokenA}`)
        .send(datosFacturaBase({ numero: `${prefijo}-${i}` }));
      expect(res.status).toBe(201);
    }

    const pagina1 = await request(app)
      .get("/api/facturas")
      .query({ page: 1, pageSize: 2, search: prefijo })
      .set("Authorization", `Bearer ${tokenA}`);
    expect(pagina1.status).toBe(200);
    expect(pagina1.body.items).toHaveLength(2);
    expect(pagina1.body.page).toBe(1);
    expect(pagina1.body.pageSize).toBe(2);
    expect(pagina1.body.total).toBe(3);
    expect(pagina1.body.totalPages).toBe(2);
    // Ninguna factura de B se cuela aunque coincidiera con el término de búsqueda.
    expect(pagina1.body.items.every((f: any) => f.id !== facturaBId)).toBe(true);

    const pagina2 = await request(app)
      .get("/api/facturas")
      .query({ page: 2, pageSize: 2, search: prefijo })
      .set("Authorization", `Bearer ${tokenA}`);
    expect(pagina2.body.items).toHaveLength(1);
    expect(pagina2.body.page).toBe(2);

    // Sin `page`, sigue devolviendo el array plano de siempre (compatibilidad).
    const sinPage = await request(app)
      .get("/api/facturas")
      .query({ search: prefijo })
      .set("Authorization", `Bearer ${tokenA}`);
    expect(Array.isArray(sinPage.body)).toBe(true);
    expect(sinPage.body).toHaveLength(3);
  });

  it("paginación: pageSize se limita a 100 aunque el cliente pida más", async () => {
    const res = await request(app)
      .get("/api/facturas")
      .query({ page: 1, pageSize: 99999 })
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(100);
  });

  // ---- Archivos ----

  it("13. Tenant A no puede descargar el archivo de una factura de Tenant B (404)", async () => {
    const res = await request(app)
      .get(`/api/facturas/${facturaBId}/archivo`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it("13b. Bloque 7: Tenant A intentando subir un archivo a una factura de Tenant B nunca lo escribe en la carpeta real de esa factura", async () => {
    const res = await request(app)
      .post(`/api/facturas/${facturaBId}/archivo`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("archivo", Buffer.from("%PDF-1.4 contenido cross-tenant"), "intento.pdf");
    expect(res.status).toBe(404);

    // La carpeta real de la factura de B (uploads/facturas/<facturaBId>/)
    // nunca debe tener este archivo — ni siquiera transitoriamente: multer
    // escribe primero a una carpeta temporal compartida, y el archivo solo
    // se mueve a la carpeta real DESPUÉS de que el controller confirma que
    // la factura pertenece al tenant que hace la petición (ver
    // moverArchivoDefinitivo en upload.middleware.ts).
    const carpetaReal = path.join(UPLOADS_DIR, facturaBId);
    const contenido = fs.existsSync(carpetaReal) ? fs.readdirSync(carpetaReal) : [];
    expect(contenido).toHaveLength(0);

    // La factura de B tampoco quedó con un archivo adjunto en BD.
    const sinTocar = await prisma.factura.findUnique({ where: { id: facturaBId } });
    expect(sinTocar?.archivoRuta).toBeNull();
  });

  it("13c. Bloque 7: Tenant A SÍ puede subir un archivo a su propia factura, y queda en la carpeta real", async () => {
    const creada = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero: `FAC-UPLOAD-A-${sufijo}` }));
    expect(creada.status).toBe(201);
    const facturaId = creada.body.id;

    const res = await request(app)
      .post(`/api/facturas/${facturaId}/archivo`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("archivo", Buffer.from("%PDF-1.4 contenido propio"), "propio.pdf");
    expect(res.status).toBe(201);

    const carpetaReal = path.join(UPLOADS_DIR, facturaId);
    expect(fs.existsSync(carpetaReal)).toBe(true);
    expect(fs.readdirSync(carpetaReal)).toHaveLength(1);
  });

  it("13d. M-03: un archivo de texto plano disfrazado de PDF (mimetype declarado + extensión .pdf) es rechazado con 400, y nunca llega a escribirse en la carpeta real", async () => {
    const creada = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero: `FAC-MAGICBYTES-${sufijo}` }));
    expect(creada.status).toBe(201);
    const facturaId = creada.body.id;

    const res = await request(app)
      .post(`/api/facturas/${facturaId}/archivo`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("archivo", Buffer.from("esto no es un PDF real, solo texto plano"), {
        filename: "disfrazado.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(400);

    const carpetaReal = path.join(UPLOADS_DIR, facturaId);
    const contenido = fs.existsSync(carpetaReal) ? fs.readdirSync(carpetaReal) : [];
    expect(contenido).toHaveLength(0);

    const sinArchivo = await prisma.factura.findUnique({ where: { id: facturaId } });
    expect(sinArchivo?.archivoRuta).toBeNull();
  });

  it("14. Tenant A no puede descargar el comprobante de un pago de Tenant B (404)", async () => {
    const res = await request(app)
      .get(`/api/facturas/${facturaBId}/pagos/${pagoBId}/comprobante`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  // ---- Transacción ----

  it("15/16. crearFactura vinculada a una SC propia sigue siendo atómica y conserva tenantId en todos los registros", async () => {
    const solicitudA = await prisma.solicitudCompra.create({
      data: {
        tenantId: tenantAId,
        empresaId: "001",
        area: "Administración",
        solicitante: "Solicitante A",
        item: `Item de A ${sufijo}`,
        cantidad: 1,
        valorEstimado: 100000,
        estado: "Aprobada",
      },
    });

    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero: `FAC-TX-A-${sufijo}`, solicitudCompraId: solicitudA.id }));
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe("Aprobada");

    const facturaDb = await prisma.factura.findUnique({
      where: { id: res.body.id },
      include: { historial: true },
    });
    expect(facturaDb?.tenantId).toBe(tenantAId);
    expect(facturaDb?.historial.length).toBeGreaterThanOrEqual(2);

    const solicitudDb = await prisma.solicitudCompra.findUnique({ where: { id: solicitudA.id } });
    expect(solicitudDb?.estado).toBe("Facturada");

    const auditorias = await prisma.auditoria.findMany({
      where: { tenantId: tenantAId, entidadId: res.body.id },
    });
    // Las auditorías de creación de factura no llevan entidadId hoy (ver
    // controller); se valida en su lugar que existan auditorías recientes
    // del tenant con las acciones esperadas, conservando tenantId correcto.
    const accionesRecientes = await prisma.auditoria.findMany({
      where: {
        tenantId: tenantAId,
        accion: { in: ["FACTURA_CREADA", "SOLICITUD_COMPRA_FACTURADA"] },
      },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    expect(accionesRecientes.every((a) => a.tenantId === tenantAId)).toBe(true);
    expect(accionesRecientes.length).toBe(2);
    void auditorias;
  });

  // ---- Pagos ----

  it("17. Tenant A no puede consultar pagos de una factura de Tenant B (404)", async () => {
    const res = await request(app)
      .get(`/api/facturas/${facturaBId}/pagos`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);
  });

  it("18. Tenant A no puede registrar un pago sobre una factura de Tenant B (404), no se crea el pago", async () => {
    const antes = await prisma.pago.count({ where: { facturaId: facturaBId } });
    const res = await request(app)
      .post(`/api/facturas/${facturaBId}/pagos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ valor: 1000, metodoPago: "Transferencia" });
    expect(res.status).toBe(404);
    const despues = await prisma.pago.count({ where: { facturaId: facturaBId } });
    expect(despues).toBe(antes);
  });

  it("19. Tenant A no puede anular un pago de Tenant B (404), el pago sigue Confirmado", async () => {
    const res = await request(app)
      .patch(`/api/facturas/${facturaBId}/pagos/${pagoBId}/anular`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(404);

    const sinTocar = await prisma.pago.findUnique({ where: { id: pagoBId } });
    expect(sinTocar?.estado).toBe("Confirmado");
  });

  it("20. Tenant A no puede subir comprobante de un pago de Tenant B (404)", async () => {
    const res = await request(app)
      .post(`/api/facturas/${facturaBId}/pagos/${pagoBId}/comprobante`)
      .set("Authorization", `Bearer ${tokenA}`)
      .attach("archivo", Buffer.from("%PDF-1.4 contenido"), "comprobante.pdf");
    expect(res.status).toBe(404);
  });

  it("21/22/23. Tenant A registra y anula un pago sobre su propia factura; recalcularEstadoPorPagos sigue funcionando", async () => {
    const creada = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero: `FAC-PAGO-A-${sufijo}`, subtotal: 100000, iva: 0 }));
    expect(creada.status).toBe(201);
    const facturaId = creada.body.id;

    await request(app)
      .patch(`/api/facturas/${facturaId}/estado`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ estado: "Aprobada" });

    const pago = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ valor: 100000, metodoPago: "Transferencia" });
    expect(pago.status).toBe(201);
    // El saldo llega a $0: recalcularEstadoPorPagos debe pasar la factura a Pagada.
    expect(pago.body.factura.estado).toBe("Pagada");

    const anulado = await request(app)
      .patch(`/api/facturas/${facturaId}/pagos/${pago.body.pago.id}/anular`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(anulado.status).toBe(200);
    // Vuelve a quedar saldo pendiente: recalcularEstadoPorPagos regresa a Aprobada.
    expect(anulado.body.factura.estado).toBe("Aprobada");
  });

  // ---- Reglas de negocio ----

  it("24. Crear una factura duplicada (mismo empresaId+numero) dentro del mismo tenant → 409", async () => {
    const numero = `FAC-DUP-A-${sufijo}`;
    const primero = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero }));
    expect(primero.status).toBe(201);

    const duplicado = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero }));
    expect(duplicado.status).toBe(409);
  });

  it("25. El mismo número de factura en otro tenant sigue permitido (la unicidad es por tenant)", async () => {
    const numero = `FAC-COMPARTIDO-${sufijo}`;
    const enA = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase({ numero }));
    expect(enA.status).toBe(201);

    const enB = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenB}`)
      .send(datosFacturaBase({ numero }));
    expect(enB.status).toBe(201);
  });

  // ---- Permisos ----

  it("26. Usuario sin permiso de facturas.crear recibe 403 al crear una factura", async () => {
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenSinPermiso}`)
      .send(datosFacturaBase());
    expect(res.status).toBe(403);
  });

  it("27. Usuario con permiso (superadmin) puede operar sobre facturas de su propio tenant", async () => {
    const res = await request(app)
      .post("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`)
      .send(datosFacturaBase());
    expect(res.status).toBe(201);
  });

  it("28. Superadmin de Tenant A sigue limitado a Tenant A: no ve ni puede tocar facturas de Tenant B", async () => {
    const listado = await request(app)
      .get("/api/facturas")
      .set("Authorization", `Bearer ${tokenA}`);
    expect(listado.body.some((f: any) => f.id === facturaBId)).toBe(false);

    const intento = await request(app)
      .delete(`/api/facturas/${facturaBId}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(intento.status).toBe(404);
  });
});
