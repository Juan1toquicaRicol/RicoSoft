import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/config/api";

interface Ajustes {
  lectura: boolean;
  procesamiento: boolean;
  etiqueta: string;
  minutos: number;
  correos: number;
  adjuntos: number;
}
const ruta = "/importaciones/bandeja/operacion";
export function PanelCorreo() {
  const [ajustes, set] = useState<Ajustes | null>(null);
  const [procesos, setProcesos] = useState<
    {
      nombre: string;
      estado: string;
      ultima: string | null;
      proxima: string | null;
      error: string | null;
    }[]
  >([]);
  const [buzon, setBuzon] = useState("");
  const [etiquetas, lista] = useState<{ id: string; nombre: string }[]>([]);
  const [mensaje, avisar] = useState("");
  const [ocupado, busy] = useState(false);
  useEffect(() => {
    let vigente = true;
    fetchAuth(ruta)
      .then((data) => {
        if (vigente) {
          set(data.ajustes);
          setProcesos(data.procesos);
          setBuzon(data.buzon);
        }
      })
      .catch((e) => {
        if (vigente && !(e instanceof ApiError && e.status === 403))
          avisar("No se pudo cargar la configuración del correo.");
      });
    return () => {
      vigente = false;
    };
  }, []);
  async function ejecutar(prueba: boolean) {
    busy(true);
    avisar("");
    try {
      if (prueba) {
        const data = await fetchAuth(ruta + "/conexion", { method: "POST" });
        lista(data.etiquetas);
        avisar("Conexión verificada con Gmail.");
      } else {
        await fetchAuth(ruta, { method: "PUT", body: JSON.stringify(ajustes) });
        avisar("Configuración guardada.");
        const estado = await fetchAuth(ruta);
        setProcesos(estado.procesos);
      }
    } catch (e) {
      avisar(e instanceof Error ? e.message : "Error al conectar con el servidor.");
    } finally {
      busy(false);
    }
  }
  if (!ajustes && !mensaje) return null;
  return (
    <section className="space-y-4 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Correo de Importaciones</h2>
      {ajustes && (
        <fieldset disabled={ocupado} className="space-y-4">
          <p>Buzón autorizado · {buzon || "Pendiente de configurar"}</p>
          <Button variant="outline" onClick={() => ejecutar(true)}>
            Probar conexión
          </Button>
          <label className="block">
            Etiqueta del piloto{" "}
            <select
              className="border rounded p-1"
              value={ajustes.etiqueta}
              onChange={(e) => set({ ...ajustes, etiqueta: e.target.value })}
            >
              <option value="">Selecciona una etiqueta después de probar la conexión</option>
              {ajustes.etiqueta && !etiquetas.some((x) => x.id === ajustes.etiqueta) && (
                <option value={ajustes.etiqueta}>{ajustes.etiqueta}</option>
              )}
              {etiquetas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-4">
            <label>
              Frecuencia{" "}
              <select
                value={ajustes.minutos}
                onChange={(e) => set({ ...ajustes, minutos: Number(e.target.value) })}
              >
                {[1, 5, 10, 15, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
            </label>
            {(["correos", "adjuntos"] as const).map((k) => (
              <label key={k}>
                Máximo de {k} por ciclo{" "}
                <input
                  className="w-16 border rounded px-1"
                  type="number"
                  min={1}
                  max={k === "correos" ? 100 : 200}
                  value={ajustes[k]}
                  onChange={(e) => set({ ...ajustes, [k]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-4">
            {(["lectura", "procesamiento"] as const).map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={ajustes[k]}
                  onChange={(e) => set({ ...ajustes, [k]: e.target.checked })}
                />{" "}
                Activar {k}
              </label>
            ))}
          </div>
          <Button onClick={() => ejecutar(false)}>Guardar parámetros</Button>
        </fieldset>
      )}
      {procesos.map((p) => (
        <p className="text-sm" key={p.nombre}>
          {p.nombre} · {p.estado} · Última ejecución{" "}
          {p.ultima ? new Date(p.ultima).toLocaleString("es-CO") : "sin registrar"} · Próxima{" "}
          {p.proxima ? new Date(p.proxima).toLocaleString("es-CO") : "sin programar"}{" "}
          {p.error && " · " + p.error}
        </p>
      ))}
      {mensaje && <p role="status">{mensaje}</p>}
    </section>
  );
}
