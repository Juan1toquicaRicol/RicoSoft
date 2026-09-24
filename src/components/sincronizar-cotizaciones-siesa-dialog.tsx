import { useState } from "react";
import { CloudDownload } from "lucide-react";
import { toast } from "sonner";

import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSincronizarCotizacionesSiesa } from "@/hooks/use-comercial";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import {
  fechaDesdePorDefecto,
  resumenSincronizacion,
  type ResultadoSincronizacionCotizaciones,
} from "@/lib/sincronizacion-cotizaciones";
import { CLASES_TONO_ESTADO } from "@/lib/estado-tono";
import { cn } from "@/lib/utils";

/**
 * "Sincronizar desde Siesa CRM": trae las cotizaciones (CDV) de la compañía
 * Siesa del tenant a partir de una fecha y las guarda como BORRADOR. Solo se
 * muestra con el permiso cotizaciones.gestionar (el backend lo exige igual).
 * "Simular" muestra el resumen sin escribir nada.
 */
export function SincronizarCotizacionesSiesa({ onSincronizado }: { onSincronizado?: () => void }) {
  const { user } = useSession();
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(() => fechaDesdePorDefecto());
  const [resultado, setResultado] = useState<ResultadoSincronizacionCotizaciones | null>(null);
  const { sincronizar, loading, error } = useSincronizarCotizacionesSiesa();

  if (!hasPermission(user, PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR)) return null;

  const ejecutar = async (guardar: boolean) => {
    try {
      const r = await sincronizar({ desde: desde || undefined, guardar });
      setResultado(r);
      if (guardar) {
        toast.success(
          `Sincronización lista: ${r.creadas} nuevas, ${r.yaVinculadas} ya vinculadas.`,
        );
        onSincronizado?.();
      }
    } catch {
      setResultado(null); // el mensaje queda en `error`
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAbierto(true)}>
        <CloudDownload className="h-3.5 w-3.5" /> Sincronizar desde Siesa CRM
      </Button>

      <Dialog
        open={abierto}
        onOpenChange={(v) => {
          setAbierto(v);
          if (!v) setResultado(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar cotizaciones desde Siesa CRM</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <p className="text-slate-600">
              Trae las cotizaciones de Siesa de tu empresa desde la fecha elegida. Las nuevas se
              crean como <strong>borrador</strong>; las ya vinculadas se actualizan solo si siguen
              en borrador.
            </p>

            <label className="block space-y-1">
              <span className="font-medium text-slate-700">Desde</span>
              <Input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                disabled={loading}
              />
            </label>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void ejecutar(false)}
              >
                Simular
              </Button>
              <Button size="sm" disabled={loading} onClick={() => void ejecutar(true)}>
                {loading ? "Sincronizando..." : "Sincronizar y guardar"}
              </Button>
            </div>

            {error && (
              <p
                role="alert"
                className={cn("rounded-md border px-3 py-2", CLASES_TONO_ESTADO.danger)}
              >
                {error}
              </p>
            )}

            {resultado && (
              <div
                className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"
                data-testid="resumen-sincronizacion"
              >
                <p className="font-semibold text-slate-800">
                  {resultado.modo === "GUARDADO"
                    ? "Resumen de la sincronización"
                    : "Simulación (no se guardó nada)"}
                  {" · "}
                  {resultado.total} en Siesa
                </p>
                <ul className="space-y-1">
                  {resumenSincronizacion(resultado).map((l) => (
                    <li key={l.etiqueta} className="flex items-center justify-between">
                      <span className="text-slate-600">{l.etiqueta}</span>
                      <span className="flex items-center gap-2">
                        <EstadoBadge estado={String(l.valor)} tono={l.tono} />
                      </span>
                    </li>
                  ))}
                </ul>
                {resultado.errores.length > 0 && (
                  <p className="text-slate-600">
                    No se pudieron guardar: {resultado.errores.map((e) => e.consecutivo).join(", ")}
                    .
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
