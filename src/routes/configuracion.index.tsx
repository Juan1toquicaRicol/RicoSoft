import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, ShieldCheck, User } from "lucide-react";

import { useSession } from "@/lib/session-context";

export const Route = createFileRoute("/configuracion/")({
  component: MiPerfilPage,
});

function MiPerfilPage() {
  const { user } = useSession();

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-800">Seguridad de la cuenta</h3>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <User className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              Sesión iniciada como <strong className="text-slate-800">{user.email}</strong>.
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-600">
            <KeyRound className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              El cambio de contraseña propio y el restablecimiento de contraseñas de otros
              usuarios aún no están disponibles en esta versión.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
