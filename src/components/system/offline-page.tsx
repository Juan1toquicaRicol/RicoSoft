import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Aviso de "sin conexión" — DELIBERADAMENTE no bloqueante. `navigator.onLine`
 * no es confiable para una app servida en red local/intranet (el sistema
 * operativo puede reportar "sin internet" aunque el propio servidor de
 * RicoSoft siga perfectamente alcanzable), así que esto nunca debe tapar la
 * pantalla completa ni impedir usar la app — solo informa en una esquina y
 * deja reintentar. No cierra sesión, no borra estado local.
 */
export function OfflinePage({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg sm:left-auto sm:right-4 sm:translate-x-0">
      <div className="flex items-start gap-2.5">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800">Sin conexión</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            RicoSoft se reconectará automáticamente cuando vuelva la red.
          </p>
        </div>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 shrink-0 text-[11px]"
            onClick={onRetry}
          >
            Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}
