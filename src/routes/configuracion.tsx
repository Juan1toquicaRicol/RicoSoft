import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración | Facturaflow" },
      { name: "description", content: "Perfil, seguridad, roles y permisos granulares de la plataforma de facturas." },
      { property: "og:title", content: "Configuración | Facturaflow" },
      { property: "og:description", content: "Administra tu perfil, sesión, 2FA y control de acceso por rol." },
    ],
  }),
  component: Configuracion,
});

const roles = [
  "Administrador",
  "Gerencia",
  "Director Financiero",
  "Contabilidad",
  "Tesorería",
  "Compras",
  "Recursos Humanos",
  "Jurídica",
  "Supervisor",
  "Auditor",
  "Usuario",
];

const permisos = ["Ver facturas", "Aprobar", "Rechazar", "Registrar pagos", "Editar reglas", "Ver auditoría", "Exportar"];

function Configuracion() {
  return (
    <AppShell title="Configuración" description="Perfil, seguridad y control de acceso">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Perfil</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input id="nombre" defaultValue="Laura Restrepo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="correo">Correo corporativo</Label>
              <Input id="correo" type="email" defaultValue="laura.restrepo@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" defaultValue="Director Financiero" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" defaultValue="Holding Central S.A." />
            </div>
          </div>
          <Button size="sm" className="mt-5">
            Guardar cambios
          </Button>
        </div>

        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Seguridad</h2>
          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="actual">Contraseña actual</Label>
              <Input id="actual" type="password" placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nueva">Nueva contraseña</Label>
              <Input id="nueva" type="password" placeholder="••••••••" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="min-w-0 pr-3">
                <p className="text-sm font-medium">Autenticación 2FA</p>
                <p className="text-[11px] text-muted-foreground">Disponible en la próxima versión</p>
              </div>
              <Switch disabled aria-label="Activar 2FA" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Recordar sesión</p>
              <Switch defaultChecked aria-label="Recordar sesión" />
            </div>
          </div>
        </div>
      </div>

      <div className="panel mt-4 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Roles y permisos granulares</h2>
          <p className="text-xs text-muted-foreground">Matriz RBAC · cada rol tiene permisos independientes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Rol</th>
                {permisos.map((p) => (
                  <th key={p} className="px-3 py-3 text-center font-medium">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((rol, r) => (
                <tr key={rol} className="border-t border-border">
                  <td className="px-5 py-2.5 font-medium">{rol}</td>
                  {permisos.map((p, c) => {
                    const on = r === 0 || (r + c) % 3 !== 0;
                    return (
                      <td key={p} className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${on ? "bg-success" : "bg-muted-foreground/25"}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
