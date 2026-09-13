import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Search, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDespachos,
  useResumenDespachos,
  useDocumentosVentaParaDespacho,
  type EstadoDespacho,
  type DocumentoVenta,
} from "@/hooks/use-despachos";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { money } from "@/lib/data";

export const Route = createFileRoute("/despachos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.DESPACHOS_VER),
  head: () => ({
    meta: [
      { title: "Despachos | RicoSoft" },
      {
        name: "description",
        content:
          "Torre de control operativa: qué pedidos están pendientes de despachar, en qué etapa está cada uno y qué falta.",
      },
    ],
  }),
  component: DespachosPage,
});

const INDICADORES: { estado: EstadoDespacho | null; label: string }[] = [
  { estado: null, label: "Todos" },
  { estado: "RECIBIDO", label: "Pendientes" },
  { estado: "PREPARANDO", label: "Preparando" },
  { estado: "PREPARADO", label: "Preparados" },
  { estado: "PENDIENTE_CARGUE", label: "Por cargar" },
  { estado: "CARGANDO", label: "Cargando" },
  { estado: "CARGADO", label: "Cargados" },
  { estado: "DESPACHADO", label: "Despachados" },
  { estado: "EN_TRANSITO", label: "En tránsito" },
  { estado: "ENTREGADO", label: "Entregados" },
];

function DialogoNuevoDespacho({
  abierto,
  onOpenChange,
  onCreado,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onCreado: (id: string) => void;
}) {
  const { buscar, loading } = useDocumentosVentaParaDespacho();
  const { crear } = useDespachos({});
  const [search, setSearch] = useState("");
  const [documentos, setDocumentos] = useState<DocumentoVenta[]>([]);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const handleBuscar = async () => {
    setMotivo(null);
    const res = await buscar(search);
    if (!res.disponible) {
      setMotivo(res.motivo ?? "No disponible.");
      setDocumentos([]);
    } else {
      setDocumentos(res.items ?? []);
    }
  };

  const handleCrear = async (doc: DocumentoVenta) => {
    setCreando(true);
    try {
      const despacho = await crear({ siesaDocRowId: doc.id });
      toast.success("Despacho creado.");
      onOpenChange(false);
      onCreado(despacho.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el despacho.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo despacho</DialogTitle>
          <DialogDescription>
            Busca el documento de venta real (Siesa, últimos 90 días) que da origen al despacho —
            cliente y productos se traen de ahí, RicoSoft nunca lo modifica.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-[11px] font-semibold text-slate-500 uppercase">
              Cliente, NIT o referencia
            </Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <Button size="sm" onClick={handleBuscar} disabled={loading}>
            <Search className="mr-1 h-3.5 w-3.5" /> Buscar
          </Button>
        </div>

        {motivo && <p className="mt-3 text-xs text-slate-500">{motivo}</p>}

        {documentos.length > 0 && (
          <div className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
            {documentos.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">
                    {d.clienteNombre ?? "Cliente sin nombre"}
                  </p>
                  <p className="text-slate-500">
                    {d.referencia ?? d.id} ·{" "}
                    {new Date(d.fecha).toLocaleDateString("es-CO", { timeZone: "UTC" })} ·{" "}
                    {money(d.neto)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCrear(d)}
                  disabled={creando}
                >
                  Crear despacho
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

function DespachosPage() {
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.DESPACHOS_GESTIONAR);
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoDespacho | null>(null);
  const [page, setPage] = useState(1);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const { porEstado } = useResumenDespachos();
  const { items, total, totalPages, loading, refresh } = useDespachos({
    page,
    pageSize: 20,
    estado: estadoFiltro ?? undefined,
  });

  return (
    <AppShell
      title="Despachos"
      description="¿Qué pedidos están pendientes de despachar, en qué etapa está cada uno y cuáles ya fueron entregados?"
      actions={
        puedeGestionar ? (
          <Button size="sm" onClick={() => setDialogoAbierto(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo despacho
          </Button>
        ) : undefined
      }
    >
      <DialogoNuevoDespacho
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        onCreado={() => refresh()}
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        {INDICADORES.map(({ estado, label }) => {
          const cantidad =
            estado === null
              ? Object.values(porEstado).reduce((acc, n) => acc + n, 0)
              : (porEstado[estado] ?? 0);
          const activo = estadoFiltro === estado;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                setEstadoFiltro(estado);
                setPage(1);
              }}
              className={`panel rounded-lg border p-3 text-left transition ${
                activo
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <p className="num mt-1 text-lg font-bold text-slate-900">{cantidad}</p>
            </button>
          );
        })}
      </div>

      <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
        {loading && <p className="text-xs text-slate-500">Cargando...</p>}
        {!loading && items.length === 0 && (
          <p className="text-xs text-slate-500">No hay despachos que coincidan con el filtro.</p>
        )}
        {!loading && items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Documento
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Cliente
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Estado
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Valor
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Vehículo
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Conductor
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Creado
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id} className="hover:bg-slate-50/80">
                    <TableCell className="text-xs text-slate-600">
                      {d.siesaDocReferencia ?? d.siesaDocRowId}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {d.clienteNombre}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={d.estado} />
                    </TableCell>
                    <TableCell className="num text-right text-xs text-slate-700">
                      {money(d.valorPedido)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {d.vehiculoPlaca ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {d.conductorNombre ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(d.createdAt).toLocaleDateString("es-CO")}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <Link
                        to="/despachos/$id"
                        params={{ id: d.id }}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        Ver detalle
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>{total} despachos en total</span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <span>
                Página {page} de {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
        <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Cada despacho se origina desde un documento de venta real de Siesa — RicoSoft nunca lo
          modifica. El seguimiento logístico (preparación, cargue, despacho, entrega) es 100% nativo
          de RicoSoft.
        </span>
      </div>
    </AppShell>
  );
}
