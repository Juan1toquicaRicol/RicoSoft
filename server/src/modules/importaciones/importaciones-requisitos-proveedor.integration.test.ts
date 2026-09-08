import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Proveedores y Requisitos — nueva sección del módulo de Importaciones.
 * RequisitoProveedorImportacion es tenant-scoped (vía tenantPrisma, ver
 * MODELOS_TENANT_SCOPED) y referencia VIVA (decisión explícita de esta
 * fase, ver comentario en schema.prisma): la orden que consulta los
 * requisitos de su proveedor siempre ve los vigentes, sin snapshot.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — Proveedores y Requisitos (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let tokenA: string;
  let tokenASinPermiso: string;
  let tokenB: string;
  let proveedorAId: string;
  let proveedorBId: string;

  const login = async (email: string) => {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Requisitos A ${sufijo}`, subdomain: `test-requi-a-${sufijo}` },
    });
    tenantAId = tenantA.id;
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Requisitos B ${sufijo}`, subdomain: `test-requi-b-${sufijo}` },
    });
    tenantBId = tenantB.id;

    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `requi-admin-a-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin A",
        isSuperadmin: true,
        activo: true,
      },
    });
    const rolSinPermiso = await prisma.rol.create({
      data: {
        tenantId: tenantAId,
        nombre: `Sin Permiso Requi ${sufijo}`,
        permisos: JSON.stringify([]),
      },
    });
    await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `requi-sinpermiso-${sufijo}@test.ricosoft.local`,
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
        email: `requi-admin-b-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin B",
        isSuperadmin: true,
        activo: true,
      },
    });

    tokenA = await login(`requi-admin-a-${sufijo}@test.ricosoft.local`);
    tokenASinPermiso = await login(`requi-sinpermiso-${sufijo}@test.ricosoft.local`);
    tokenB = await login(`requi-admin-b-${sufijo}@test.ricosoft.local`);

    proveedorAId = (
      await prisma.proveedor.create({
        data: { tenantId: tenantAId, nombre: `Proveedor Chino X ${sufijo}`, nit: `800${sufijo}1` },
      })
    ).id;
    proveedorBId = (
      await prisma.proveedor.create({
        data: { tenantId: tenantBId, nombre: `Proveedor Chino Y ${sufijo}`, nit: `800${sufijo}2` },
      })
    ).id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.requisitoProveedorImportacion.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proveedor.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  let requisitoCertificadoId: string;

  it("13. crear un requisito para un proveedor", async () => {
    const res = await request(app)
      .post(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "DOCUMENTO", nombre: "Certificado de origen", obligatorio: true, orden: 1 });
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe("Certificado de origen");
    requisitoCertificadoId = res.body.id;
  });

  it("14. editar un requisito", async () => {
    const res = await request(app)
      .patch(`/api/importaciones/proveedores/requisitos/${requisitoCertificadoId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ descripcion: "Debe venir apostillado", orden: 2 });
    expect(res.status).toBe(200);
    expect(res.body.descripcion).toBe("Debe venir apostillado");
    expect(res.body.orden).toBe(2);
  });

  it("15. activar/desactivar un requisito", async () => {
    const desactivado = await request(app)
      .patch(`/api/importaciones/proveedores/requisitos/${requisitoCertificadoId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ activo: false });
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.activo).toBe(false);

    const listaSoloActivos = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(
      listaSoloActivos.body.requisitos.some((r: { id: string }) => r.id === requisitoCertificadoId),
    ).toBe(false);

    const listaConInactivos = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorAId}/requisitos?incluirInactivos=true`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(
      listaConInactivos.body.requisitos.some(
        (r: { id: string }) => r.id === requisitoCertificadoId,
      ),
    ).toBe(true);

    const reactivado = await request(app)
      .patch(`/api/importaciones/proveedores/requisitos/${requisitoCertificadoId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ activo: true });
    expect(reactivado.body.activo).toBe(true);
  });

  it("16. obligatorio true/false se respeta", async () => {
    const opcional = await request(app)
      .post(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "DOCUMENTO", nombre: "Foto del embalaje", obligatorio: false });
    expect(opcional.status).toBe(201);
    expect(opcional.body.obligatorio).toBe(false);
  });

  it("17. orden se respeta y permite reordenar", async () => {
    const res = await request(app)
      .post(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "PAGO", nombre: "Anticipo 30%", orden: 0 });
    expect(res.status).toBe(201);
    expect(res.body.orden).toBe(0);
  });

  it("18. un proveedor con múltiples requisitos los lista todos", async () => {
    const res = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorAId}/requisitos?incluirInactivos=true`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.requisitos.length).toBeGreaterThanOrEqual(3);
  });

  it("19. un proveedor sin requisitos devuelve lista vacía, no error", async () => {
    const proveedorSinRequisitos = await prisma.proveedor.create({
      data: { tenantId: tenantAId, nombre: `Sin Requisitos ${sufijo}`, nit: `800${sufijo}3` },
    });
    const res = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorSinRequisitos.id}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.requisitos).toEqual([]);
  });

  it("20. no se puede crear un requisito para un proveedor de OTRO tenant (404, no se crea)", async () => {
    const res = await request(app)
      .post(`/api/importaciones/proveedores/${proveedorBId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "DOCUMENTO", nombre: "Packing List" });
    expect(res.status).toBe(404);

    const noCreado = await prisma.requisitoProveedorImportacion.findFirst({
      where: { proveedorId: proveedorBId, nombre: "Packing List" },
    });
    expect(noCreado).toBeNull();
  });

  it("21. IDOR: no se puede editar ni eliminar un requisito de OTRO tenant por id directo (404)", async () => {
    const requisitoB = await prisma.requisitoProveedorImportacion.create({
      data: {
        tenantId: tenantBId,
        proveedorId: proveedorBId,
        tipo: "DOCUMENTO",
        nombre: "Packing List de B",
      },
    });

    const editar = await request(app)
      .patch(`/api/importaciones/proveedores/requisitos/${requisitoB.id}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Hackeado" });
    expect(editar.status).toBe(404);

    const eliminar = await request(app)
      .delete(`/api/importaciones/proveedores/requisitos/${requisitoB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(eliminar.status).toBe(404);

    const sinTocar = await prisma.requisitoProveedorImportacion.findUnique({
      where: { id: requisitoB.id },
    });
    expect(sinTocar?.nombre).toBe("Packing List de B");
  });

  it("22. permisos: un usuario sin importaciones.requisitos_* recibe 403 en cada operación", async () => {
    const listar = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(listar.status).toBe(403);

    const crear = await request(app)
      .post(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ tipo: "DOCUMENTO", nombre: "Intento" });
    expect(crear.status).toBe(403);

    const editar = await request(app)
      .patch(`/api/importaciones/proveedores/requisitos/${requisitoCertificadoId}`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`)
      .send({ nombre: "Intento" });
    expect(editar.status).toBe(403);

    const eliminar = await request(app)
      .delete(`/api/importaciones/proveedores/requisitos/${requisitoCertificadoId}`)
      .set("Authorization", `Bearer ${tokenASinPermiso}`);
    expect(eliminar.status).toBe(403);
  });

  it("23. cada mutación (crear/editar/eliminar) deja un registro en Auditoria del tenant correcto", async () => {
    const creado = await request(app)
      .post(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "ESPECIFICACION", nombre: "Confirmar dimensiones" });
    const requisitoId = creado.body.id;

    await request(app)
      .patch(`/api/importaciones/proveedores/requisitos/${requisitoId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ nombre: "Confirmar dimensiones exactas" });

    await request(app)
      .delete(`/api/importaciones/proveedores/requisitos/${requisitoId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    const auditoria = await prisma.auditoria.findMany({
      where: { tenantId: tenantAId, entidadId: requisitoId },
      orderBy: { createdAt: "asc" },
    });
    expect(auditoria.map((a) => a.accion)).toEqual([
      "REQUISITO_PROVEEDOR_CREADO",
      "REQUISITO_PROVEEDOR_EDITADO",
      "REQUISITO_PROVEEDOR_ELIMINADO",
    ]);
  });

  it("24. una orden con proveedor vinculado muestra los requisitos vigentes de ese proveedor en el detalle", async () => {
    const orden = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        numeroOrden: `REQUI-24-${sufijo}`,
        incoterm: "FOB",
        proveedorId: proveedorAId,
        proveedorExtranjero: "Proveedor Chino X",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        items: [{ descripcion: "Ítem", cantidad: 1, valorUnitarioFob: 1 }],
      });
    expect(orden.status).toBe(201);

    const detalle = await request(app)
      .get(`/api/importaciones/${orden.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.proveedor.id).toBe(proveedorAId);
    expect(detalle.body.proveedor.requisitos.length).toBeGreaterThan(0);
    expect(detalle.body.proveedor.requisitos.every((r: { activo: boolean }) => r.activo)).toBe(
      true,
    );
  });

  it("25. referencia VIVA: si se agrega un nuevo requisito DESPUÉS de crear la orden, el detalle ya lo muestra (sin snapshot)", async () => {
    const orden = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        numeroOrden: `REQUI-25-${sufijo}`,
        incoterm: "FOB",
        proveedorId: proveedorAId,
        proveedorExtranjero: "Proveedor Chino X",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        items: [{ descripcion: "Ítem", cantidad: 1, valorUnitarioFob: 1 }],
      });

    const antes = await request(app)
      .get(`/api/importaciones/${orden.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    const cantidadAntes = antes.body.proveedor.requisitos.length;

    await request(app)
      .post(`/api/importaciones/proveedores/${proveedorAId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ tipo: "DOCUMENTO", nombre: "Requisito agregado después de la orden" });

    const despues = await request(app)
      .get(`/api/importaciones/${orden.body.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(despues.body.proveedor.requisitos.length).toBe(cantidadAntes + 1);
    expect(
      despues.body.proveedor.requisitos.some(
        (r: { nombre: string }) => r.nombre === "Requisito agregado después de la orden",
      ),
    ).toBe(true);
  });

  it("30. multi-tenant: el requisito 'Packing List' del proveedor de Tenant B jamás aparece para Tenant A", async () => {
    await prisma.requisitoProveedorImportacion.deleteMany({
      where: { proveedorId: proveedorBId },
    });
    await prisma.requisitoProveedorImportacion.create({
      data: {
        tenantId: tenantBId,
        proveedorId: proveedorBId,
        tipo: "DOCUMENTO",
        nombre: "Packing List",
      },
    });

    // Tenant A no puede ni siquiera listar los requisitos de un proveedor de B.
    const intentoA = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorBId}/requisitos`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect(intentoA.status).toBe(404);

    // Tenant B SÍ ve su propio "Packing List".
    const listaB = await request(app)
      .get(`/api/importaciones/proveedores/${proveedorBId}/requisitos`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(listaB.status).toBe(200);
    expect(
      listaB.body.requisitos.some((r: { nombre: string }) => r.nombre === "Packing List"),
    ).toBe(true);

    // Y ningún requisito de A (ej. "Certificado de origen") aparece jamás
    // en la lista de B.
    expect(
      listaB.body.requisitos.some((r: { nombre: string }) => r.nombre === "Certificado de origen"),
    ).toBe(false);
  });
});
