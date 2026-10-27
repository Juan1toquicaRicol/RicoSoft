import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Fingerprint, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface EmpleadoOption {
  id: string;
  nombres: string;
  apellidos: string;
  documento: string;
}

interface UsuarioBiometrico {
  userid: string;
  codigo: string | null;
  nombre: string | null;
  asociado: boolean;
}

interface AsociacionBiometrica {
  id: string;
  fuenteId: string;
  externalUserId: string;
  usuarioBiometrico?: { nombre: string | null; codigo: string | null } | null;
  activo: boolean;
  empleado: EmpleadoOption | null;
}

interface PaginaAsociaciones {
  items: AsociacionBiometrica[];
  page: number;
  total: number;
  totalPages: number;
}

const TH = "text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5";
const BASE_URL = "/gestion-humana/biometrico/fuentes";

export function BiometricoFuentesPanel({
  puedeConfigurar,
  puedeAsociar,
  empleados,
}: {
  puedeConfigurar: boolean;
  puedeAsociar: boolean;
  empleados: EmpleadoOption[];
}) {
  const [fuentes, setFuentes] = useState<FuenteBiometrica[]>([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [fuenteSeleccionadaId, setFuenteSeleccionadaId] = useState("");
  const [asociaciones, setAsociaciones] = useState<AsociacionBiometrica[]>([]);
  const [totalAsociaciones, setTotalAsociaciones] = useState(0);
  const [totalPaginasAsociaciones, setTotalPaginasAsociaciones] = useState(0);
  const [paginaAsociaciones, setPaginaAsociaciones] = useState(1);
  const [cargandoAsociaciones, setCargandoAsociaciones] = useState(false);
  const [errorAsociaciones, setErrorAsociaciones] = useState("");
  const [externalUserId, setExternalUserId] = useState("");
  const [usuariosBiometrico, setUsuariosBiometrico] = useState<UsuarioBiometrico[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [creandoAsociacion, setCreandoAsociacion] = useState(false);
  const [asociacionOcupadaId, setAsociacionOcupadaId] = useState<string | null>(null);
  const asociacionesPanelRef = useRef<HTMLElement | null>(null);

  const fuenteSeleccionada = useMemo(
    () => fuentes.find((fuente) => fuente.id === fuenteSeleccionadaId) ?? null,
    [fuentes, fuenteSeleccionadaId],
  );

  const cargarFuentes = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const resultado: FuenteBiometrica[] = await fetchAuth(BASE_URL);
      setFuentes(resultado);
      setFuenteSeleccionadaId((actual) =>
        resultado.some((fuente) => fuente.id === actual)
          ? actual
          : (resultado.find((fuente) => fuente.activa)?.id ?? resultado[0]?.id ?? ""),
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "No fue posible cargar las fuentes biométricas.",
      );
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarAsociaciones = useCallback(async () => {
    if (!fuenteSeleccionadaId) {
      setAsociaciones([]);
      setTotalAsociaciones(0);
      setTotalPaginasAsociaciones(0);
      return;
    }
    setCargandoAsociaciones(true);
    setErrorAsociaciones("");
    try {
      const query = new URLSearchParams({
        fuenteId: fuenteSeleccionadaId,
        page: String(paginaAsociaciones),
        limit: "100",
      });
      const resultado: PaginaAsociaciones = await fetchAuth(
        `/gestion-humana/biometrico/asociaciones?${query.toString()}`,
      );
      setAsociaciones(resultado.items);
      setTotalAsociaciones(resultado.total);
      setTotalPaginasAsociaciones(resultado.totalPages);
    } catch (err: unknown) {
      setErrorAsociaciones(
        err instanceof Error ? err.message : "No fue posible cargar las asociaciones.",
      );
    } finally {
      setCargandoAsociaciones(false);
    }
  }, [fuenteSeleccionadaId, paginaAsociaciones]);

  useEffect(() => {
    void cargarAsociaciones();
  }, [cargarAsociaciones]);

  useEffect(() => {
    void cargarFuentes();
  }, [cargarFuentes]);

  // Usuarios registrados en el biométrico (para elegir el ID sin tener que teclearlo).
  // Si no se pueden leer, el campo sigue funcionando como texto libre.
  useEffect(() => {
    if (!puedeAsociar || !fuenteSeleccionadaId) {
      setUsuariosBiometrico([]);
      return;
    }
    let activo = true;
    fetchAuth("/gestion-humana/biometrico/usuarios")
      .then((r: { items?: UsuarioBiometrico[] }) => {
        if (activo) setUsuariosBiometrico(Array.isArray(r?.items) ? r.items : []);
      })
      .catch(() => {
        if (activo) setUsuariosBiometrico([]);
      });
    return () => {
      activo = false;
    };
  }, [puedeAsociar, fuenteSeleccionadaId, asociaciones.length]);

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

  const crearAsociacion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const idLimpio = externalUserId.trim();
    if (!fuenteSeleccionadaId || !idLimpio || !empleadoId) return;

    setCreandoAsociacion(true);
    try {
      await fetchAuth("/gestion-humana/biometrico/asociaciones", {
        method: "POST",
        body: JSON.stringify({
          fuenteId: fuenteSeleccionadaId,
          externalUserId: idLimpio,
          empleadoId,
        }),
      });
      setExternalUserId("");
      setEmpleadoId("");
      setPaginaAsociaciones(1);
      toast.success("Usuario CrossChex asociado al colaborador.");
      if (paginaAsociaciones === 1) await cargarAsociaciones();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear la asociación.");
    } finally {
      setCreandoAsociacion(false);
    }
  };

  const cambiarEstadoAsociacion = async (asociacion: AsociacionBiometrica, activo: boolean) => {
    setAsociacionOcupadaId(asociacion.id);
    try {
      await fetchAuth(`/gestion-humana/biometrico/asociaciones/${asociacion.id}`, {
        method: "PATCH",
        body: JSON.stringify({ activo }),
      });
      setAsociaciones((actuales) =>
        actuales.map((item) => (item.id === asociacion.id ? { ...item, activo } : item)),
      );
      toast.success(`Asociación ${activo ? "activada" : "desactivada"}.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible actualizar la asociación.");
    } finally {
      setAsociacionOcupadaId(null);
    }
  };

  const administrarFuente = (fuenteId: string) => {
    setFuenteSeleccionadaId(fuenteId);
    setPaginaAsociaciones(1);
    requestAnimationFrame(() => {
      asociacionesPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
            depende de la configuración del servidor. Solo puede haber una fuente activa en toda la
            instalación, y no se puede crear ni activar otra mientras haya una sincronización en
            curso.
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
                <TableHead className={`${TH} text-right`}>Asociaciones</TableHead>
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
                  <TableCell className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      size="xs"
                      variant={fuenteSeleccionadaId === fuente.id ? "default" : "outline"}
                      className="h-7 text-[11px]"
                      aria-controls="biometrico-asociaciones"
                      aria-pressed={fuenteSeleccionadaId === fuente.id}
                      onClick={() => administrarFuente(fuente.id)}
                    >
                      Administrar
                    </Button>
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

        {fuenteSeleccionada && !cargando && (
          <section
            id="biometrico-asociaciones"
            ref={asociacionesPanelRef}
            className="scroll-mt-4 rounded-lg border border-slate-200 bg-white"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 p-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Asociaciones — {fuenteSeleccionada.nombre}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Vincula cada ID de usuario de CrossChex con su colaborador. La asociación no se
                  deduce automáticamente.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-2 text-xs"
                onClick={() => void cargarAsociaciones()}
                disabled={cargandoAsociaciones}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${cargandoAsociaciones ? "animate-spin" : ""}`}
                />
                Actualizar
              </Button>
            </header>

            <div className="space-y-4 p-4">
              {puedeAsociar && empleados.length > 0 && (
                <form
                  onSubmit={crearAsociacion}
                  className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end"
                >
                  <div className="space-y-1">
                    <Label
                      htmlFor="crosschex-user-id"
                      className="text-xs font-semibold text-slate-700"
                    >
                      ID de usuario CrossChex
                    </Label>
                    <Input
                      id="crosschex-user-id"
                      value={externalUserId}
                      maxLength={50}
                      onChange={(event) => setExternalUserId(event.target.value)}
                      placeholder="Ej. 14"
                      className="h-9 border-slate-300 text-xs"
                      list="crosschex-usuarios"
                      required
                    />
                    <datalist id="crosschex-usuarios">
                      {usuariosBiometrico
                        .filter((u) => !u.asociado)
                        .map((u) => (
                          <option key={u.userid} value={u.userid}>
                            {u.nombre ?? "Sin nombre"}
                            {u.codigo ? ` · ${u.codigo}` : ""}
                          </option>
                        ))}
                    </datalist>
                    <p className="text-[11px] text-slate-500">
                      {usuariosBiometrico.length > 0
                        ? "Elige un usuario del biométrico que aún no esté asociado, o escribe su ID."
                        : "Escribe el ID tal como aparece en CrossChex."}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">
                      Colaborador de la empresa activa
                    </Label>
                    <Select value={empleadoId} onValueChange={setEmpleadoId}>
                      <SelectTrigger className="h-9 border-slate-300 text-xs">
                        <SelectValue placeholder="Selecciona el colaborador" />
                      </SelectTrigger>
                      <SelectContent>
                        {empleados.map((empleado) => (
                          <SelectItem key={empleado.id} value={empleado.id}>
                            {empleado.nombres} {empleado.apellidos} · {empleado.documento}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="gap-2"
                    disabled={creandoAsociacion || !externalUserId.trim() || !empleadoId}
                  >
                    {creandoAsociacion ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Asociar
                  </Button>
                </form>
              )}

              {puedeAsociar && empleados.length === 0 && (
                <Alert className="border-amber-200 bg-amber-50 text-amber-950">
                  <AlertDescription className="text-xs">
                    No hay colaboradores disponibles en la empresa activa. Verifica el tenant y
                    registra los colaboradores en Gestión Humana antes de asociar IDs.
                  </AlertDescription>
                </Alert>
              )}

              {!puedeAsociar && (
                <p className="text-xs text-slate-500">
                  Tienes acceso de consulta. Para crear o modificar asociaciones solicita el permiso
                  biometrico.asociar.
                </p>
              )}

              {errorAsociaciones && (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                >
                  {errorAsociaciones}
                </div>
              )}

              {cargandoAsociaciones ? (
                <p role="status" className="flex items-center gap-2 py-6 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando asociaciones...
                </p>
              ) : errorAsociaciones ? (
                <p className="py-6 text-center text-xs text-red-700" role="alert">
                  No fue posible mostrar las asociaciones. Revisa el error anterior y pulsa
                  Actualizar para reintentar.
                </p>
              ) : asociaciones.length === 0 ? (
                <EmptyState
                  icon={Fingerprint}
                  title="Aún no hay asociaciones para esta fuente"
                  description="Confirma cada ID de CrossChex y vincúlalo con el colaborador correspondiente."
                  className="py-8"
                />
              ) : (
                <>
                  <Table>
                    <TableHeader className="bg-slate-100/80">
                      <TableRow className="hover:bg-slate-100/80">
                        <TableHead className={TH}>Usuario del biométrico</TableHead>
                        <TableHead className={TH}>Colaborador en RicoSoft</TableHead>
                        <TableHead className={TH}>Estado</TableHead>
                        {puedeAsociar && (
                          <TableHead className={`${TH} text-right`}>Activa</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {asociaciones.map((asociacion) => (
                        <TableRow
                          key={asociacion.id}
                          className={asociacion.activo ? "" : "opacity-70"}
                        >
                          <TableCell className="px-4 py-3 text-xs">
                            <span className="font-semibold text-slate-900">
                              {asociacion.usuarioBiometrico?.nombre ??
                                "Sin nombre en el biométrico"}
                            </span>
                            <span className="block text-[11px] text-slate-500">
                              ID {asociacion.externalUserId}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-xs text-slate-700">
                            {asociacion.empleado
                              ? `${asociacion.empleado.nombres} ${asociacion.empleado.apellidos} · ${asociacion.empleado.documento}`
                              : "Colaborador no disponible"}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge
                              variant="outline"
                              className={
                                asociacion.activo
                                  ? "border-blue-200 bg-blue-50 text-blue-800 font-bold"
                                  : "border-slate-300 bg-slate-100 text-slate-600 font-bold"
                              }
                            >
                              {asociacion.activo ? "Activa" : "Inactiva"}
                            </Badge>
                          </TableCell>
                          {puedeAsociar && (
                            <TableCell className="px-4 py-3 text-right">
                              <Switch
                                aria-label={`${asociacion.activo ? "Desactivar" : "Activar"} asociación ${asociacion.externalUserId}`}
                                checked={asociacion.activo}
                                disabled={asociacionOcupadaId === asociacion.id}
                                onCheckedChange={(activo) =>
                                  void cambiarEstadoAsociacion(asociacion, activo)
                                }
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{totalAsociaciones} asociaciones</span>
                    {totalPaginasAsociaciones > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={paginaAsociaciones <= 1 || cargandoAsociaciones}
                          onClick={() => setPaginaAsociaciones((pagina) => Math.max(1, pagina - 1))}
                        >
                          <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                        </Button>
                        <span>
                          Página {paginaAsociaciones} de {totalPaginasAsociaciones}
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={
                            paginaAsociaciones >= totalPaginasAsociaciones || cargandoAsociaciones
                          }
                          onClick={() => setPaginaAsociaciones((pagina) => pagina + 1)}
                        >
                          Siguiente <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
