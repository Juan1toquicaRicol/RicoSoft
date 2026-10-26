import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { createApp } from "../../app";
import { prisma } from "../../config/prisma";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

/**
 * Máquina de estados de Proforma (ENVIADA -> ACEPTADA -> PEDIDO_CREADO |
 * ANULADA), índice único filtrado (un pedido por proforma) y consecutivo
 * monotónico de PedidoComercial, con BD REAL.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const item = {
  descripcion: "Producto",
  cantidad: 2,
  precioUnitario: 1000,
  descuentoPct: 0,
  ivaPct: 19,
};

// Interruptores (prisma.$use se registra una vez y alcanza al cliente `tx`).
let fallarAuditoria = false;
let alCrearPedido: (() => Promise<void>) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$use(
  async (
    params: { model?: string; action: string },
    next: (params: unknown) => Promise<unknown>,
  ) => {
    if (fallarAuditoria && params.model === "Auditoria" && params.action === "create") {
      throw new Error("boom auditoria");
    }
    if (alCrearPedido && params.model === "PedidoComercial" && params.action === "create") {
      const hook = alCrearPedido;
      alCrearPedido = null;
      await hook();
    }
    return next(params);
  },
);

describe.skipIf(!RUN)("Proforma — máquina de estados y consecutivo de Pedido", () => {
  const app = createApp();
  const PASSWORD = "TestPassword123";
  const sufijo = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];

  let tenantId: string;
  let token: string;
  let otroToken: string;
  let tokenSoloVer: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  const crearTenant = async (etiqueta: string, permisosRol?: string[]) => {
    const tenant = await prisma.tenant.create({
      data: {
        nombre: `Estados ${etiqueta} ${sufijo}`,
        subdomain: `test-estados-${etiqueta}-${sufijo}`,
      },
    });
    tenantIds.push(tenant.id);
    const email = `estados-${etiqueta}-${sufijo}@test.ricosoft.local`;
    const rol = permisosRol
      ? await prisma.rol.create({
          data: {
            tenantId: tenant.id,
            nombre: `Rol ${etiqueta} ${sufijo}`,
            permisos: JSON.stringify(permisosRol),
          },
        })
      : null;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        nombre: `U ${etiqueta}`,
        isSuperadmin: !permisosRol,
        activo: true,
        ...(rol ? { rolId: rol.id } : {}),
      },
    });
    const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
    if (res.status !== 200) throw new Error(`Login falló ${etiqueta}: ${res.status}`);
    return { id: tenant.id, token: res.body.token as string };
  };

  const crearProforma = async (tok = token) => {
    const res = await request(app)
      .post("/api/proformas")
      .set(auth(tok))
      .send({ clienteRowId: 1, clienteNombre: "Cliente Estados", items: [item] });
    if (res.status !== 201)
      throw new Error(`crearProforma ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string; numero: number; estado: string };
  };
  const aceptar = (id: string, tok = token) =>
    request(app).post(`/api/proformas/${id}/aceptar`).set(auth(tok)).send({});
  const anular = (id: string, tok = token) =>
    request(app).post(`/api/proformas/${id}/anular`).set(auth(tok)).send({});
  const editar = (id: string, tok = token) =>
    request(app)
      .patch(`/api/proformas/${id}`)
      .set(auth(tok))
      .send({ clienteRowId: 1, clienteNombre: "Editado", items: [item] });
  const crearPedido = (id: string, tok = token) =>
    request(app).post(`/api/comercial/proformas/${id}/pedido`).set(auth(tok)).send({});
  const proformaAceptada = async (tok = token) => {
    const p = await crearProforma(tok);
    expect((await aceptar(p.id, tok)).status).toBe(200);
    return p;
  };
  const estadoEnBd = async (id: string) =>
    (await prisma.proforma.findUniqueOrThrow({ where: { id } })).estado;
  const auditorias = (accion: string, entidadId: string) =>
    prisma.auditoria.count({ where: { accion, entidadId } });
  const contadorPedido = async (tid = tenantId) =>
    (await prisma.configuracionComercial.findUnique({ where: { tenantId: tid } }))
      ?.siguienteConsecutivoPedidoComercial ?? null;

  beforeAll(async () => {
    const a = await crearTenant("a");
    const b = await crearTenant("b");
    const c = await crearTenant("ver", [PERMISOS_SISTEMA.PROFORMAS_VER]);
    tenantId = a.id;
    token = a.token;
    otroToken = b.token;
    tokenSoloVer = c.token;
  });

  afterAll(async () => {
    await prisma.pedidoComercialItem.deleteMany({
      where: { pedido: { tenantId: { in: tenantIds } } },
    });
    await prisma.pedidoComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.proformaItem.deleteMany({ where: { proforma: { tenantId: { in: tenantIds } } } });
    await prisma.proforma.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.configuracionComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  });

  describe("aceptar", () => {
    it("una proforma nace ENVIADA y aceptar la pasa a ACEPTADA con auditoría antes/después", async () => {
      const p = await crearProforma();
      expect(p.estado).toBe("ENVIADA");

      const res = await aceptar(p.id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: p.id, estado: "ACEPTADA" });
      expect(await estadoEnBd(p.id)).toBe("ACEPTADA");
      const evento = await prisma.auditoria.findFirstOrThrow({
        where: { accion: "PROFORMA_ACEPTADA", entidadId: p.id },
      });
      expect(JSON.parse(evento.datosAnteriores!).estado).toBe("ENVIADA");
      expect(JSON.parse(evento.datosNuevos!).estado).toBe("ACEPTADA");
    });

    it("aceptar dos veces -> 409; proforma de otro tenant -> 404; sin PROFORMAS_GESTIONAR -> 403", async () => {
      const p = await proformaAceptada();
      expect((await aceptar(p.id)).status).toBe(409);
      expect((await aceptar(p.id, otroToken)).status).toBe(404);

      const nueva = await crearProforma();
      expect((await aceptar(nueva.id, tokenSoloVer)).status).toBe(403);
      expect(await estadoEnBd(nueva.id)).toBe("ENVIADA");
    });

    it("RBAC: aceptar exige comercial.proformas.aceptar (+ proformas.ver); gestionar NO basta", async () => {
      // Usuarios NO superadmin del MISMO tenant, cada uno con un rol distinto.
      const crearUsuario = async (etiqueta: string, permisos: string[]) => {
        const email = `estados-rbac-${etiqueta}-${sufijo}@test.ricosoft.local`;
        const rol = await prisma.rol.create({
          data: {
            tenantId,
            nombre: `Rol rbac ${etiqueta} ${sufijo}`,
            permisos: JSON.stringify(permisos),
          },
        });
        await prisma.user.create({
          data: {
            tenantId,
            email,
            passwordHash: await bcrypt.hash(PASSWORD, 10),
            nombre: `U ${etiqueta}`,
            isSuperadmin: false,
            activo: true,
            rolId: rol.id,
          },
        });
        const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
        return res.body.token as string;
      };
      const tokenSoloGestionar = await crearUsuario("gestionar", [
        PERMISOS_SISTEMA.PROFORMAS_VER,
        PERMISOS_SISTEMA.PROFORMAS_GESTIONAR,
      ]);
      const tokenAceptarSinVer = await crearUsuario("sinver", [PERMISOS_SISTEMA.PROFORMAS_ACEPTAR]);
      const tokenAceptar = await crearUsuario("aceptar", [
        PERMISOS_SISTEMA.PROFORMAS_VER,
        PERMISOS_SISTEMA.PROFORMAS_ACEPTAR,
      ]);

      const p = await crearProforma();
      const gestionar = await aceptar(p.id, tokenSoloGestionar);
      const sinVer = await aceptar(p.id, tokenAceptarSinVer);
      expect(gestionar.status).toBe(403);
      expect(sinVer.status).toBe(403); // aceptar exige también proformas.ver
      expect(await estadoEnBd(p.id)).toBe("ENVIADA");
      expect(await auditorias("PROFORMA_ACEPTADA", p.id)).toBe(0);

      const ok = await aceptar(p.id, tokenAceptar);
      expect(ok.status).toBe(200);
      expect(await estadoEnBd(p.id)).toBe("ACEPTADA");
    });

    it("dos aceptaciones simultáneas -> un 200, un 409 y UNA sola auditoría", async () => {
      const p = await crearProforma();
      const [a, b] = await Promise.all([aceptar(p.id), aceptar(p.id)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await auditorias("PROFORMA_ACEPTADA", p.id)).toBe(1);
    });

    it("ROLLBACK: si la auditoría falla, la proforma sigue ENVIADA", async () => {
      const p = await crearProforma();
      fallarAuditoria = true;
      try {
        expect((await aceptar(p.id)).status).toBe(500);
      } finally {
        fallarAuditoria = false;
      }
      expect(await estadoEnBd(p.id)).toBe("ENVIADA");
    });
  });

  describe("crear Pedido desde Proforma", () => {
    it("ENVIADA -> 409 (no se puede crear pedido antes de aceptar)", async () => {
      const p = await crearProforma();
      const res = await crearPedido(p.id);
      expect(res.status).toBe(409);
      expect(await estadoEnBd(p.id)).toBe("ENVIADA");
      expect(await prisma.pedidoComercial.count({ where: { proformaId: p.id } })).toBe(0);
    });

    it("ACEPTADA -> 201; la proforma pasa a PEDIDO_CREADO y todo queda auditado", async () => {
      const p = await proformaAceptada();
      const res = await crearPedido(p.id);

      expect(res.status).toBe(201);
      expect(res.body.proformaId).toBe(p.id);
      expect(await estadoEnBd(p.id)).toBe("PEDIDO_CREADO");
      const evento = await prisma.auditoria.findFirstOrThrow({
        where: { accion: "PEDIDO_COMERCIAL_CREADO", entidadId: res.body.id },
      });
      expect(JSON.parse(evento.datosAnteriores!).proformaEstado).toBe("ACEPTADA");
      expect(JSON.parse(evento.datosNuevos!).proformaEstado).toBe("PEDIDO_CREADO");
    });

    it("segundo intento sobre la misma proforma -> 409 y un solo pedido", async () => {
      const p = await proformaAceptada();
      expect((await crearPedido(p.id)).status).toBe(201);
      expect((await crearPedido(p.id)).status).toBe(409);
      expect(await prisma.pedidoComercial.count({ where: { proformaId: p.id } })).toBe(1);
    });

    it("dos creaciones SIMULTÁNEAS -> un 201, un 409, un pedido, una auditoría de creación", async () => {
      const p = await proformaAceptada();
      const [a, b] = await Promise.all([crearPedido(p.id), crearPedido(p.id)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await prisma.pedidoComercial.count({ where: { proformaId: p.id } })).toBe(1);
      expect(await estadoEnBd(p.id)).toBe("PEDIDO_CREADO");
      const ganador = [a, b].find((r) => r.status === 201)!;
      expect(await auditorias("PEDIDO_COMERCIAL_CREADO", ganador.body.id)).toBe(1);
    });

    it("el índice único filtrado de BD rechaza un segundo pedido de la misma proforma (P2002)", async () => {
      const p = await proformaAceptada();
      const res = await crearPedido(p.id);
      expect(res.status).toBe(201);
      await expect(
        prisma.pedidoComercial.create({
          data: {
            tenantId,
            numero: 999_001,
            proformaId: p.id,
            clienteRowId: 1,
            clienteNombre: "Duplicado directo",
            creadoPorNombre: "Suite",
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      // ...pero pedidos SIN proforma coexisten (índice filtrado, no @@unique plano).
      for (const numero of [999_002, 999_003]) {
        await prisma.pedidoComercial.create({
          data: {
            tenantId,
            numero,
            clienteRowId: 1,
            clienteNombre: "Sin proforma",
            creadoPorNombre: "Suite",
          },
        });
      }
    });

    it("transición CONDICIONAL: si la proforma deja de estar ACEPTADA a mitad de camino -> 409 y rollback total", async () => {
      const p = await proformaAceptada();
      // Justo antes de insertar el pedido, otro proceso anula la proforma.
      alCrearPedido = async () => {
        await prisma.proforma.update({ where: { id: p.id }, data: { estado: "ANULADA" } });
      };

      const res = await crearPedido(p.id);

      expect(res.status).toBe(409);
      expect(await estadoEnBd(p.id)).toBe("ANULADA"); // no la pisó con PEDIDO_CREADO
      expect(await prisma.pedidoComercial.count({ where: { proformaId: p.id } })).toBe(0);
    });

    it("ROLLBACK: si la auditoría falla -> 500, proforma sigue ACEPTADA, sin pedido y contador intacto", async () => {
      const p = await proformaAceptada();
      const contadorAntes = await contadorPedido();
      fallarAuditoria = true;
      try {
        expect((await crearPedido(p.id)).status).toBe(500);
      } finally {
        fallarAuditoria = false;
      }
      expect(await estadoEnBd(p.id)).toBe("ACEPTADA");
      expect(await prisma.pedidoComercial.count({ where: { proformaId: p.id } })).toBe(0);
      expect(await contadorPedido()).toBe(contadorAntes);
      expect((await crearPedido(p.id)).status).toBe(201); // el reintento funciona
    });
  });

  describe("estados inmutables", () => {
    it("PEDIDO_CREADO: no se edita, acepta, anula ni vincula ERP (409)", async () => {
      const p = await proformaAceptada();
      expect((await crearPedido(p.id)).status).toBe(201);

      expect((await editar(p.id)).status).toBe(409);
      expect((await aceptar(p.id)).status).toBe(409);
      expect((await anular(p.id)).status).toBe(409);
      const erp = await request(app)
        .patch(`/api/proformas/${p.id}/documento-erp`)
        .set(auth(token))
        .send({ cotizacionIdExterno: "123" });
      expect(erp.status).toBe(409);
      expect(await estadoEnBd(p.id)).toBe("PEDIDO_CREADO");
    });

    it("ANULADA: no se edita, acepta, anula ni genera pedido (409)", async () => {
      const p = await crearProforma();
      expect((await anular(p.id)).status).toBe(200);

      expect((await editar(p.id)).status).toBe(409);
      expect((await aceptar(p.id)).status).toBe(409);
      expect((await anular(p.id)).status).toBe(409);
      expect((await crearPedido(p.id)).status).toBe(409);
      expect(await estadoEnBd(p.id)).toBe("ANULADA");
    });

    it("ENVIADA y ACEPTADA sí se editan y se anulan", async () => {
      const enviada = await crearProforma();
      expect((await editar(enviada.id)).status).toBe(200);
      expect((await anular(enviada.id)).status).toBe(200);

      const aceptada = await proformaAceptada();
      expect((await editar(aceptada.id)).status).toBe(200);
      expect(await estadoEnBd(aceptada.id)).toBe("ACEPTADA");
      expect((await anular(aceptada.id)).status).toBe(200);
      expect(await estadoEnBd(aceptada.id)).toBe("ANULADA");
    });
  });

  describe("consecutivo monotónico de PedidoComercial", () => {
    it("empieza en 1, avanza el contador y aísla por tenant", async () => {
      const t = await crearTenant("cons1");
      const p1 = await proformaAceptada(t.token);
      const p2 = await proformaAceptada(t.token);

      const n1 = await crearPedido(p1.id, t.token);
      expect(n1.body.numero).toBe(1);
      expect(await contadorPedido(t.id)).toBe(2);
      const n2 = await crearPedido(p2.id, t.token);
      expect(n2.body.numero).toBe(2);
      expect(await contadorPedido(t.id)).toBe(3);

      // otro tenant: su propia secuencia desde 1
      const otro = await crearTenant("cons2");
      const po = await proformaAceptada(otro.token);
      expect((await crearPedido(po.id, otro.token)).body.numero).toBe(1);
    });

    it("respeta un contador más alto y nunca reutiliza un número ya usado (max(contador, MAX+1))", async () => {
      const t = await crearTenant("cons3");
      const p1 = await proformaAceptada(t.token);
      expect((await crearPedido(p1.id, t.token)).body.numero).toBe(1);

      await prisma.configuracionComercial.update({
        where: { tenantId: t.id },
        data: { siguienteConsecutivoPedidoComercial: 50 },
      });
      const p2 = await proformaAceptada(t.token);
      expect((await crearPedido(p2.id, t.token)).body.numero).toBe(50);
      expect(await contadorPedido(t.id)).toBe(51);

      // Contador manipulado hacia atrás: el MAX(numero)+1 evita repetir.
      await prisma.configuracionComercial.update({
        where: { tenantId: t.id },
        data: { siguienteConsecutivoPedidoComercial: 1 },
      });
      const p3 = await proformaAceptada(t.token);
      expect((await crearPedido(p3.id, t.token)).body.numero).toBe(51);
      expect(await contadorPedido(t.id)).toBe(52);
    });

    it("creaciones concurrentes de pedidos (proformas distintas) -> números distintos y consecutivos", async () => {
      const t = await crearTenant("cons4");
      const N = 5;
      const proformas = [];
      for (let i = 0; i < N; i++) proformas.push(await proformaAceptada(t.token));

      const resultados = await Promise.all(proformas.map((p) => crearPedido(p.id, t.token)));

      expect(resultados.map((r) => r.status)).toEqual(Array(N).fill(201));
      const numeros = resultados.map((r) => r.body.numero as number).sort((x, y) => x - y);
      expect(numeros).toEqual([1, 2, 3, 4, 5]);
      expect(await contadorPedido(t.id)).toBe(N + 1);
    });
  });
});
