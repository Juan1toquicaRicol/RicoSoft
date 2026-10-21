import { useState } from "react";
import { Pencil, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCargosAdmin } from "@/hooks/use-cargos";

const TH = "text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5";

/**
 * Catálogo de cargos del tenant (Gestión Humana). Los cargos nunca se
 * eliminan: se desactivan, y los colaboradores ya asignados conservan su
 * cargo. `puedeGestionar` (cargos.gestionar) controla las acciones de
 * escritura; con solo cargos.ver la tabla es de lectura.
 */
export function CargosPanel({ puedeGestionar }: { puedeGestionar: boolean }) {
  const { cargos, loading, error, crear, actualizar } = useCargosAdmin(true);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCorreoRequerido, setNuevoCorreoRequerido] = useState(true);
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    try {
      await crear({
        nombre: nuevoNombre.trim(),
        correoCorporativoRequerido: nuevoCorreoRequerido,
      });
      setNuevoNombre("");
      setNuevoCorreoRequerido(true);
      toast.success("Cargo creado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el cargo.");
    } finally {
      setCreando(false);
    }
  };

  const aplicar = async (
    id: string,
    data: { nombre?: string; activo?: boolean; correoCorporativoRequerido?: boolean },
  ) => {
    setOcupadoId(id);
    try {
      await actualizar(id, data);
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el cargo.");
      return false;
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <div className="p-4 border-b border-slate-200 bg-slate-50/80">
        <h3 className="text-sm font-bold text-slate-900">Catálogo de cargos</h3>
        <p className="text-xs text-slate-500 font-medium">
          Define los cargos de la empresa y si el correo corporativo es obligatorio para cada uno.
          Un cargo desactivado no se puede elegir para nuevos colaboradores, pero se conserva en los
          ya asignados.
        </p>
      </div>

      {puedeGestionar && (
        <form
          onSubmit={handleCrear}
          className="p-4 border-b border-slate-200 flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1 flex-1 min-w-56">
            <Label htmlFor="cargo-nuevo" className="text-xs font-semibold text-slate-700">
              Nuevo cargo
            </Label>
            <Input
              id="cargo-nuevo"
              value={nuevoNombre}
              maxLength={255}
              onChange={(e) => setNuevoNombre(e.target.value)}
              placeholder="Ej. Analista de Nómina"
              className="h-9 text-xs border-slate-300"
            />
          </div>
          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="cargo-nuevo-correo"
              checked={nuevoCorreoRequerido}
              onCheckedChange={setNuevoCorreoRequerido}
            />
            <Label htmlFor="cargo-nuevo-correo" className="text-xs font-semibold text-slate-700">
              Correo corporativo obligatorio
            </Label>
          </div>
          <Button
            type="submit"
            size="sm"
            className="gap-2"
            disabled={creando || !nuevoNombre.trim()}
          >
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </form>
      )}

      {error && <p className="px-4 py-3 text-xs text-slate-900 font-semibold">{error}</p>}

      <Table>
        <TableHeader className="bg-slate-100/80">
          <TableRow className="hover:bg-slate-100/80">
            <TableHead className={TH}>Cargo</TableHead>
            <TableHead className={TH}>Correo corporativo</TableHead>
            <TableHead className={`${TH} text-center`}>Colaboradores</TableHead>
            <TableHead className={TH}>Estado</TableHead>
            {puedeGestionar && <TableHead className={`${TH} text-right`}>Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cargos.map((c) => (
            <TableRow key={c.id} className={c.activo ? "" : "opacity-60"}>
              <TableCell className="px-4 py-3 font-semibold text-slate-900">
                {editandoId === c.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Nuevo nombre para ${c.nombre}`}
                      value={nombreEditado}
                      maxLength={255}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      className="h-8 text-xs border-slate-300"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      aria-label="Guardar nombre"
                      disabled={ocupadoId === c.id || !nombreEditado.trim()}
                      onClick={async () => {
                        if (await aplicar(c.id, { nombre: nombreEditado.trim() })) {
                          setEditandoId(null);
                        }
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label="Cancelar edición"
                      onClick={() => setEditandoId(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  c.nombre
                )}
              </TableCell>
              <TableCell className="px-4 py-3 text-xs">
                {puedeGestionar ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label={`Correo corporativo obligatorio para ${c.nombre}`}
                      checked={c.correoCorporativoRequerido}
                      disabled={ocupadoId === c.id}
                      onCheckedChange={(v) => aplicar(c.id, { correoCorporativoRequerido: v })}
                    />
                    <span className="text-slate-600">
                      {c.correoCorporativoRequerido ? "Obligatorio" : "Opcional"}
                    </span>
                  </div>
                ) : c.correoCorporativoRequerido ? (
                  "Obligatorio"
                ) : (
                  "Opcional"
                )}
              </TableCell>
              <TableCell className="px-4 py-3 text-center text-xs text-slate-600">
                {c.colaboradoresAsignados}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={
                    c.activo
                      ? "border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      : "border-slate-300 bg-slate-100 text-slate-600 font-bold"
                  }
                >
                  {c.activo ? "Activo" : "Inactivo"}
                </Badge>
              </TableCell>
              {puedeGestionar && (
                <TableCell className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="xs"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        setEditandoId(c.id);
                        setNombreEditado(c.nombre);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Renombrar
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 text-[11px] text-slate-900 hover:bg-slate-100"
                      disabled={ocupadoId === c.id}
                      onClick={() => aplicar(c.id, { activo: !c.activo })}
                    >
                      {c.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
          {cargos.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={puedeGestionar ? 5 : 4}
                className="px-4 py-8 text-center text-xs text-slate-500"
              >
                {loading ? "Cargando cargos..." : "Aún no hay cargos configurados."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
