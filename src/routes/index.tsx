import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Bell, Calendar, Info, Megaphone, User as UserIcon } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session-context";
import { useNotificaciones } from "@/hooks/use-notificaciones";
import { usePublicaciones } from "@/hooks/use-publicaciones";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inicio | RicoSoft" },
      {
        name: "description",
        content: "Información, novedades y actividades de tu organización.",
      },
    ],
  }),
  component: Inicio,
});

function formatFechaLarga(fecha: Date) {
  const texto = fecha.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatFechaCorta(iso: string) {
  const fecha = new Date(iso);
  return {
    dia: fecha.toLocaleDateString("es-CO", { day: "2-digit" }),
    mes: fecha.toLocaleDateString("es-CO", { month: "short" }).replace(".", "").toUpperCase(),
  };
}

function tiempoRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutos = Math.floor(diffMs / 60_000);
  if (minutos < 1) return "Hace un momento";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Contenedor visual compartido por los paneles del Home: mismo borde,
 * mismo encabezado con ícono, mismos estados de loading/vacío. */
function PanelHome({
  icono: Icono,
  titulo,
  loading,
  vacio,
  mensajeVacio,
  children,
}: {
  icono: typeof Bell;
  titulo: string;
  loading: boolean;
  vacio: boolean;
  mensajeVacio: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700">
        <Icono className="h-4 w-4 text-blue-700" /> {titulo}
      </h2>
      <div className="mt-4 flex-1">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : vacio ? (
          <p className="py-6 text-center text-sm text-slate-400">{mensajeVacio}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function PanelNovedades() {
  const { publicaciones, loading } = usePublicaciones("NOVEDAD");
  return (
    <PanelHome
      icono={Megaphone}
      titulo="Novedades de la organización"
      loading={loading}
      vacio={publicaciones.length === 0}
      mensajeVacio="No hay novedades disponibles en este momento."
    >
      <ul className="divide-y divide-slate-100">
        {publicaciones.map((p) => (
          <li key={p.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                {p.tipo}
              </Badge>
              <span className="text-[11px] text-slate-400">
                {tiempoRelativo(p.fechaPublicacion)}
              </span>
            </div>
            <h3 className="mt-1.5 text-sm font-bold text-slate-900">{p.titulo}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.contenido}</p>
            {p.autorNombre && <p className="mt-1 text-[11px] text-slate-400">{p.autorNombre}</p>}
          </li>
        ))}
      </ul>
    </PanelHome>
  );
}

function PanelAvisos() {
  const { publicaciones, loading } = usePublicaciones("AVISO");
  return (
    <PanelHome
      icono={Info}
      titulo="Información importante"
      loading={loading}
      vacio={publicaciones.length === 0}
      mensajeVacio="No hay avisos activos en este momento."
    >
      <ul className="space-y-3">
        {publicaciones.map((p) => (
          <li key={p.id} className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {p.tipo}
              </span>
              <h3 className="text-sm font-bold text-slate-900">{p.titulo}</h3>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.contenido}</p>
            </div>
          </li>
        ))}
      </ul>
    </PanelHome>
  );
}

function PanelEventos() {
  const { publicaciones, loading } = usePublicaciones("EVENTO");
  return (
    <PanelHome
      icono={Calendar}
      titulo="Próximos eventos"
      loading={loading}
      vacio={publicaciones.length === 0}
      mensajeVacio="No hay eventos próximos."
    >
      <ul className="divide-y divide-slate-100">
        {publicaciones.map((p) => {
          const { dia, mes } = formatFechaCorta(p.fechaEvento ?? p.fechaPublicacion);
          return (
            <li key={p.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-1.5">
                <span className="text-base font-bold leading-none text-slate-900">{dia}</span>
                <span className="text-[10px] font-bold uppercase text-slate-500">{mes}</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">{p.titulo}</h3>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{p.contenido}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </PanelHome>
  );
}

function PanelMiActividad() {
  const { user } = useSession();
  const { notificaciones, noLeidas, loading, refrescarLista } = useNotificaciones();

  useEffect(() => {
    refrescarLista();
  }, [refrescarLista, user?.tenantId]);

  return (
    <PanelHome
      icono={Bell}
      titulo="Mi actividad"
      loading={loading}
      vacio={notificaciones.length === 0}
      mensajeVacio="No tienes actividad reciente."
    >
      {noLeidas > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <span className="text-2xl font-bold text-blue-800">{noLeidas}</span>
          <span className="text-xs font-semibold text-blue-800">
            {noLeidas === 1 ? "notificación nueva" : "notificaciones nuevas"}
          </span>
        </div>
      )}
      <ul className="space-y-3">
        {notificaciones.slice(0, 5).map((n) => (
          <li key={n.id} className="flex items-start gap-2.5">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.leida ? "bg-slate-300" : "bg-blue-600"}`}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">{n.titulo}</p>
              <p className="text-[11px] text-slate-400">{tiempoRelativo(n.createdAt)}</p>
            </div>
          </li>
        ))}
      </ul>
    </PanelHome>
  );
}

function PanelMisAccesos() {
  return (
    <section className="panel flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-bold text-slate-700">Mis accesos</h2>
      <p className="mt-1 text-xs text-slate-400">Accede rápidamente a lo que necesitas.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link to="/perfil" className="block">
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-blue-400 hover:bg-white">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <UserIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-slate-800">Mi perfil</span>
          </div>
        </Link>
      </div>
    </section>
  );
}

function Inicio() {
  const { user } = useSession();
  const primerNombre = user?.nombre?.split(" ")[0] ?? "";

  return (
    <AppShell title="Inicio" description="Información, novedades y actividades de tu organización.">
      <div className="space-y-6">
        <section className="panel rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                ¡Hola{primerNombre ? `, ${primerNombre}` : ""}!
              </h1>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                Bienvenido a RicoSoft. Aquí encontrarás las novedades, tu actividad y la información
                más relevante de {user?.tenantNombre ?? "tu organización"}.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600">
              <Calendar className="h-4 w-4 shrink-0 text-blue-700" />
              {formatFechaLarga(new Date())}
            </div>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <PanelNovedades />
          <PanelMiActividad />
          <PanelAvisos />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <PanelEventos />
          </div>
          <PanelMisAccesos />
        </div>
      </div>
    </AppShell>
  );
}
