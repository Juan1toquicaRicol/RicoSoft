import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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
import { fetchAuth } from "@/lib/session";

interface FuenteBiometrica {
  id: string;
  nombre: string;
  proveedor: string;
  activa: boolean;
  lastProcessedLogId: number;
  ultimaSincronizacion: {
    estado: string;
    iniciadoEn: string;
    finalizadoEn: string | null;
  } | null;
}

const TH = "text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5";
const BASE_URL = "/gestion-humana/biometrico/fuentes";

export function BiometricoFuentesPanel({ puedeConfigurar }: { puedeConfigurar: boolean }) {
  const [fuentes, setFuentes] = useState<FuenteBiometrica[]>([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const cargarFuentes = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const resultado: FuenteBiometrica[] = await fetchAuth(BASE_URL);
      setFuentes(resultado);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "No fue posible cargar las fuentes biométricas.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarFuentes();
  }, [cargarFuentes]);

  const crearFuente = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length < 3 || nombreLimpio.length > 50) return;

    setGuardando(true);
    try {
      const creada: FuenteBiometrica = await fetchAuth(BASE_URL, {
        method: "POST",
        body: JSON.stringify({ nombre: nombreLimpio, proveedor: "anviz" }),
      });
      setFuentes((actuales) =>
        [...actuales, creada].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      setNombre("");
      toast.success("Fuente biométrica creada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear la fuente.");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (fuente: FuenteBiometrica, activa: boolean) => {
    setOcupadoId(fuente.id);
    try {
      const actualizada: FuenteBiometrica = await fetchAuth(`${BASE_URL}/${fuente.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activa }),
      });
      setFuentes((actuales) =>
        actuales.map((item) => (item.id === fuente.id ? actualizada : item)),
      );
      toast.success(`Fuente ${activa ? "activada" : "desactivada"}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible actualizar la fuente.");
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <section className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <header className="p-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Fuentes biométricas</h3>
          <p className="mt-1 text-xs text-slate-500 font-medium">
            Administra las fuentes CrossChex vinculadas a la empresa activa.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-2 text-xs"
          onClick={() => void cargarFuentes()}
          disabled={cargando}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </Button>
      </header>

      <div className="p-4 space-y-4">
        <Alert className="border-blue-200 bg-blue-50 text-blue-950">
          <Fingerprint className="h-4 w-4" />
          <AlertDescription className="text-xs leading-relaxed">
            La conexión al archivo CrossChex se configura en el servidor mediante
            <code className="mx-1 rounded bg-white/70 px-1 py-0.5">CROSSCHEX_MDB_PATH</code>. Crear
            o activar una fuente aquí no habilita por sí solo la sincronización automática; esta
            depende de la configuración del servidor.
          </AlertDescription>
        </Alert>

        {puedeConfigurar && (
          <form onSubmit={crearFuente} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1">
              <Label
                htmlFor="fuente-biometrica-nombre"
                className="text-xs font-semibold text-slate-700"
              >
                Nombre de la fuente
              </Label>
              <Input
                id="fuente-biometrica-nombre"
                value={nombre}
                maxLength={50}
                minLength={3}
                onChange={(event) => setNombre(event.target.value)}
                placeholder="Ej. CrossChex principal"
                className="h-9 border-slate-300 text-xs"
                required
              />
              <p className="text-[11px] text-slate-500">
                Entre 3 y 50 caracteres. El proveedor será Anviz.
              </p>
            </div>
            <Button
              type="submit"
              size="sm"
              className="gap-2"
              disabled={guardando || nombre.trim().length < 3}
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Crear fuente
            </Button>
          </form>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          >
            {error}
          </div>
        )}

        {cargando ? (
          <p role="status" className="flex items-center gap-2 py-8 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando fuentes...
          </p>
        ) : fuentes.length === 0 ? (
          <EmptyState
            icon={Fingerprint}
            title="No hay fuentes biométricas configuradas"
            description={
              puedeConfigurar
                ? "Crea una fuente para registrar la conexión CrossChex de esta empresa."
                : "Solicita el permiso biometrico.configurar a un administrador para crear una fuente."
            }
          />
        ) : (
          <Table>
            <TableHeader className="bg-slate-100/80">
              <TableRow className="hover:bg-slate-100/80">
                <TableHead className={TH}>Fuente</TableHead>
                <TableHead className={TH}>Proveedor</TableHead>
                <TableHead className={TH}>Última sincronización</TableHead>
                <TableHead className={TH}>Estado</TableHead>
                {puedeConfigurar && <TableHead className={`${TH} text-right`}>Activa</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {fuentes.map((fuente) => (
                <TableRow key={fuente.id} className={fuente.activa ? "" : "opacity-70"}>
                  <TableCell className="px-4 py-3 text-xs font-semibold text-slate-900">
                    {fuente.nombre}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-slate-600">
                    Anviz / CrossChex
                  </TableCell>
                  <TableCell className="px-4 py-3 text-xs text-slate-600">
                    {fuente.ultimaSincronizacion
                      ? new Date(fuente.ultimaSincronizacion.iniciadoEn).toLocaleString("es-CO")
                      : "Sin sincronizaciones"}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        fuente.activa
                          ? "border-blue-200 bg-blue-50 text-blue-800 font-bold"
                          : "border-slate-300 bg-slate-100 text-slate-600 font-bold"
                      }
                    >
                      {fuente.activa ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                  {puedeConfigurar && (
                    <TableCell className="px-4 py-3 text-right">
                      <Switch
                        aria-label={`${fuente.activa ? "Desactivar" : "Activar"} fuente ${fuente.nombre}`}
                        checked={fuente.activa}
                        disabled={ocupadoId === fuente.id}
                        onCheckedChange={(activa) => void cambiarEstado(fuente, activa)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
