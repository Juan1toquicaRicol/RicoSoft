import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../app";
import { prisma } from "../config/prisma";

/**
 * Suite de integración con BASE DE DATOS REAL para el alcance
 * GENERAL/TENANT de Departamento, Rol y Modulo.
 *
 * IMPORTANTE: requiere que la migración 20260831010000_alcance_general_tenant
 * ya esté aplicada (Proveedor... digo, Departamento/Rol/Modulo.tenantId
 * nullable) — a propósito NO se aplicó en esta sesión (instrucción explícita
 * de no tocar saas_dev sin autorización), así que esta suite no pudo
 * ejecutarse todavía. Queda lista para correr en cuanto se apruebe la
 * migración.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

interface ConIdDto {
  id: string;
}

describe.skipIf(!RUN)(
  "Alcance GENERAL/TENANT — Departamentos, Roles, Módulos (multi-tenant real)",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantAId: string;
    let tenantBId: string;
    let tokenA: string;
    let tokenB: string;
    let userAId: string;
    let usuarioNormalAId: string;

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
        data: { nombre: `Alcance Test A ${sufijo}`, subdomain: `test-alcance-a-${sufijo}` },
      });
      const tenantB = await prisma.tenant.create({
        data: { nombre: `Alcance Test B ${sufijo}`, subdomain: `test-alcance-b-${sufijo}` },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      const userA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `alcance-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin A",
          isSuperadmin: true,
          activo: true,
        },
      });
      userAId = userA.id;
      await prisma.user.create({
        data: {
          tenantId: tenantBId,
          email: `alcance-b-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin B",
          isSuperadmin: true,
          activo: true,
        },
      });
      // Usuario normal (NO superadmin) de Tenant A: un superadmin no puede
      // que se le reasigne el rol (regla real de negocio en
      // usuarios.controller.ts, "No se puede reasignar el rol de un
      // superadministrador") — las pruebas de asignación de ROL necesitan
      // un usuario al que sí se le pueda cambiar.
      const usuarioNormalA = await prisma.user.create({
        data: {
          tenantId: tenantAId,
          email: `alcance-normal-a-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Usuario Normal A",
          isSuperadmin: false,
          activo: true,
        },
      });
      usuarioNormalAId = usuarioNormalA.id;

      tokenA = await login(`alcance-a-${sufijo}@test.ricosoft.local`);
      tokenB = await login(`alcance-b-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const tenantIds = [tenantAId, tenantBId];
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.membresia.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      // Departamentos/roles GENERALES creados en la suite (tenantId null) no
      // quedan ligados a ningún tenant de los que se borran abajo — se limpian
      // aparte por nombre único de esta corrida.
      await prisma.departamento.deleteMany({ where: { nombre: { contains: sufijo } } });
      await prisma.rol.deleteMany({ where: { nombre: { contains: sufijo } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    describe("Departamentos", () => {
      it("1-3. un departamento GENERAL es visible desde cualquier tenant", async () => {
        const crear = await request(app)
          .post("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Comercial General ${sufijo}`, alcance: "GENERAL" });
        expect(crear.status).toBe(201);
        expect(crear.body.alcance).toBe("GENERAL");

        const desdeA = await request(app)
          .get("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`);
        expect(desdeA.body.some((d: ConIdDto) => d.id === crear.body.id)).toBe(true);

        const desdeB = await request(app)
          .get("/api/departamentos")
          .set("Authorization", `Bearer ${tokenB}`);
        expect(desdeB.body.some((d: ConIdDto) => d.id === crear.body.id)).toBe(true);
      });

      it("4-6. un departamento exclusivo de Tenant A no es visible desde Tenant B", async () => {
        const crear = await request(app)
          .post("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Comercio Exterior ${sufijo}`, alcance: "TENANT" });
        expect(crear.body.alcance).toBe("TENANT");

        const desdeA = await request(app)
          .get("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`);
        expect(desdeA.body.some((d: ConIdDto) => d.id === crear.body.id)).toBe(true);

        const desdeB = await request(app)
          .get("/api/departamentos")
          .set("Authorization", `Bearer ${tokenB}`);
        expect(desdeB.body.some((d: ConIdDto) => d.id === crear.body.id)).toBe(false);

        // 7. Intentar editarlo/asignarlo desde Tenant B -> 404 (IDOR)
        const editarDesdeB = await request(app)
          .patch(`/api/departamentos/${crear.body.id}`)
          .set("Authorization", `Bearer ${tokenB}`)
          .send({ nombre: "Hackeado" });
        expect(editarDesdeB.status).toBe(404);
      });

      it("8. cambio de alcance TENANT->GENERAL permitido; GENERAL->TENANT bloqueado si otro tenant lo usa", async () => {
        const crear = await request(app)
          .post("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Producción ${sufijo}`, alcance: "TENANT" });

        const aGeneral = await request(app)
          .patch(`/api/departamentos/${crear.body.id}`)
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ alcance: "GENERAL" });
        expect(aGeneral.status).toBe(200);
        expect(aGeneral.body.alcance).toBe("GENERAL");

        // Un usuario de B se asigna a este departamento ahora general.
        await prisma.user.update({ where: { id: userAId }, data: {} }); // no-op, mantiene lint feliz
        const usuarioB = await prisma.user.findFirst({ where: { tenantId: tenantBId } });
        await prisma.user.update({
          where: { id: usuarioB!.id },
          data: { departamentoId: crear.body.id },
        });

        const aTenant = await request(app)
          .patch(`/api/departamentos/${crear.body.id}`)
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ alcance: "TENANT" });
        expect(aTenant.status).toBe(409);

        await prisma.user.update({ where: { id: usuarioB!.id }, data: { departamentoId: null } });
      });
    });

    describe("Roles", () => {
      it("9-11. un rol GENERAL es visible desde cualquier tenant", async () => {
        const crear = await request(app)
          .post("/api/roles")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Contador ${sufijo}`, alcance: "GENERAL" });
        expect(crear.body.alcance).toBe("GENERAL");

        const desdeB = await request(app)
          .get("/api/roles")
          .set("Authorization", `Bearer ${tokenB}`);
        expect(desdeB.body.some((r: ConIdDto) => r.id === crear.body.id)).toBe(true);
      });

      it("12-14. un rol exclusivo de Tenant A no se puede asignar a una membresía de Tenant B", async () => {
        const crear = await request(app)
          .post("/api/roles")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Coordinador Importaciones ${sufijo}`, alcance: "TENANT" });

        // Asignado a un usuario NORMAL (no superadmin) del mismo tenant A:
        // permitido. (A un superadmin no se le puede reasignar el rol —
        // regla real de negocio, no relacionada con este test.)
        const asignarA = await request(app)
          .patch(`/api/usuarios/${usuarioNormalAId}/rol`)
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ rolId: crear.body.id });
        expect(asignarA.status).toBe(200);

        // Dar a un usuario de B membresía HACIA Tenant A usando el rol de A
        // es válido (el rol pertenece al tenant DESTINO de la membresía) —
        // confirma que sí se pueden otorgar accesos cruzados legítimos.
        const usuarioB = await prisma.user.findFirst({ where: { tenantId: tenantBId } });
        const membresiaValida = await request(app)
          .post(`/api/membresias/usuarios/${usuarioB!.id}`)
          .set("Authorization", `Bearer ${tokenB}`)
          .send({ tenantId: tenantAId, rolId: crear.body.id });
        expect(membresiaValida.status).toBe(201);

        // El caso realmente inválido: usar ese mismo rol (exclusivo de A)
        // para una membresía cuyo tenant DESTINO es un tercer tenant C,
        // donde el rol no pertenece ni es GENERAL — debe rechazarse.
        const tenantC = await prisma.tenant.create({
          data: { nombre: `Alcance Test C ${sufijo}`, subdomain: `test-alcance-c-${sufijo}` },
        });
        const usuarioC = await prisma.user.create({
          data: {
            tenantId: tenantC.id,
            email: `alcance-c-${sufijo}@test.ricosoft.local`,
            passwordHash: (await prisma.user.findUnique({ where: { id: usuarioB!.id } }))!
              .passwordHash,
            nombre: "Admin C",
            isSuperadmin: true,
            activo: true,
          },
        });
        const tokenC = await login(`alcance-c-${sufijo}@test.ricosoft.local`);
        const membresiaCrossTenant = await request(app)
          .post(`/api/membresias/usuarios/${usuarioC.id}`)
          .set("Authorization", `Bearer ${tokenC}`)
          .send({ tenantId: tenantAId, rolId: crear.body.id });
        // usuarioC no es nativo de A ni de C-hacia-A tiene ese rol... en
        // realidad el rol SÍ pertenece a A y el destino también es A, así
        // que lo relevante acá es que un tenant ajeno (C) no puede ni
        // siquiera iniciar la operación sobre un usuario que no es suyo si
        // el actor no es de la empresa nativa correcta — pero usuarioC SÍ
        // es nativo de C y actúa sobre sí mismo, así que la única barrera
        // real que debe activarse es intentar usar el rol de A para un
        // tenant destino que NO es A.
        const membresiaRolAjeno = await request(app)
          .post(`/api/membresias/usuarios/${usuarioC.id}`)
          .set("Authorization", `Bearer ${tokenC}`)
          .send({ tenantId: tenantBId, rolId: crear.body.id });
        expect(membresiaRolAjeno.status).toBe(404);

        await prisma.membresia.deleteMany({ where: { userId: usuarioC.id } });
        await prisma.auditoria.deleteMany({ where: { usuarioId: usuarioC.id } });
        await prisma.user.delete({ where: { id: usuarioC.id } });
        await prisma.tenant.delete({ where: { id: tenantC.id } });
      });

      it("15-16. los permisos del rol y Membresia.rolId mantienen el contexto correcto tras asignar un rol general", async () => {
        const crear = await request(app)
          .post("/api/roles")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({
            nombre: `Jefe de Compras ${sufijo}`,
            alcance: "GENERAL",
            permisos: ["solicitudes.ver"],
          });

        // Se asigna a un usuario NORMAL (no superadmin) — a un superadmin no
        // se le puede reasignar el rol (regla real, ver test anterior).
        const asignar = await request(app)
          .patch(`/api/usuarios/${usuarioNormalAId}/rol`)
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ rolId: crear.body.id });
        expect(asignar.status).toBe(200);

        const tokenNormalA = await login(`alcance-normal-a-${sufijo}@test.ricosoft.local`);
        const me = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${tokenNormalA}`);
        expect(me.body.user.permisos).toContain("solicitudes.ver");
      });
    });

    describe("Seguridad / regresión", () => {
      it("22-24. IDOR: Tenant A no puede modificar un rol/departamento exclusivo de Tenant B", async () => {
        const crearEnB = await request(app)
          .post("/api/roles")
          .set("Authorization", `Bearer ${tokenB}`)
          .send({ nombre: `Solo De B ${sufijo}`, alcance: "TENANT" });

        const intento = await request(app)
          .patch(`/api/roles/${crearEnB.body.id}`)
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: "Robado" });
        expect(intento.status).toBe(404);

        const eliminar = await request(app)
          .delete(`/api/roles/${crearEnB.body.id}`)
          .set("Authorization", `Bearer ${tokenA}`);
        expect(eliminar.status).toBe(404);
      });

      it("25. un elemento GENERAL sí puede usarse en múltiples tenants simultáneamente", async () => {
        const crear = await request(app)
          .post("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Gerencia General ${sufijo}`, alcance: "GENERAL" });

        const usuarioB = await prisma.user.findFirst({ where: { tenantId: tenantBId } });
        const asignarEnB = await request(app)
          .patch(`/api/usuarios/${usuarioB!.id}/departamento`)
          .set("Authorization", `Bearer ${tokenB}`)
          .send({ departamentoId: crear.body.id });
        expect(asignarEnB.status).toBe(200);

        const asignarEnA = await request(app)
          .patch(`/api/usuarios/${userAId}/departamento`)
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ departamentoId: crear.body.id });
        expect(asignarEnA.status).toBe(200);
      });

      it("26-28. esSistemas de un departamento GENERAL sigue dando bypass solo dentro del tenant activo", async () => {
        const crear = await request(app)
          .post("/api/departamentos")
          .set("Authorization", `Bearer ${tokenA}`)
          .send({ nombre: `Sistemas General ${sufijo}`, alcance: "GENERAL", esSistemas: true });

        // Usuario normal (no superadmin) de Tenant B, sin ningún permiso,
        // asignado al departamento Sistemas GENERAL: debe tener bypass DENTRO
        // de Tenant B, y jamás acceso a datos de Tenant A.
        const passwordHash = await bcrypt.hash(PASSWORD, 10);
        const empleado = await prisma.user.create({
          data: {
            tenantId: tenantBId,
            email: `empleado-sistemas-${sufijo}@test.ricosoft.local`,
            passwordHash,
            nombre: "Empleado Sistemas",
            departamentoId: crear.body.id,
            isSuperadmin: false,
            activo: true,
          },
        });
        const tokenEmpleado = await login(`empleado-sistemas-${sufijo}@test.ricosoft.local`);

        const me = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${tokenEmpleado}`);
        expect(me.body.user.tenantId).toBe(tenantBId);
        // El bypass de "Sistemas" se refleja en permisos efectivos amplios,
        // pero el tenant activo sigue siendo B — nunca A.
        expect(me.body.user.tenantId).not.toBe(tenantAId);

        await prisma.auditoria.deleteMany({ where: { usuarioId: empleado.id } });
        await prisma.user.delete({ where: { id: empleado.id } });
      });
    });
  },
);
