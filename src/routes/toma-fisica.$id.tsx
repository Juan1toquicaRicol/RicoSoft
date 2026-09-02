import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTomaFisica } from "@/hooks/use-toma-fisica";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { compact, money } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/toma-fisica/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.TOMA_FISICA_VER),
  head: () => ({
    meta: [{ title: "Detalle de Toma Física | RicoSoft" }],
  }),
  component: DetalleTomaFisica,
});

function FilaConteo({
  linea,
  puedeGestionar,
  abierta,
  onRegistrar,
}: {
  linea: {
    id: string;
    itemRowId: number;
    descripcion: string | null;
    referencia: string | null;
    stockSistema: number;
    conteoFisico: number | null;
    diferencia: number | null;
    diferenciaPct: number | null;
    valorDiferencia: number | null;
  };
  puedeGestionar: boolean;
  abierta: boolean;
  onRegistrar: (lineaId: string, conteoFisico: number) => Promise<void>;
}) {
  const [valor, setValor] = useState(linea.conteoFisico !== null ? String(linea.conteoFisico) : "");
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0) return;
    setGuardando(true);
    try {
      await onRegistrar(linea.id, n);
    } catch (err: any) {
      toast.error(err.message || "No se pudo registrar el conteo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <TableRow className="hover:bg-slate-50/80">
      <TableCell className="text-xs text-slate-600">{linea.referencia ?? "—"}</TableCell>
      <TableCell className="text-xs font-semibold text-slate-800">
        {linea.descripcion ?? "Ítem sin descripción"}
      </TableCell>
      <TableCell className="num text-right text-xs text-slate-700">
        {compact(linea.stockSistema)}
      </TableCell>
      <TableCell className="text-right text-xs">
        {puedeGestionar && abierta ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              min={0}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="h-8 w-24 text-right text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleGuardar} disabled={guardando}>
              {guardando ? "..." : "Guardar"}
            </Button>
          </div>
        ) : (
          <span className="num text-slate-700">
            {linea.conteoFisico !== null ? compact(linea.conteoFisico) : "—"}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs">
        {linea.diferenciaPct === null ? (
          <span className="text-slate-400">—</span>
        ) : (
          <span
            className={cn(
              "num font-semibold",
              linea.diferencia && linea.diferencia < 0 ? "text-red-600" : "text-emerald-600",
            )}
          >
            {linea.diferencia! >= 0 ? "+" : ""}
            {compact(linea.diferencia!)} ({linea.diferenciaPct >= 0 ? "+" : ""}
            {linea.diferenciaPct}%)
          </span>
        )}
      </TableCell>
      <TableCell className="num text-right text-xs font-semibold text-slate-900">
        {linea.valorDiferencia !== null ? money(linea.valorDiferencia) : "—"}
      </TableCell>
    </TableRow>
  );
}

function DetalleTomaFisica() {
  const { id } = Route.useParams();
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.TOMA_FISICA_GESTIONAR);
  const { detalle, loading, registrarConteo, cerrar } = useTomaFisica(id);
  const [cerrando, setCerrando] = useState(false);

  const handleCerrar = async () => {
    if (!confirm("¿Cerrar esta toma física? Después de cerrarla no se podrá modificar el conteo.")) return;
    setCerrando(true);
    try {
      await cerrar();
      toast.success("Toma física cerrada.");
    } catch (err: any) {
      toast.error(err.message || "No se pudo cerrar la toma física.");
    } finally {
      setCerrando(false);
    }
  };

  return (
    <AppShell
      title="Detalle de Toma Física"
      description="Conteo físico contra el snapshot de existencia real tomado en el momento de crear la toma"
    >
      <Link to="/toma-fisica" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Volver a Toma Física
      </Link>

      {loading && <p className="text-xs text-slate-500">Cargando...</p>}

      {!loading && !detalle && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          Toma física no encontrada.
        </div>
      )}

      {!loading && detalle && (
        <>
          <div className="panel mb-4 p-5 bg-white border-slate-200 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">{detalle.toma.bodegaNombre}</h2>
                <p className="text-xs text-slate-500">
                  {new Date(detalle.toma.fecha).toLocaleDateString("es-CO")} · Responsable:{" "}
                  {detalle.toma.responsable}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <EstadoBadge estado={detalle.toma.estado} />
                {puedeGestionar && detalle.toma.estado === "Abierta" && (
                  <Button size="sm" variant="outline" onClick={handleCerrar} disabled={cerrando}>
                    <Lock className="mr-1 h-3.5 w-3.5" /> {cerrando ? "Cerrando..." : "Cerrar toma"}
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Líneas contadas</p>
                <p className="num text-lg font-bold text-slate-900">
                  {detalle.resumen.lineasContadas} / {detalle.resumen.totalLineas}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Pendientes</p>
                <p className="num text-lg font-bold text-amber-600">
                  {detalle.resumen.lineasPendientes}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Valor de diferencia</p>
                <p
                  className={cn(
                    "num text-lg font-bold",
                    detalle.resumen.valorDiferenciaTotal < 0 ? "text-red-600" : "text-emerald-600",
                  )}
                >
                  {money(detalle.resumen.valorDiferenciaTotal)}
                </p>
              </div>
            </div>
          </div>

          <div className="panel p-5 bg-white border-slate-200 shadow-2xs">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Referencia
                    </TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Ítem
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Stock sistema
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Conteo físico
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Diferencia
                    </TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                      Valor
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalle.lineas.map((l) => (
                    <FilaConteo
                      key={l.id}
                      linea={l}
                      puedeGestionar={puedeGestionar}
                      abierta={detalle.toma.estado === "Abierta"}
                      onRegistrar={registrarConteo}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
