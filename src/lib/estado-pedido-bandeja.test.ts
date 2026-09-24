import { describe, expect, it } from "vitest";
import { estadoBandejaPedido, ETIQUETA_PENDIENTE_ERP } from "./estado-pedido-bandeja";
import type { CompromisoInventarioPedido, EstadoCompromiso } from "@/hooks/use-comercial";

const dto = (compromiso: EstadoCompromiso, estadoUnoee?: string): CompromisoInventarioPedido => ({
  pedidoId: "p",
  numero: 1,
  erpRowId: compromiso === "SIN_VINCULO_ERP" ? null : 10,
  estadoComercial: "LISTO_PARA_ERP",
  estadoSincronizacion: compromiso === "SIN_VINCULO_ERP" ? "NO_VINCULADO" : "VINCULADO",
  compromiso,
  siesa: estadoUnoee
    ? {
        pdvRowId: 10,
        pdvNumero: 55444,
        estadoOperativo: "Aprobado",
        estadoUnoee,
        cantidadPedida: 10,
        cantidadComprometida: 5,
        cantidadRemisionada: 0,
        cantidadFacturada: 0,
        lineas: 1,
        lineasComprometidas: 1,
      }
    : null,
});

describe("estadoBandejaPedido", () => {
  it("sin documento ERP -> 'Pendiente de envío a ERP'", () => {
    expect(estadoBandejaPedido("BORRADOR", dto("SIN_VINCULO_ERP"))).toEqual({
      texto: ETIQUETA_PENDIENTE_ERP,
      origen: "pendiente",
    });
    expect(ETIQUETA_PENDIENTE_ERP).toBe("Pendiente de envío a ERP");
  });

  it("con PDV vinculado -> estado operativo UnoEE (Comprometido, Facturado, ...)", () => {
    expect(estadoBandejaPedido("LISTO_PARA_ERP", dto("COMPROMETIDO", "Comprometido"))).toEqual({
      texto: "Comprometido",
      origen: "erp",
    });
    expect(estadoBandejaPedido("LISTO_PARA_ERP", dto("NO_COMPROMETIDO", "Facturado")).texto).toBe(
      "Facturado",
    );
  });

  it("vinculado pero Siesa no lo devuelve -> 'No encontrado en Siesa'", () => {
    expect(estadoBandejaPedido("LISTO_PARA_ERP", dto("SIESA_NO_ENCONTRADO")).texto).toBe(
      "No encontrado en Siesa",
    );
  });

  it("Siesa no disponible (sin compromiso) -> estado comercial de RicoSoft", () => {
    expect(estadoBandejaPedido("CONFIRMADO", null)).toEqual({
      texto: "CONFIRMADO",
      origen: "comercial",
    });
    expect(estadoBandejaPedido("CONFIRMADO", undefined).origen).toBe("comercial");
  });
});
