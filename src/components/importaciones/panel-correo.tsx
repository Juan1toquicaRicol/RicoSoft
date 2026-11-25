import { useEffect, useState, type FormEvent } from "react";
import { fetchAuth } from "@/lib/session";
import { Archive, ChevronDown, Mail, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/config/api";

interface Ajustes {
  lectura: boolean;
  procesamiento: boolean;
  minutos: number;
}
interface Buzon {
  id: string;
  direccion: string;
  estado: "REGISTRADO" | "APROBADO" | "ACTIVO" | "PAUSADO" | "RETIRADO";
  etiquetaId: string | null;
  etiquetaNombre: string | null;
  responsableUsuarioId: string | null;
  correosPorCiclo: number;
  adjuntosPorCiclo: number;
  timeoutSegundos: number;
  ultimaEjecucion: string | null;
  ultimoError: string | null;
}
interface Proceso {
  nombre: string;
  estado: string;
  ultima: string | null;
  proxima: string | null;
  error: string | null;
}
interface Etiqueta {
  id: string;
  nombre: string;
}
export interface ResponsableCorreo {
  id: string;
  nombre: string;
}
export const rutaOperacionCorreo = "/importaciones/bandeja/operacion";
const fecha = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "Sin registrar";

const estados: Record<Buzon["estado"], { texto: string; clase: string }> = {
  REGISTRADO: { texto: "Por aprobar", clase: "border-amber-200 bg-amber-50 text-amber-900" },
  APROBADO: { texto: "Aprobado", clase: "border-blue-200 bg-blue-50 text-blue-900" },
  ACTIVO: { texto: "Activo", clase: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  PAUSADO: { texto: "Pausado", clase: "border-slate-200 bg-slate-100 text-slate-700" },
  RETIRADO: { texto: "Retirado", clase: "border-slate-200 bg-slate-100 text-slate-700" },
};
const estiloSelector = "h-9 max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

export function SelectorResponsable({
  usuarios,
  valor,
  onChange,
}: {
  usuarios: ResponsableCorreo[];
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      Responsable
      <select className={estiloSelector} value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin asignar</option>
        {valor && !usuarios.some((u) => u.id === valor) && (
          <option value={valor}>Responsable anterior</option>
        )}
        {usuarios.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilaBuzon({
  buzon,
  usuarios,
  onBuzon,
}: {
  buzon: Buzon;
  usuarios: ResponsableCorreo[];
  onBuzon: (buzon: Buzon) => void;
}) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[] | null>(null);
  const [etiqueta, setEtiqueta] = useState(buzon.etiquetaId ?? "");
  const [responsable, setResponsable] = useState(buzon.responsableUsuarioId ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function ejecutar(accion: string, cuerpo?: object) {
    setOcupado(true);
    setMensaje("");
    if (accion === "conexion") setEtiquetas(null);
    try {
      const data = await fetchAuth(rutaOperacionCorreo + "/buzones/" + buzon.id + "/" + accion, {
        method: cuerpo ? "PUT" : "POST",
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      });
      if (data.buzon) onBuzon(data.buzon);
      if (accion === "etiqueta") setMensaje("Etiqueta guardada.");
      if (data.etiquetas) {
        const opciones: Etiqueta[] = data.etiquetas;
        setEtiquetas(opciones);
        setEtiqueta((actual) =>
          opciones.some((opcion) => opcion.id === actual) ? actual : (buzon.etiquetaId ?? ""),
        );
        if (data.etiquetas.length > 0) setMensaje("Etiquetas de Gmail cargadas.");
      }
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo actualizar el buzón.");
    } finally {
      setOcupado(false);
    }
  }

  const estado = estados[buzon.estado];
  const editable = buzon.estado === "APROBADO" || buzon.estado === "PAUSADO";
  const etiquetaSeleccionada = etiquetas?.some((opcion) => opcion.id === etiqueta);
  const etiquetaGuardadaEnLista = etiquetas?.some((opcion) => opcion.id === buzon.etiquetaId);
  const nombreResponsable = buzon.responsableUsuarioId
    ? (usuarios.find((u) => u.id === buzon.responsableUsuarioId)?.nombre ?? "Responsable anterior")
    : "Sin asignar";

  return (
    <details className="group min-w-0 rounded-lg border border-slate-200 bg-white open:border-slate-300">
      <summary
        className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-lg p-4
        hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-all text-sm font-semibold text-slate-900">
              {buzon.direccion}
            </span>
            <Badge variant="outline" className={estado.clase}>
              {estado.texto}
            </Badge>
          </div>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
            <div>
              <dt className="inline">Etiqueta · </dt>
              <dd className="inline">{buzon.etiquetaNombre ?? "Sin seleccionar"}</dd>
            </div>
            <div>
              <dt className="inline">Responsable · </dt>
              <dd className="inline">{nombreResponsable}</dd>
            </div>
            <div>
              <dt className="inline">Última lectura · </dt>
              <dd className="inline">{fecha(buzon.ultimaEjecucion)}</dd>
            </div>
          </dl>
          {buzon.ultimoError && (
            <p className="text-xs font-medium text-red-700">{buzon.ultimoError}</p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-slate-600">
          <span>Gestionar</span>
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <fieldset disabled={ocupado} className="space-y-4 border-t border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {buzon.estado === "REGISTRADO" && (
            <Button size="sm" onClick={() => ejecutar("aprobar")}>
              Aprobar buzón
            </Button>
          )}
          {buzon.estado === "ACTIVO" ? (
            <Button size="sm" variant="outline" onClick={() => ejecutar("pausar")}>
              Pausar
            </Button>
          ) : (
            buzon.estado !== "REGISTRADO" && (
              <Button size="sm" disabled={!buzon.etiquetaId} onClick={() => ejecutar("activar")}>
                Activar
              </Button>
            )
          )}
        </div>
        <section aria-label="Etiqueta de Gmail" className="space-y-2 rounded-md bg-slate-50 p-3">
          {buzon.estado === "REGISTRADO" ? (
            <p className="text-sm text-slate-600">
              Aprueba el buzón para consultar sus etiquetas de Gmail.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-slate-700">
                Etiqueta de Gmail
                <select
                  className={estiloSelector}
                  value={editable ? etiqueta : (buzon.etiquetaId ?? "")}
                  disabled={!editable || !etiquetas?.length}
                  onChange={(e) => setEtiqueta(e.target.value)}
                >
                  <option value="">Selecciona una etiqueta</option>
                  {buzon.etiquetaId && !etiquetaGuardadaEnLista && (
                    <option value={buzon.etiquetaId}>
                      {buzon.etiquetaNombre ?? buzon.etiquetaId}
                    </option>
                  )}
                  {etiquetas?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="outline" onClick={() => ejecutar("conexion")}>
                {etiquetas ? "Actualizar etiquetas" : "Cargar etiquetas"}
              </Button>
              {editable && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!etiquetaSeleccionada || etiqueta === buzon.etiquetaId}
                  onClick={() => ejecutar("etiqueta", { etiquetaId: etiqueta })}
                >
                  Guardar etiqueta
                </Button>
              )}
            </div>
          )}
          {buzon.estado === "ACTIVO" && (
            <p className="text-xs text-slate-600">
              Pausa el buzón para cambiar la etiqueta de lectura.
            </p>
          )}
          {etiquetas?.length === 0 && (
            <p role="status" className="text-sm text-slate-700">
              Gmail respondió y este buzón no tiene etiquetas personalizadas. Crea una etiqueta en
              Gmail y actualiza la lista aquí.
            </p>
          )}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <SelectorResponsable usuarios={usuarios} valor={responsable} onChange={setResponsable} />
          <Button
            size="sm"
            variant="outline"
            disabled={responsable === (buzon.responsableUsuarioId ?? "")}
            onClick={() => ejecutar("responsable", { responsableUsuarioId: responsable || null })}
          >
            Guardar responsable
          </Button>
        </div>
        {mensaje && (
          <p role="status" className="text-sm">
            {mensaje}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500">
            {buzon.correosPorCiclo} correos · {buzon.adjuntosPorCiclo} adjuntos ·{" "}
            {buzon.timeoutSegundos} s por ciclo
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" disabled={ocupado} className="text-slate-700">
                <Archive aria-hidden /> Retirar buzón
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Retirar buzón</AlertDialogTitle>
                <AlertDialogDescription>
                  {buzon.direccion} dejará de consultarse en los próximos ciclos. Los correos ya
                  ingresados y su historial se conservan. Podrás restaurar la cuenta desde Buzones
                  retirados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => ejecutar("retirar")}>
                  Retirar buzón
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </fieldset>
    </details>
  );
}

export function PanelCorreo() {
  const [ajustes, setAjustes] = useState<Ajustes | null>(null);
  const [procesos, setProcesos] = useState<Proceso[]>([]);
  const [buzones, setBuzones] = useState<Buzon[]>([]);
  const [usuarios, setUsuarios] = useState<ResponsableCorreo[]>([]);
  const [direccion, setDireccion] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vigente = true;
    Promise.all([
      fetchAuth(rutaOperacionCorreo),
      fetchAuth(rutaOperacionCorreo + "/buzones"),
      fetchAuth(rutaOperacionCorreo + "/responsables"),
    ])
      .then(([estado, lista, responsables]) => {
        if (!vigente) return;
        setAjustes(estado.ajustes);
        setProcesos(estado.procesos);
        setBuzones(lista.buzones);
        setUsuarios(responsables.usuarios);
      })
      .catch((error) => {
        if (vigente && !(error instanceof ApiError && error.status === 403)) {
          setMensaje("No se pudo cargar la configuración de correo.");
        }
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function registrar(event: FormEvent) {
    event.preventDefault();
    setOcupado(true);
    setMensaje("");
    try {
      const data = await fetchAuth(rutaOperacionCorreo + "/buzones", {
        method: "POST",
        body: JSON.stringify({ direccion }),
      });
      setBuzones((anteriores) => [...anteriores, data.buzon]);
      setDireccion("");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo registrar el buzón.");
    } finally {
      setOcupado(false);
    }
  }

  async function guardarProgramacion() {
    setOcupado(true);
    setMensaje("");
    try {
      await fetchAuth(rutaOperacionCorreo, { method: "PUT", body: JSON.stringify(ajustes) });
      const estado = await fetchAuth(rutaOperacionCorreo);
      setProcesos(estado.procesos);
      setMensaje("Programación guardada.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo guardar la programación.");
    } finally {
      setOcupado(false);
    }
  }

  async function actualizarEstado() {
    setOcupado(true);
    setMensaje("");
    try {
      const [estado, lista] = await Promise.all([
        fetchAuth(rutaOperacionCorreo),
        fetchAuth(rutaOperacionCorreo + "/buzones"),
      ]);
      setProcesos(estado.procesos);
      setBuzones(lista.buzones);
    } catch {
      setMensaje("No se pudo actualizar el estado de los buzones.");
    } finally {
      setOcupado(false);
    }
  }

  function actualizarBuzon(actualizado: Buzon) {
    setBuzones((anteriores) => anteriores.map((b) => (b.id === actualizado.id ? actualizado : b)));
    if (actualizado.estado === "RETIRADO")
      setMensaje("Buzón retirado. Su historial sigue disponible.");
  }

  async function restaurar(buzon: Buzon) {
    setOcupado(true);
    setMensaje("");
    try {
      const data = await fetchAuth(rutaOperacionCorreo + "/buzones/" + buzon.id + "/restaurar", {
        method: "POST",
      });
      actualizarBuzon(data.buzon);
      setMensaje("Buzón restaurado. Apruébalo para volver a configurarlo.");
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo restaurar el buzón.");
    } finally {
      setOcupado(false);
    }
  }

  if (!ajustes && !mensaje) return null;
  const operativos = buzones.filter((b) => b.estado !== "RETIRADO");
  const retirados = buzones.filter((b) => b.estado === "RETIRADO");
  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-label="Correo de Importaciones"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
        <h2 className="flex items-center gap-3 text-base font-semibold text-slate-900">
          <Mail aria-hidden className="size-5 text-slate-600" /> Correo de Importaciones
        </h2>
        {ajustes && (
          <Button size="sm" variant="outline" disabled={ocupado} onClick={actualizarEstado}>
            <RefreshCw aria-hidden /> Actualizar estado
          </Button>
        )}
      </header>
      <div className="space-y-6 p-4 sm:p-6">
        {ajustes && (
          <>
            <fieldset
              disabled={ocupado}
              className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <legend className="sr-only">Programación general</legend>
              <h3 className="text-sm font-semibold text-slate-900">Programación general</h3>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <label className="flex items-center gap-2 text-sm">
                  Frecuencia
                  <select
                    className={estiloSelector}
                    value={ajustes.minutos}
                    onChange={(e) => setAjustes({ ...ajustes, minutos: Number(e.target.value) })}
                  >
                    {[1, 5, 10, 15, 30].map((n) => (
                      <option key={n} value={n}>
                        {n} min
                      </option>
                    ))}
                  </select>
                </label>
                {(["lectura", "procesamiento"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input
                      className="size-4 accent-blue-700"
                      type="checkbox"
                      checked={ajustes[k]}
                      onChange={(e) => setAjustes({ ...ajustes, [k]: e.target.checked })}
                    />
                    Activar {k}
                  </label>
                ))}
                <Button size="sm" onClick={guardarProgramacion}>
                  Guardar programación
                </Button>
              </div>
            </fieldset>
            <section className="space-y-3" aria-label="Buzones">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Buzones{" "}
                  {operativos.length > 0 && (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      {operativos.length}
                    </span>
                  )}
                </h3>
                <form onSubmit={registrar} className="flex flex-wrap items-end gap-2">
                  <label className="space-y-1 text-xs font-medium text-slate-600">
                    Dirección del buzón
                    <Input
                      className="h-9 w-full sm:w-56"
                      type="email"
                      required
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                    />
                  </label>
                  <Button size="sm" type="submit" disabled={ocupado}>
                    <Plus aria-hidden /> Registrar buzón
                  </Button>
                </form>
              </div>
              {!operativos.length && (
                <p className="rounded-md border border-dashed p-4 text-sm text-slate-600">
                  No hay buzones en la lista operativa.
                </p>
              )}
              {operativos.map((buzon) => (
                <FilaBuzon
                  key={buzon.id}
                  buzon={buzon}
                  usuarios={usuarios}
                  onBuzon={actualizarBuzon}
                />
              ))}
              {retirados.length > 0 && (
                <details className="rounded-md border border-slate-200 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Buzones retirados ({retirados.length})
                  </summary>
                  <ul className="mt-2 divide-y divide-slate-100">
                    {retirados.map((b) => (
                      <li
                        key={b.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <span className="break-all">{b.direccion}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado}
                          onClick={() => restaurar(b)}
                        >
                          Restaurar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          </>
        )}
        {procesos.length > 0 && (
          <section
            className="space-y-3 border-t border-slate-200 pt-4"
            aria-label="Estado de los procesos"
          >
            <h3 className="text-sm font-semibold text-slate-900">Estado de los procesos</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {procesos.map((p) => (
                <div key={p.nombre} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{p.nombre}</p>
                    <Badge variant="outline">{p.estado.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Última ejecución · {fecha(p.ultima)}
                  </p>
                  <p className="text-xs text-slate-600">
                    Próxima · {p.proxima ? fecha(p.proxima) : "Sin programar"}
                  </p>
                  {p.error && <p className="mt-1 text-xs text-red-700">{p.error}</p>}
                </div>
              ))}
            </div>
          </section>
        )}
        {mensaje && (
          <p role="status" className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            {mensaje}
          </p>
        )}
      </div>
    </section>
  );
}
