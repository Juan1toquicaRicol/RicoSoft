import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutGrid, ArrowUp, ArrowDown, Building2 } from "lucide-react";

import { fetchAuth } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { useModulos } from "@/hooks/use-modulos";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/configuracion/modulos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.MODULOS_VER),
  component: ModulosConfigPage,
});

interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

const SIN_DEPARTAMENTO = "__sin_departamento__";

function ModulosConfigPage() {
  const { user: sesion } = useSession();
  const puedeGestionar = hasPermission(sesion, PERMISOS_SISTEMA.MODULOS_GESTIONAR);

  const { modulos, loading, error, actualizarModulo } = useModulos();
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);

  useEffect(() => {
    fetchAuth("/departamentos")
      .then((data) => setDepartamentos(data))
      .catch(() => setDepartamentos([]));
  }, []);

  const handleCambiarDepartamento = async (id: string, departamentoId: string) => {
    await actualizarModulo(id, {
      departamentoId: departamentoId === SIN_DEPARTAMENTO ? null : departamentoId,
    });
  };

  const handleToggleActivo = async (id: string, activo: boolean) => {
    await actualizarModulo(id, { activo });
  };

  const handleMover = async (index: number, direccion: -1 | 1) => {
    const destino = index + direccion;
    if (destino < 0 || destino >= modulos.length) return;
    const actual = modulos[index];
    const vecino = modulos[destino];
    await actualizarModulo(actual.id, { orden: vecino.orden });
    await actualizarModulo(vecino.id, { orden: actual.orden });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
          <LayoutGrid className="h-6 w-6 text-blue-600" />
          Módulos
        </h1>
        <p className="text-sm text-slate-500">
          Módulos principales de la aplicación. Asigna cada uno a un departamento, actívalos o
          desactívalos y define el orden en que aparecen en el menú lateral.
        </p>
      </div>

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-20">Orden</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500 py-6">
                  {loading ? "Cargando módulos..." : "No hay módulos registrados."}
                </TableCell>
              </TableRow>
            ) : (
              modulos.map((m, index) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={!puedeGestionar || index === 0}
                        onClick={() => handleMover(index, -1)}
                        className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                        title="Subir"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        disabled={!puedeGestionar || index === modulos.length - 1}
                        onClick={() => handleMover(index, 1)}
                        className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 transition-colors"
                        title="Bajar"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-800">{m.nombre}</div>
                    <div className="text-xs text-slate-400">{m.ruta}</div>
                  </TableCell>
                  <TableCell>
                    {puedeGestionar ? (
                      <Select
                        value={m.departamentoId ?? SIN_DEPARTAMENTO}
                        onValueChange={(value) => handleCambiarDepartamento(m.id, value)}
                      >
                        <SelectTrigger className="h-8 w-52 text-xs">
                          <SelectValue placeholder="Sin departamento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_DEPARTAMENTO}>Sin departamento</SelectItem>
                          {departamentos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : m.departamento ? (
                      <Badge
                        variant="outline"
                        className="border-blue-200 bg-blue-50 text-blue-700 gap-1"
                      >
                        <Building2 className="h-3 w-3" /> {m.departamento.nombre}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">Sin departamento</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={m.activo}
                        disabled={!puedeGestionar}
                        onCheckedChange={(checked) => handleToggleActivo(m.id, checked)}
                      />
                      <span className="text-xs text-slate-500">
                        {m.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
