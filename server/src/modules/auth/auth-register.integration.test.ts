import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

/**
 * Fase 5.4.1 (hardening de auditoría) — autoregistro público
 * (POST /api/auth/register). Cubre los dos hallazgos CRÍTICOS reportados:
 *
 *  1. Un departamento con esSistemas=true otorga TODOS los permisos del
 *     sistema (calcularPermisosEfectivos) — el autoregistro NUNCA puede
 *     aterrizar ahí, sin importar que el id venga de un endpoint público
 *     legítimo (GET /departamentos/publico).
 *  2. El autoregistro no verifica que quien se registra controla la bandeja
 *     de correo (no hay flujo de confirmación) — la cuenta se crea inactiva,
 *     pendiente de aprobación explícita por un administrador.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("POST /api/auth/register — hardening (Fase 5.4.1, BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  // esDominioCorporativoValido (lib/dominios.ts) solo acepta un puñado de
  // dominios reales hardcodeados, y Tenant.dominioCorporativo es @unique —
  // no se puede crear un tenant de prueba con un dominio inventado y que
  // pase esa validación. Se reutiliza el tenant real de RICOL (el único
  // dueño de "ricol.com.co") SOLO como padre de datos nuevos: un
  // departamento nuevo y usuarios con emails nuevos, jamás se toca ni se lee
  // nada preexistente de ese tenant, y el afterAll borra únicamente lo que
  // este archivo creó (por id).
  const DOMINIO = "ricol.com.co";

  let tenantId: string;
  let departamentoSistemasId: string;
  let departamentoNormalId: string;

  beforeAll(async () => {
    const tenantRicol = await prisma.tenant.findUniqueOrThrow({
      where: { dominioCorporativo: DOMINIO },
      select: { id: true },
    });
    tenantId = tenantRicol.id;

    const departamentoSistemas = await prisma.departamento.create({
      data: { tenantId, nombre: `Sistemas Test ${sufijo}`, esSistemas: true, activo: true },
    });
    departamentoSistemasId = departamentoSistemas.id;
    const departamentoNormal = await prisma.departamento.create({
      data: { tenantId, nombre: `Operaciones Test ${sufijo}`, esSistemas: false, activo: true },
    });
    departamentoNormalId = departamentoNormal.id;
  });

  afterAll(async () => {
    const usuariosDePrueba = await prisma.user.findMany({
      where: { email: { contains: `+${sufijo}@` } },
      select: { id: true },
    });
    const userIds = usuariosDePrueba.map((u) => u.id);
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.departamento.deleteMany({
      where: { id: { in: [departamentoSistemasId, departamentoNormalId] } },
    });
    await prisma.$disconnect();
  });

  it("1. rechaza el registro si el departamento elegido tiene esSistemas=true (no crea el usuario)", async () => {
    const email = `registro-sistemas+${sufijo}@${DOMINIO}`;
    const res = await request(app).post("/api/auth/register").send({
      nombre: "Intento Escalado",
      email,
      password: "ClaveSegura123",
      departamentoId: departamentoSistemasId,
    });
    expect(res.status).toBe(400);

    const noCreado = await prisma.user.findUnique({ where: { email } });
    expect(noCreado).toBeNull();
  });

  it("2. permite el registro con un departamento normal, pero la cuenta queda INACTIVA", async () => {
    const email = `registro-normal+${sufijo}@${DOMINIO}`;
    const res = await request(app).post("/api/auth/register").send({
      nombre: "Registro Normal",
      email,
      password: "ClaveSegura123",
      departamentoId: departamentoNormalId,
    });
    expect(res.status).toBe(201);

    const creado = await prisma.user.findUnique({ where: { email } });
    expect(creado).not.toBeNull();
    expect(creado?.activo).toBe(false);
    expect(creado?.isSuperadmin).toBe(false);
    expect(creado?.rolId).toBeNull();
  });

  it("3. una cuenta autoregistrada (inactiva) no puede iniciar sesión hasta ser activada", async () => {
    const email = `registro-login+${sufijo}@${DOMINIO}`;
    await request(app).post("/api/auth/register").send({
      nombre: "Pendiente Aprobación",
      email,
      password: "ClaveSegura123",
      departamentoId: departamentoNormalId,
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "ClaveSegura123" });
    expect(login.status).toBe(401);
    expect(login.body.message).toMatch(/inactiva/i);
  });

  it("4. tras activar la cuenta (flujo administrativo existente), el login funciona", async () => {
    const email = `registro-activado+${sufijo}@${DOMINIO}`;
    await request(app).post("/api/auth/register").send({
      nombre: "Ya Aprobado",
      email,
      password: "ClaveSegura123",
      departamentoId: departamentoNormalId,
    });
    await prisma.user.update({ where: { email }, data: { activo: true } });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "ClaveSegura123" });
    expect(login.status).toBe(200);
  });
});

describe.skipIf(!RUN)("POST /api/auth/login — enumeración de cuentas (Fase 5.4.1, BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";

  let tenantId: string;
  let emailInactivo: string;

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { nombre: `Enum Login ${sufijo}`, subdomain: `test-enum-login-${sufijo}` },
    });
    tenantId = tenant.id;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    emailInactivo = `enum-inactivo-${sufijo}@test.ricosoft.local`;
    await prisma.user.create({
      data: {
        tenantId,
        email: emailInactivo,
        passwordHash,
        nombre: "Cuenta Inactiva",
        activo: false,
      },
    });
  });

  afterAll(async () => {
    // El intento de login con clave incorrecta contra una cuenta que sí
    // existe deja un registro LOGIN_FALLIDO en Auditoria (FK a User) — hay
    // que borrarlo antes del usuario, o el delete de abajo falla igual que
    // el hallazgo de limpieza ya corregido en auth.integration.test.ts.
    await prisma.auditoria.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  it("un correo inexistente y una cuenta inactiva con contraseña incorrecta devuelven el MISMO mensaje", async () => {
    const inexistente = await request(app)
      .post("/api/auth/login")
      .send({ email: `no-existe-${sufijo}@test.ricosoft.local`, password: "loquesea123X" });
    const inactivaClaveMala = await request(app)
      .post("/api/auth/login")
      .send({ email: emailInactivo, password: "loquesea123X" });

    expect(inexistente.status).toBe(401);
    expect(inactivaClaveMala.status).toBe(401);
    expect(inactivaClaveMala.body.message).toBe(inexistente.body.message);
  });

  it("una cuenta inactiva con la contraseña CORRECTA sí revela específicamente que está inactiva", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: emailInactivo, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/inactiva/i);
  });
});
