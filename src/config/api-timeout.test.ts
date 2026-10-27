import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, fetchApi } from "./api";

/** fetch que nunca responde y solo termina cuando se aborta la señal. */
function fetchColgado() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchApi — tiempo de espera configurable", () => {
  it("con timeoutMs propio espera ese tiempo (no los 20 s por defecto) y falla como 'timeout'", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchColgado());

    const promesa = fetchApi("/lento", {}, 60_000).catch((e: unknown) => e);
    // A los 25 s el límite por defecto ya habría abortado; con 60 s sigue esperando.
    await vi.advanceTimersByTimeAsync(25_000);
    let resuelta = false;
    void promesa.then(() => {
      resuelta = true;
    });
    await Promise.resolve();
    expect(resuelta).toBe(false);

    await vi.advanceTimersByTimeAsync(40_000);
    const error = await promesa;
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe("timeout");
  });

  it("sin timeoutMs conserva el límite por defecto de 20 s", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchColgado());

    const promesa = fetchApi("/lento").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_001);
    const error = await promesa;
    expect((error as ApiError).kind).toBe("timeout");
  });
});
