import { createFileRoute } from "@tanstack/react-router";
import React, { useMemo, useState } from "react";
import { ListChecks, Plus, Globe2, Building2, Info } from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import {
  useCatalogoAdmin,
  useTiposCatalogo,
  TIPOS_CATALOGO_ADMINISTRABLES,
  type CatalogoValor,
  type MetadataCatalogo,
  type TipoCatalogoDefinicion,
} from "@/hooks/use-catalogos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";

export const Route = createFileRoute("/configuracion/catalogos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS),
  component: CatalogosConfigPage,
});

const ETIQUETA_CAMPO_METADATA: Record<string, string> = {
  simbolo: "Símbolo",
  responsabilidad: "Responsabilidad / flete",
  dias: "Días",
  documento: "Documento al que aplica",
};

interface FormValor {
  clave: string;
  etiqueta: string;
  descripcion: string;
  orden: number;
  simbolo: string;
  responsabilidad: string;
  dias: string;
  documento: string;
  aliasesTexto: string;
}

const FORM_VACIO: FormValor = {
  clave: "",
  etiqueta: "",
  descripcion: "",
  orden: 0,
  simbolo: "",
  responsabilidad: "",
  dias: "",
  documento: "",
  aliasesTexto: "",
};

function formularioDesdeValor(valor: CatalogoValor): FormValor {
  return {
    clave: valor.clave,
    etiqueta: valor.etiqueta,
    descripcion: valor.descripcion ?? "",
    orden: valor.orden,
    simbolo: valor.metadata.simbolo ?? "",
    responsabilidad: valor.metadata.responsabilidad ?? "",
    dias: valor.metadata.dias !== undefined ? String(valor.metadata.dias) : "",
    documento: valor.metadata.documento ?? "",
    aliasesTexto: (valor.metadata.aliases ?? []).join(", "),
  };
}

/** Solo arma los campos de metadata que el tipo declara en camposMetadata —
 * así no se persiste ruido de un campo que ese catálogo no usa. */
function metadataDesdeFormulario(
  form: FormValor,
  campos: TipoCatalogoDefinicion["camposMetadata"] | undefined,
): MetadataCatalogo {
  const metadata: MetadataCatalogo = {};
  if (campos?.includes("simbolo") && form.simbolo.trim()) metadata.simbolo = form.simbolo.trim();
  if (campos?.includes("responsabilidad") && form.responsabilidad.trim()) {
    metadata.responsabilidad = form.responsabilidad.trim();
  }
  if (campos?.includes("documento") && form.documento.trim()) {
    metadata.documento = form.documento.trim();
  }
  if (campos?.includes("dias") && form.dias.trim() !== "") {
    const n = Number(form.dias);
    if (Number.isFinite(n)) metadata.dias = n;
  }
  const aliases = form.aliasesTexto
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  if (aliases.length > 0) metadata.aliases = aliases;
  return metadata;
}

function CatalogosConfigPage() {
  const { user: sesion } = useSession();
  const puedeAdministrar = hasPermission(sesion, PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS);
  const esSuperadmin = !!sesion?.isSuperadmin;

  const { data: tipos, isLoading: cargandoTipos } = useTiposCatalogo();
  // Mientras /catalogos/tipos carga (o si fallara), se usa la lista estática
  // como fallback — nunca deja el selector vacío.
  const opcionesTipo = tipos.length > 0 ? tipos : null;
  const [tipoSeleccionado, setTipoSeleccionado] = useState(TIPOS_CATALOGO_ADMINISTRABLES[0].tipo);

  const definicionActual = tipos.find((t) => t.tipo === tipoSeleccionado);
  const etiquetaTipoActual =
    definicionActual?.etiqueta ??
    TIPOS_CATALOGO_ADMINISTRABLES.find((t) => t.tipo === tipoSeleccionado)?.etiqueta ??
    tipoSeleccionado;

  const gruposOrdenados = useMemo(() => {
    const orden = ["General", "Comercial", "Importaciones", "Logística", "CRM"];
    const grupos = new Map<string, TipoCatalogoDefinicion[]>();
    for (const t of tipos) grupos.set(t.grupo, [...(grupos.get(t.grupo) ?? []), t]);
    return orden.filter((g) => grupos.has(g)).map((g) => ({ grupo: g, tipos: grupos.get(g)! }));
  }, [tipos]);

  const { data, isLoading, error, crear, actualizar, eliminar } =
    useCatalogoAdmin(tipoSeleccionado);

  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<FormValor>(FORM_VACIO);
  const [nuevoAlcance, setNuevoAlcance] = useState<"GENERAL" | "TENANT">("TENANT");
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<CatalogoValor | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormValor>(FORM_VACIO);
  const [aEliminar, setAEliminar] = useState<CatalogoValor | null>(null);
  const [conflictoEliminar, setConflictoEliminar] = useState<{
    valor: CatalogoValor;
    mensaje: string;
  } | null>(null);

  // Un registro GENERAL (tenantId null) es compartido entre todas las
  // empresas: solo un superadministrador puede crearlo/editarlo/eliminarlo
  // (mismo criterio que el backend en catalogos.controller.ts).
  const puedeModificar = (valor: CatalogoValor) =>
    puedeAdministrar && (valor.alcance !== "GENERAL" || esSuperadmin);

  const handleCambiarTipo = (tipo: string) => {
    setTipoSeleccionado(tipo);
    setCreando(false);
    setNuevo(FORM_VACIO);
  };

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevo.clave.trim() || !nuevo.etiqueta.trim()) return;
    setGuardando(true);
    try {
      await crear({
        clave: nuevo.clave.trim(),
        etiqueta: nuevo.etiqueta.trim(),
        descripcion: nuevo.descripcion.trim() || null,
        metadata: metadataDesdeFormulario(nuevo, definicionActual?.camposMetadata),
        orden: nuevo.orden,
        alcance: nuevoAlcance,
      });
      toast.success(`Valor "${nuevo.etiqueta}" creado.`);
      setNuevo(FORM_VACIO);
      setNuevoAlcance("TENANT");
      setCreando(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear el valor de catálogo.");
    } finally {
      setGuardando(false);
    }
  };

  const handleAbrirEdicion = (valor: CatalogoValor) => {
    setEditando(valor);
    setFormEdicion(formularioDesdeValor(valor));
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    try {
      await actualizar(editando.id, {
        etiqueta: formEdicion.etiqueta.trim(),
        descripcion: formEdicion.descripcion.trim() || null,
        metadata: metadataDesdeFormulario(formEdicion, definicionActual?.camposMetadata),
        orden: formEdicion.orden,
      });
      toast.success("Valor de catálogo actualizado.");
      setEditando(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el valor.");
    }
  };

  const handleToggleActivo = async (valor: CatalogoValor) => {
    try {
      await actualizar(valor.id, { activo: !valor.activo });
      toast.success(valor.activo ? "Valor desactivado." : "Valor activado.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el valor.");
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    try {
      await eliminar(aEliminar.id);
      toast.success(`"${aEliminar.etiqueta}" eliminado.`);
      setAEliminar(null);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : "Error al eliminar el valor.";
      // 409 = está en uso: se ofrece desactivar en su lugar, en vez de solo
      // mostrar el error y dejar al usuario sin salida.
      if (mensaje.toLowerCase().includes("en uso")) {
        setConflictoEliminar({ valor: aEliminar, mensaje });
        setAEliminar(null);
      } else {
        toast.error(mensaje);
      }
    }
  };

  const handleDesactivarEnLugarDeEliminar = async () => {
    if (!conflictoEliminar) return;
    await handleToggleActivo(conflictoEliminar.valor);
    setConflictoEliminar(null);
  };

  const camposMetadataActuales = definicionActual?.camposMetadata ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
            <ListChecks className="h-6 w-6 text-blue-600" />
            Catálogos
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Valores de referencia usados en formularios de todo el sistema (incoterms, monedas,
            países, condiciones y métodos de pago, unidades, estados comerciales, tipos de
            oportunidad, etc.). Los valores <span className="font-semibold">GENERAL</span> son
            compartidos por todas las empresas y solo un superadministrador puede modificarlos; los
            de <span className="font-semibold">esta empresa</span> son exclusivos del tenant actual
            y, con la misma clave, sobrescriben al general.
          </p>
        </div>
        {puedeAdministrar && (
          <Button size="sm" onClick={() => setCreando((c) => !c)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Nuevo valor
          </Button>
        )}
      </div>

      <div className="max-w-xs">
        <Select value={tipoSeleccionado} onValueChange={handleCambiarTipo}>
          <SelectTrigger className="bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200">
            {opcionesTipo ? (
              gruposOrdenados.map(({ grupo, tipos: tiposDelGrupo }) => (
                <SelectGroup key={grupo}>
                  <SelectLabel>{grupo}</SelectLabel>
                  {tiposDelGrupo.map((t) => (
                    <SelectItem key={t.tipo} value={t.tipo}>
                      {t.etiqueta}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            ) : (
              <>
                {TIPOS_CATALOGO_ADMINISTRABLES.map((t) => (
                  <SelectItem key={t.tipo} value={t.tipo}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
                {cargandoTipos && (
                  <p className="px-2 py-1.5 text-[11px] text-slate-400">Cargando catálogo...</p>
                )}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {definicionActual && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p>
            {definicionActual.descripcion}
            {definicionActual.equivalenteCanonico && (
              <span className="ml-1 text-slate-400">
                — heredado, se mantiene por compatibilidad con datos ya guardados; el catálogo
                vigente es "
                {tipos.find((t) => t.tipo === definicionActual.equivalenteCanonico)?.etiqueta ??
                  definicionActual.equivalenteCanonico}
                ".
              </span>
            )}
          </p>
        </div>
      )}

      {creando && (
        <form
          onSubmit={handleCrear}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-2xs"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              required
              placeholder="Clave (ej. FOB, CREDITO_45D) *"
              value={nuevo.clave}
              onChange={(e) => setNuevo({ ...nuevo, clave: e.target.value })}
            />
            <Input
              required
              placeholder="Etiqueta visible (ej. FOB - Libre a Bordo) *"
              value={nuevo.etiqueta}
              onChange={(e) => setNuevo({ ...nuevo, etiqueta: e.target.value })}
            />
          </div>
          <Textarea
            placeholder="Descripción (opcional)"
            rows={2}
            value={nuevo.descripcion}
            onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })}
          />
          {camposMetadataActuales.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {camposMetadataActuales.includes("simbolo") && (
                <Input
                  placeholder={ETIQUETA_CAMPO_METADATA.simbolo}
                  value={nuevo.simbolo}
                  onChange={(e) => setNuevo({ ...nuevo, simbolo: e.target.value })}
                />
              )}
              {camposMetadataActuales.includes("responsabilidad") && (
                <Input
                  placeholder={ETIQUETA_CAMPO_METADATA.responsabilidad}
                  value={nuevo.responsabilidad}
                  onChange={(e) => setNuevo({ ...nuevo, responsabilidad: e.target.value })}
                />
              )}
              {camposMetadataActuales.includes("dias") && (
                <Input
                  type="number"
                  min={0}
                  placeholder={ETIQUETA_CAMPO_METADATA.dias}
                  value={nuevo.dias}
                  onChange={(e) => setNuevo({ ...nuevo, dias: e.target.value })}
                />
              )}
              {camposMetadataActuales.includes("documento") && (
                <Input
                  placeholder={ETIQUETA_CAMPO_METADATA.documento}
                  value={nuevo.documento}
                  onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })}
                />
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              type="number"
              placeholder="Orden (opcional)"
              value={nuevo.orden}
              onChange={(e) => setNuevo({ ...nuevo, orden: Number(e.target.value) || 0 })}
            />
            <Input
              placeholder="Claves heredadas equivalentes, separadas por coma (opcional)"
              value={nuevo.aliasesTexto}
              onChange={(e) => setNuevo({ ...nuevo, aliasesTexto: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="font-semibold text-slate-500">Alcance:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="alcance-catalogo"
                checked={nuevoAlcance === "TENANT"}
                onChange={() => setNuevoAlcance("TENANT")}
                className="accent-blue-600"
              />
              Solo esta empresa
            </label>
            {esSuperadmin && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="alcance-catalogo"
                  checked={nuevoAlcance === "GENERAL"}
                  onChange={() => setNuevoAlcance("GENERAL")}
                  className="accent-blue-600"
                />
                General — todas las empresas
              </label>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="success" disabled={guardando}>
              {guardando ? "Guardando..." : "Crear valor"}
            </Button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-slate-900 font-semibold">{error}</p>}

      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Clave</TableHead>
              <TableHead>Etiqueta</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Alcance</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-500 py-6">
                  {isLoading
                    ? "Cargando catálogo..."
                    : `No hay valores registrados para "${etiquetaTipoActual}".`}
                </TableCell>
              </TableRow>
            ) : (
              data.map((valor) => (
                <TableRow key={valor.id}>
                  <TableCell className="font-mono text-xs text-slate-700">{valor.clave}</TableCell>
                  <TableCell className="font-medium text-slate-800">
                    {valor.etiqueta}
                    {valor.descripcion && (
                      <p className="mt-0.5 max-w-xs text-[11px] font-normal text-slate-400">
                        {valor.descripcion}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-slate-600">{valor.orden}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {valor.alcance === "GENERAL" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1 w-fit"
                        >
                          <Globe2 className="h-3 w-3" /> General
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-slate-200 bg-slate-50 text-slate-600 gap-1 w-fit"
                        >
                          <Building2 className="h-3 w-3" /> Esta empresa
                        </Badge>
                      )}
                      {valor.sobrescribeGeneral && (
                        <span className="text-[10px] text-amber-600">Sobrescribe al general</span>
                      )}
                      {valor.sobrescrito && (
                        <span className="text-[10px] text-slate-400">
                          Sobrescrito por esta empresa
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {valor.activo ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                        Activo
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-slate-900 text-white"
                      >
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    {puedeModificar(valor) && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAbrirEdicion(valor)}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActivo(valor)}
                        >
                          {valor.activo ? "Desactivar" : "Activar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setAEliminar(valor)}
                        >
                          Eliminar
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar valor — {editando?.clave}</DialogTitle>
            <DialogDescription>
              La clave no se puede cambiar: ya puede estar guardada en datos existentes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGuardarEdicion} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Etiqueta</Label>
              <Input
                required
                value={formEdicion.etiqueta}
                onChange={(e) => setFormEdicion({ ...formEdicion, etiqueta: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Descripción</Label>
              <Textarea
                rows={2}
                value={formEdicion.descripcion}
                onChange={(e) => setFormEdicion({ ...formEdicion, descripcion: e.target.value })}
              />
            </div>
            {camposMetadataActuales.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {camposMetadataActuales.includes("simbolo") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      {ETIQUETA_CAMPO_METADATA.simbolo}
                    </Label>
                    <Input
                      value={formEdicion.simbolo}
                      onChange={(e) => setFormEdicion({ ...formEdicion, simbolo: e.target.value })}
                    />
                  </div>
                )}
                {camposMetadataActuales.includes("responsabilidad") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      {ETIQUETA_CAMPO_METADATA.responsabilidad}
                    </Label>
                    <Input
                      value={formEdicion.responsabilidad}
                      onChange={(e) =>
                        setFormEdicion({ ...formEdicion, responsabilidad: e.target.value })
                      }
                    />
                  </div>
                )}
                {camposMetadataActuales.includes("dias") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      {ETIQUETA_CAMPO_METADATA.dias}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={formEdicion.dias}
                      onChange={(e) => setFormEdicion({ ...formEdicion, dias: e.target.value })}
                    />
                  </div>
                )}
                {camposMetadataActuales.includes("documento") && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      {ETIQUETA_CAMPO_METADATA.documento}
                    </Label>
                    <Input
                      value={formEdicion.documento}
                      onChange={(e) =>
                        setFormEdicion({ ...formEdicion, documento: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Orden</Label>
                <Input
                  type="number"
                  value={formEdicion.orden}
                  onChange={(e) =>
                    setFormEdicion({ ...formEdicion, orden: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Claves heredadas equivalentes
                </Label>
                <Input
                  placeholder="Separadas por coma"
                  value={formEdicion.aliasesTexto}
                  onChange={(e) => setFormEdicion({ ...formEdicion, aliasesTexto: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" variant="success">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={aEliminar !== null} onOpenChange={(open) => !open && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar valor de catálogo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción elimina permanentemente "{aEliminar?.etiqueta}" ({aEliminar?.clave}). Si
              ya está en uso en algún registro, no se podrá eliminar y se ofrecerá desactivarlo en
              su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={conflictoEliminar !== null}
        onOpenChange={(open) => !open && setConflictoEliminar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se puede eliminar: está en uso</AlertDialogTitle>
            <AlertDialogDescription>
              {conflictoEliminar?.mensaje} Desactivarlo lo oculta de los formularios nuevos sin
              afectar los registros que ya lo usan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDesactivarEnLugarDeEliminar}>
              Desactivar en su lugar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
