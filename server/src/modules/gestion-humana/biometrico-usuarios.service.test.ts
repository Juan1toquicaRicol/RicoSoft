import { describe, it, expect, vi, beforeEach } from "vitest";

const fuenteCountMock = vi.fn();
const obtenerUsuariosMock = vi.fn();

vi.mock("../../config/prisma", () => ({
  prisma: { fuenteBiometrica: { count: (...a: unknown[]) => fuenteCountMock(...a) } },
}));
vi.mock("../../integrations/crosschex", () => ({
  obtenerUsuarios: (...a: unknown[]) => obtenerUsuariosMock(...a),
}));

const { usuariosDelBiometrico, _limpiarCacheUsuariosBiometrico, MAX_USUARIOS_BIOMETRICO } =
  await import("./biometrico-usuarios.service");

beforeEach(() => {
  fuenteCountMock.mockReset();
  obtenerUsuariosMock.mockReset();
  fuenteCountMock.mockResolvedValue(1);
  _limpiarCacheUsuariosBiometrico();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("usuariosDelBiometrico", () => {
  it("lee Userinfo y devuelve nombre y código por userid (recortando espacios y vacíos)", async () => {
    obtenerUsuariosMock.mockResolvedValue([
      { userid: " 33 ", UserCode: "A-33", Name: " Juan Pérez ", Deptid: 1, IsAtt: true },
      { userid: "34", UserCode: null, Name: "   ", Deptid: null, IsAtt: null },
      { userid: "", UserCode: null, Name: "Sin id", Deptid: null, IsAtt: null },
    ]);

    const r = await usuariosDelBiometrico("tenant-A");

    expect(r.disponible).toBe(true);
    expect(r.mapa.get("33")).toEqual({ userid: "33", codigo: "A-33", nombre: "Juan Pérez" });
    expect(r.mapa.get("34")).toEqual({ userid: "34", codigo: null, nombre: null });
    expect(r.mapa.has("")).toBe(false);
  });

  it("aislamiento: un tenant SIN fuente activa no recibe nombres y no se abre el .mdb", async () => {
    fuenteCountMock.mockResolvedValue(0);

    const r = await usuariosDelBiometrico("tenant-B");

    expect(fuenteCountMock).toHaveBeenCalledWith({ where: { tenantId: "tenant-B", activa: true } });
    expect(r.mapa.size).toBe(0);
    expect(r.disponible).toBe(false);
    expect(obtenerUsuariosMock).not.toHaveBeenCalled();
  });

  it("cachea unos minutos: la segunda llamada no vuelve a leer el .mdb", async () => {
    obtenerUsuariosMock.mockResolvedValue([
      { userid: "1", UserCode: null, Name: "Ana", Deptid: null, IsAtt: null },
    ]);

    await usuariosDelBiometrico("tenant-A");
    await usuariosDelBiometrico("tenant-A");

    expect(obtenerUsuariosMock).toHaveBeenCalledTimes(1);
  });

  it("si el .mdb falla, no lanza: devuelve vacío y no disponible (el listado sigue funcionando)", async () => {
    obtenerUsuariosMock.mockRejectedValue(new Error("[odbc] driver no encontrado\nruta interna"));

    const r = await usuariosDelBiometrico("tenant-A");

    expect(r.mapa.size).toBe(0);
    expect(r.disponible).toBe(false);
  });

  it("si falla después de haber leído antes, conserva los últimos nombres pero marca no disponible", async () => {
    vi.useFakeTimers();
    obtenerUsuariosMock.mockResolvedValueOnce([
      { userid: "1", UserCode: null, Name: "Ana", Deptid: null, IsAtt: null },
    ]);
    await usuariosDelBiometrico("tenant-A");

    vi.advanceTimersByTime(6 * 60_000);
    obtenerUsuariosMock.mockRejectedValueOnce(new Error("bloqueado"));
    const r = await usuariosDelBiometrico("tenant-A");
    vi.useRealTimers();

    expect(r.mapa.get("1")?.nombre).toBe("Ana");
    expect(r.disponible).toBe(false);
  });

  it("marca el resultado como incompleto si se alcanza el tope de lectura", async () => {
    obtenerUsuariosMock.mockResolvedValue(
      Array.from({ length: MAX_USUARIOS_BIOMETRICO }, (_, i) => ({
        userid: String(i),
        UserCode: null,
        Name: `U${i}`,
        Deptid: null,
        IsAtt: null,
      })),
    );

    const r = await usuariosDelBiometrico("tenant-A");

    expect(r.incompleto).toBe(true);
  });
});
