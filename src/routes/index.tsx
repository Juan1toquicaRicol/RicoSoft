import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell"; // Ajusta esta ruta de importación si tu AppShell está en otro path
import { Building2, Users, FileText, ShoppingCart } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: DashboardExecutive,
});

function DashboardExecutive() {
  return (
    <AppShell
      title="Dashboard Executive"
      description="Bienvenido al panel principal del Sistema Integrado RicoSoft."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/gestion-humana" className="block">
          <div className="panel p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 text-blue-700 rounded-lg">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Gestión Humana</h3>
                <p className="text-xs text-slate-500">Directorio, novedades y personal</p>
              </div>
            </div>
          </div>
        </Link>

        <Link to="/facturas" className="block">
          <div className="panel p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Recepción de Facturas</h3>
                <p className="text-xs text-slate-500">Gestión de facturas y contabilidad</p>
              </div>
            </div>
          </div>
        </Link>

        <Link to="/solicitudes-compra" className="block">
          <div className="panel p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-500 transition-all cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-50 text-purple-700 rounded-lg">
                <ShoppingCart className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Solicitudes de Compra</h3>
                <p className="text-xs text-slate-500">Aprobación y control de compras</p>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </AppShell>
  );
}
