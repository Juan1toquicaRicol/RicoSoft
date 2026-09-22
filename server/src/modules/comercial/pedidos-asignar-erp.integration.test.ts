import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { PERMISOS_SISTEMA } from "../../lib/permissions";

/**
 * Suite de integración con BASE DE DATOS REAL para
 * POST /comercial/pedidos/:id/asignar-erp (vinculación V1 con el PDV real
 * de Siesa). Mismo patrón que comercial.integration.test.ts/
 * permisos-ver-manipular.integration.test.ts (app real + supertest + BD
 * real, RUN_DB_INTEGRATION_TESTS) — la única pieza mockeada es la conexión
 * a Siesa (../../config/siesa::getSiesaPool), exactamente como ya hace
 * siesa-pedidos.service.test.ts para probar el filtro CDV/PDV sin VPN. Con
 * esto, el índice único filtrado de BD (sección 8 del encargo) se ejercita
 * de verdad — no se puede verificar de forma creíble con un mock de Prisma.
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

const CIA_ID = 900950;
const CLIENTE_ROW_ID = 2001;
const OTRO_CLIENTE_ROW_ID = 2002;

interface PdvFake {
  f430_rowid: number;
  f430_id_cia: number;
  f430_consec_docto: number;
  f430_id_tipo_docto: "PDV" | "CDV";
  f430_rowid_tercero_fact: number;
}

const PDV_OTRO_CLIENTE: PdvFake = {
  f430_rowid: 71003,
  f430_id_cia: CIA_ID,
  f430_consec_docto: 71003,
  f430_id_tipo_docto: "PDV",
  f430_rowid_tercero_fact: OTRO_CLIENTE_ROW_ID,
};
// Mismo rowid "conceptual" que un CDV real (no coincide con ningún f430_rowid
// de la tabla de prueba) — homónimo de tipo equivocado, para confirmar que
// leerPdvSiesa exige 'PDV' y no confunde un CDV con un PDV.
const CDV_HOMONIMO: PdvFake = {
  f430_rowid: 71004,
  f430_id_cia: CIA_ID,
  f430_consec_docto: 71004,
  f430_id_tipo_docto: "CDV",
  f430_rowid_tercero_fact: CLIENTE_ROW_ID,
};

const TABLA_PDV: PdvFake[] = [PDV_OTRO_CLIENTE, CDV_HOMONIMO];

// El índice único filtrado de BD es REAL (misma base entre corridas de este
// archivo): reusar un f430_rowid ya vinculado por un test anterior haría que
// el SIGUIENTE intento de vincular por primera vez choque contra ese vínculo
// previo, no contra lo que ese test realmente quiere probar. Cada test que
// necesita "un PDV al que se pueda vincular con éxito" pide uno nuevo aquí.
let siguientePdvRowId = 72001;
function nuevoPdvValido(clienteRowId = CLIENTE_ROW_ID): PdvFake {
  const rowid = siguientePdvRowId++;
  const pdv: PdvFake = {
    f430_rowid: rowid,
    f430_id_cia: CIA_ID,
    f430_consec_docto: rowid,
    f430_id_tipo_docto: "PDV",
    f430_rowid_tercero_fact: clienteRowId,
  };
  TABLA_PDV.push(pdv);
  return pdv;
}

function crearRequestFake() {
  const inputs: Record<string, unknown> = {};
  const req = {
    input(nombre: string, valor: unknown) {
      inputs[nombre] = valor;
      return req;
    },
    async query(sql: string) {
      const exigePdv = /f430_id_tipo_docto\s*=\s*'PDV'/.test(sql);
      let filas = TABLA_PDV.filter(
        (f) => f.f430_id_cia === inputs.ciaId && f.f430_rowid === inputs.rowId,
      );
      if (exigePdv) filas = filas.filter((f) => f.f430_id_tipo_docto === "PDV");
      return {
        recordset: filas.map((f) => ({
          pdvRowId: f.f430_rowid,
          pdvNumero: f.f430_consec_docto,
          clienteRowId: f.f430_rowid_tercero_fact,
          clienteNombre: "Cliente Demo Siesa",
          clienteNit: "900123456-1",
          fecha: new Date("2026-09-01"),
        })),
      };
    },
  };
  return req;
}

const poolFake = { request: vi.fn(() => crearRequestFake()) };
const getSiesaPoolMock = vi.fn(async () => poolFake);

vi.mock("../../config/siesa", () => ({
  getSiesaPool: (...args: unknown[]) => getSiesaPoolMock(...args),
}));

import { createApp } from "../../app";
import { prisma } from "../../config/prisma";

// Interruptor para el test 22 (rollback de auditoría). Registrado UNA sola
// vez a nivel de módulo porque prisma.$use no admite "des-registrarse" —
// stackear un $use nuevo por test dejaría el mock anterior activo para
// siempre. Con el interruptor en false (default), el middleware es un
// passthrough inofensivo para el resto de la suite.
let forzarFalloAuditoria = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(prisma as any).$use(
  async (
    params: { model?: string; action: string },
    next: (params: unknown) => Promise<unknown>,
  ) => {
    if (forzarFalloAuditoria && params.model === "Auditoria" && params.action === "create") {
      throw new Error("boom inesperado");
    }
    return next(params);
  },
);

describe.skipIf(!RUN)(
  "POST /comercial/pedidos/:id/asignar-erp — vinculación con PDV real de Siesa",
  () => {
    const app = createApp();
    const PASSWORD = "TestPassword123";
    const sufijo = randomUUID().slice(0, 8);

    let tenantId: string;
    let otroTenantId: string;
    let tenantSinSiesaId: string;
    let token: string;
    let otroToken: string;
    let tokenSinSiesa: string;
    let tokenSoloVer: string;
    let numeroBase = 800000;

    const login = async (email: string): Promise<string> => {
      const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
      if (res.status !== 200 || !res.body.token) {
        throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      }
      return res.body.token as string;
    };

    /** Crea un PedidoComercial directamente (sin pasar por la cadena
     * Cotización→Proforma) — la máquina de transiciones ya está cubierta por
     * comercial.integration.test.ts; aquí solo hace falta una fila con el
     * estado/cliente/erp* exactos que cada caso necesita. */
    const crearPedido = async (overrides: {
      tenantId: string;
      estado?: string;
      clienteRowId?: number;
      erpRowId?: number | null;
      erpEstadoSincronizacion?: string | null;
    }) => {
      numeroBase += 1;
      return prisma.pedidoComercial.create({
        data: {
          tenantId: overrides.tenantId,
          numero: numeroBase,
          clienteRowId: overrides.clienteRowId ?? CLIENTE_ROW_ID,
          clienteNombre: "Cliente Prueba Asignar-ERP",
          creadoPorNombre: "Suite de pruebas",
          estado: overrides.estado ?? "LISTO_PARA_ERP",
          erpRowId: overrides.erpRowId ?? null,
          erpEstadoSincronizacion: overrides.erpEstadoSincronizacion ?? null,
        },
      });
    };

    const asignarErp = (id: string, erpRowId: number, tok = token) =>
      request(app)
        .post(`/api/comercial/pedidos/${id}/asignar-erp`)
        .set("Authorization", `Bearer ${tok}`)
        .send({ erpRowId });

    beforeAll(async () => {
      const passwordHash = await bcrypt.hash(PASSWORD, 10);

      const tenant = await prisma.tenant.create({
        data: {
          nombre: `Test AsignarErp ${sufijo}`,
          subdomain: `test-asignarerp-${sufijo}`,
          siesaCiaId: CIA_ID,
        },
      });
      const otroTenant = await prisma.tenant.create({
        data: {
          nombre: `Test AsignarErp Otro ${sufijo}`,
          subdomain: `test-asignarerp-otro-${sufijo}`,
          siesaCiaId: CIA_ID + 1,
        },
      });
      const tenantSinSiesa = await prisma.tenant.create({
        data: {
          nombre: `Test AsignarErp SinSiesa ${sufijo}`,
          subdomain: `test-asignarerp-sinsiesa-${sufijo}`,
        },
      });
      tenantId = tenant.id;
      otroTenantId = otroTenant.id;
      tenantSinSiesaId = tenantSinSiesa.id;

      await prisma.user.create({
        data: {
          tenantId,
          email: `admin-asignarerp-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin AsignarErp",
          isSuperadmin: true,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: otroTenantId,
          email: `admin-asignarerp-otro-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Otro Tenant",
          isSuperadmin: true,
          activo: true,
        },
      });
      await prisma.user.create({
        data: {
          tenantId: tenantSinSiesaId,
          email: `admin-asignarerp-sinsiesa-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Admin Sin Siesa",
          isSuperadmin: true,
          activo: true,
        },
      });

      const rolSoloVer = await prisma.rol.create({
        data: {
          tenantId,
          nombre: `Solo ver pedidos ${sufijo}`,
          permisos: JSON.stringify([PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER]),
        },
      });
      await prisma.user.create({
        data: {
          tenantId,
          email: `solo-ver-${sufijo}@test.ricosoft.local`,
          passwordHash,
          nombre: "Solo Ver",
          isSuperadmin: false,
          activo: true,
          rolId: rolSoloVer.id,
        },
      });

      token = await login(`admin-asignarerp-${sufijo}@test.ricosoft.local`);
      otroToken = await login(`admin-asignarerp-otro-${sufijo}@test.ricosoft.local`);
      tokenSinSiesa = await login(`admin-asignarerp-sinsiesa-${sufijo}@test.ricosoft.local`);
      tokenSoloVer = await login(`solo-ver-${sufijo}@test.ricosoft.local`);
    });

    afterAll(async () => {
      const tenantIds = [tenantId, otroTenantId, tenantSinSiesaId];
      await prisma.pedidoComercialItem.deleteMany({
        where: { pedido: { tenantId: { in: tenantIds } } },
      });
      await prisma.pedidoComercial.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.auditoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.rol.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    });

    it("3. pedido inexistente -> 404", async () => {
      const res = await asignarErp(randomUUID(), nuevoPdvValido().f430_rowid);
      expect(res.status).toBe(404);
    });

    it("4. aislamiento multi-tenant: un pedido de otro tenant no puede vincularse (404, no 403)", async () => {
      const pedido = await crearPedido({ tenantId });
      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid, otroToken);
      expect(res.status).toBe(404);
      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("5. pedido BORRADOR -> 409, sin consultar Siesa", async () => {
      const pedido = await crearPedido({ tenantId, estado: "BORRADOR" });
      getSiesaPoolMock.mockClear();
      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid);
      expect(res.status).toBe(409);
      expect(getSiesaPoolMock).not.toHaveBeenCalled();
    });

    it("6. pedido CONFIRMADO -> 409", async () => {
      const pedido = await crearPedido({ tenantId, estado: "CONFIRMADO" });
      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid);
      expect(res.status).toBe(409);
    });

    it("8. pedido ANULADO -> 409", async () => {
      const pedido = await crearPedido({ tenantId, estado: "ANULADO" });
      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid);
      expect(res.status).toBe(409);
    });

    it("9. PDV inexistente en Siesa -> error funcional (400), sin persistir nada", async () => {
      const pedido = await crearPedido({ tenantId });
      const res = await asignarErp(pedido.id, 999999999);
      expect(res.status).toBe(400);
      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("no confunde un CDV homónimo con un PDV real (mismo criterio que Cotización, al revés)", async () => {
      const pedido = await crearPedido({ tenantId });
      const res = await asignarErp(pedido.id, CDV_HOMONIMO.f430_rowid);
      expect(res.status).toBe(400);
    });

    it("10. PDV pertenece a otro cliente -> 409, sin persistir", async () => {
      const pedido = await crearPedido({ tenantId, clienteRowId: CLIENTE_ROW_ID });
      const res = await asignarErp(pedido.id, PDV_OTRO_CLIENTE.f430_rowid);
      expect(res.status).toBe(409);
      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("7 y 11-17. PDV válido -> vincula correctamente (estado LISTO_PARA_ERP permitido) y persiste exactamente los campos esperados, sin tocar el estado comercial", async () => {
      const pedido = await crearPedido({ tenantId });
      const pdv = nuevoPdvValido();

      const res = await asignarErp(pedido.id, pdv.f430_rowid);

      expect(res.status).toBe(200); // 7: LISTO_PARA_ERP permitido
      expect(res.body.erpTipoDocumento).toBe("PDV"); // 12 (ver nota de desviación en la entrega)
      expect(res.body.erpRowId).toBe(pdv.f430_rowid); // 13
      expect(res.body.erpNumero).toBe(`PDV-${pdv.f430_consec_docto}`); // 14
      expect(res.body.erpFechaSincronizacion).toBeTruthy(); // 15
      expect(res.body.erpEstadoSincronizacion).toBe("VINCULADO"); // 16

      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.estado).toBe("LISTO_PARA_ERP"); // 17: estado comercial intacto
      expect(enBd?.clienteRowId).toBe(CLIENTE_ROW_ID);
      expect(enBd?.clienteNombre).toBe("Cliente Prueba Asignar-ERP");
      expect(enBd?.erpRowId).toBe(pdv.f430_rowid);

      // 23: auditoría creada correctamente.
      const evento = await prisma.auditoria.findFirst({
        where: {
          tenantId,
          entidadTipo: "PedidoComercial",
          entidadId: pedido.id,
          accion: "PEDIDO_COMERCIAL_ERP_VINCULADO",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(evento).not.toBeNull();
      expect(evento?.detalle).toContain(String(pdv.f430_rowid));
      expect(evento?.detalle).not.toMatch(/password|DATABASE_URL|SIESA_DB_/i);
    });

    it("18. re-vincular al MISMO PDV ya vinculado es idempotente (200, no error, mismos datos)", async () => {
      const pedido = await crearPedido({ tenantId });
      const pdv = nuevoPdvValido();
      const primera = await asignarErp(pedido.id, pdv.f430_rowid);
      expect(primera.status).toBe(200);

      const segunda = await asignarErp(pedido.id, pdv.f430_rowid);
      expect(segunda.status).toBe(200);
      expect(segunda.body.erpRowId).toBe(pdv.f430_rowid);
      expect(segunda.body.erpEstadoSincronizacion).toBe("VINCULADO");
    });

    it("19. pedido ya vinculado a OTRO PDV -> 409, no reemplaza en silencio", async () => {
      const pedido = await crearPedido({ tenantId });
      const pdvOriginal = nuevoPdvValido();
      const primera = await asignarErp(pedido.id, pdvOriginal.f430_rowid);
      expect(primera.status).toBe(200);

      // Cualquier erpRowId DISTINTO del ya vinculado se rechaza antes de
      // llegar a Siesa (el punto de este caso es que YA hay uno guardado).
      const otroPdv = nuevoPdvValido();
      const segunda = await asignarErp(pedido.id, otroPdv.f430_rowid);
      expect(segunda.status).toBe(409);

      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.erpRowId).toBe(pdvOriginal.f430_rowid); // conserva el vínculo original
    });

    it("20. violación del índice único filtrado de SQL Server -> 409 (dos pedidos del mismo tenant al mismo PDV)", async () => {
      const pedidoA = await crearPedido({ tenantId });
      const pedidoB = await crearPedido({ tenantId }); // mismo cliente, ambos sin vincular todavía
      const pdv = nuevoPdvValido();

      const primera = await asignarErp(pedidoA.id, pdv.f430_rowid);
      expect(primera.status).toBe(200);

      // pedidoB pasa la validación de Siesa igual de bien (mismo PDV, mismo
      // cliente) — el conflicto lo tiene que atrapar el índice único de BD,
      // NUNCA un findFirst previo (sección 8 del encargo).
      const segunda = await asignarErp(pedidoB.id, pdv.f430_rowid);
      expect(segunda.status).toBe(409);

      const bEnBd = await prisma.pedidoComercial.findUnique({ where: { id: pedidoB.id } });
      expect(bEnBd?.erpRowId).toBeNull(); // el intento fallido no dejó nada persistido
      expect(bEnBd?.erpEstadoSincronizacion).toBeNull();
    });

    it("21. error de conexión/consulta con Siesa -> 502, sin persistir nada", async () => {
      const pedido = await crearPedido({ tenantId });
      getSiesaPoolMock.mockRejectedValueOnce(new Error("simulated ECONNREFUSED"));

      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid);
      expect(res.status).toBe(502);
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|stack|SIESA_DB_/i);

      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("22. error inesperado al persistir (no es violación del índice) -> 500 por el mecanismo estándar del proyecto, con ROLLBACK completo del vínculo (microaudit 2026-09-22: update+auditoria en una sola $transaction)", async () => {
      const pedido = await crearPedido({ tenantId });

      // vi.spyOn(prisma.auditoria, "create") YA NO sirve para forzar este
      // fallo: dentro de prisma.$transaction(async (tx) => {...}), Prisma
      // construye un cliente de transacción (`tx`) distinto del `prisma`
      // importado — tx.auditoria.create no es la misma referencia de función
      // que prisma.auditoria.create, así que un spy sobre esta última nunca
      // se dispara y la escritura real (exitosa) sigue su curso. Verificado
      // empíricamente antes de este cambio: con el spy, la petición devolvía
      // 200 en vez de 500 porque el mock jamás interceptaba nada.
      //
      // prisma.$use (registrado una sola vez arriba, a nivel de módulo) SÍ
      // intercepta las llamadas hechas a través de `tx` — verificado
      // empíricamente contra la BD real: un middleware que lanza en la
      // acción Auditoria.create revierte también la escritura de
      // PedidoComercial hecha en la misma transacción. Es el mismo mecanismo
      // de mock ya disponible en el proyecto (no se agrega ninguna librería
      // nueva), solo aplicado al nivel correcto para que alcance al cliente
      // de la transacción.
      forzarFalloAuditoria = true;
      try {
        const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid);
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/boom inesperado|stack|at Object/);

        // El punto central de la transacción: si auditoria.create falla
        // DESPUÉS de que pedidoComercial.update ya tuvo éxito, ese update
        // también debe revertirse — nunca debe quedar un pedido vinculado
        // detrás de una respuesta 500.
        const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
        expect(enBd?.erpRowId).toBeNull();
        expect(enBd?.erpTipoDocumento).toBeNull();
        expect(enBd?.erpNumero).toBeNull();
        expect(enBd?.erpEstadoSincronizacion).toBeNull();
        expect(enBd?.erpFechaSincronizacion).toBeNull();
      } finally {
        forzarFalloAuditoria = false;
      }
    });

    it("siesaCiaId no configurado -> error funcional (400), sin intentar conectar a Siesa", async () => {
      const pedido = await crearPedido({ tenantId: tenantSinSiesaId });
      getSiesaPoolMock.mockClear();

      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid, tokenSinSiesa);
      expect(res.status).toBe(400);
      expect(getSiesaPoolMock).not.toHaveBeenCalled();
    });

    it("24. permiso insuficiente (solo VER, sin GESTIONAR) -> 403, sin persistir ni consultar Siesa", async () => {
      const pedido = await crearPedido({ tenantId });
      getSiesaPoolMock.mockClear();

      const res = await asignarErp(pedido.id, nuevoPdvValido().f430_rowid, tokenSoloVer);
      expect(res.status).toBe(403);
      expect(getSiesaPoolMock).not.toHaveBeenCalled();

      const enBd = await prisma.pedidoComercial.findUnique({ where: { id: pedido.id } });
      expect(enBd?.erpRowId).toBeNull();
    });

    it("body con erpRowId inválido -> 400 (schema Zod, controller)", async () => {
      const pedido = await crearPedido({ tenantId });
      const res = await request(app)
        .post(`/api/comercial/pedidos/${pedido.id}/asignar-erp`)
        .set("Authorization", `Bearer ${token}`)
        .send({ erpRowId: -1 });
      expect(res.status).toBe(400);
    });
  },
);
