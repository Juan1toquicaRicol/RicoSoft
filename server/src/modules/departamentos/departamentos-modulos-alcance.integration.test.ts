import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Fase 5.4.1 (hardening de auditoría) — un departamento/módulo de alcance
 * GENERAL (tenantId: null) es visible/editable por TODOS los tenants vía
 * whereAlcance; y un departamento con esSistemas=true otorga TODOS los
 * permisos del sistema a quien quede asignado ahí. Ambas mutaciones
 * requieren isSuperadmin — igual que ya exige roles.controller.ts para un
 * Rol GENERAL. Sin este guard, cualquier tenant con el permiso normal
 * "departamentos.editar"/"modulos.gestionar" podía afectar a todos los
 * demás tenants del sistema.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)(
  "Departamentos/Módulos — guard de alcance GENERAL y esSistemas (BD real)",
  () => {
    const app = createApp();
    const sufijo = randomUUID().slice(0, 8);
    const PASSWORD = "TestPassword123";

    let tenantId: string;
    let tokenSuperadmin: string;
    let tokenNormal: string;
    let departamentoNormalId: string;
    let moduloGeneralId: string;

    const login = async (email: string) => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      return res.body.token as string;
    };

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);
      const tenant = await prisma.tenant.create({
        data: { nombre: `Alcance General ${sufijo}`, subdomain: `test-alcance-${sufijo}` },
      });
      tenantId = tenant.id;

      await prisma.user.create({
        data: {
          tenantId,
          email: `alcance-super-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Super Alcance",
          isSuperadmin: true,
          activo: true,
        },
      });
      const rolNormal = await prisma.rol.create({
        data: {
          tenantId,
          nombre: `Depto/Modulo ${sufijo}`,
          permisos: JSON.stringify([
            "departamentos.crear",
            "departamentos.editar",
            "modulos.gestionar",
          ]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId,
          email: `alcance-normal-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Normal Alcance",
          rolId: rolNormal.id,
          isSuperadmin: false,
          activo: true,
        },
      });
      departamentoNormalId = (
        await prisma.departamento.create({
          data: { tenantId, nombre: `Normal ${sufijo}`, esSistemas: false, activo: true },
        })
      ).id;
      moduloGeneralId = (
        await prisma.modulo.create({
          data: {
            tenantId: null,
            clave: `modulo-general-${sufijo}`,
            nombre: `Módulo General ${sufijo}`,
            ruta: `/general-${sufijo}`,
            icono: "Box",
            activo: true,
          },
        })
      ).id;

      tokenSuperadmin = await login(`alcance-super-${sufijo}@test.ricosoft.local`);
      tokenNormal = await login(`alcance-normal-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      await prisma.modulo.deleteMany({ where: { id: moduloGeneralId } });
      await prisma.auditoria.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.rol.deleteMany({ where: { tenantId } });
      await prisma.departamento.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
      await prisma.$disconnect();
    });

    it("un actor NO superadmin no puede crear un departamento de alcance GENERAL (403), no se crea", async () => {
      const res = await request(app)
        .post("/api/departamentos")
        .set("Authorization", `Bearer ${tokenNormal}`)
        .send({ nombre: `Intento General ${sufijo}`, alcance: "GENERAL" });
      expect(res.status).toBe(403);

      const noCreado = await prisma.departamento.findFirst({
        where: { nombre: `Intento General ${sufijo}` },
      });
      expect(noCreado).toBeNull();
    });

    it("un actor NO superadmin no puede crear un departamento marcado como Sistemas (403), no se crea", async () => {
      const res = await request(app)
        .post("/api/departamentos")
        .set("Authorization", `Bearer ${tokenNormal}`)
        .send({ nombre: `Intento Sistemas ${sufijo}`, esSistemas: true });
      expect(res.status).toBe(403);

      const noCreado = await prisma.departamento.findFirst({
        where: { nombre: `Intento Sistemas ${sufijo}` },
      });
      expect(noCreado).toBeNull();
    });

    it("un actor NO superadmin SÍ puede crear un departamento normal (TENANT, esSistemas=false)", async () => {
      const res = await request(app)
        .post("/api/departamentos")
        .set("Authorization", `Bearer ${tokenNormal}`)
        .send({ nombre: `Depto Normal Creado ${sufijo}` });
      expect(res.status).toBe(201);
    });

    it("un actor NO superadmin no puede convertir un departamento propio en GENERAL (403), no cambia", async () => {
      const res = await request(app)
        .patch(`/api/departamentos/${departamentoNormalId}`)
        .set("Authorization", `Bearer ${tokenNormal}`)
        .send({ alcance: "GENERAL" });
      expect(res.status).toBe(403);

      const sinTocar = await prisma.departamento.findUnique({
        where: { id: departamentoNormalId },
      });
      expect(sinTocar?.tenantId).toBe(tenantId);
    });

    it("un actor NO superadmin no puede marcar un departamento propio existente como Sistemas (403), no cambia", async () => {
      const res = await request(app)
        .patch(`/api/departamentos/${departamentoNormalId}`)
        .set("Authorization", `Bearer ${tokenNormal}`)
        .send({ esSistemas: true });
      expect(res.status).toBe(403);

      const sinTocar = await prisma.departamento.findUnique({
        where: { id: departamentoNormalId },
      });
      expect(sinTocar?.esSistemas).toBe(false);
    });

    it("un superadmin SÍ puede crear un departamento GENERAL y marcarlo como Sistemas", async () => {
      const res = await request(app)
        .post("/api/departamentos")
        .set("Authorization", `Bearer ${tokenSuperadmin}`)
        .send({ nombre: `General Superadmin ${sufijo}`, alcance: "GENERAL", esSistemas: true });
      expect(res.status).toBe(201);
      expect(res.body.alcance).toBe("GENERAL");
      expect(res.body.esSistemas).toBe(true);

      await prisma.departamento.delete({ where: { id: res.body.id } });
    });

    it("un actor NO superadmin no puede editar un módulo de alcance GENERAL (403), no cambia", async () => {
      const res = await request(app)
        .patch(`/api/modulos/${moduloGeneralId}`)
        .set("Authorization", `Bearer ${tokenNormal}`)
        .send({ activo: false });
      expect(res.status).toBe(403);

      const sinTocar = await prisma.modulo.findUnique({ where: { id: moduloGeneralId } });
      expect(sinTocar?.activo).toBe(true);
    });

    it("un superadmin SÍ puede editar un módulo de alcance GENERAL", async () => {
      const res = await request(app)
        .patch(`/api/modulos/${moduloGeneralId}`)
        .set("Authorization", `Bearer ${tokenSuperadmin}`)
        .send({ orden: 99 });
      expect(res.status).toBe(200);
      expect(res.body.orden).toBe(99);
    });
  },
);
