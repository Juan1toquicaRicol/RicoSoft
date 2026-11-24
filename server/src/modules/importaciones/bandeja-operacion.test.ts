import { it, expect, vi, afterEach } from "vitest";
import { operadorBandeja } from "./bandeja-operacion";
afterEach(() => vi.unstubAllEnvs());
it("exige operador designado y empresa activa de Sistemas", () => {
  vi.stubEnv("IMPORTACIONES_SISTEMAS_TENANT_ID", "empresaA");
  vi.stubEnv("IMPORTACIONES_SISTEMAS_USUARIOS", "op1,op2");
  expect(operadorBandeja({ id: "op1", tenantId: "empresaA" })).toBe(true);
  expect(operadorBandeja({ id: "op1", tenantId: "empresaB" })).toBe(false);
  expect(operadorBandeja({ id: "otro", tenantId: "empresaA" })).toBe(false);
});
