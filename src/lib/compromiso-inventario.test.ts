import { describe, expect, it } from "vitest";
import { describirCompromiso } from "./compromiso-inventario";
import type { CompromisoInventarioPedido, EstadoCompromiso } from "@/hooks/use-comercial";

const dto = (compromiso: EstadoCompromiso): CompromisoInventarioPedido => ({
  pedidoId: "p",
  numero: 1,
  erpRowId: compromiso === "SIN_VINCULO_ERP" ? null : 10,
  estadoComercial: "LISTO_PARA_ERP",
  estadoSincronizacion: compromiso === "SIN_VINCULO_ERP" ? "NO_VINCULADO" : "VINCULADO",
  compromiso,
  siesa: null,
});

describe("describirCompromiso", () => {
  it("sin erpRowId -> 'Sin vínculo ERP'", () => {
    expect(describirCompromiso(dto("SIN_VINCULO_ERP")).titulo).toBe("Sin vínculo ERP");
  });

  it("existe en Siesa con comprometido 0 -> 'No comprometido'", () => {
    expect(describirCompromiso(dto("NO_COMPROMETIDO")).titulo).toBe("No comprometido");
  });

  it("comprometido activo -> tono ok; documento inexistente en Siesa -> alerta", () => {
    expect(describirCompromiso(dto("COMPROMETIDO")).tono).toBe("ok");
    expect(describirCompromiso(dto("SIESA_NO_ENCONTRADO")).tono).toBe("alerta");
  });
});
