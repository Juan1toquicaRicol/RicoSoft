import { createFileRoute } from "@tanstack/react-router";
import { Cloud, RefreshCw, Loader2, CheckCircle2, XCircle, Clock, Ban, X } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useSiesaSync, type EstadoSincronizacionSiesa } from "@/hooks/use-siesa-sync";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/configuracion/integraciones-siesa")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
  component: IntegracionSiesaPage,
});

const ESTADO_UI: Record<
  EstadoSincronizacionSiesa,
  { label: string; className: string; icon: typeof Clock }
> = {
  EN_COLA: {
    label: "En cola",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Clock,
  },
  EN_CURSO: {
    label: "En curso",
    className: "bg-blue-50 text-blue-800 border-blue-200",
    icon: Loader2,
  },
  COMPLETADO: {
    label: "Completado",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  FALLIDO: { label: "Fallido", className: "bg-red-50 text-red-800 border-red-200", icon: XCircle },
  CANCELADO: {
    label: "Cancelado",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Ban,
  },
};

function EstadoBadgeSiesa({ estado }: { estado: EstadoSincronizacionSiesa }) {
  const cfg = ESTADO_UI[estado];
  const Icono = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      <Icono className={`h-3 w-3 ${estado === "EN_CURSO" ? "animate-spin" : ""}`} /> {cfg.label}
    </Badge>
  );
}

function IntegracionSiesaPage() {
  const { user: sesion } = useSession();
  const puedeSincronizar = hasPermission(sesion, PERMISOS_SISTEMA.INTEGRACION_SIESA_SINCRONIZAR);

  const { historial, activa, loading, error, disparando, sincronizar, cancelar, refresh } =
    useSiesaSync();

  const handleSincronizar = async () => {
    try {
      await sincronizar();
      toast.success("Sincronización iniciada.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible iniciar la sincronización.");
    }
  };

  const handleCancelar = async (id: string) => {
    try {
      await cancelar(id);
      toast.success("Cancelación solicitada.");
    } catch (err: any) {
      toast.error(err.message || "No fue posible cancelar la sincronización.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <Cloud className="h-6 w-6 text-blue-600" />
            Integración con Siesa
          </h1>
          <p className="text-sm text-slate-500">
            Sincronización de proveedores desde Siesa/UnoEE. La empresa (compañía Siesa) se resuelve
            siempre del lado del servidor a partir de tu empresa activa — nunca se puede elegir
            aquí.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refresh()} title="Actualizar">
            <RefreshCw className={loading ? "animate-spin h-4 w-4" : "h-4 w-4"} />
          </Button>
          {puedeSincronizar && (
            <Button
              size="sm"
              onClick={handleSincronizar}
              disabled={disparando || !!activa}
              className="gap-1.5"
            >
              {activa
                ? "Sincronización en curso..."
                : disparando
                  ? "Iniciando..."
                  : "Sincronizar proveedores"}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      {activa && (
        <div className="bg-white p-4 rounded-lg border border-blue-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <EstadoBadgeSiesa estado={activa.estado} />
              <span className="text-xs text-slate-500">
                Iniciada por {activa.iniciadoPor?.nombre ?? "—"} ·{" "}
                {new Date(activa.iniciadoEn).toLocaleString("es-CO")}
              </span>
            </div>
            {puedeSincronizar && activa.estado !== "CANCELADO" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCancelar(activa.id)}
                className="gap-1"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Leídos</p>
              <p className="text-lg font-bold text-slate-900">{activa.leidos}</p>
            </div>
            <div>
              <p className="text-slate-500">Creados</p>
              <p className="text-lg font-bold text-slate-900">{activa.creados}</p>
            </div>
            <div>
              <p className="text-slate-500">Actualizados</p>
              <p className="text-lg font-bold text-slate-900">{activa.actualizados}</p>
            </div>
            <div>
              <p className="text-slate-500">Errores</p>
              <p className="text-lg font-bold text-slate-900">{activa.erroresCount}</p>
            </div>
          </div>
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Estado</TableHead>
              <TableHead>Iniciada por</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Leídos</TableHead>
              <TableHead>Creados</TableHead>
              <TableHead>Actualizados</TableHead>
              <TableHead>Desactivados</TableHead>
              <TableHead>Errores</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historial.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-500 py-6">
                  {loading
                    ? "Cargando historial..."
                    : "Todavía no se ha ejecutado ninguna sincronización."}
                </TableCell>
              </TableRow>
            ) : (
              historial.map((s) => {
                const duracion =
                  s.finalizadoEn && s.iniciadoEn
                    ? Math.round(
                        (new Date(s.finalizadoEn).getTime() - new Date(s.iniciadoEn).getTime()) /
                          1000,
                      )
                    : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <EstadoBadgeSiesa estado={s.estado} />
                      {s.mensajeError && (
                        <p className="mt-1 text-[11px] text-red-700" title={s.mensajeError}>
                          {s.mensajeError.length > 60
                            ? `${s.mensajeError.slice(0, 60)}...`
                            : s.mensajeError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">{s.iniciadoPor?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-slate-600">
                      {new Date(s.iniciadoEn).toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {duracion !== null ? `${duracion}s` : "—"}
                    </TableCell>
                    <TableCell className="num">{s.leidos}</TableCell>
                    <TableCell className="num text-emerald-700 font-semibold">
                      {s.creados}
                    </TableCell>
                    <TableCell className="num text-blue-700 font-semibold">
                      {s.actualizados}
                    </TableCell>
                    <TableCell className="num text-amber-700 font-semibold">
                      {s.desactivados}
                    </TableCell>
                    <TableCell className="num">
                      {s.erroresCount > 0 ? (
                        <span
                          className="text-red-700 font-semibold cursor-help"
                          title={s.errores.map((e) => `${e.nit}: ${e.mensaje}`).join("\n")}
                        >
                          {s.erroresCount}
                        </span>
                      ) : (
                        "0"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
