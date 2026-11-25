import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import {
  leerConfigCrossChex,
  construirConnectionString,
  CrossChexConfigError,
} from "./crosschex.config";

describe("leerConfigCrossChex", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("CROSSCHEX_")) delete process.env[key];
    }
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  it("lanza CrossChexConfigError si falta CROSSCHEX_MDB_PATH", () => {
    expect(() => leerConfigCrossChex()).toThrow(CrossChexConfigError);
    expect(() => leerConfigCrossChex()).toThrow(/CROSSCHEX_MDB_PATH/);
  });

  it("lanza CrossChexConfigError si la ruta configurada no existe en disco", () => {
    process.env.CROSSCHEX_MDB_PATH = "C:\\ruta\\que\\no\\existe\\CrossChex.mdb";
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    expect(() => leerConfigCrossChex()).toThrow(CrossChexConfigError);
    expect(() => leerConfigCrossChex()).toThrow(/no existe/);
  });

  it("usa los defaults de driver y timeouts cuando no se configuran explícitamente", () => {
    process.env.CROSSCHEX_MDB_PATH = "C:\\CrossChex.mdb";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const config = leerConfigCrossChex();

    expect(config.driverName).toBe("Microsoft Access Driver (*.mdb, *.accdb)");
    expect(config.connectTimeoutSeconds).toBe(15);
    expect(config.queryTimeoutMs).toBe(30_000);
  });

  it("respeta overrides de driver y timeouts vía entorno", () => {
    process.env.CROSSCHEX_MDB_PATH = "C:\\CrossChex.mdb";
    process.env.CROSSCHEX_ODBC_DRIVER = "Driver Custom";
    process.env.CROSSCHEX_CONNECT_TIMEOUT_SECONDS = "5";
    process.env.CROSSCHEX_QUERY_TIMEOUT_MS = "1000";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const config = leerConfigCrossChex();

    expect(config.driverName).toBe("Driver Custom");
    expect(config.connectTimeoutSeconds).toBe(5);
    expect(config.queryTimeoutMs).toBe(1000);
  });

  it("rechaza timeouts no numéricos o no positivos", () => {
    process.env.CROSSCHEX_MDB_PATH = "C:\\CrossChex.mdb";
    process.env.CROSSCHEX_CONNECT_TIMEOUT_SECONDS = "-1";
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    expect(() => leerConfigCrossChex()).toThrow(CrossChexConfigError);
  });
});

describe("construirConnectionString", () => {
  it("arma la cadena de conexión con el formato ODBC esperado", () => {
    const connectionString = construirConnectionString({
      mdbPath: "C:\\Program Files (x86)\\Anviz\\CrossChex Standard\\DB\\CrossChex.mdb",
      driverName: "Microsoft Access Driver (*.mdb, *.accdb)",
      connectTimeoutSeconds: 15,
      queryTimeoutMs: 30_000,
    });

    expect(connectionString).toBe(
      "Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=C:\\Program Files (x86)\\Anviz\\CrossChex Standard\\DB\\CrossChex.mdb;ConnectTimeout=15;",
    );
  });
});

describe("propietario explícito del CrossChex.mdb (D-01)", () => {
  const envOriginal = { ...process.env };
  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("sin CROSSCHEX_TENANT_PROPIETARIO_ID (o vacío) no hay propietario: nadie es dueño", async () => {
    const { leerTenantPropietarioCrossChex, esTenantPropietarioCrossChex } =
      await import("./crosschex.config");
    for (const valor of [undefined, "", "   "]) {
      if (valor === undefined) delete process.env.CROSSCHEX_TENANT_PROPIETARIO_ID;
      else process.env.CROSSCHEX_TENANT_PROPIETARIO_ID = valor;
      expect(leerTenantPropietarioCrossChex()).toBeNull();
      expect(esTenantPropietarioCrossChex("tenant-A")).toBe(false);
    }
  });

  it("solo el tenant configurado es propietario (sin distinguir mayúsculas del UUID)", async () => {
    const { esTenantPropietarioCrossChex } = await import("./crosschex.config");
    process.env.CROSSCHEX_TENANT_PROPIETARIO_ID = " AAAA-1111 ";
    expect(esTenantPropietarioCrossChex("aaaa-1111")).toBe(true);
    expect(esTenantPropietarioCrossChex("bbbb-2222")).toBe(false);
  });
});
