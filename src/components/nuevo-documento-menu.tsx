import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CotizacionDialog } from "@/components/cotizacion-dialog";
import { ProformaDialog } from "@/components/proforma-dialog";
import { useDocumentosComerciales, useAccionesPedido } from "@/hooks/use-comercial";
import { money } from "@/lib/data";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { ESTADO_PROFORMA_PARA_PEDIDO } from "@/lib/proforma-estados";

/** Un Pedido comercial no se crea "en blanco": siempre nace de una Proforma
 * ACEPTADA (mismo flujo que el botón "Crear Pedido" del detalle de Proforma,
 * ver comercial.proformas.$id.tsx) — esta es la misma operación, solo con
 * un punto de entrada adicional: buscar la proforma primero en vez de tener
 * que navegar a su detalle. */
function PedidoDesdeProformaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [creandoId, setCreandoId] = useState<string | null>(null);
  const accionesPedido = useAccionesPedido();
  const { items, loading } = useDocumentosComerciales({
    tipo: "proforma",
    estado: ESTADO_PROFORMA_PARA_PEDIDO,
    search: search.trim() || undefined,
    pageSize: 20,
  });

  const crear = async (proformaId: string) => {
    setCreandoId(proformaId);
    try {
      const pedido = await accionesPedido.crearDesdeProforma(proformaId);
      toast.success(`Pedido ${pedido.numeroFormateado ?? pedido.numero} creado.`);
      onOpenChange(false);
      setSearch("");
      navigate({ to: "/comercial/pedidos/$id", params: { id: pedido.id } });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear el pedido.");
    } finally {
      setCreandoId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo pedido</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Un pedido siempre se crea a partir de una proforma ACEPTADA. Busca la proforma y
            selecciónala para generar el pedido.
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              placeholder="Número o cliente..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {loading && <p className="p-2 text-xs text-slate-400">Buscando...</p>}
            {!loading && items.length === 0 && (
              <p className="p-2 text-xs text-slate-400">
                {search.trim()
                  ? "Sin proformas activas que coincidan."
                  : "No hay proformas activas todavía."}
              </p>
            )}
            {!loading &&
              items.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={creandoId !== null}
                  onClick={() => void crear(p.id)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  <span>
                    <span className="font-semibold text-slate-800">{p.numero}</span>
                    <span className="text-slate-400"> · {p.cliente}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {creandoId === p.id ? "Creando..." : money(p.valor)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Punto de entrada único para crear un documento comercial — reemplaza los
 * botones sueltos "Nueva Cotización" (antes solo en Gestión Comercial) y
 * "Realizar proforma" (antes solo en Ventas): ambos flujos conviven aquí,
 * más la creación de Pedido (que ya existía solo desde el detalle de una
 * Proforma). Cada opción se oculta si el usuario no tiene el permiso
 * *.gestionar de esa sección — si no tiene ninguno, el menú entero no se
 * muestra (ver `puedeCrearAlgo` en el caller). */
export function NuevoDocumentoMenu() {
  const { user } = useSession();
  const [dialogo, setDialogo] = useState<"cotizacion" | "proforma" | "pedido" | null>(null);

  const puedeCrearCotizacion = hasPermission(user, PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR);
  const puedeCrearProforma = hasPermission(user, PERMISOS_SISTEMA.PROFORMAS_GESTIONAR);
  const puedeCrearPedido = hasPermission(user, PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR);

  if (!puedeCrearCotizacion && !puedeCrearProforma && !puedeCrearPedido) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo documento <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {puedeCrearCotizacion && (
            <DropdownMenuItem onSelect={() => setDialogo("cotizacion")}>
              <FileText className="mr-2 h-3.5 w-3.5" /> Cotización
            </DropdownMenuItem>
          )}
          {puedeCrearProforma && (
            <DropdownMenuItem onSelect={() => setDialogo("proforma")}>
              <FileText className="mr-2 h-3.5 w-3.5" /> Proforma
            </DropdownMenuItem>
          )}
          {puedeCrearPedido && (
            <DropdownMenuItem onSelect={() => setDialogo("pedido")}>
              <FileText className="mr-2 h-3.5 w-3.5" /> Pedido
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {puedeCrearCotizacion && (
        <CotizacionDialog
          open={dialogo === "cotizacion"}
          onOpenChange={(o) => setDialogo(o ? "cotizacion" : null)}
        />
      )}
      {puedeCrearProforma && (
        <ProformaDialog
          open={dialogo === "proforma"}
          onOpenChange={(o) => setDialogo(o ? "proforma" : null)}
        />
      )}
      {puedeCrearPedido && (
        <PedidoDesdeProformaDialog
          open={dialogo === "pedido"}
          onOpenChange={(o) => setDialogo(o ? "pedido" : null)}
        />
      )}
    </>
  );
}
