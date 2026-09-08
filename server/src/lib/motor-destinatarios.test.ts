import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { getTenantPrisma } from "./tenant-prisma";
import {
  resolverDestinatariosDesdeLista,
  resolverDestinatarios,
  validarFormaDestinatario,
  tieneDestinatariosDuplicados,
  type DestinatarioLogico,
} from "./motor-destinatarios";

/**
 * Motor genérico de destinatarios (Fase 5.3) — pruebas puras (sin DB) para
 * validarFormaDestinatario/tieneDestinatariosDuplicados, y de integración
 * (con DB real) para resolverDestinatariosDesdeLista/resolverDestinatarios.
 * Evento de prueba ficticio ("TEST_EVENTO_DESTINATARIOS"): esta fase NO
 * dispara todavía ningún evento real (eso es Fase 5.4+).
 */

describe("validarFormaDestinatario (pura, sin DB)", () => {
  it("USUARIO requiere usuarioId y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "USUARIO" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "USUARIO", usuarioId: "u1" })).toBeNull();
    expect(
      validarFormaDestinatario({ tipo: "USUARIO", usuarioId: "u1", perfilId: "p1" }),
    ).not.toBeNull();
  });

  it("PERFIL requiere perfilId y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "PERFIL" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "PERFIL", perfilId: "p1" })).toBeNull();
  });

  it("AREA requiere departamentoId y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "AREA" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "AREA", departamentoId: "d1" })).toBeNull();
  });

  it("PERMISO requiere permisoClave y nada más", () => {
    expect(validarFormaDestinatario({ tipo: "PERMISO" })).not.toBeNull();
    expect(validarFormaDestinatario({ tipo: "PERMISO", permisoClave: "x.ver" })).toBeNull();
  });

  it("RESPONSABLE_REGISTRO no admite ningún id", () => {
    expect(validarFormaDestinatario({ tipo: "RESPONSABLE_REGISTRO" })).toBeNull();
    expect(
      validarFormaDestinatario({ tipo: "RESPONSABLE_REGISTRO", usuarioId: "u1" }),
    ).not.toBeNull();
  });

  it("JEFE_AREA admite departamentoId opcional, pero nada más", () => {
    expect(validarFormaDestinatario({ tipo: "JEFE_AREA" })).toBeNull();
    expect(validarFormaDestinatario({ tipo: "JEFE_AREA", departamentoId: "d1" })).toBeNull();
    expect(validarFormaDestinatario({ tipo: "JEFE_AREA", usuarioId: "u1" })).not.toBeNull();
  });

  it("rechaza un tipo desconocido", () => {
    expect(
      validarFormaDestinatario({ tipo: "NO_EXISTE" as DestinatarioLogico["tipo"] }),
    ).not.toBeNull();
  });
});

describe("tieneDestinatariosDuplicados (pura, sin DB)", () => {
  it("detecta el mismo PERFIL repetido", () => {
    expect(
      tieneDestinatariosDuplicados([
        { tipo: "PERFIL", perfilId: "p1" },
        { tipo: "PERFIL", perfilId: "p1" },
      ]),
    ).toBe(true);
  });

  it("no confunde el mismo id bajo tipos distintos", () => {
    expect(
      tieneDestinatariosDuplicados([
        { tipo: "PERFIL", perfilId: "x" },
        { tipo: "USUARIO", usuarioId: "x" },
      ]),
    ).toBe(false);
  });

  it("permite dos RESPONSABLE_REGISTRO como inválido (misma clave lógica)", () => {
    expect(
      tieneDestinatariosDuplicados([
        { tipo: "RESPONSABLE_REGISTRO" },
        { tipo: "RESPONSABLE_REGISTRO" },
      ]),
    ).toBe(true);
  });
});

const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("resolverDestinatariosDesdeLista / resolverDestinatarios (DB real)", () => {
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantAId: string;
  let tenantBId: string;
  let deptoContabilidadAId: string;
  let deptoContabilidadBId: string;
  let perfilTesoreriaAId: string;
  let perfilJefeContabilidadAId: string;
  let perfilContabilizacionAId: string;
  let perfilInactivoAId: string;
  let perfilTesoreriaBId: string;
  let juanId: string;
  let mariaId: string;
  let pedroAId: string;
  let inactivoId: string;
  let sinDeptoId: string;
  let responsableId: string;
  let pedroBId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const tenantA = await prisma.tenant.create({
      data: { nombre: `Motor Tenant A ${sufijo}`, subdomain: `test-motor-a-${sufijo}` },
    });
    const tenantB = await prisma.tenant.create({
      data: { nombre: `Motor Tenant B ${sufijo}`, subdomain: `test-motor-b-${sufijo}` },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const deptoA = await prisma.departamento.create({
      data: { tenantId: tenantAId, nombre: `Contabilidad ${sufijo}` },
    });
    deptoContabilidadAId = deptoA.id;
    const deptoB = await prisma.departamento.create({
      data: { tenantId: tenantBId, nombre: `Contabilidad ${sufijo}` },
    });
    deptoContabilidadBId = deptoB.id;

    const perfilTesoreriaA = await prisma.perfilFuncional.create({
      data: { tenantId: tenantAId, departamentoId: deptoContabilidadAId, nombre: "Tesorería" },
    });
    perfilTesoreriaAId = perfilTesoreriaA.id;
    const perfilJefeContabilidadA = await prisma.perfilFuncional.create({
      data: {
        tenantId: tenantAId,
        departamentoId: deptoContabilidadAId,
        nombre: "Jefe de Contabilidad",
        esJefeDeArea: true,
      },
    });
    perfilJefeContabilidadAId = perfilJefeContabilidadA.id;
    const perfilContabilizacionA = await prisma.perfilFuncional.create({
      data: {
        tenantId: tenantAId,
        departamentoId: deptoContabilidadAId,
        nombre: "Contabilización",
        esJefeDeArea: false,
      },
    });
    perfilContabilizacionAId = perfilContabilizacionA.id;
    const perfilInactivoA = await prisma.perfilFuncional.create({
      data: {
        tenantId: tenantAId,
        departamentoId: deptoContabilidadAId,
        nombre: "Nómina",
        activo: false,
      },
    });
    perfilInactivoAId = perfilInactivoA.id;

    const perfilTesoreriaB = await prisma.perfilFuncional.create({
      data: { tenantId: tenantBId, departamentoId: deptoContabilidadBId, nombre: "Tesorería" },
    });
    perfilTesoreriaBId = perfilTesoreriaB.id;

    const juan = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        departamentoId: deptoContabilidadAId,
        email: `motor-juan-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Juan",
        activo: true,
      },
    });
    juanId = juan.id;
    const maria = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `motor-maria-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "María",
        activo: true,
      },
    });
    mariaId = maria.id;
    const pedroA = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        departamentoId: deptoContabilidadAId,
        email: `motor-pedroa-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Pedro A",
        activo: true,
      },
    });
    pedroAId = pedroA.id;
    const inactivo = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `motor-inactivo-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Inactivo",
        activo: false,
      },
    });
    inactivoId = inactivo.id;
    const sinDepto = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `motor-sindepto-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Sin Depto",
        activo: true,
      },
    });
    sinDeptoId = sinDepto.id;
    const responsable = await prisma.user.create({
      data: {
        tenantId: tenantAId,
        email: `motor-responsable-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Responsable",
        activo: true,
      },
    });
    responsableId = responsable.id;
    const pedroB = await prisma.user.create({
      data: {
        tenantId: tenantBId,
        email: `motor-pedrob-${sufijo}@test.ricosoft.local`,
        passwordHash,
        nombre: "Pedro B",
        activo: true,
      },
    });
    pedroBId = pedroB.id;

    // Juan: Tesorería + Contabilización (varios perfiles del mismo usuario) +
    // permiso directo solicitudes.aprobar. Inactivo también asignado a
    // Tesorería, para probar que un usuario inactivo nunca aporta.
    await prisma.usuarioPerfilFuncional.createMany({
      data: [
        { tenantId: tenantAId, userId: juanId, perfilId: perfilTesoreriaAId },
        { tenantId: tenantAId, userId: juanId, perfilId: perfilContabilizacionAId },
        { tenantId: tenantAId, userId: inactivoId, perfilId: perfilTesoreriaAId },
        { tenantId: tenantAId, userId: mariaId, perfilId: perfilJefeContabilidadAId },
        { tenantId: tenantBId, userId: pedroBId, perfilId: perfilTesoreriaBId },
      ],
    });

    await prisma.permisoUsuario.create({
      data: { userId: juanId, permisoId: "solicitudes.aprobar", concedido: true },
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await prisma.reglaDestinatario.deleteMany({
      where: { regla: { tenantId: { in: tenantIds } } },
    });
    await prisma.reglaDestinatarios.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.permisoUsuario.deleteMany({ where: { userId: juanId } });
    await prisma.usuarioPerfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.perfilFuncional.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.departamento.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  // 1. USUARIO
  it("1. USUARIO resuelve exactamente ese usuario", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "USUARIO", usuarioId: juanId },
    ]);
    expect(set).toEqual(new Set([juanId]));
  });

  // 2. PERFIL
  it("2. PERFIL resuelve a los usuarios activos asignados, no a los inactivos", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "PERFIL", perfilId: perfilTesoreriaAId },
    ]);
    expect(set).toEqual(new Set([juanId]));
    expect(set.has(inactivoId)).toBe(false);
  });

  // 3. AREA
  it("3. AREA resuelve a los usuarios del departamento, no a los de fuera", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "AREA", departamentoId: deptoContabilidadAId },
    ]);
    expect(set.has(juanId)).toBe(true);
    expect(set.has(pedroAId)).toBe(true);
    expect(set.has(sinDeptoId)).toBe(false);
  });

  // 4. RESPONSABLE_REGISTRO
  it("4. RESPONSABLE_REGISTRO resuelve el id del contexto", async () => {
    const set = await resolverDestinatariosDesdeLista(
      tenantAId,
      [{ tipo: "RESPONSABLE_REGISTRO" }],
      { responsableId },
    );
    expect(set).toEqual(new Set([responsableId]));
  });

  // 5. JEFE_AREA
  it("5. JEFE_AREA resuelve solo el perfil marcado esJefeDeArea=true del área", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "JEFE_AREA", departamentoId: deptoContabilidadAId },
    ]);
    expect(set).toEqual(new Set([mariaId]));
  });

  // 6. PERMISO
  it("6. PERMISO resuelve vía listarUsuariosConPermiso, sin duplicar el cálculo", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "PERMISO", permisoClave: "solicitudes.aprobar" },
    ]);
    expect(set.has(juanId)).toBe(true);
    expect(set.has(pedroAId)).toBe(false);
  });

  // 7. múltiples destinatarios
  it("7. combina varios destinatarios en un solo resultado", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "PERFIL", perfilId: perfilJefeContabilidadAId },
      { tipo: "AREA", departamentoId: deptoContabilidadAId },
    ]);
    expect(set).toEqual(new Set([mariaId, juanId, pedroAId]));
  });

  // 8. deduplicación
  it("8. el mismo usuario alcanzado por dos vías aparece una sola vez", async () => {
    const set = await resolverDestinatariosDesdeLista(
      tenantAId,
      [
        { tipo: "USUARIO", usuarioId: juanId },
        { tipo: "PERFIL", perfilId: perfilTesoreriaAId },
      ],
      {},
    );
    expect(set.size).toBe(1);
    expect(set.has(juanId)).toBe(true);
  });

  // 9. usuario inactivo
  it("9. un destinatario USUARIO apuntando a un usuario inactivo no resuelve a nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "USUARIO", usuarioId: inactivoId },
    ]);
    expect(set.size).toBe(0);
  });

  // 10. perfil inactivo
  it("10. un PERFIL inactivo no resuelve a nadie aunque tenga usuarios asignados", async () => {
    await prisma.usuarioPerfilFuncional.create({
      data: { tenantId: tenantAId, userId: pedroAId, perfilId: perfilInactivoAId },
    });
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "PERFIL", perfilId: perfilInactivoAId },
    ]);
    expect(set.size).toBe(0);
  });

  // 11. departamento incorrecto (de otro tenant)
  it("11. AREA con un departamento de otro tenant no resuelve a nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "AREA", departamentoId: deptoContabilidadBId },
    ]);
    expect(set.size).toBe(0);
  });

  // 12. usuario de otro tenant
  it("12. USUARIO con un id de otro tenant no resuelve a nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "USUARIO", usuarioId: pedroBId },
    ]);
    expect(set.size).toBe(0);
  });

  // 13. perfil de otro tenant
  it("13. PERFIL de otro tenant no resuelve a nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "PERFIL", perfilId: perfilTesoreriaBId },
    ]);
    expect(set.size).toBe(0);
  });

  // 14. regla de otro tenant (a nivel de resolverDestinatarios persistido)
  it("14. una ReglaDestinatarios de Tenant A nunca resuelve para Tenant B", async () => {
    const evento = `TEST_EVENTO_DESTINATARIOS_${sufijo}`;
    await prisma.reglaDestinatarios.create({
      data: {
        tenantId: tenantAId,
        evento,
        destinatarios: { create: [{ tipo: "PERFIL", perfilId: perfilTesoreriaAId }] },
      },
    });
    const tpA = getTenantPrisma(tenantAId);
    const tpB = getTenantPrisma(tenantBId);
    const resultA = await resolverDestinatarios(tpA, tenantAId, evento);
    const resultB = await resolverDestinatarios(tpB, tenantBId, evento);
    expect(resultA).toEqual(new Set([juanId]));
    expect(resultB.size).toBe(0);
  });

  // 15. contexto sin responsable
  it("15. RESPONSABLE_REGISTRO sin responsable en el contexto no falla y no resuelve a nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(
      tenantAId,
      [{ tipo: "RESPONSABLE_REGISTRO" }],
      {},
    );
    expect(set.size).toBe(0);
  });

  // 16. contexto sin departamento
  it("16. JEFE_AREA sin departamento propio ni en el contexto no falla y no resuelve a nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [{ tipo: "JEFE_AREA" }], {});
    expect(set.size).toBe(0);
  });

  // 17. regla sin destinatarios
  it("17. una lista vacía de destinatarios resuelve un Set vacío de inmediato", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, []);
    expect(set.size).toBe(0);
  });

  // 18. destinatario inválido
  it("18. un tipo de destinatario desconocido no rompe la resolución, solo no aporta nadie", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "NO_EXISTE" as DestinatarioLogico["tipo"] },
    ]);
    expect(set.size).toBe(0);
  });

  // 19. varios perfiles del mismo usuario
  it("19. un usuario en varios perfiles apuntados por la regla aparece una sola vez", async () => {
    const set = await resolverDestinatariosDesdeLista(tenantAId, [
      { tipo: "PERFIL", perfilId: perfilTesoreriaAId },
      { tipo: "PERFIL", perfilId: perfilContabilizacionAId },
    ]);
    expect(set).toEqual(new Set([juanId]));
  });

  // 20. usuario que aparece por varias vías (usuario + perfil + responsable)
  it("20. un usuario alcanzado por USUARIO + PERFIL + RESPONSABLE_REGISTRO cuenta una sola vez", async () => {
    const set = await resolverDestinatariosDesdeLista(
      tenantAId,
      [
        { tipo: "USUARIO", usuarioId: juanId },
        { tipo: "PERFIL", perfilId: perfilTesoreriaAId },
        { tipo: "RESPONSABLE_REGISTRO" },
      ],
      { responsableId: juanId },
    );
    expect(set).toEqual(new Set([juanId]));
  });
});
