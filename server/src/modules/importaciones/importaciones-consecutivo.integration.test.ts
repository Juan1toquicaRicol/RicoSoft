import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { anioActualImportaciones } from "./importaciones-consecutivo";

/**
 * Consecutivo anual de órdenes internacionales (IMP-<año>-<n>) y responsable
 * de la importación, con BD real. Cada escenario usa su propio tenant para no
 * depender del orden de los tests.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("Importaciones — consecutivo anual y responsables (BD real)", () => {
  const app = createApp();
  const sufijo = randomUUID().slice(0, 8);
  const PASSWORD = "TestPassword123";
  const anio = anioActualImportaciones();
  const codigo = (n: number) => `IMP-${anio}-${String(n).padStart(3, "0")}`;

  const tenantIds: string[] = [];
  const emails = {
    admin: (t: string) => `cons-admin-${t}-${sufijo}@test.ricosoft.local`,
  };
  let passwordHash: string;

  const datosOrden = (extra: Record<string, unknown> = {}) => ({
    incoterm: "FOB",
    proveedorExtranjero: "Proveedor Consecutivo",
    paisOrigen: "China",
    moneda: "USD",
    trmPactada: 4000,
    items: [{ descripcion: "Ítem", cantidad: 1, valorUnitarioFob: 10 }],
    ...extra,
  });

  async function login(email: string): Promise<string> {
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    return res.body.token as string;
  }

  async function crearTenant(etiqueta: string) {
    const tenant = await prisma.tenant.create({
      data: { nombre: `Cons ${etiqueta} ${sufijo}`, subdomain: `test-cons-${etiqueta}-${sufijo}` },
    });
    tenantIds.push(tenant.id);
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: emails.admin(etiqueta),
        passwordHash,
        nombre: `Admin ${etiqueta}`,
        isSuperadmin: true,
        activo: true,
      },
    });
    return { tenantId: tenant.id, token: await login(emails.admin(etiqueta)) };
  }

  const ordenLegada = (tenantId: string, cod: string, extra: Record<string, unknown> = {}) =>
    prisma.ordenCompraIntl.create({
      data: {
        tenantId,
        codigo: cod,
        numeroOrden: cod,
        incoterm: "FOB",
        proveedorExtranjero: "Legada",
        paisOrigen: "China",
        moneda: "USD",
        trmPactada: 4000,
        valorEstimadoTotal: 1,
        ...extra,
      },
    });

  const get = (token: string) =>
    request(app).get("/api/importaciones/consecutivo").set("Authorization", `Bearer ${token}`);
  const put = (token: string, siguiente: unknown) =>
    request(app)
      .put("/api/importaciones/consecutivo")
      .set("Authorization", `Bearer ${token}`)
      .send({ siguiente });
  const crear = (token: string, extra: Record<string, unknown> = {}) =>
    request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${token}`)
      .send(datosOrden(extra));

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  afterAll(async () => {
    await prisma.inboxItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notificacion.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.importacionHistorial.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.importacionActividad.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.itemOrdenCompraIntl.deleteMany({
      where: { ordenCompra: { tenantId: { in: tenantIds } } },
    });
    await prisma.ordenCompraIntl.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.membresia.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  it("1. el servidor asigna codigo = numeroOrden = IMP-año-001 e ignora lo que envíe el cliente", async () => {
    const { token } = await crearTenant("a");
    const estimado = await get(token);
    expect(estimado.status).toBe(200);
    expect(estimado.body).toMatchObject({ anio, siguiente: 1, codigoSiguiente: codigo(1) });

    const res = await crear(token, { numeroOrden: "MI-NUMERO-MANUAL", codigo: codigo(777) });
    expect(res.status).toBe(201);
    expect(res.body.codigo).toBe(codigo(1));
    expect(res.body.numeroOrden).toBe(codigo(1));

    const fila = await prisma.ordenCompraIntl.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(fila.codigo).toBe(codigo(1));
    expect(fila.numeroOrden).toBe(codigo(1));

    expect((await get(token)).body.siguiente).toBe(2);
    const segunda = await crear(token);
    expect(segunda.body.codigo).toBe(codigo(2));
  });

  it("2. mínimo a partir de los códigos existentes: tras IMP-año-009 el siguiente no puede ser < 010 y no se puede bajar", async () => {
    const { tenantId, token } = await crearTenant("legado");
    await ordenLegada(tenantId, codigo(9));
    // Una serie de otro año no influye en el año actual.
    await ordenLegada(tenantId, `IMP-${anio - 1}-050`);

    const estado = await get(token);
    expect(estado.body).toMatchObject({ siguiente: 10, minimo: 10, codigoSiguiente: codigo(10) });

    const bajar = await put(token, 5);
    expect(bajar.status).toBe(400);
    expect(bajar.body.minimo).toBe(10);
    expect((await get(token)).body.siguiente).toBe(10);

    const subir = await put(token, 20);
    expect(subir.status).toBe(200);
    expect(subir.body.siguiente).toBe(20);

    const nueva = await crear(token);
    expect(nueva.body.codigo).toBe(codigo(20));
    expect(nueva.body.numeroOrden).toBe(codigo(20));

    // Ya no se puede volver a 20 (el vigente es 21), ni a nada menor.
    expect((await put(token, 20)).status).toBe(400);
    expect((await put(token, 21)).status).toBe(200);

    const auditoria = await prisma.auditoria.findMany({
      where: { tenantId, accion: "CONSECUTIVO_IMPORTACION_ACTUALIZADO" },
    });
    expect(auditoria.length).toBe(2);
    expect(auditoria[0].datosAnteriores).toBeTruthy();
  });

  it("3. el número de una orden anulada o eliminada no se reutiliza ni se puede fijar por debajo", async () => {
    const { tenantId, token } = await crearTenant("anulada");
    const o1 = await crear(token);
    expect(o1.body.codigo).toBe(codigo(1));
    const anular = await request(app)
      .delete(`/api/importaciones/${o1.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ motivo: "prueba" });
    expect([200, 204]).toContain(anular.status);

    const o2 = await crear(token);
    expect(o2.body.codigo).toBe(codigo(2));

    // Aunque el contador fuera menor, el MAX de códigos existentes (incluida la
    // anulada) lo protege: se simula un contador atrasado.
    await prisma.consecutivoImportacion.updateMany({
      where: { tenantId, anio },
      data: { siguienteConsecutivo: 1 },
    });
    expect((await get(token)).body.siguiente).toBe(3);
    expect((await put(token, 2)).status).toBe(400);
    expect((await crear(token)).body.codigo).toBe(codigo(3));
  });

  it("4. creaciones concurrentes: sin duplicados y números consecutivos", async () => {
    const { tenantId, token } = await crearTenant("conc");
    const N = 6;
    const resultados = await Promise.all(Array.from({ length: N }, () => crear(token)));
    expect(resultados.map((r) => r.status)).toEqual(Array(N).fill(201));

    const codigos = resultados.map((r) => r.body.codigo as string).sort();
    expect(new Set(codigos).size).toBe(N);
    expect(codigos).toEqual(Array.from({ length: N }, (_, i) => codigo(i + 1)));
    for (const r of resultados) expect(r.body.numeroOrden).toBe(r.body.codigo);

    const filas = await prisma.ordenCompraIntl.findMany({ where: { tenantId } });
    expect(new Set(filas.map((f) => f.codigo)).size).toBe(N);
    expect((await get(token)).body.siguiente).toBe(N + 1);
  });

  it("5. una orden que falla no consume consecutivo", async () => {
    const { tenantId, token } = await crearTenant("falla");
    const invalida = await crear(token, { incoterm: "NO-EXISTE" });
    expect(invalida.status).toBe(400);
    expect(await prisma.consecutivoImportacion.count({ where: { tenantId } })).toBe(0);
    expect((await crear(token)).body.codigo).toBe(codigo(1));
  });

  it("6. aislamiento: las series de dos tenants son independientes y el cliente no puede elegir tenant", async () => {
    const a = await crearTenant("iso-a");
    const b = await crearTenant("iso-b");
    await crear(a.token);
    await crear(a.token);
    expect((await get(b.token)).body.siguiente).toBe(1);
    const enB = await request(app)
      .post("/api/importaciones")
      .set("Authorization", `Bearer ${b.token}`)
      .send(datosOrden({ tenantId: a.tenantId }));
    expect(enB.status).toBe(201);
    expect(enB.body.codigo).toBe(codigo(1));
    const fila = await prisma.ordenCompraIntl.findUniqueOrThrow({ where: { id: enB.body.id } });
    expect(fila.tenantId).toBe(b.tenantId);
    // Fijar el consecutivo de B no toca el de A.
    expect((await put(b.token, 50)).status).toBe(200);
    expect((await get(a.token)).body.siguiente).toBe(3);
  });

  it("7. permisos: ver/consultar exige importaciones.crear o configuracion.editar; fijar exige configuracion.editar", async () => {
    const { tenantId, token } = await crearTenant("perm");
    const mk = async (nombre: string, permisos: string[]) => {
      const rol = await prisma.rol.create({
        data: { tenantId, nombre: `${nombre} ${sufijo}`, permisos: JSON.stringify(permisos) },
      });
      const email = `cons-${nombre}-${sufijo}@test.ricosoft.local`;
      await prisma.user.create({
        data: { tenantId, email, passwordHash, nombre, rolId: rol.id, activo: true },
      });
      return login(email);
    };
    const tokenCrear = await mk("creador", ["importaciones.ver", "importaciones.crear"]);
    const tokenLector = await mk("lector", ["importaciones.ver"]);
    const tokenConfig = await mk("config", ["configuracion.editar"]);

    expect((await get(tokenCrear)).status).toBe(200);
    expect((await get(tokenConfig)).status).toBe(200);
    expect((await get(tokenLector)).status).toBe(403);
    expect((await put(tokenCrear, 5)).status).toBe(403);
    expect((await put(tokenLector, 5)).status).toBe(403);
    expect((await put(tokenConfig, 5)).status).toBe(200);
    expect((await put(token, "abc")).status).toBe(400);
    expect((await put(token, 0)).status).toBe(400);
    expect((await put(token, 1.5)).status).toBe(400);
  });

  describe("responsable de la importación", () => {
    let tenantId: string;
    let tokenAdmin: string;
    const ids: Record<string, string> = {};

    beforeAll(async () => {
      const t = await crearTenant("resp");
      tenantId = t.tenantId;
      tokenAdmin = t.token;
      const rol = (nombre: string, permisos: string[], activo = true) =>
        prisma.rol.create({
          data: {
            tenantId,
            nombre: `${nombre} ${sufijo}`,
            permisos: JSON.stringify(permisos),
            activo,
          },
        });
      const rolCrear = await rol("rcrear", ["importaciones.ver", "importaciones.crear"]);
      const rolGestor = await rol("rgestor", [
        "importaciones.ver",
        "importaciones.gestionar_transito",
      ]);
      const rolLector = await rol("rlector", ["importaciones.ver"]);
      const rolApagado = await rol("rapagado", ["importaciones.ver", "importaciones.crear"], false);
      const usuario = async (nombre: string, extra: Record<string, unknown> = {}) => {
        const u = await prisma.user.create({
          data: {
            tenantId,
            email: `resp-${nombre}-${sufijo}@test.ricosoft.local`,
            passwordHash,
            nombre,
            activo: true,
            ...extra,
          },
        });
        ids[nombre] = u.id;
        return u;
      };
      await usuario("Creador", { rolId: rolCrear.id });
      await usuario("Gestor", { rolId: rolGestor.id });
      await usuario("Lector", { rolId: rolLector.id });
      await usuario("SinRol");
      await usuario("Inactivo", { rolId: rolCrear.id, activo: false });
      await usuario("RolApagado", { rolId: rolApagado.id });
      const revocado = await usuario("Revocado", { rolId: rolCrear.id });
      await prisma.permisoUsuario.create({
        data: { userId: revocado.id, permisoId: "importaciones.crear", concedido: false },
      });
      const concedido = await usuario("ConcedidoDirecto");
      await prisma.permisoUsuario.createMany({
        data: [
          { userId: concedido.id, permisoId: "importaciones.ver", concedido: true },
          { userId: concedido.id, permisoId: "importaciones.crear", concedido: true },
        ],
      });

      // Usuario de OTRO tenant (hogar) con membresía en este: cuenta con el rol de la membresía.
      const otro = await prisma.tenant.create({
        data: { nombre: `Cons hogar ${sufijo}`, subdomain: `test-cons-hogar-${sufijo}` },
      });
      tenantIds.push(otro.id);
      const miembro = await prisma.user.create({
        data: {
          tenantId: otro.id,
          email: `resp-miembro-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Miembro",
          activo: true,
        },
      });
      ids.Miembro = miembro.id;
      await prisma.membresia.create({
        data: { userId: miembro.id, tenantId, rolId: rolCrear.id, activo: true },
      });
      // Membresía inactiva: no cuenta.
      const miembroInactivo = await prisma.user.create({
        data: {
          tenantId: otro.id,
          email: `resp-miembro-off-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "MiembroInactivo",
          activo: true,
        },
      });
      ids.MiembroInactivo = miembroInactivo.id;
      await prisma.membresia.create({
        data: { userId: miembroInactivo.id, tenantId, rolId: rolCrear.id, activo: false },
      });
    });

    it("lista solo usuarios activos con permiso efectivo de crear o gestionar (rol, permisos directos, revocaciones, membresías)", async () => {
      const res = await request(app)
        .get("/api/importaciones/responsables")
        .set("Authorization", `Bearer ${tokenAdmin}`);
      expect(res.status).toBe(200);
      const nombres = (res.body as { nombre: string }[]).map((u) => u.nombre);
      expect(nombres).toEqual(
        expect.arrayContaining(["Creador", "Gestor", "ConcedidoDirecto", "Miembro", `Admin resp`]),
      );
      for (const excluido of [
        "Lector",
        "SinRol",
        "Inactivo",
        "RolApagado",
        "Revocado",
        "MiembroInactivo",
      ]) {
        expect(nombres).not.toContain(excluido);
      }
    });

    it("la API valida la misma condición al recibir responsableId", async () => {
      for (const nombre of ["Creador", "Gestor", "ConcedidoDirecto", "Miembro"]) {
        const ok = await crear(tokenAdmin, { responsableId: ids[nombre] });
        expect(ok.status, nombre).toBe(201);
        expect(ok.body.responsable?.id).toBe(ids[nombre]);
      }
      for (const nombre of ["Lector", "SinRol", "RolApagado", "Revocado", "MiembroInactivo"]) {
        const malo = await crear(tokenAdmin, { responsableId: ids[nombre] });
        expect(malo.status, nombre).toBe(nombre === "MiembroInactivo" ? 404 : 400);
      }
      // Inactivo del tenant: ya no existe como responsable posible.
      expect((await crear(tokenAdmin, { responsableId: ids.Inactivo })).status).toBe(404);
      // Id de otro tenant (IDOR) → no existe aquí.
      const otroTenant = await crearTenant("ajeno");
      const ajeno = await prisma.user.findFirstOrThrow({
        where: { tenantId: otroTenant.tenantId },
      });
      expect((await crear(tokenAdmin, { responsableId: ajeno.id })).status).toBe(404);
    });
  });
});
