import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCatalogoSeguridadSocial, type TipoSeguridadSocial } from "@/hooks/use-seguridad-social";

const TH = "text-[11px] uppercase tracking-wider text-slate-600 font-bold px-4 py-3.5";

/**
 * Catálogo simple por tenant (EPS, ARL o fondos de pensiones). Nada se
 * elimina: se desactiva, y lo ya registrado en los colaboradores se conserva.
 */
export function CatalogoSeguridadSocialPanel({
  tipo,
  titulo,
  singular,
  puedeGestionar,
}: {
  tipo: TipoSeguridadSocial;
  titulo: string;
  singular: string;
  puedeGestionar: boolean;
}) {
  const { items, loading, error, crear, actualizar } = useCatalogoSeguridadSocial(tipo);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim()) return;
    setCreando(true);
    try {
      await crear(nuevoNombre.trim());
      setNuevoNombre("");
      toast.success(`${singular} agregado.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al agregar.");
    } finally {
      setCreando(false);
    }
  };

  const aplicar = async (id: string, data: { nombre?: string; activo?: boolean }) => {
    setOcupadoId(id);
    try {
      await actualizar(id, data);
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar.");
      return false;
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
      <div className="p-4 border-b border-slate-200 bg-slate-50/80">
        <h3 className="text-sm font-bold text-slate-900">{titulo}</h3>
        <p className="text-xs text-slate-500 font-medium">
          Opciones disponibles al registrar los detalles de un colaborador. Una opción desactivada
          no se puede elegir de nuevo, pero se conserva en quienes ya la tienen.
        </p>
      </div>

      {puedeGestionar && (
        <form
          onSubmit={handleCrear}
          className="p-4 border-b border-slate-200 flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1 flex-1 min-w-56">
            <Label htmlFor={`ss-nuevo-${tipo}`} className="text-xs font-semibold text-slate-700">
              Nuevo {singular}
            </Label>
            <Input
              id={`ss-nuevo-${tipo}`}
              value={nuevoNombre}
              maxLength={150}
              onChange={(e) => setNuevoNombre(e.target.value)}
              className="h-9 text-xs border-slate-300"
            />
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
            <TableHead className={TH}>Nombre</TableHead>
            <TableHead className={TH}>Estado</TableHead>
            {puedeGestionar && <TableHead className={`${TH} text-right`}>Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id} className={i.activo ? "" : "opacity-60"}>
              <TableCell className="px-4 py-3 font-semibold text-slate-900">
                {editandoId === i.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      aria-label={`Nuevo nombre para ${i.nombre}`}
                      value={nombreEditado}
                      maxLength={150}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      className="h-8 text-xs border-slate-300"
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      aria-label="Guardar nombre"
                      disabled={ocupadoId === i.id || !nombreEditado.trim()}
                      onClick={async () => {
                        if (await aplicar(i.id, { nombre: nombreEditado.trim() })) {
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
                  i.nombre
                )}
              </TableCell>
              <TableCell className="px-4 py-3">
                <Badge
                  variant="outline"
                  className={
                    i.activo
                      ? "border-blue-200 bg-blue-50 text-blue-800 font-bold"
                      : "border-slate-300 bg-slate-100 text-slate-600 font-bold"
                  }
                >
                  {i.activo ? "Activo" : "Inactivo"}
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
                        setEditandoId(i.id);
                        setNombreEditado(i.nombre);
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" /> Renombrar
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 text-[11px] text-slate-900 hover:bg-slate-100"
                      disabled={ocupadoId === i.id}
                      onClick={() => aplicar(i.id, { activo: !i.activo })}
                    >
                      {i.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={puedeGestionar ? 3 : 2}
                className="px-4 py-8 text-center text-xs text-slate-500"
              >
                {loading ? "Cargando..." : "Aún no hay opciones configuradas."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
