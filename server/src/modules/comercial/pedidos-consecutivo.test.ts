import { describe, it, expect, vi } from "vitest";
import {
  PRIMER_NUMERO_PEDIDO,
  avanzarContadorPedidoComercial,
  calcularSiguienteNumeroPedido,
  siguienteNumeroPedidoComercial,
} from "./pedidos-consecutivo";

describe("calcularSiguienteNumeroPedido = max(contador, MAX+1)", () => {
  it("tenant vacío -> 1", () => {
    expect(PRIMER_NUMERO_PEDIDO).toBe(1);
    expect(calcularSiguienteNumeroPedido(null, null)).toBe(1);
  });

  it("el contador manda si es mayor; MAX+1 manda si el contador quedó atrás", () => {
    expect(calcularSiguienteNumeroPedido(50, 10)).toBe(50);
    expect(calcularSiguienteNumeroPedido(1, 50)).toBe(51);
  });
});

describe("siguienteNumeroPedidoComercial", () => {
  it("consulta contador y MAX acotados a { tenantId }", async () => {
    const config = vi.fn().mockResolvedValue({ siguienteConsecutivoPedidoComercial: 7 });
    const ultimo = vi.fn().mockResolvedValue({ numero: 9 });
    const n = await siguienteNumeroPedidoComercial(
      {
        configuracionComercial: { findFirst: config },
        pedidoComercial: { findFirst: ultimo },
      } as never,
      "t1",
    );
    expect(n).toBe(10);
    expect(config).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      select: { siguienteConsecutivoPedidoComercial: true },
    });
    expect(ultimo).toHaveBeenCalledWith({
      where: { tenantId: "t1" },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
  });
});

describe("avanzarContadorPedidoComercial (monotónico)", () => {
  const fake = (count: number, existente: { id: string } | null) => ({
    configuracionComercial: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      findFirst: vi.fn().mockResolvedValue(existente),
      create: vi.fn().mockResolvedValue({}),
    },
  });

  it("UPDATE condicional (contador < numero+1) acotado a tenantId", async () => {
    const tx = fake(1, { id: "c" });
    await avanzarContadorPedidoComercial(tx as never, "t1", 5);
    expect(tx.configuracionComercial.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t1", siguienteConsecutivoPedidoComercial: { lt: 6 } },
      data: { siguienteConsecutivoPedidoComercial: 6 },
    });
    expect(tx.configuracionComercial.create).not.toHaveBeenCalled();
  });

  it("contador ya mayor: no crea ni reduce", async () => {
    const tx = fake(0, { id: "c" });
    await avanzarContadorPedidoComercial(tx as never, "t1", 2);
    expect(tx.configuracionComercial.create).not.toHaveBeenCalled();
  });

  it("tenant sin fila: la crea con max(1, numero+1)", async () => {
    const tx = fake(0, null);
    await avanzarContadorPedidoComercial(tx as never, "t1", 1);
    expect(tx.configuracionComercial.create).toHaveBeenCalledWith({
      data: { tenantId: "t1", siguienteConsecutivoPedidoComercial: 2 },
    });
  });
});
