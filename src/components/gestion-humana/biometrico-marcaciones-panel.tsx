import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatoHoraReloj, hoyLocal } from "@/lib/hora-reloj";
import { fetchAuth } from "@/lib/session";

interface MarcacionBiometrica {
  id: string;
  fecha: string;
  horaMarcacion: string;
  externalUserId: string;
  /** Usuario registrado en el biométrico (CrossChex), no el empleado de RicoSoft. */
  usuarioBiometrico: { nombre: string | null; codigo: string | null } | null;
  externalLogId: string;
  tipoMarcacion: string;
  dispositivoId: string | null;
  fuente: { id: string; nombre: string };
  empleado: { id: string; nombres: string; apellidos: string } | null;
}

interface PaginaMarcaciones {
  items: MarcacionBiometrica[];
  ultimaMarcacion: string | null;
  nombresDisponibles: boolean;
  page: number;
  total: number;
  totalPages: number;
}

const POR_PAGINA = 20;
const TH = "text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5";

const TIPO: Record<string, string> = {
  ENTRADA: "Entrada",
  BREAK: "Break",
  FUERATIEMPO: "Fuera de tiempo",
  OTRO: "Otro",
};

export function BiometricoMarcacionesPanel() {
  const [pagina, setPagina] = useState(1);
  const [soloSinAsociar, setSoloSinAsociar] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState<PaginaMarcaciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ page: String(pagina), limit: String(POR_PAGINA) });
      if (soloSinAsociar) params.set("soloNoAsociados", "true");
      if (desde) params.set("fechaDesde", desde);
      if (hasta) params.set("fechaHasta", hasta);
      const resultado = await fetchAuth(`/gestion-humana/biometrico/marcaciones?${params}`);
      setDatos(resultado as PaginaMarcaciones);
      setError("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No fue posible cargar las marcaciones.");
    } finally {
      setCargando(false);
    }
  }, [pagina, soloSinAsociar, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <section className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <header className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Marcaciones</h3>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Eventos tal como los reporta el reloj. La hora es la del reloj, sin ajuste de zona
            horaria.
          </p>
          {datos && (
            <p className="mt-1 text-xs font-semibold text-slate-700">
              Última marcación guardada:{" "}
              {datos.ultimaMarcacion ? formatoHoraReloj(datos.ultimaMarcacion) : "ninguna todavía"}
            </p>
          )}
        </div>
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
      </header>

      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label htmlFor="marc-desde" className="text-xs font-semibold text-slate-700">
              Desde
            </Label>
            <Input
              id="marc-desde"
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => {
                setDesde(e.target.value);
                setPagina(1);
              }}
              className="h-9 w-40 border-slate-300 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="marc-hasta" className="text-xs font-semibold text-slate-700">
              Hasta
            </Label>
            <Input
              id="marc-hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => {
                setHasta(e.target.value);
                setPagina(1);
              }}
              className="h-9 w-40 border-slate-300 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 pb-2">
            <Switch
              id="marc-sin-asociar"
              checked={soloSinAsociar}
              onCheckedChange={(v) => {
                setSoloSinAsociar(v);
                setPagina(1);
              }}
            />
            <Label htmlFor="marc-sin-asociar" className="text-xs font-semibold text-slate-700">
              Solo sin asociar a un empleado
            </Label>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 text-xs"
            onClick={() => {
              const hoy = hoyLocal();
              setDesde(hoy);
              setHasta(hoy);
              setPagina(1);
            }}
          >
            Hoy
          </Button>
          {(desde || hasta || soloSinAsociar) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 text-xs"
              onClick={() => {
                setDesde("");
                setHasta("");
                setSoloSinAsociar(false);
                setPagina(1);
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        {datos && !datos.nombresDisponibles && datos.items.length > 0 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-950">
            <AlertDescription className="text-xs">
              No se pudieron leer los nombres del biométrico en este momento; se muestra solo el ID
              de cada usuario.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {cargando && !datos ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando marcaciones…
          </div>
        ) : datos && datos.items.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No hay marcaciones con esos filtros"
            description={
              datos.ultimaMarcacion
                ? `Prueba con otro rango o quita los filtros. La última marcación guardada es del ${formatoHoraReloj(datos.ultimaMarcacion)}: si es anterior al día que buscas, aún no han llegado las de ese día (la sincronización corre cada minuto).`
                : "Todavía no se ha guardado ninguna marcación. Revisa la vista Sincronizaciones."
            }
          />
        ) : (
          datos && (
            <>
              <Table>
                <TableHeader className="bg-slate-100/80">
                  <TableRow className="hover:bg-slate-100/80">
                    <TableHead className={TH}>Hora del reloj</TableHead>
                    <TableHead className={TH}>Usuario del biométrico</TableHead>
                    <TableHead className={TH}>Empleado en RicoSoft</TableHead>
                    <TableHead className={TH}>Tipo</TableHead>
                    <TableHead className={TH}>Dispositivo</TableHead>
                    <TableHead className={TH}>Fuente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {datos.items.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="px-4 py-3 text-xs text-slate-700">
                        {formatoHoraReloj(m.horaMarcacion)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        <span className="font-semibold text-slate-900">
                          {m.usuarioBiometrico?.nombre ?? "Sin nombre en el biométrico"}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          ID {m.externalUserId}
                          {m.usuarioBiometrico?.codigo
                            ? ` · Código ${m.usuarioBiometrico.codigo}`
                            : ""}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        {m.empleado ? (
                          <span className="font-semibold text-slate-900">
                            {m.empleado.nombres} {m.empleado.apellidos}
                          </span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-amber-800 font-bold"
                          >
                            Sin asociar
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-600">
                        {TIPO[m.tipoMarcacion] ?? m.tipoMarcacion}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-600">
                        {m.dispositivoId ?? "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-600">
                        {m.fuente.nombre}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Página {datos.page} de {Math.max(1, datos.totalPages)} ·{" "}
                  {datos.total.toLocaleString("es-CO")} marcaciones
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
