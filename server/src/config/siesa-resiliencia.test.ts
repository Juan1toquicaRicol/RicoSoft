import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";

/**
 * Matriz de resiliencia del pool de Siesa (sin VPN ni Siesa real): mockea
 * mssql.ConnectionPool con un fake que permite simular socket destruido,
 * timeout de conexión y timeout de consulta, y verifica cuándo el pool se
 * descarta (para reconectar en la siguiente petición) y cuándo NO.
 */

const estado = vi.hoisted(() => ({
  construcciones: 0,
  pools: [] as unknown[],
  connect: [] as Array<() => Promise<void>>,
  query: [] as Array<() => Promise<unknown>>,
}));

vi.mock("mssql", async () => {
  const { EventEmitter: Emitter } = await import("events");
  class PoolFake extends Emitter {
    connected = false;
    closeLlamado = 0;
    constructor(_config: unknown) {
      super();
      estado.construcciones++;
      estado.pools.push(this);
    }
    async connect() {
      const paso = estado.connect.shift();
      if (paso) await paso();
      this.connected = true;
      return this;
    }
    async close() {
      this.closeLlamado++;
      this.connected = false;
    }
    request() {
      return {
        input() {
          return this;
        },
        query: async () => {
          const paso = estado.query.shift();
          return paso ? paso() : { recordset: [{ ok: 1 }] };
        },
      };
    }
  }
  return { default: { ConnectionPool: PoolFake } };
});

function errorMssql(name: string, code: string, message = "mensaje interno con host-fake") {
  return Object.assign(new Error(message), { name, code });
}

const emitirError = (pool: unknown, error: unknown) =>
  (pool as EventEmitter).emit("error", error);

describe("pool Siesa — resiliencia", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    estado.construcciones = 0;
    estado.pools.length = 0;
    estado.connect.length = 0;
    estado.query.length = 0;
    Object.assign(process.env, {
      SIESA_DB_HOST: "host-fake",
      SIESA_DB_PORT: "1433",
      SIESA_DB_NAME: "db-fake",
      SIESA_DB_USER: "user-fake",
      SIESA_DB_PASSWORD: "password-fake",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  it("conexión exitosa y reuso: consultas sucesivas usan un único pool", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();
    const r = await p1.request().query("SELECT 1");
    const p2 = await getSiesaPool();

    expect(r).toEqual({ recordset: [{ ok: 1 }] });
    expect(p2).toBe(p1);
    expect(estado.construcciones).toBe(1);
  });

  it("socket destruido durante una consulta: se invalida el pool y la SIGUIENTE petición reconecta", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();
    estado.query.push(() => Promise.reject(errorMssql("ConnectionError", "ECONNRESET")));

    // El llamador recibe el MISMO error (su manejo 502 actual sigue funcionando).
    await expect(p1.request().query("SELECT 1")).rejects.toMatchObject({ code: "ECONNRESET" });

    const p2 = await getSiesaPool();
    expect(p2).not.toBe(p1);
    expect(estado.construcciones).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    expect((estado.pools[0] as { closeLlamado: number }).closeLlamado).toBe(1);
    await expect(p2.request().query("SELECT 1")).resolves.toBeDefined();
  });

  it("evento 'error' del pool (socket cae entre consultas): no tumba el proceso e invalida", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();

    // Sin listener registrado, emit("error") de un EventEmitter lanzaría.
    expect(() => emitirError(p1, errorMssql("ConnectionError", "ESOCKET"))).not.toThrow();

    expect(await getSiesaPool()).not.toBe(p1);
  });

  it("pool que quedó desconectado (connected=false) se descarta y se reconecta", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();
    (p1 as unknown as { connected: boolean }).connected = false;

    const p2 = await getSiesaPool();
    expect(p2).not.toBe(p1);
    expect(estado.construcciones).toBe(2);
  });

  it("recuperación tras fallo de conexión inicial: el siguiente intento conecta y funciona", async () => {
    estado.connect.push(() => Promise.reject(errorMssql("ConnectionError", "ESOCKET")));
    const { getSiesaPool } = await import("./siesa");

    await expect(getSiesaPool()).rejects.toMatchObject({ code: "ESOCKET" });
    const p = await getSiesaPool();
    await expect(p.request().query("SELECT 1")).resolves.toBeDefined();
    expect(estado.construcciones).toBe(2);
  });

  it("timeout de CONSULTA: NO invalida el pool (sigue sano) y el error se relanza", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();
    estado.query.push(() => Promise.reject(errorMssql("RequestError", "ETIMEOUT")));

    await expect(p1.request().query("SELECT lento")).rejects.toMatchObject({ code: "ETIMEOUT" });

    expect(await getSiesaPool()).toBe(p1);
    expect(estado.construcciones).toBe(1);
  });

  it("timeout de CONEXIÓN durante una consulta: sí invalida el pool", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();
    estado.query.push(() => Promise.reject(errorMssql("ConnectionError", "ETIMEOUT")));

    await expect(p1.request().query("SELECT 1")).rejects.toBeDefined();
    expect(await getSiesaPool()).not.toBe(p1);
  });

  it("un error tardío de un pool viejo no invalida al pool nuevo", async () => {
    const { getSiesaPool } = await import("./siesa");
    const viejo = await getSiesaPool();
    estado.query.push(() => Promise.reject(errorMssql("ConnectionError", "ECONNRESET")));
    await viejo.request().query("x").catch(() => undefined);
    const nuevo = await getSiesaPool();

    emitirError(viejo, errorMssql("ConnectionError", "ESOCKET"));

    expect(await getSiesaPool()).toBe(nuevo);
    expect(estado.construcciones).toBe(2);
  });

  it("un error que NO es de transporte (p. ej. SQL inválido) no invalida el pool", async () => {
    const { getSiesaPool } = await import("./siesa");
    const p1 = await getSiesaPool();
    estado.query.push(() => Promise.reject(errorMssql("RequestError", "EREQUEST")));

    await expect(p1.request().query("SELEC")).rejects.toBeDefined();
    expect(await getSiesaPool()).toBe(p1);
  });
});

describe("clasificación y respuesta uniforme 502 ante errores de Siesa", () => {
  it("clasifica transporte, timeout de conexión, timeout de consulta y errores ajenos", async () => {
    const { clasificarErrorSiesa } = await import("../lib/siesa-errores");
    expect(clasificarErrorSiesa(errorMssql("ConnectionError", "ESOCKET"))).toBe("transporte");
    expect(clasificarErrorSiesa(errorMssql("ConnectionError", "ETIMEOUT"))).toBe(
      "timeout_conexion",
    );
    expect(clasificarErrorSiesa(errorMssql("RequestError", "ETIMEOUT"))).toBe("timeout_consulta");
    expect(clasificarErrorSiesa(errorMssql("Error", "ECONNRESET"))).toBe("transporte");
    expect(clasificarErrorSiesa(errorMssql("RequestError", "EREQUEST"))).toBeNull();
    expect(clasificarErrorSiesa(new Error("otro"))).toBeNull();
    expect(clasificarErrorSiesa(null)).toBeNull();
    expect(clasificarErrorSiesa("texto")).toBeNull();
  });

  it("solo errores MARCADOS como de Siesa reciben el 502; un ECONNRESET/ETIMEDOUT/EHOSTUNREACH de otra librería no", async () => {
    const { respuestaErrorSiesa, marcarErrorSiesa } = await import("../lib/siesa-errores");
    for (const code of ["ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH"]) {
      const ajeno = errorMssql("Error", code, "smtp.example.com falló");
      expect(respuestaErrorSiesa(ajeno)).toBeNull();
      expect(respuestaErrorSiesa(marcarErrorSiesa(ajeno))?.status).toBe(502);
    }
  });

  it("los errores que salen de getSiesaPool y de query llevan la marca de origen Siesa", async () => {
    vi.resetModules();
    const { getSiesaPool } = await import("./siesa");
    const { esErrorSiesa } = await import("../lib/siesa-errores");
    Object.assign(process.env, { SIESA_DB_HOST: "h", SIESA_DB_NAME: "d", SIESA_DB_USER: "u", SIESA_DB_PASSWORD: "p" });
    estado.connect.push(() => Promise.reject(errorMssql("ConnectionError", "ESOCKET")));
    const fallo = await getSiesaPool().catch((e) => e);
    expect(esErrorSiesa(fallo)).toBe(true);

    const p = await getSiesaPool();
    estado.query.push(() => Promise.reject(errorMssql("ConnectionError", "ECONNRESET")));
    expect(esErrorSiesa(await p.request().query("x").catch((e: unknown) => e))).toBe(true);
  });

  it("respuestaErrorSiesa -> 502 con mensaje fijo, sin host/usuario/credenciales del driver", async () => {
    const { respuestaErrorSiesa, marcarErrorSiesa } = await import("../lib/siesa-errores");
    const errores = [
      errorMssql(
        "ConnectionError",
        "ESOCKET",
        "Failed to connect to host-fake:1433 user-fake password-fake",
      ),
      errorMssql("RequestError", "ETIMEOUT", "Timeout host-fake"),
    ].map(marcarErrorSiesa);

    for (const e of errores) {
      const r = respuestaErrorSiesa(e);
      expect(r?.status).toBe(502);
      expect(JSON.stringify(r)).not.toMatch(/host-fake|user-fake|password-fake|1433/);
    }
    expect(respuestaErrorSiesa(new Error("otro"))).toBeNull();
  });
});
