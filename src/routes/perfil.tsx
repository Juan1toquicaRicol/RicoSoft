import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { useSession } from "@/lib/session-context";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Mi Perfil | RicoSoft" },
      { name: "description", content: "Información de la cuenta y sesión activa en RicoSoft." },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user } = useSession();

  if (!user) return null;

  return (
    <AppShell title="Mi Perfil" description="Información de tu cuenta y sesión activa">
      <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-4 border-b border-slate-200 p-6">
          <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-bold shrink-0">
            {user.nombre ? user.nombre[0].toUpperCase() : "U"}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{user.nombre}</h2>
            <p className="text-slate-500 text-sm">{user.email}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Rol</label>
            <p className="text-slate-700 font-medium">
              {user.isSuperadmin ? "Superadministrador" : (user.rol ?? "Sin rol asignado")}
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">
              ID de Empresa (Tenant)
            </label>
            <p className="text-slate-700 font-medium font-mono text-sm">{user.tenantId}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase">Estado</label>
            <p className="text-slate-700 font-medium">{user.activo ? "Activo" : "Inactivo"}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
