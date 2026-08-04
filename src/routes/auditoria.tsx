import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoría | Facturaflow" },
      { name: "description", content: "Traza completa de accesos, cambios, aprobaciones y descargas del sistema." },
      { property: "og:title", content: "Auditoría | Facturaflow" },
      { property: "og:description", content: "Registro inmutable de todas las acciones realizadas en la plataforma." },
    ],
  }),
  component: Auditoria,
});

const eventos = [
  { fecha: "02 ago, 07:12", usuario: "Laura Restrepo", rol: "Director Financiero", accion: "Aprobó factura FV-88190", ip: "190.85.12.4", tipo: "Aprobación" },
  { fecha: "02 ago, 06:50", usuario: "Sistema", rol: "Automatización", accion: "Recepción de FV-88322 vía correo", ip: "-", tipo: "Recepción" },
  { fecha: "01 ago, 18:31", usuario: "Mauricio Peña", rol: "Supervisor", accion: "Descargó documento FV-88301.pdf", ip: "201.232.9.77", tipo: "Descarga" },
  { fecha: "01 ago, 09:04", usuario: "admin@empresa.com", rol: "Administrador", accion: "Modificó la regla R-03", ip: "190.85.12.9", tipo: "Configuración" },
  { fecha: "31 jul, 22:47", usuario: "desconocido", rol: "-", accion: "Intento de inicio de sesión fallido", ip: "45.12.90.203", tipo: "Seguridad" },
  { fecha: "31 jul, 15:00", usuario: "Tesorería", rol: "Tesorería", accion: "Registró pago de FV-88044", ip: "190.85.12.18", tipo: "Pago" },
];

function Auditoria() {
  return (
    <AppShell
      title="Auditoría"
      description="Registro inmutable de eventos · retención 7 años"
      actions={
        <Button variant="outline" size="sm" className="gap-2">
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
                <th className="px-5 py-3 font-medium">Rol</th>
                <th className="px-5 py-3 font-medium">Acción</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e, i) => (
                <tr key={i} className="border-t border-border transition-colors hover:bg-muted/40">
                  <td className="num px-5 py-3 text-muted-foreground">{e.fecha}</td>
                  <td className="px-5 py-3 font-medium">{e.usuario}</td>
                  <td className="px-5 py-3 text-muted-foreground">{e.rol}</td>
                  <td className="px-5 py-3">{e.accion}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{e.tipo}</span>
                  </td>
                  <td className="num px-5 py-3 text-muted-foreground">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
