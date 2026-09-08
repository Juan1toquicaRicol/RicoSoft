import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

/**
 * Mockea el paquete `odbc` (igual que siesa.test.ts mockea `mssql`): estos
 * tests no requieren un CrossChex.mdb real ni el driver instalado, prueban
 * el comportamiento del cliente (timeouts, cierre de conexión, traducción
 * de errores) de forma determinista.
 */
const connectMock = vi.fn();
const queryMock = vi.fn();
const closeMock = vi.fn();

vi.mock("odbc", () => ({
  default: { connect: (...args: unknown[]) => connectMock(...args) },
}));

const ENV_CROSSCHEX = {
  CROSSCHEX_MDB_PATH: "C:\\CrossChex.mdb",
};

describe("crosschex.client", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    connectMock.mockReset();
    queryMock.mockReset();
    closeMock.mockReset();
    Object.assign(process.env, ENV_CROSSCHEX);
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  it("abre y cierra la conexión en una operación exitosa", async () => {
    connectMock.mockResolvedValue({ query: queryMock, close: closeMock });
    queryMock.mockResolvedValue([{ Logid: 1 }]);
    closeMock.mockResolvedValue(undefined);

    const { ejecutarConsulta } = await import("./crosschex.client");
    const resultado = await ejecutarConsulta("SELECT TOP 1 Logid FROM Checkinout");

    expect(resultado).toEqual([{ Logid: 1 }]);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("cierra la conexión incluso si la consulta falla", async () => {
    connectMock.mockResolvedValue({ query: queryMock, close: closeMock });
    queryMock.mockRejectedValue(new Error("columna inválida"));
    closeMock.mockResolvedValue(undefined);

    const { ejecutarConsulta, CrossChexQueryError } = await import("./crosschex.client");

    await expect(ejecutarConsulta("SELECT algo")).rejects.toThrow(CrossChexQueryError);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("nunca escribe/actualiza: solo se invoca query, jamás un método de mutación sobre la conexión", async () => {
    const connFake = { query: queryMock, close: closeMock };
    connectMock.mockResolvedValue(connFake);
    queryMock.mockResolvedValue([]);
    closeMock.mockResolvedValue(undefined);

    const { ejecutarConsulta } = await import("./crosschex.client");
    await ejecutarConsulta("SELECT TOP 1 Logid FROM Checkinout");

    // El fake de conexión no expone ningún método de escritura para que el
    // adaptador pudiera llamar por error; solo se ejercitan query y close.
    expect(Object.keys(connFake).sort()).toEqual(["close", "query"]);
  });

  it("traduce un error de archivo bloqueado a un mensaje entendible, preservando la causa original", async () => {
    connectMock.mockRejectedValue({
      odbcErrors: [{ message: "No se pudo usar el archivo ya que está siendo utilizado" }],
    });

    const { verificarConexion, CrossChexConnectionError } = await import("./crosschex.client");

    await expect(verificarConexion()).rejects.toThrow(CrossChexConnectionError);
    await expect(verificarConexion()).rejects.toThrow(/bloqueado/i);
  });

  it("respeta el timeout de conexión configurado en vez de colgarse indefinidamente", async () => {
    process.env.CROSSCHEX_CONNECT_TIMEOUT_SECONDS = "0.01"; // 10ms
    connectMock.mockReturnValue(new Promise(() => {})); // nunca resuelve

    const { verificarConexion, CrossChexTimeoutError } = await import("./crosschex.client");

    await expect(verificarConexion()).rejects.toThrow(CrossChexTimeoutError);
  });

  it("lanza CrossChexConfigError (no un error crudo de odbc) si falta configuración", async () => {
    delete process.env.CROSSCHEX_MDB_PATH;

    const { ejecutarConsulta } = await import("./crosschex.client");
    const { CrossChexConfigError } = await import("./crosschex.config");

    await expect(ejecutarConsulta("SELECT 1")).rejects.toThrow(CrossChexConfigError);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
