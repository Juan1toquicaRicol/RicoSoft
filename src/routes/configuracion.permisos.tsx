import { createFileRoute } from "@tanstack/react-router";
import { Key } from "lucide-react";

import { LISTA_PERMISOS_DEFINICION, PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/configuracion/permisos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PERMISOS_VER),
  component: PermisosConfigPage,
});

const MODULOS = Array.from(new Set(LISTA_PERMISOS_DEFINICION.map((p) => p.modulo)));

function PermisosConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <Key className="h-6 w-6 text-blue-600" />
          Permisos
        </h1>
        <p className="text-sm text-slate-500">
          Todos los permisos granulares del sistema. Se asignan a los usuarios a través de Roles, en
          la pestaña "Roles".
        </p>
      </div>

      <div className="space-y-6">
        {MODULOS.map((modulo) => (
          <div
            key={modulo}
            className="border border-slate-200 rounded-lg bg-white shadow-2xs overflow-hidden"
          >
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
              {modulo}
            </div>
            <Table>
              <TableBody>
                {LISTA_PERMISOS_DEFINICION.filter((p) => p.modulo === modulo).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="w-56 font-mono text-xs text-blue-700">{p.id}</TableCell>
                    <TableCell className="font-medium text-slate-800">{p.nombre}</TableCell>
                    <TableCell className="text-slate-500">{p.descripcion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  );
}
