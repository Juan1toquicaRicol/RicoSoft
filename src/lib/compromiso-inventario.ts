import type { CompromisoInventarioPedido } from "@/hooks/use-comercial";

export interface DescripcionCompromiso {
  titulo: string;
  tono: "neutro" | "ok" | "alerta";
  detalle: string;
}

/** Texto/tono del panel "Compromiso de Inventario" de un pedido. Función pura
 * (testeable) — la vista no decide etiquetas por su cuenta. */
export function describirCompromiso(c: CompromisoInventarioPedido): DescripcionCompromiso {
  switch (c.compromiso) {
    case "SIN_VINCULO_ERP":
      return {
        titulo: "Sin vínculo ERP",
        tono: "neutro",
        detalle: "Este pedido aún no está vinculado a un pedido de venta de Siesa.",
      };
    case "SIESA_NO_ENCONTRADO":
      return {
        titulo: "No encontrado en Siesa",
        tono: "alerta",
        detalle: "El documento vinculado no existe en la compañía Siesa de este tenant.",
      };
    case "NO_COMPROMETIDO":
      return {
        titulo: "No comprometido",
        tono: "neutro",
        detalle: "El pedido existe en Siesa, pero no tiene cantidades comprometidas de inventario.",
      };
    case "COMPROMETIDO":
      return {
        titulo: "Comprometido en Siesa",
        tono: "ok",
        detalle: "Siesa tiene inventario reservado para este pedido.",
      };
  }
}
