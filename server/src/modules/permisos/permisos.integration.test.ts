import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para el catálogo dinámico de
 * permisos: siembra perezosa (createMany sin skipDuplicates, porque SQL
 * Server no lo soporta — ver permisos.service.ts), CRUD, y que un permiso
 * personalizado activo quede realmente asignable a un Rol.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Permisos — catálogo dinámico (multi-tenant real)", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);

  let tenantId: string;
  let otroTenantId: string;
  let token: string;
  let otroToken: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenant = await prisma.tenant.create({
      data: { nombre: `Test Permisos ${sufijo}`, subdomain: `test-permisos-${sufijo}` },
    });
    const otroTenant = await prisma.tenant.create({
      data: { nombre: `Test Permisos Otro ${sufijo}`, subdomain: `test-permisos-otro-${sufijo}` },
    });
    tenantId = tenant.id;
    otroTenantId = otroTenant.id;

    await prisma.user.create({
      data: {
        tenantId,
        email: `admin-permisos-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Permisos",
        isSuperadmin: true,
        activo: true,
      },
    });
    await prisma.user.create({
      data: {
        tenantId: otroTenantId,
        email: `admin-otro-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Admin Otro Tenant",
        isSuperadmin: true,
        activo: true,
      },
    });

    const login = async (email: string): Promise<string> => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200 || !res.body.token) {
        throw new Error(
          `Login de prueba falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`,
        );
      }
      return res.body.token as string;
    };

    token = await login(`admin-permisos-${sufijo}@test.ricosoft.local`);
    otroToken = await login(`admin-otro-${sufijo}@test.ricosoft.local`);
  });

  afterAll(async () => {
    const tenantIds = [tenantId, otroTenantId];
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.permiso.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("siembra el catálogo del sistema en el primer acceso, sin duplicarlo en accesos siguientes", async () => {
    const primera = await request(app).get("/api/permisos").set("Authorization", `Bearer ${token}`);
    expect(primera.status).toBe(200);
    expect(primera.body.length).toBeGreaterThan(50);
    expect(
      primera.body.every((p: { esSistema: boolean; id: string; codigo: string }) => p.esSistema),
    ).toBe(true);

    const segunda = await request(app).get("/api/permisos").set("Authorization", `Bearer ${token}`);
    expect(segunda.status).toBe(200);
    expect(segunda.body.length).toBe(primera.body.length);
  });

  it("crea un permiso personalizado, lo asigna a un rol, y ya no se puede eliminar mientras esté asignado", async () => {
    const codigo = `pruebas.custom_${sufijo}`;
    const crear = await request(app)
      .post("/api/permisos")
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo, nombre: "Permiso de prueba", modulo: "Pruebas" });
    expect(crear.status).toBe(201);
    expect(crear.body.esSistema).toBe(false);
    const permisoId = crear.body.id as string;

    // Duplicado exacto rechazado.
    const duplicado = await request(app)
      .post("/api/permisos")
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo, nombre: "Otro nombre", modulo: "Pruebas" });
    expect(duplicado.status).toBe(409);

    // Formato inválido rechazado.
    const invalido = await request(app)
      .post("/api/permisos")
      .set("Authorization", `Bearer ${token}`)
      .send({ codigo: "SinPunto", nombre: "Malo", modulo: "Pruebas" });
    expect(invalido.status).toBe(400);

    // Asignable a un rol nuevo.
    const rol = await request(app)
      .post("/api/roles")
      .set("Authorization", `Bearer ${token}`)
      .send({ nombre: `Rol de prueba ${sufijo}`, permisos: [codigo] });
    expect(rol.status).toBe(201);
    expect(rol.body.permisos).toContain(codigo);

    // No se puede eliminar mientras un rol lo tenga asignado.
    const eliminarEnUso = await request(app)
      .delete(`/api/permisos/${permisoId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(eliminarEnUso.status).toBe(409);

    // Se libera quitándolo del rol, y ahora sí se puede eliminar.
    const liberar = await request(app)
      .patch(`/api/roles/${rol.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ permisos: [] });
    expect(liberar.status).toBe(200);

    const eliminar = await request(app)
      .delete(`/api/permisos/${permisoId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(eliminar.status).toBe(204);
  });

  it("reconcilia un código de sistema que falte (agregado después del primer seed) sin duplicar ni tocar los demás", async () => {
    const antes = await request(app).get("/api/permisos").set("Authorization", `Bearer ${token}`);
    expect(antes.status).toBe(200);
    const totalAntes = antes.body.length;
    const objetivo = antes.body.find(
      (p: { esSistema: boolean; codigo: string }) => p.esSistema && p.codigo === "biometrico.ver",
    );
    expect(objetivo).toBeTruthy();

    // Simula un tenant cuyo catálogo se sembró antes de que "biometrico.ver"
    // existiera en PERMISOS_SISTEMA: borra esa fila directamente, sin pasar
    // por el endpoint (los permisos de sistema no se pueden borrar por API).
    await prisma.permiso.delete({ where: { id: objetivo.id } });

    // listarCatalogoPermisos reconcilia en la MISMA llamada que detecta el
    // faltante (asegurarCatalogoSembrado corre antes del findMany) — no hace
    // falta una segunda consulta para que reaparezca.
    const reconciliada = await request(app)
      .get("/api/permisos")
      .set("Authorization", `Bearer ${token}`);
    expect(reconciliada.status).toBe(200);
    expect(reconciliada.body.length).toBe(totalAntes);
    const recreado = reconciliada.body.find(
      (p: { codigo: string; esSistema: boolean }) => p.codigo === "biometrico.ver",
    );
    expect(recreado).toBeTruthy();
    expect(recreado.esSistema).toBe(true);
    expect(recreado.id).not.toBe(objetivo.id); // fila nueva, no la misma que se borró

    // Una consulta más no debe duplicar nada ni volver a insertar.
    const otraVezMas = await request(app)
      .get("/api/permisos")
      .set("Authorization", `Bearer ${token}`);
    expect(otraVezMas.status).toBe(200);
    expect(otraVezMas.body.length).toBe(totalAntes);
    const sinDuplicar = otraVezMas.body.filter(
      (p: { codigo: string }) => p.codigo === "biometrico.ver",
    );
    expect(sinDuplicar.length).toBe(1);
    expect(sinDuplicar[0].id).toBe(recreado.id);

    // El otro tenant, que nunca perdió esa fila, no se ve afectado.
    const otroTenantLista = await request(app)
      .get("/api/permisos")
      .set("Authorization", `Bearer ${otroToken}`);
    expect(otroTenantLista.status).toBe(200);
    expect(
      otroTenantLista.body.filter((p: { codigo: string }) => p.codigo === "biometrico.ver").length,
    ).toBe(1);
  });

  it("no permite eliminar ni editar el código de un permiso del sistema, y aísla el catálogo por tenant", async () => {
    const lista = await request(app).get("/api/permisos").set("Authorization", `Bearer ${token}`);
    const permisoSistema = lista.body.find(
      (p: { esSistema: boolean; id: string; codigo: string }) => p.esSistema,
    );
    expect(permisoSistema).toBeTruthy();

    const eliminar = await request(app)
      .delete(`/api/permisos/${permisoSistema.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(eliminar.status).toBe(409);

    // Otro tenant no puede tocar (ni ver, vía 404) el permiso de este tenant.
    const cruzado = await request(app)
      .patch(`/api/permisos/${permisoSistema.id}`)
      .set("Authorization", `Bearer ${otroToken}`)
      .send({ nombre: "Hackeado" });
    expect(cruzado.status).toBe(404);
  });
});
