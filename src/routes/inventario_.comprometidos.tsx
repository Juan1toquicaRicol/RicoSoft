import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * El comprometido de Siesa ahora se ve por pedido en Gestión Comercial →
 * pestaña Pedidos. Esta ruta se conserva solo para no romper marcadores ni
 * enlaces antiguos: redirige a esa pestaña. Los permisos los aplica el destino.
 */
export const Route = createFileRoute("/inventario_/comprometidos")({
  beforeLoad: () => {
    throw redirect({
      to: "/comercial/gestion",
      search: { tab: "pedidos" },
    });
  },
});
