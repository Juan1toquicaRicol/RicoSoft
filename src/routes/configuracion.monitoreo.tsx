import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Server,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import {
  useMonitoreoJobs,
  useMonitoreoSiesa,
  type Comprobacion,
  type EstadoComprobacion,
  type EstadoGeneralSiesa,
  type EstadoJob,
  type JobMonitoreado,
  type OrigenJob,
} from "@/hooks/use-monitoreo";
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

export const Route = createFileRoute("/configuracion/monitoreo")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.INTEGRACION_SIESA_VER),
  component: MonitoreoPage,
});

function fechaLegible(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO");
}

function duracionLegible(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

const ESTILO_ESTADO_GENERAL: Record<
  EstadoGeneralSiesa,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  OPERATIVO: {
    label: "Operativo",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    icon: CheckCircle2,
  },
  DEGRADADO: {
    label: "Degradado",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    icon: AlertTriangle,
  },
  CAIDO: { label: "Caído", className: "bg-red-50 text-red-800 border-red-200", icon: XCircle },
  NO_CONFIGURADO: {
    label: "No configurado",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    icon: ShieldQuestion,
  },
};

function BadgeEstadoGeneral({ estado }: { estado: EstadoGeneralSiesa }) {
  const cfg = ESTILO_ESTADO_GENERAL[estado];
  const Icono = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 text-sm ${cfg.className}`}>
      <Icono className="h-4 w-4" /> {cfg.label}
    </Badge>
  );
}

const ESTILO_COMPROBACION: Record<
  EstadoComprobacion,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  OK: {
    label: "OK",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  FALLO: { label: "Falló", className: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  DESCONOCIDO: {
    label: "Desconocido",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    icon: ShieldQuestion,
  },
  OMITIDO: {
    label: "Omitido",
    className: "bg-slate-100 text-slate-500 border-slate-200",
    icon: Ban,
  },
  NO_CONFIGURADO: {
    label: "No configurado",
    className: "bg-slate-100 text-slate-500 border-slate-200",
    icon: ShieldQuestion,
  },
};

function FilaComprobacion({
  etiqueta,
  comprobacion,
}: {
  etiqueta: string;
  comprobacion: Comprobacion;
}) {
  const cfg = ESTILO_COMPROBACION[comprobacion.estado];
  const Icono = cfg.icon;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{etiqueta}</p>
        {comprobacion.mensaje && <p className="text-xs text-slate-500">{comprobacion.mensaje}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {comprobacion.latenciaMs !== null && (
          <span className="text-xs text-slate-400">{duracionLegible(comprobacion.latenciaMs)}</span>
        )}
        <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
          <Icono className="h-3 w-3" /> {cfg.label}
        </Badge>
      </div>
    </div>
  );
}

function SeccionSiesa() {
  const { reporte, loading, comprobando, error, refresh } = useMonitoreoSiesa();

  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-800">Siesa y VPN</h2>
        </div>
        <div className="flex items-center gap-2">
          {reporte && <BadgeEstadoGeneral estado={reporte.estadoGeneral} />}
          <Button
            variant="outline"
            size="icon"
            onClick={() => refresh(true)}
            disabled={comprobando}
            title="Volver a comprobar"
          >
            <RefreshCw className={comprobando ? "animate-spin h-4 w-4" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      {loading && !reporte ? (
        <p className="text-sm text-slate-500 py-6 text-center">Comprobando...</p>
      ) : reporte ? (
        <>
          {!reporte.configuracion.configurada ? (
            <p className="text-sm text-slate-500">
              Este servidor no tiene configurada la conexión a Siesa
              {reporte.configuracion.variablesFaltantes.length > 0 && (
                <> (faltan: {reporte.configuracion.variablesFaltantes.join(", ")})</>
              )}
              .
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Última comprobación: {fechaLegible(reporte.comprobadoEn)} · duración total{" "}
                {duracionLegible(reporte.duracionTotalMs)}
                {reporte.desdeCache && " · resultado en caché"}
                {!reporte.tenant.siesaCiaConfigurada && (
                  <> · esta empresa no tiene compañía Siesa configurada</>
                )}
              </p>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">
                  Conectividad
                </h3>
                <FilaComprobacion
                  etiqueta="Túnel VPN (interfaz)"
                  comprobacion={reporte.vpn.interfazTunel}
                />
                <FilaComprobacion
                  etiqueta="Ruta hacia el servidor Siesa (DNS)"
                  comprobacion={reporte.vpn.rutaSiesa}
                />
                <FilaComprobacion
                  etiqueta="Conexión TCP a SQL Server"
                  comprobacion={reporte.conectividad}
                />
                <FilaComprobacion
                  etiqueta="Autenticación y consulta (SELECT 1)"
                  comprobacion={reporte.sql}
                />
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">
                  Vistas/consultas usadas por RicoSoft
                </h3>
                {reporte.vistas.map((v) => (
                  <FilaComprobacion key={v.nombre} etiqueta={v.nombre} comprobacion={v} />
                ))}
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

const ESTILO_ESTADO_JOB: Record<
  EstadoJob,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  OK: {
    label: "OK",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
  FALLIDO: { label: "Fallido", className: "bg-red-50 text-red-700 border-red-200", icon: XCircle },
  EN_EJECUCION: {
    label: "En ejecución",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: Loader2,
  },
  PROGRAMADO: {
    label: "Programado",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    icon: Clock,
  },
  NO_CONFIGURADO: {
    label: "No configurado",
    className: "bg-slate-100 text-slate-500 border-slate-200",
    icon: ShieldQuestion,
  },
};

const ETIQUETA_ORIGEN: Record<OrigenJob, string> = {
  SCHEDULER: "Programado (cron)",
  BAJO_DEMANDA: "A demanda",
  NO_EXISTE: "Sin proceso",
};

function FilaJob({ job }: { job: JobMonitoreado }) {
  const cfg = ESTILO_ESTADO_JOB[job.estado];
  const Icono = cfg.icon;
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-slate-800">{job.nombre}</p>
        <p className="text-[11px] text-slate-400 max-w-sm">{job.descripcion}</p>
        {job.motivo && <p className="text-[11px] text-slate-400 mt-0.5">{job.motivo}</p>}
      </TableCell>
      <TableCell className="text-slate-500 text-xs">{ETIQUETA_ORIGEN[job.origen]}</TableCell>
      <TableCell>
        <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
          <Icono className={`h-3 w-3 ${job.estado === "EN_EJECUCION" ? "animate-spin" : ""}`} />{" "}
          {cfg.label}
        </Badge>
      </TableCell>
      <TableCell className="text-slate-600 text-xs">{job.cron ?? "—"}</TableCell>
      <TableCell className="text-slate-600 text-xs">{fechaLegible(job.ultimaEjecucion)}</TableCell>
      <TableCell className="text-slate-600 text-xs">
        {fechaLegible(job.ultimaEjecucionExitosa)}
      </TableCell>
      <TableCell className="text-xs">
        {job.ultimaEjecucionFallida ? (
          <span className="text-red-700" title={job.mensajeUltimoError ?? undefined}>
            {fechaLegible(job.ultimaEjecucionFallida)}
          </span>
        ) : (
          <span className="text-slate-600">—</span>
        )}
      </TableCell>
      <TableCell className="text-slate-600 text-xs">
        {duracionLegible(job.duracionUltimaMs)}
      </TableCell>
      <TableCell className="text-slate-600 text-xs">{fechaLegible(job.proximaEjecucion)}</TableCell>
    </TableRow>
  );
}

function SeccionJobs() {
  const { jobs, loading, error, refresh, generadoEn } = useMonitoreoJobs();

  return (
    <section className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-slate-800">Procesos en background</h2>
        </div>
        <div className="flex items-center gap-3">
          {generadoEn && (
            <span className="text-[11px] text-slate-500">
              Se actualiza solo cada 30 s · última:{" "}
              {new Date(generadoEn).toLocaleTimeString("es-CO")}
            </span>
          )}
          <Button variant="outline" size="icon" onClick={() => refresh()} title="Actualizar">
            <RefreshCw className={loading ? "animate-spin h-4 w-4" : "h-4 w-4"} />
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        <strong>No configurado</strong> significa que el proceso está apagado en el servidor (no es
        una falla). Los procesos programados reportan su actividad desde el último reinicio de este
        servidor; la sincronización a demanda persiste su historial entre reinicios.
      </p>

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cron</TableHead>
              <TableHead>Última ejecución</TableHead>
              <TableHead>Última exitosa</TableHead>
              <TableHead>Última fallida</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Próxima</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-slate-500 py-6">
                  {loading ? "Cargando..." : "Sin información de procesos."}
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => <FilaJob key={job.id} job={job} />)
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function MonitoreoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Activity className="h-6 w-6 text-blue-600" />
          Monitoreo de integraciones y operación
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Salud de la conexión con Siesa y la VPN, y estado de los procesos en background. Solo
          lectura: RicoSoft observa esta infraestructura, no la administra desde aquí.
        </p>
      </div>

      <SeccionSiesa />
      <SeccionJobs />
    </div>
  );
}
