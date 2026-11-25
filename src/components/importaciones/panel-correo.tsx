import { useEffect, useState, type FormEvent } from "react";
import { fetchAuth } from "@/lib/session";
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
  estado: "REGISTRADO" | "APROBADO" | "ACTIVO" | "PAUSADO";
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
interface Etiqueta { id: string; nombre: string }
export interface ResponsableCorreo { id: string; nombre: string }
export const rutaOperacionCorreo = "/importaciones/bandeja/operacion";
const fecha = (valor: string | null) =>
  valor ? new Date(valor).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "Sin registrar";

export function SelectorResponsable({ usuarios, valor, onChange }: {
  usuarios: ResponsableCorreo[];
  valor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      Responsable
      <select className="rounded border p-1" value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin asignar</option>
        {valor && !usuarios.some((u) => u.id === valor) && <option value={valor}>Responsable anterior</option>}
        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
      </select>
    </label>
  );
}

function FilaBuzon({ buzon, usuarios, onBuzon }: {
  buzon: Buzon;
  usuarios: ResponsableCorreo[];
  onBuzon: (buzon: Buzon) => void;
}) {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([]);
  const [etiqueta, setEtiqueta] = useState(buzon.etiquetaId ?? "");
  const [responsable, setResponsable] = useState(buzon.responsableUsuarioId ?? "");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function ejecutar(accion: string, cuerpo?: object) {
    setOcupado(true);
    setMensaje("");
    try {
      const data = await fetchAuth(rutaOperacionCorreo + "/buzones/" + buzon.id + "/" + accion, {
        method: cuerpo ? "PUT" : "POST",
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      });
      if (data.buzon) onBuzon(data.buzon);
      if (data.etiquetas) {
        setEtiquetas(data.etiquetas);
        setMensaje("Conexión verificada con Gmail.");
      }
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo actualizar el buzón.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <fieldset disabled={ocupado} className="space-y-3 rounded border p-3">
      <div>
        <p className="font-semibold">{buzon.direccion} · {buzon.estado}</p>
        <p className="text-sm">Etiqueta · {buzon.etiquetaNombre ?? "Sin seleccionar"}</p>
        <p className="text-sm">Última ejecución · {fecha(buzon.ultimaEjecucion)}</p>
        {buzon.ultimoError && <p className="text-sm text-red-700">{buzon.ultimoError}</p>}
        <p className="text-sm text-slate-600">{buzon.correosPorCiclo} correos · {buzon.adjuntosPorCiclo} adjuntos · {buzon.timeoutSegundos} s por ciclo</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {buzon.estado === "REGISTRADO"
          ? <Button variant="outline" onClick={() => ejecutar("aprobar")}>Aprobar buzón</Button>
          : <Button variant="outline" onClick={() => ejecutar("conexion")}>Probar conexión</Button>}
        {buzon.estado === "ACTIVO"
          ? <Button variant="outline" onClick={() => ejecutar("pausar")}>Pausar</Button>
          : buzon.estado !== "REGISTRADO" && (
            <Button disabled={!buzon.etiquetaId} onClick={() => ejecutar("activar")}>Activar</Button>
          )}
      </div>
      {buzon.estado !== "ACTIVO" && etiquetas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Etiqueta de Gmail{" "}
            <select className="rounded border p-1" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
              <option value="">Selecciona una etiqueta</option>
              {etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>
          <Button variant="outline" disabled={!etiqueta || etiqueta === buzon.etiquetaId}
            onClick={() => ejecutar("etiqueta", { etiquetaId: etiqueta })}>Guardar etiqueta</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SelectorResponsable usuarios={usuarios} valor={responsable} onChange={setResponsable} />
        <Button variant="outline" disabled={responsable === (buzon.responsableUsuarioId ?? "")}
          onClick={() => ejecutar("responsable", { responsableUsuarioId: responsable || null })}>
          Guardar responsable
        </Button>
      </div>
      {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
    </fieldset>
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
    ]).then(([estado, lista, responsables]) => {
      if (!vigente) return;
      setAjustes(estado.ajustes);
      setProcesos(estado.procesos);
      setBuzones(lista.buzones);
      setUsuarios(responsables.usuarios);
    }).catch((error) => {
      if (vigente && !(error instanceof ApiError && error.status === 403)) {
        setMensaje("No se pudo cargar la configuración de correo.");
      }
    });
    return () => { vigente = false; };
  }, []);

  async function registrar(event: FormEvent) {
    event.preventDefault();
    setOcupado(true);
    setMensaje("");
    try {
      const data = await fetchAuth(rutaOperacionCorreo + "/buzones", {
        method: "POST", body: JSON.stringify({ direccion }),
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
        fetchAuth(rutaOperacionCorreo), fetchAuth(rutaOperacionCorreo + "/buzones"),
      ]);
      setProcesos(estado.procesos);
      setBuzones(lista.buzones);
    } catch {
      setMensaje("No se pudo actualizar el estado de los buzones.");
    } finally {
      setOcupado(false);
    }
  }

  if (!ajustes && !mensaje) return null;
  return (
    <section className="space-y-4 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Correo de Importaciones</h2>
      {ajustes && (
        <>
          <fieldset disabled={ocupado} className="flex flex-wrap items-center gap-4">
            <label>Frecuencia{" "}
              <select value={ajustes.minutos}
                onChange={(e) => setAjustes({ ...ajustes, minutos: Number(e.target.value) })}>
                {[1, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} min</option>)}
              </select>
            </label>
            {(["lectura", "procesamiento"] as const).map((k) => (
              <label key={k}>
                <input type="checkbox" checked={ajustes[k]}
                  onChange={(e) => setAjustes({ ...ajustes, [k]: e.target.checked })} /> Activar {k}
              </label>
            ))}
            <Button onClick={guardarProgramacion}>Guardar programación</Button>
          </fieldset>
          <form onSubmit={registrar} className="flex flex-wrap items-center gap-2">
            <label className="text-sm">Dirección del buzón{" "}
              <input className="rounded border p-1" type="email" required value={direccion}
                onChange={(e) => setDireccion(e.target.value)} />
            </label>
            <Button type="submit" disabled={ocupado}>Registrar buzón</Button>
            <Button type="button" variant="outline" disabled={ocupado} onClick={actualizarEstado}>Actualizar estado</Button>
          </form>
          {!buzones.length && <p className="text-sm">Aún no hay buzones registrados.</p>}
          {buzones.map((buzon) => <FilaBuzon key={buzon.id} buzon={buzon} usuarios={usuarios}
            onBuzon={(actualizado) => setBuzones((anteriores) => anteriores.map((b) => b.id === actualizado.id ? actualizado : b))} />)}
        </>
      )}
      {procesos.map((p) => <p className="text-sm" key={p.nombre}>
        {p.nombre} · {p.estado} · Última ejecución {fecha(p.ultima)} · Próxima {fecha(p.proxima)}
        {p.error && " · " + p.error}
      </p>)}
      {mensaje && <p role="status">{mensaje}</p>}
    </section>
  );
}
