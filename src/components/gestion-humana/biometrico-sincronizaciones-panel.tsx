import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchAuth } from "@/lib/session";

interface SincronizacionBiometrica {
  id: string;
  fuente: { id: string; nombre: string };
  estado: "EN_CURSO" | "COMPLETADO" | "FALLIDO";
  iniciadoEn: string;
  finalizadoEn: string | null;
  duracionMs: number | null;
  logIdDesde: number;
  logIdHasta: number | null;
  leidos: number;
  insertados: number;
  duplicados: number;
  sinEmpleado: number;
  erroresCount: number;
  mensajeError: string | null;
}

interface PaginaSincronizaciones {
  items: SincronizacionBiometrica[];
  page: number;
  total: number;
  totalPages: number;
}

interface FuenteResumen {
  id: string;
  nombre: string;
  activa: boolean;
}

const BASE = "/gestion-humana/biometrico";
const POR_PAGINA = 10;
const REFRESCO_MS = 30_000;

const TH = "text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5";

const ESTADO: Record<SincronizacionBiometrica["estado"], { etiqueta: string; className: string }> =
  {
    COMPLETADO: {
      etiqueta: "Completada",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    EN_CURSO: { etiqueta: "En curso", className: "border-blue-200 bg-blue-50 text-blue-800" },
    FALLIDO: { etiqueta: "Fallida", className: "border-red-200 bg-red-50 text-red-700" },
  };

function formatoDuracion(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

function haceCuanto(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{titulo}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{valor}</p>
      {detalle && <p className="text-[11px] text-slate-500">{detalle}</p>}
    </div>
  );
}

export function BiometricoSincronizacionesPanel({
  puedeSincronizar,
}: {
  puedeSincronizar: boolean;
}) {
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<PaginaSincronizaciones | null>(null);
  const [fuentes, setFuentes] = useState<FuenteResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [sincronizando, setSincronizando] = useState(false);

  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      try {
        const [resultado, listaFuentes] = await Promise.all([
          fetchAuth(`${BASE}/sincronizaciones?page=${pagina}&limit=${POR_PAGINA}`),
          fetchAuth(`${BASE}/fuentes`),
        ]);
        setDatos(resultado as PaginaSincronizaciones);
        setFuentes(Array.isArray(listaFuentes) ? listaFuentes : []);
        setError("");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "No fue posible cargar las sincronizaciones.",
        );
      } finally {
        setCargando(false);
      }
    },
    [pagina],
  );

  useEffect(() => {
    void cargar();
    const id = setInterval(() => void cargar(true), REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const fuenteActiva = fuentes.find((f) => f.activa) ?? null;
  const ultima = pagina === 1 ? (datos?.items[0] ?? null) : null;

  const sincronizarAhora = async () => {
    if (!fuenteActiva) return;
    setSincronizando(true);
    try {
      const reporte = await fetchAuth(`${BASE}/fuentes/${fuenteActiva.id}/sincronizar`, {
        method: "POST",
      });
      if (reporte?.estado === "FALLIDO") {
        toast.error(`La sincronización falló: ${reporte.mensajeError ?? "error desconocido"}`);
      } else {
        toast.success(
          `Sincronización completada: ${reporte?.leidos ?? 0} leídas, ${reporte?.insertados ?? 0} nuevas.`,
        );
      }
      await cargar(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible sincronizar.");
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <section className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <header className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Sincronizaciones</h3>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Historial de cada corrida de CrossChex → RicoSoft. Se actualiza solo cada 30 segundos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-2 text-xs"
            onClick={() => void cargar()}
            disabled={cargando}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
          </Button>
          {puedeSincronizar && (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-2 text-xs"
              onClick={() => void sincronizarAhora()}
              disabled={sincronizando || !fuenteActiva}
              title={fuenteActiva ? undefined : "No hay una fuente biométrica activa."}
            >
              {sincronizando ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Sincronizar ahora
            </Button>
          )}
        </div>
      </header>

      <div className="p-4 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {!cargando && !fuenteActiva && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertDescription className="text-xs">
              No hay una fuente biométrica activa: el proceso automático no sincroniza nada hasta
              que actives una en “Fuentes y asociaciones”.
            </AlertDescription>
          </Alert>
        )}

        {ultima && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Dato
                titulo="Última corrida"
                valor={ESTADO[ultima.estado].etiqueta}
                detalle={`${haceCuanto(ultima.iniciadoEn)} · ${ultima.fuente.nombre}`}
              />
              <Dato
                titulo="Marcaciones leídas"
                valor={ultima.leidos.toLocaleString("es-CO")}
                detalle={`Duración ${formatoDuracion(ultima.duracionMs)}`}
              />
              <Dato
                titulo="Nuevas guardadas"
                valor={ultima.insertados.toLocaleString("es-CO")}
                detalle={`${ultima.duplicados.toLocaleString("es-CO")} ya existían`}
              />
              <Dato
                titulo="Sin asociar a un empleado"
                valor={ultima.sinEmpleado.toLocaleString("es-CO")}
                detalle="En la última corrida"
              />
            </div>
            {ultima.estado === "FALLIDO" && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  La última corrida falló: {ultima.mensajeError ?? "sin detalle"}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {cargando && !datos ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando sincronizaciones…
          </div>
        ) : datos && datos.items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Aún no hay sincronizaciones"
            description="Aparecerán aquí cuando el proceso automático o una sincronización manual corra por primera vez."
          />
        ) : (
          datos && (
            <>
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className={TH}>Inicio</TableHead>
                    <TableHead className={TH}>Fuente</TableHead>
                    <TableHead className={TH}>Estado</TableHead>
                    <TableHead className={`${TH} text-right`}>Leídas</TableHead>
                    <TableHead className={`${TH} text-right`}>Nuevas</TableHead>
                    <TableHead className={`${TH} text-right`}>Duplicadas</TableHead>
                    <TableHead className={`${TH} text-right`}>Sin empleado</TableHead>
                    <TableHead className={`${TH} text-right`}>Duración</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="px-4 py-3 text-xs text-slate-700">
                        {new Date(s.iniciadoEn).toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs font-semibold text-slate-900">
                        {s.fuente.nombre}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`gap-1 font-bold ${ESTADO[s.estado].className}`}
                          title={s.mensajeError ?? undefined}
                        >
                          {s.estado === "COMPLETADO" && <CheckCircle2 className="h-3 w-3" />}
                          {s.estado === "FALLIDO" && <XCircle className="h-3 w-3" />}
                          {s.estado === "EN_CURSO" && <Loader2 className="h-3 w-3 animate-spin" />}
                          {ESTADO[s.estado].etiqueta}
                        </Badge>
                        {s.estado === "FALLIDO" && s.mensajeError && (
                          <p
                            className="mt-1 max-w-64 truncate text-[11px] text-red-700"
                            title={s.mensajeError}
                          >
                            {s.mensajeError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-xs">{s.leidos}</TableCell>
                      <TableCell className="px-4 py-3 text-right text-xs">{s.insertados}</TableCell>
                      <TableCell className="px-4 py-3 text-right text-xs">{s.duplicados}</TableCell>
                      <TableCell className="px-4 py-3 text-right text-xs">
                        {s.sinEmpleado}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right text-xs text-slate-600">
                        {formatoDuracion(s.duracionMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Página {datos.page} de {Math.max(1, datos.totalPages)} · {datos.total} corridas
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((p) => p - 1)}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={pagina >= datos.totalPages}
                    onClick={() => setPagina((p) => p + 1)}
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </section>
  );
}
