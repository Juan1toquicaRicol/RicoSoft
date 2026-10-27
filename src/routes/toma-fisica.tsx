import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBodegasSiesa, useTomasFisicas, usePatronesTomaFisica } from "@/hooks/use-toma-fisica";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { money } from "@/lib/data";

export const Route = createFileRoute("/toma-fisica")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.TOMA_FISICA_VER),
  head: () => ({
    meta: [
      { title: "Toma Física | RicoSoft" },
      {
        name: "description",
        content:
          "Toma física mensual de inventario por bodega, contra la existencia real de Siesa.",
      },
    ],
  }),
  component: TomaFisicaPage,
});

function DialogoNuevaToma({
  abierto,
  onOpenChange,
  onCreada,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  onCreada: (id: string) => void;
}) {
  const { bodegas, loading } = useBodegasSiesa();
  const { crear } = useTomasFisicas();
  const [bodegaRowId, setBodegaRowId] = useState<string>("");
  const [creando, setCreando] = useState(false);

  const handleCrear = async () => {
    if (!bodegaRowId) {
      toast.error("Selecciona una bodega para crear la toma física.");
      return;
    }
    setCreando(true);
    try {
      const toma = await crear(Number(bodegaRowId));
      toast.success("Toma física creada.");
      onOpenChange(false);
      setBodegaRowId("");
      onCreada(toma.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la toma física.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva toma física</DialogTitle>
          <DialogDescription>
            Se toma un snapshot en vivo de la existencia real de la bodega elegida — el conteo
            físico se registra después, línea por línea.
          </DialogDescription>
        </DialogHeader>
        {!loading && !bodegas.disponible && (
          <p className="text-xs text-slate-500">
            {bodegas.motivo ?? "No fue posible cargar las bodegas de Siesa."}
          </p>
        )}
        {bodegas.disponible && (
          <Select value={bodegaRowId} onValueChange={setBodegaRowId}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Selecciona una bodega" />
            </SelectTrigger>
            <SelectContent>
              {(bodegas.bodegas ?? []).map((b) => (
                <SelectItem key={b.bodegaRowId} value={String(b.bodegaRowId)}>
                  {b.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button onClick={handleCrear} disabled={!bodegaRowId || creando}>
            {creando ? "Creando..." : "Crear toma física"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TomaFisicaPage() {
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.TOMA_FISICA_GESTIONAR);
  const { tomas, loading, refresh } = useTomasFisicas();
  const { patrones, loading: cargandoPatrones } = usePatronesTomaFisica();
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const navigate = useNavigate();

  return (
    <AppShell
      title="Toma Física"
      description="Conteo físico de inventario por bodega, contra la existencia real de Siesa — RicoSoft nunca escribe de vuelta a Siesa"
    >
      {puedeGestionar && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setDialogoAbierto(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nueva toma física
          </Button>
        </div>
      )}

      <DialogoNuevaToma
        abierto={dialogoAbierto}
        onOpenChange={setDialogoAbierto}
        onCreada={(id) => {
          refresh();
          navigate({ to: "/toma-fisica/$id", params: { id } });
        }}
      />

      {patrones.length > 0 && (
        <div className="panel mb-4 p-5 bg-white border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">Diferencias recurrentes</h2>
          </div>
          <p className="text-xs text-slate-500">
            Ítems cuyas últimas 3 tomas físicas cerradas tuvieron diferencia del mismo signo — señal
            de un problema operativo real, no ruido de conteo
          </p>
          <ul className="mt-3 space-y-2">
            {patrones.slice(0, 10).map((p) => (
              <li key={p.itemRowId} className="flex items-center justify-between text-xs">
                <span className="min-w-0 truncate text-slate-700">
                  {p.descripcion ?? "Ítem sin descripción"}
                </span>
                <span
                  className={`num shrink-0 font-semibold ${p.signo === "faltante" ? "text-red-600" : "text-emerald-600"}`}
                >
                  {p.diferenciaPromedioPct >= 0 ? "+" : ""}
                  {p.diferenciaPromedioPct}% ({p.ocurrencias} tomas)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900">Tomas físicas</h2>
        {loading && <p className="mt-3 text-xs text-slate-500">Cargando...</p>}
        {!loading && tomas.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">
            Todavía no se ha creado ninguna toma física.
          </p>
        )}
        {!loading && tomas.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-100/80">
                <TableRow className="hover:bg-slate-100/80">
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Bodega
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Fecha
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Responsable
                  </TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Líneas
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                    Estado
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tomas.map((t) => (
                  <TableRow key={t.id} className="hover:bg-slate-50/80">
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {t.bodegaNombre}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(t.fecha).toLocaleDateString("es-CO")}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{t.responsable}</TableCell>
                    <TableCell className="num text-right text-xs text-slate-600">
                      {t._count.lineas}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={t.estado} />
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <Link
                        to="/toma-fisica/$id"
                        params={{ id: t.id }}
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
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
        <ClipboardList className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Cerrar una toma física es un registro interno de RicoSoft — nunca un ajuste contable real
          en Siesa. Cualquier ajuste que corresponda por la diferencia se hace directamente en
          Siesa, manualmente, por un usuario con criterio sobre el caso.
        </span>
      </div>
    </AppShell>
  );
}
