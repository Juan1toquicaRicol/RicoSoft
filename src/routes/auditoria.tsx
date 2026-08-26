import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FilaGrupo, OPCION_SIN_AGRUPAR, SelectorAgrupacion } from "@/components/ui/selector-agrupacion";
import { agruparFilas } from "@/lib/agrupar";
import { fetchAuth } from "@/lib/session";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría | RicoSoft" },
      { name: "description", content: "Traza completa de accesos, cambios, aprobaciones y descargas del sistema." },
      { property: "og:title", content: "Auditoría | RicoSoft" },
      { property: "og:description", content: "Registro de todas las acciones realizadas en la plataforma." },
    ],
  }),
  component: Auditoria,
});

interface EventoAuditoria {
  id: string;
  accion: string;
  detalle: string;
  usuarioAfectado: string | null;
  createdAt: string;
  usuario: { nombre: string; email: string } | null;
  entidadTipo: string | null;
  entidadId: string | null;
  datosAnteriores: string | null;
  datosNuevos: string | null;
}

/** Compara los campos presentes en `nuevos` contra `anteriores` y devuelve
 * solo los que cambiaron, para no repetir en el diff los campos que no se
 * tocaron en esa edición. */
function calcularCambios(
  anteriores: Record<string, unknown> | null,
  nuevos: Record<string, unknown> | null,
): { campo: string; antes: unknown; despues: unknown }[] {
  if (!nuevos) return [];
  return Object.keys(nuevos)
    .filter((campo) => JSON.stringify(anteriores?.[campo]) !== JSON.stringify(nuevos[campo]))
    .map((campo) => ({ campo, antes: anteriores?.[campo], despues: nuevos[campo] }));
}

function formatearValor(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (Array.isArray(valor)) return valor.length ? valor.join(", ") : "(ninguno)";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  return String(valor);
}

function Auditoria() {
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [agrupacion, setAgrupacion] = useState(OPCION_SIN_AGRUPAR.value);

  const claveDeAgrupacion = useMemo(() => {
    switch (agrupacion) {
      case "accion":
        return (e: EventoAuditoria) => e.accion;
      case "usuario":
        return (e: EventoAuditoria) => e.usuario?.nombre ?? e.usuarioAfectado ?? "Sistema";
      default:
        return null;
    }
  }, [agrupacion]);

  const gruposEventos = useMemo(() => agruparFilas(eventos, claveDeAgrupacion), [eventos, claveDeAgrupacion]);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchAuth("/auditoria?pageSize=50");
        setEventos(data.data ?? []);
      } catch (err: any) {
        setError(err.message || "Error cargando el registro de auditoría.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppShell
      title="Auditoría"
      description="Registro de eventos de seguridad y administración"
      actions={
        <Button variant="outline" size="sm" className="gap-2" disabled>
          <Download className="h-4 w-4" /> Exportar log
        </Button>
      }
    >
      <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="flex justify-end border-b border-slate-200 bg-slate-50/80 p-3">
          <SelectorAgrupacion
            value={agrupacion}
            onChange={setAgrupacion}
            opciones={[OPCION_SIN_AGRUPAR, { value: "accion", label: "Acción" }, { value: "usuario", label: "Usuario" }]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 uppercase tracking-wider text-slate-600 font-bold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="px-4 py-3.5 w-8" />
                <th className="px-4 py-3.5">Fecha</th>
                <th className="px-4 py-3.5">Usuario</th>
                <th className="px-4 py-3.5">Acción</th>
                <th className="px-4 py-3.5">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-500">
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && eventos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-slate-500">
                    {error || "No hay eventos registrados todavía."}
                  </td>
                </tr>
              )}
              {gruposEventos.map((grupo) => (
                <Fragment key={grupo.clave || "sin-grupo"}>
                  {grupo.clave && (
                    <FilaGrupo clave={grupo.clave} cantidad={grupo.filas.length} colSpan={5} />
                  )}
                  {grupo.filas.map((e) => {
                let anteriores: Record<string, unknown> | null = null;
                let nuevos: Record<string, unknown> | null = null;
                try {
                  anteriores = e.datosAnteriores ? JSON.parse(e.datosAnteriores) : null;
                } catch {
                  anteriores = null;
                }
                try {
                  nuevos = e.datosNuevos ? JSON.parse(e.datosNuevos) : null;
                } catch {
                  nuevos = null;
                }
                const cambios = calcularCambios(anteriores, nuevos);
                const tieneDetalleTecnico = cambios.length > 0 || (anteriores && !nuevos);
                const abierta = expandido === e.id;

                return (
                  <Fragment key={e.id}>
                    <tr
                      className={`transition-colors hover:bg-slate-50 ${tieneDetalleTecnico ? "cursor-pointer" : ""}`}
                      onClick={() => tieneDetalleTecnico && setExpandido(abierta ? null : e.id)}
                    >
                      <td className="px-4 py-3 text-slate-400">
                        {tieneDetalleTecnico &&
                          (abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
                      </td>
                      <td className="num px-4 py-3 text-xs text-slate-500">
                        {new Date(e.createdAt).toLocaleString("es-CO")}
                      </td>
                      <td className="px-4 py-3 font-bold text-xs text-slate-900">{e.usuario?.nombre ?? e.usuarioAfectado ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          {e.accion}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{e.detalle}</td>
                    </tr>
                    {abierta && tieneDetalleTecnico && (
                      <tr className="bg-slate-50/60">
                        <td />
                        <td colSpan={4} className="px-4 py-3">
                          {cambios.length > 0 ? (
                            <table className="text-xs">
                              <thead>
                                <tr className="text-left text-slate-500">
                                  <th className="pr-6 py-1 font-bold">Campo</th>
                                  <th className="pr-6 py-1 font-bold">Antes</th>
                                  <th className="pr-6 py-1 font-bold">Después</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cambios.map((c) => (
                                  <tr key={c.campo}>
                                    <td className="pr-6 py-1 font-mono text-slate-500">{c.campo}</td>
                                    <td className="pr-6 py-1 text-slate-600">{formatearValor(c.antes)}</td>
                                    <td className="pr-6 py-1 font-semibold text-slate-900">{formatearValor(c.despues)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-slate-500">Registro eliminado (no queda estado nuevo).</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
