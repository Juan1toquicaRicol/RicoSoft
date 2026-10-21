import { describe, it, expect, vi, beforeEach } from "vitest";

const ejecutarConsultaMock = vi.fn();

vi.mock("./crosschex.client", () => ({
  ejecutarConsulta: (...args: unknown[]) => ejecutarConsultaMock(...args),
}));

describe("crosschex.queries", () => {
  beforeEach(() => {
    ejecutarConsultaMock.mockReset();
    ejecutarConsultaMock.mockResolvedValue([]);
  });

  it("obtenerUsuarios NUNCA selecciona Pwd", async () => {
    const { obtenerUsuarios } = await import("./crosschex.queries");
    await obtenerUsuarios(10);

    const sqlEjecutado = ejecutarConsultaMock.mock.calls[0][0] as string;
    expect(sqlEjecutado.toLowerCase()).not.toContain("pwd");
  });

  it("obtenerUsuarios nunca usa SELECT * contra Userinfo", async () => {
    const { obtenerUsuarios } = await import("./crosschex.queries");
    await obtenerUsuarios(10);

    const sqlEjecutado = ejecutarConsultaMock.mock.calls[0][0] as string;
    expect(sqlEjecutado).not.toMatch(/SELECT\s+\*/i);
    expect(sqlEjecutado).toContain("userid");
    expect(sqlEjecutado).toContain("UserCode");
    expect(sqlEjecutado).toContain("Name");
    expect(sqlEjecutado).toContain("Deptid");
    expect(sqlEjecutado).toContain("IsAtt");
    expect(sqlEjecutado).toContain("FROM Userinfo");
  });

  it("obtenerUltimasMarcaciones consulta las columnas esperadas de Checkinout, ordenadas por Logid DESC", async () => {
    const { obtenerUltimasMarcaciones } = await import("./crosschex.queries");
    await obtenerUltimasMarcaciones(10);

    const sqlEjecutado = ejecutarConsultaMock.mock.calls[0][0] as string;
    expect(sqlEjecutado).toContain("FROM Checkinout");
    expect(sqlEjecutado).toContain("ORDER BY Logid DESC");
    for (const columna of [
      "Logid",
      "userid",
      "CheckTime",
      "CheckType",
      "Sensorid",
      "WorkType",
      "AttFlag",
      "Checked",
      "Exported",
      "OpenDoorFlag",
      "temperature",
      "whynoopen",
      "mask",
    ]) {
      expect(sqlEjecutado).toContain(columna);
    }
  });

  it("obtenerMarcacionesDesde interpola el cursor solo después de normalizarlo a entero", async () => {
    const { obtenerMarcacionesDesde } = await import("./crosschex.queries");
    await obtenerMarcacionesDesde(239176, 500);

    const [sqlEjecutado, ...args] = ejecutarConsultaMock.mock.calls[0];
    expect(sqlEjecutado).toContain("WHERE Logid > 239176");
    expect(sqlEjecutado).toContain("ORDER BY Logid ASC");
    expect(args).toHaveLength(0);
  });

  it("obtenerMarcacionesDesde acota el lote a 2000 y usa 0 si el cursor es inválido", async () => {
    const { obtenerMarcacionesDesde } = await import("./crosschex.queries");

    await obtenerMarcacionesDesde(0, 999999);
    expect(ejecutarConsultaMock.mock.calls[0][0]).toContain("TOP 2000");

    await obtenerMarcacionesDesde(Number.NaN, 500);
    expect(ejecutarConsultaMock.mock.calls[1][0]).toContain("WHERE Logid > 0");
    expect(ejecutarConsultaMock.mock.calls[1]).toHaveLength(1);
  });

  it("el TOP se acota a un rango razonable (1-1000) y nunca inyecta valores no numéricos", async () => {
    const { obtenerUltimasMarcaciones } = await import("./crosschex.queries");

    await obtenerUltimasMarcaciones(Number.NaN);
    expect(ejecutarConsultaMock.mock.calls[0][0]).toContain("TOP 10");

    await obtenerUltimasMarcaciones(999999);
    expect(ejecutarConsultaMock.mock.calls[1][0]).toContain("TOP 1000");

    await obtenerUltimasMarcaciones(-5);
    expect(ejecutarConsultaMock.mock.calls[2][0]).toContain("TOP 1");
  });
});
