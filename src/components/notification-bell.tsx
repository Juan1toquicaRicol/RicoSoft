import { useNavigate } from "@tanstack/react-router";
import { Bell, CheckCheck, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotificaciones, type NotificacionApi } from "@/hooks/use-notificaciones";
import { cn } from "@/lib/utils";

function tiempoRelativo(fecha: string): string {
  const ms = Date.now() - new Date(fecha).getTime();
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { notificaciones, noLeidas, loading, refrescarLista, marcarLeida, marcarTodasLeidas } =
    useNotificaciones();

  const handleClickNotificacion = (n: NotificacionApi) => {
    if (!n.leida) marcarLeida(n.id);
    if (n.enlace) navigate({ to: n.enlace });
  };

  return (
    <Popover onOpenChange={(open) => open && refrescarLista()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="h-4.5 w-4.5" />
          {noLeidas > 0 && (
            <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] font-bold text-white">
              {noLeidas > 9 ? "9+" : noLeidas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
          <span className="text-xs font-bold text-slate-800">Notificaciones</span>
          {noLeidas > 0 && (
            <button
              type="button"
              onClick={marcarTodasLeidas}
              className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900"
            >
              <CheckCheck className="h-3 w-3" /> Marcar todas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading && notificaciones.length === 0 && (
            <p className="p-6 text-center text-xs text-slate-400">Cargando...</p>
          )}
          {!loading && notificaciones.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <Inbox className="h-6 w-6 text-slate-300" />
              <p className="text-xs text-slate-400">No tienes notificaciones.</p>
            </div>
          )}
          {notificaciones.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleClickNotificacion(n)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-50",
                !n.leida && "bg-blue-50/60",
              )}
            >
              <div className="flex items-center gap-1.5">
                {!n.leida && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-700" />}
                <span
                  className={cn("text-xs text-slate-800", !n.leida ? "font-bold" : "font-semibold")}
                >
                  {n.titulo}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 line-clamp-2">{n.mensaje}</p>
              <span className="text-[10px] text-slate-400">{tiempoRelativo(n.createdAt)}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
