import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
}

function Auditoria() {
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Usuario</th>
                <th className="px-5 py-3 font-medium">Acción</th>
                <th className="px-5 py-3 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                    Cargando...
                  </td>
                </tr>
              )}
              {!loading && eventos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                    {error || "No hay eventos registrados todavía."}
                  </td>
                </tr>
              )}
              {eventos.map((e) => (
                <tr key={e.id} className="border-t border-border transition-colors hover:bg-muted/40">
                  <td className="num px-5 py-3 text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString("es-CO")}
                  </td>
                  <td className="px-5 py-3 font-medium">{e.usuario?.nombre ?? e.usuarioAfectado ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {e.accion}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{e.detalle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
