import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Hallazgos A-02 (sobrepago) y M-09 (atomicidad de pagos), auditoría
 * 2026-09-02. registrarPago ahora valida el pago contra el saldo pendiente
 * real (suma de pagos Confirmado) y envuelve create+historial+recálculo+
 * auditoría en un $transaction. Esta suite prueba el comportamiento
 * observable con BD real, incluyendo el caso de concurrencia exigido por el
 * prompt de hardening.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Pagos — sobrepago, atomicidad y concurrencia (A-02/M-09, BD real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let token: string;

  const login = async (email: string): Promise<string> => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200 || !res.body.token) {
      throw new Error(`Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.token as string;
  };

  const crearFacturaAprobada = async (total: number) => {
    const factura = await prisma.factura.create({
      data: {
        tenantId,
        empresaId: "001",
        numero: `FAC-HARD-${randomUUID().slice(0, 8)}`,
        proveedor: "Proveedor Hardening",
        nit: "900000000-1",
        area: "Administración",
        responsable: "Responsable Hardening",
        vence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: total,
        iva: 0,
        total,
        estado: "Aprobada",
      },
    });
    return factura.id;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const tenant = await prisma.tenant.create({
      data: { nombre: `Pagos Hardening ${sufijo}`, subdomain: `test-pagos-hard-${sufijo}` },
    });
    tenantId = tenant.id;
    await prisma.user.create({
      data: {
        tenantId,
        email: `pagos-hard-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin",
        isSuperadmin: true,
        activo: true,
      },
    });
    token = await login(`pagos-hard-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.pago.deleteMany({ where: { tenantId } });
    await prisma.facturaHistorial.deleteMany({ where: { factura: { tenantId } } });
    await prisma.factura.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("1. Pago parcial (500.000 de 1.000.000): permitido, saldo queda en 500.000, factura sigue Aprobada", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);
    const res = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 500_000, metodoPago: "Transferencia" });
    expect(res.status).toBe(201);
    expect(res.body.factura.estado).toBe("Aprobada");

    const pagos = await request(app)
      .get(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`);
    expect(pagos.body.saldoPendiente).toBe(500_000);
  });

  it("2. Pago exacto (1.000.000 de 1.000.000): permitido, saldo 0, factura pasa a Pagada", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);
    const res = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 1_000_000, metodoPago: "Transferencia" });
    expect(res.status).toBe(201);
    expect(res.body.factura.estado).toBe("Pagada");
  });

  it("3. Pago superior al saldo (1.000.001 de 1.000.000): rechazado con 409, no se crea el pago", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);
    const antes = await prisma.pago.count({ where: { facturaId } });
    const res = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 1_000_001, metodoPago: "Transferencia" });
    expect(res.status).toBe(409);
    const despues = await prisma.pago.count({ where: { facturaId } });
    expect(despues).toBe(antes);
  });

  it("4. Un segundo pago que sumado al primero supera el saldo restante es rechazado (409)", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);
    const primero = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 700_000, metodoPago: "Transferencia" });
    expect(primero.status).toBe(201);

    const segundo = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 400_000, metodoPago: "Transferencia" }); // 700k + 400k > 1.000.000
    expect(segundo.status).toBe(409);

    const pagosDb = await prisma.pago.findMany({ where: { facturaId, estado: "Confirmado" } });
    expect(pagosDb.reduce((acc, p) => acc + Number(p.valor), 0)).toBe(700_000);
  });

  it("5. Pago con valor 0: rechazado con 400 (validación de esquema/controlador, no llega a tocar saldo)", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);
    const res = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 0, metodoPago: "Transferencia" });
    expect(res.status).toBe(400);
  });

  it("6. Pago con valor negativo: rechazado con 400", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);
    const res = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: -100_000, metodoPago: "Transferencia" });
    expect(res.status).toBe(400);
  });

  it("7. CONCURRENCIA (obligatoria): dos pagos de 800.000 simultáneos sobre una factura de 1.000.000 — uno permitido, el otro rechazado; nunca ambos", async () => {
    const facturaId = await crearFacturaAprobada(1_000_000);

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/facturas/${facturaId}/pagos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ valor: 800_000, metodoPago: "Transferencia", referencia: "A" }),
      request(app)
        .post(`/api/facturas/${facturaId}/pagos`)
        .set("Authorization", `Bearer ${token}`)
        .send({ valor: 800_000, metodoPago: "Transferencia", referencia: "B" }),
    ]);

    const estados = [resA.status, resB.status].sort();
    const totalConfirmado = (
      await prisma.pago.findMany({ where: { facturaId, estado: "Confirmado" } })
    ).reduce((acc, p) => acc + Number(p.valor), 0);

    // Nunca debe permitirse sobrepago, sin importar cómo se resuelva la
    // carrera entre las dos transacciones concurrentes.
    expect(totalConfirmado).toBeLessThanOrEqual(1_000_000);
    // Exactamente uno de los dos gana el saldo (201); el perdedor recibe un
    // rechazo controlado — 409 tanto si perdió por saldo insuficiente como
    // si perdió por el deadlock conocido de SQL Server entre ambas
    // transacciones (M-10: P2034 se traduce a 409, nunca a 500).
    expect(estados).toEqual([201, 409]);
  });

  it("8. M-09: si se anula un pago que dejó la factura en 'Pagada', la factura vuelve a 'Aprobada' de forma atómica (no queda en un estado intermedio)", async () => {
    const facturaId = await crearFacturaAprobada(300_000);
    const pago = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 300_000, metodoPago: "Efectivo" });
    expect(pago.body.factura.estado).toBe("Pagada");

    const anulado = await request(app)
      .patch(`/api/facturas/${facturaId}/pagos/${pago.body.pago.id}/anular`)
      .set("Authorization", `Bearer ${token}`);
    expect(anulado.status).toBe(200);
    expect(anulado.body.factura.estado).toBe("Aprobada");

    const facturaDb = await prisma.factura.findUnique({ where: { id: facturaId } });
    expect(facturaDb?.estado).toBe("Aprobada");
    const pagoDb = await prisma.pago.findUnique({ where: { id: pago.body.pago.id } });
    expect(pagoDb?.estado).toBe("Anulado");
  });

  it("9. M-04 adyacente: el registro de auditoría de PAGO_REGISTRADO incluye entidadTipo/entidadId/datosNuevos completos", async () => {
    const facturaId = await crearFacturaAprobada(200_000);
    const pago = await request(app)
      .post(`/api/facturas/${facturaId}/pagos`)
      .set("Authorization", `Bearer ${token}`)
      .send({ valor: 200_000, metodoPago: "Cheque" });
    expect(pago.status).toBe(201);

    const auditoria = await prisma.auditoria.findFirst({
      where: { tenantId, accion: "PAGO_REGISTRADO", entidadId: pago.body.pago.id },
      orderBy: { createdAt: "desc" },
    });
    expect(auditoria).not.toBeNull();
    expect(auditoria?.entidadTipo).toBe("Pago");
    expect(auditoria?.datosNuevos).not.toBeNull();
    const datos = JSON.parse(auditoria!.datosNuevos!);
    expect(datos.facturaId).toBe(facturaId);
    expect(datos.estadoFactura).toBe("Pagada");
  });
});
