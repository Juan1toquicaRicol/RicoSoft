import { describe, it, expect, beforeEach, vi } from "vitest";
import { getOrSetCache, limpiarCache } from "./memo-cache";

describe("memo-cache", () => {
  beforeEach(() => {
    limpiarCache();
    vi.useRealTimers();
  });

  it("ejecuta el productor la primera vez y cachea el resultado", async () => {
    const productor = vi.fn().mockResolvedValue("valor-1");
    const a = await getOrSetCache("clave-1", 1000, productor);
    const b = await getOrSetCache("clave-1", 1000, productor);
    expect(a).toBe("valor-1");
    expect(b).toBe("valor-1");
    expect(productor).toHaveBeenCalledTimes(1);
  });

  it("vuelve a ejecutar el productor una vez expirado el TTL", async () => {
    vi.useFakeTimers();
    const productor = vi.fn().mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    const a = await getOrSetCache("clave-ttl", 50, productor);
    expect(a).toBe("v1");
    vi.advanceTimersByTime(51);
    const b = await getOrSetCache("clave-ttl", 50, productor);
    expect(b).toBe("v2");
    expect(productor).toHaveBeenCalledTimes(2);
  });

  it("aísla por clave — dos claves distintas nunca comparten resultado", async () => {
    const productorA = vi.fn().mockResolvedValue("A");
    const productorB = vi.fn().mockResolvedValue("B");
    const a = await getOrSetCache("tenant-1:ventas", 1000, productorA);
    const b = await getOrSetCache("tenant-2:ventas", 1000, productorB);
    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(productorA).toHaveBeenCalledTimes(1);
    expect(productorB).toHaveBeenCalledTimes(1);
  });

  it("no cachea errores: un fallo del productor se reintenta en la siguiente llamada", async () => {
    const productor = vi
      .fn()
      .mockRejectedValueOnce(new Error("Siesa caído"))
      .mockResolvedValueOnce("recuperado");

    await expect(getOrSetCache("clave-error", 1000, productor)).rejects.toThrow("Siesa caído");
    const resultado = await getOrSetCache("clave-error", 1000, productor);
    expect(resultado).toBe("recuperado");
    expect(productor).toHaveBeenCalledTimes(2);
  });
});
