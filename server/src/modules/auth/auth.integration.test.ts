import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para el sistema de acceso
 * multiempresa completo: selección en login, cambio de empresa dentro de la
 * app (switch-tenant) sin logout, aislamiento de datos/permisos por tenant,
 * y manipulación de tenantId. Requiere DATABASE_URL/JWT_SECRET reales,
 * gateada por RUN_DB_INTEGRATION_TESTS=true.
 *
 * Fixture: un usuario ("Juan") con acceso a 3 empresas —
 *   - Ricol: tenant hogar, isSuperadmin=true.
 *   - Flexipack: membresía con el rol "Jefe de Compras" (solicitudes.ver +
 *     solicitudes.crear, NO superadmin).
 *   - Green: membresía con el rol "Consulta" (sin permisos).
 * Más un cuarto tenant ("Ajeno") al que Juan NUNCA tiene acceso, para las
 * pruebas de rechazo/manipulación.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";
const JWT_SECRET = process.env.JWT_SECRET as string;

describe.skipIf(!RUN)(
  "Auth — acceso multiempresa (Ricol/Flexipack/Green, multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantRicolId: string;
    let tenantFlexipackId: string;
    let tenantGreenId: string;
    let tenantAjenoId: string;
    let juanId: string;
    let membresiaFlexipackId: string;
    let solicitanteFlexipackId: string;

    const login = async (email: string, password = PASSWORD) =>
      request(app).post("/api/auth/login").send({ email, password });

    const seleccionarTenant = async (selectionToken: string, tenantId: string) =>
      request(app).post("/api/auth/select-tenant").send({ selectionToken, tenantId });

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const [tenantRicol, tenantFlexipack, tenantGreen, tenantAjeno] = await Promise.all([
        prisma.tenant.create({
          data: { nombre: `Ricol Test ${sufijo}`, subdomain: `test-ricol-${sufijo}` },
        }),
        prisma.tenant.create({
          data: { nombre: `Flexipack Test ${sufijo}`, subdomain: `test-flexi-${sufijo}` },
        }),
        prisma.tenant.create({
          data: { nombre: `Green Test ${sufijo}`, subdomain: `test-green-${sufijo}` },
        }),
        prisma.tenant.create({
          data: { nombre: `Ajeno Test ${sufijo}`, subdomain: `test-ajeno-${sufijo}` },
        }),
      ]);
      tenantRicolId = tenantRicol.id;
      tenantFlexipackId = tenantFlexipack.id;
      tenantGreenId = tenantGreen.id;
      tenantAjenoId = tenantAjeno.id;

      const rolJefeCompras = await prisma.rol.create({
        data: {
          tenantId: tenantFlexipackId,
          nombre: "Jefe de Compras",
          permisos: JSON.stringify(["solicitudes.ver", "solicitudes.crear"]),
        },
      });
      // "Consulta" puede VER solicitudes (para probar aislamiento de datos en
      // el TEST 6) pero no crearlas — eso es justo lo que valida el TEST 7/8.
      const rolConsulta = await prisma.rol.create({
        data: {
          tenantId: tenantGreenId,
          nombre: "Consulta",
          permisos: JSON.stringify(["solicitudes.ver"]),
        },
      });

      const juan = await prisma.user.create({
        data: {
          tenantId: tenantRicolId,
          email: `juan-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Juan Multi Empresa",
          isSuperadmin: true, // Superadmin SOLO en su tenant hogar (Ricol).
          activo: true,
        },
      });
      juanId = juan.id;

      const membresiaFlexipack = await prisma.membresia.create({
        data: {
          userId: juanId,
          tenantId: tenantFlexipackId,
          rolId: rolJefeCompras.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      membresiaFlexipackId = membresiaFlexipack.id;
      await prisma.membresia.create({
        data: {
          userId: juanId,
          tenantId: tenantGreenId,
          rolId: rolConsulta.id,
          isSuperadmin: false,
          activo: true,
        },
      });

      // Usuario real de Flexipack para poder crear una SolicitudCompra ahí
      // (solicitanteId debe pertenecer al tenant activo — ver solicitudes.controller).
      const solicitanteFlexipack = await prisma.user.create({
        data: {
          tenantId: tenantFlexipackId,
          email: `solicitante-flexi-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Solicitante Flexipack",
          activo: true,
        },
      });
      solicitanteFlexipackId = solicitanteFlexipack.id;
    });

    afterAll(async () => {
      const tenantIds = [tenantRicolId, tenantFlexipackId, tenantGreenId, tenantAjenoId];
      await prisma.solicitudCompra.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.membresia.deleteMany({ where: { userId: juanId } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    // TEST 1 — usuario con una sola empresa entra directo, sin selección.
    it("1. usuario con una sola empresa entra directo (sin selección)", async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const solo = await prisma.user.create({
        data: {
          tenantId: tenantAjenoId,
          email: `solo-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Usuario de una sola empresa",
          activo: true,
        },
      });
      try {
        const res = await login(`solo-${sufijo}@test.ricosoft.local`);
        expect(res.status).toBe(200);
        expect(res.body.requiresTenantSelection).toBeFalsy();
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.tenantId).toBe(tenantAjenoId);
      } finally {
        await prisma.auditoria.deleteMany({ where: { usuarioId: solo.id } });
        await prisma.user.delete({ where: { id: solo.id } });
      }
    });

    // TEST 2 — usuario con 3 empresas puede seleccionar cualquiera de ellas.
    it("2. usuario con 3 empresas puede seleccionar cualquiera", async () => {
      const res = await login(`juan-${sufijo}@test.ricosoft.local`);
      expect(res.status).toBe(200);
      expect(res.body.requiresTenantSelection).toBe(true);
      expect(res.body.tenants.map((t: any) => t.id).sort()).toEqual(
        [tenantRicolId, tenantFlexipackId, tenantGreenId].sort(),
      );

      for (const tenantId of [tenantGreenId, tenantFlexipackId, tenantRicolId]) {
        const seleccion = await seleccionarTenant(res.body.selectionToken, tenantId);
        expect(seleccion.status).toBe(200);
        expect(seleccion.body.user.tenantId).toBe(tenantId);
      }
    });

    // TEST 3 — cambia de empresa dos veces seguidas sin logout: Ricol -> Flexipack -> Green -> Ricol.
    it("3. cambia de empresa en cadena (Ricol -> Flexipack -> Green -> Ricol) sin logout", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const seleccion = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      let token = seleccion.body.token as string;
      expect(seleccion.body.user.tenantId).toBe(tenantRicolId);

      const aFlexipack = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${token}`)
        .send({ tenantId: tenantFlexipackId });
      expect(aFlexipack.status).toBe(200);
      expect(aFlexipack.body.user.tenantId).toBe(tenantFlexipackId);
      token = aFlexipack.body.token;

      const aGreen = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${token}`)
        .send({ tenantId: tenantGreenId });
      expect(aGreen.status).toBe(200);
      expect(aGreen.body.user.tenantId).toBe(tenantGreenId);
      token = aGreen.body.token;

      const aRicol = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${token}`)
        .send({ tenantId: tenantRicolId });
      expect(aRicol.status).toBe(200);
      expect(aRicol.body.user.tenantId).toBe(tenantRicolId);
    });

    // TEST 4 — intentar cambiar a una empresa sin acceso -> 403, sesión no se mueve.
    it("4. rechaza cambiar a una empresa sin acceso (403), la sesión no se mueve", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const seleccion = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      const token = seleccion.body.token as string;

      const cambio = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${token}`)
        .send({ tenantId: tenantAjenoId });
      expect(cambio.status).toBe(403);

      const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
      expect(me.body.user.tenantId).toBe(tenantRicolId);
    });

    // TEST 5 — manipulación manual de tenantId: el backend NUNCA confía en el
    // tenantId del token sin revalidar contra Membresia/User real, ni siquiera
    // si el token está correctamente firmado con el secreto real.
    it("5. rechaza un tenantId manipulado en el JWT, incluso firmado con el secreto real", async () => {
      const tokenForjado = jwt.sign({ sub: juanId, tv: 0, tenantId: tenantAjenoId }, JWT_SECRET, {
        expiresIn: "8h",
      });
      const me = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenForjado}`);
      // authenticateJWT llama loadSessionUser(juanId, tenantAjenoId): sin
      // membresía a ese tenant, la sesión es inválida aunque la firma sea
      // válida — se rechaza en la autenticación misma, no solo en switch-tenant.
      expect(me.status).toBe(401);

      // Además, un JWT con el payload trasteado a mano (sin volver a firmar)
      // rompe la firma HMAC: jwt.verify lanza y authenticateJWT lo rechaza
      // con 403 antes siquiera de llegar a revisar tenant/usuario alguno.
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const seleccion = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      const tokenValido = seleccion.body.token as string;
      const partes = tokenValido.split(".");
      const payloadManipulado = Buffer.from(
        JSON.stringify({ sub: juanId, tv: 0, tenantId: tenantAjenoId }),
      ).toString("base64url");
      const tokenAlterado = `${partes[0]}.${payloadManipulado}.${partes[2]}`;
      const meAlterado = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${tokenAlterado}`);
      expect(meAlterado.status).toBe(403);
    });

    // TEST 6 — tras cambiar de empresa, los datos mostrados pertenecen
    // ÚNICAMENTE al nuevo tenant (aislamiento real de datos, no solo de JWT).
    it("6. los datos tras el cambio de empresa pertenecen únicamente al nuevo tenant", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const aRicol = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      const tokenRicol = aRicol.body.token as string;

      const aFlexipack = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${tokenRicol}`)
        .send({ tenantId: tenantFlexipackId });
      const tokenFlexipack = aFlexipack.body.token as string;

      const itemUnico = `Item exclusivo de Flexipack ${sufijo}`;
      const crear = await request(app)
        .post("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenFlexipack}`)
        .send({
          empresaId: "RC",
          area: "Compras",
          solicitanteId: solicitanteFlexipackId,
          item: itemUnico,
          descripcion: "Prueba de aislamiento multiempresa",
          cantidad: 1,
          valorEstimado: 100_000,
          prioridad: "Media",
        });
      expect(crear.status).toBe(201);

      // Visible en Flexipack.
      const listaFlexipack = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenFlexipack}`);
      expect(listaFlexipack.body.some((s: any) => s.item === itemUnico)).toBe(true);

      // Invisible en Ricol, aunque sea el mismo usuario.
      const listaRicol = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${tokenRicol}`);
      expect(listaRicol.body.some((s: any) => s.item === itemUnico)).toBe(false);

      // Invisible en Green también.
      const aGreen = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${tokenFlexipack}`)
        .send({ tenantId: tenantGreenId });
      const listaGreen = await request(app)
        .get("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${aGreen.body.token}`);
      expect(listaGreen.body.some((s: any) => s.item === itemUnico)).toBe(false);
    });

    // TEST 7 y TEST 8 — permisos y rol cambian correctamente por empresa; el
    // superadmin de Ricol NO hereda automáticamente permisos administrativos
    // en Flexipack ni en Green.
    it("7-8. permisos/rol cambian por empresa; superadmin de Ricol no se hereda a Flexipack/Green", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);

      const enRicol = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      expect(enRicol.body.user.isSuperadmin).toBe(true);

      const enFlexipack = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${enRicol.body.token}`)
        .send({ tenantId: tenantFlexipackId });
      expect(enFlexipack.body.user.isSuperadmin).toBe(false);
      expect(enFlexipack.body.user.rol).toBe("Jefe de Compras");
      expect(enFlexipack.body.user.permisos.sort()).toEqual([
        "solicitudes.crear",
        "solicitudes.ver",
      ]);
      // Nunca tiene en Flexipack un permiso que no le fue asignado ahí.
      expect(enFlexipack.body.user.permisos).not.toContain("usuarios.eliminar");

      const enGreen = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${enFlexipack.body.token}`)
        .send({ tenantId: tenantGreenId });
      expect(enGreen.body.user.isSuperadmin).toBe(false);
      expect(enGreen.body.user.rol).toBe("Consulta");
      expect(enGreen.body.user.permisos).toEqual(["solicitudes.ver"]);

      // Un endpoint que exige un permiso que Juan no tiene en Green (p. ej.
      // crear una solicitud, que sí puede en Flexipack) debe rechazarse ahí.
      const intentoCrearEnGreen = await request(app)
        .post("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${enGreen.body.token}`)
        .send({
          empresaId: "RC",
          area: "Compras",
          solicitanteId: solicitanteFlexipackId,
          item: "No debería poder crear esto",
          descripcion: "x",
          cantidad: 1,
          valorEstimado: 1,
          prioridad: "Media",
        });
      expect(intentoCrearEnGreen.status).toBe(403);
    });

    // TEST 9 — refresh (F5) después de cambiar de empresa: repetidas llamadas
    // a /auth/me con el mismo token siguen reflejando la empresa activa.
    it("9. el tenant activo se mantiene correcto tras simular varios refresh (F5)", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const seleccion = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      const cambio = await request(app)
        .post("/api/auth/switch-tenant")
        .set("Authorization", `Bearer ${seleccion.body.token}`)
        .send({ tenantId: tenantFlexipackId });
      const token = cambio.body.token as string;

      for (let i = 0; i < 3; i++) {
        const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
        expect(me.status).toBe(200);
        expect(me.body.user.tenantId).toBe(tenantFlexipackId);
      }
    });

    // TEST 11 — el usuario pierde acceso a una empresa (membresía desactivada)
    // y no puede volver a seleccionarla ni cambiarse a ella.
    it("11. al perder el acceso a una empresa, ya no aparece ni se puede seleccionar", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const enRicol = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      const tokenRicol = enRicol.body.token as string;

      await prisma.membresia.update({
        where: { id: membresiaFlexipackId },
        data: { activo: false },
      });

      try {
        const accesibles = await request(app)
          .get("/api/auth/tenants-accesibles")
          .set("Authorization", `Bearer ${tokenRicol}`);
        expect(accesibles.body.tenants.some((t: any) => t.id === tenantFlexipackId)).toBe(false);

        const cambio = await request(app)
          .post("/api/auth/switch-tenant")
          .set("Authorization", `Bearer ${tokenRicol}`)
          .send({ tenantId: tenantFlexipackId });
        expect(cambio.status).toBe(403);

        const login2 = await login(`juan-${sufijo}@test.ricosoft.local`);
        expect(login2.body.tenants.some((t: any) => t.id === tenantFlexipackId)).toBe(false);
      } finally {
        await prisma.membresia.update({
          where: { id: membresiaFlexipackId },
          data: { activo: true },
        });
      }
    });

    // TEST 12 — el comportamiento de SuperAdmin en su empresa hogar no cambia.
    it("12. SuperAdmin conserva acceso total en su empresa hogar (Ricol)", async () => {
      const login1 = await login(`juan-${sufijo}@test.ricosoft.local`);
      const enRicol = await seleccionarTenant(login1.body.selectionToken, tenantRicolId);
      expect(enRicol.body.user.isSuperadmin).toBe(true);

      // Superadmin bypassa cualquier chequeo de permiso concreto en su tenant.
      // Juan mismo es válido como solicitante: pertenece a Ricol (su hogar).
      const crear = await request(app)
        .post("/api/solicitudes-compra")
        .set("Authorization", `Bearer ${enRicol.body.token}`)
        .send({
          empresaId: "RC",
          area: "Compras",
          solicitanteId: juanId,
          item: `Item de Ricol ${sufijo}`,
          descripcion: "Prueba superadmin",
          cantidad: 1,
          valorEstimado: 1,
          prioridad: "Media",
        });
      expect(crear.status).toBe(201);
    });
  },
);
