import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { correoRequeridoParaCargo, validarCorreoColaborador, type CargoOpcion } from "@/lib/cargos";
import type { Empleado } from "@/lib/data";
import { SelectorArchivo } from "@/components/gestion-humana/selector-archivo";
import { validarArchivoAdjunto } from "@/lib/archivo-adjunto";
import { DetallePersonalCampos } from "@/components/gestion-humana/detalle-personal-campos";
import { DETALLE_PERSONAL_VACIO, type DetallePersonalForm } from "@/lib/detalle-personal";
import { crearGuardaSolicitudes } from "@/lib/solicitud-vigente";
import type { OpcionesSeguridadSocial } from "@/hooks/use-seguridad-social";
import { fetchAuth, fetchAuthBlob, fetchAuthUpload } from "@/lib/session";

interface DocumentoApi {
  id: string;
  tipo: "CERTIFICADO_BANCARIO" | "SOPORTE_ESTUDIO";
  estudioId: string | null;
  nombre: string;
  mime: string;
  tamano: number;
}
interface DetallesApi {
  detalle: { [K in keyof DetallePersonalForm]: string | null };
  familiares: { id: string; nombre: string; parentesco: string }[];
  estudios: { id: string; titulo: string; institucion: string | null }[];
  documentos: DocumentoApi[];
  puedeVerDocumentos: boolean;
}

export interface PermisosDetalles {
  verDetalles: boolean;
  editarDetalles: boolean;
  gestionarDocumentos: boolean;
  editarCargoCorreo: boolean;
}

interface Props {
  empleado: Empleado | null;
  onClose: () => void;
  permisos: PermisosDetalles;
  cargos: CargoOpcion[];
  opcionesSeguridadSocial: OpcionesSeguridadSocial;
  onEditarCargoCorreo: (
    id: string,
    data: { cargoId?: string; correo?: string; tipoContrato?: string },
  ) => Promise<void>;
}

const AVISO_ESTUDIO_CON_SOPORTES =
  "Este estudio tiene soportes: eliminarlo requiere el permiso de gestionar documentos.";
const SECCION = "space-y-3 rounded-md border border-slate-200 p-3";
const TITULO = "text-xs font-bold uppercase tracking-wider text-slate-700";
const INPUT = "h-9 text-xs border-slate-300";

/**
 * "Detalles" del colaborador: datos laborales editables (cargo/correo) y los
 * datos personales adicionales con sus soportes privados. Cada bloque se
 * muestra solo con su permiso; el backend lo vuelve a exigir en cada llamada.
 */
export function EmpleadoDetallesDialog({
  empleado,
  onClose,
  permisos,
  cargos,
  opcionesSeguridadSocial,
  onEditarCargoCorreo,
}: Props) {
  const empleadoId = empleado?.id ?? null;
  const [datos, setDatos] = useState<DetallesApi | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");

  const [cargoId, setCargoId] = useState("");
  const [correo, setCorreo] = useState("");
  const [tipoContrato, setTipoContrato] = useState("");
  const [guardandoLaboral, setGuardandoLaboral] = useState(false);

  const [form, setForm] = useState<DetallePersonalForm>(DETALLE_PERSONAL_VACIO);
  const [guardandoDetalle, setGuardandoDetalle] = useState(false);

  const [famNombre, setFamNombre] = useState("");
  const [famParentesco, setFamParentesco] = useState("");
  const [estTitulo, setEstTitulo] = useState("");
  const [estInstitucion, setEstInstitucion] = useState("");

  // Una respuesta solo actualiza el diálogo si sigue siendo la última solicitud
  // del colaborador activo: una carga lenta del anterior no puede pisar al nuevo.
  const [guarda] = useState(() => crearGuardaSolicitudes<string>());

  const cargar = useCallback(async () => {
    if (!empleadoId || !permisos.verDetalles) return;
    const token = guarda.iniciar(empleadoId);
    if (token === null) return;
    setCargando(true);
    setErrorCarga("");
    try {
      const data: DetallesApi = await fetchAuth(`/gestion-humana/empleados/${empleadoId}/detalles`);
      if (!guarda.esVigente(token)) return;
      setDatos(data);
      setForm(
        Object.fromEntries(
          Object.keys(DETALLE_PERSONAL_VACIO).map((k) => [
            k,
            data.detalle[k as keyof DetallePersonalForm] ?? "",
          ]),
        ) as unknown as DetallePersonalForm,
      );
    } catch (err: unknown) {
      if (!guarda.esVigente(token)) return;
      setErrorCarga(err instanceof Error ? err.message : "Error al cargar los detalles.");
    } finally {
      if (guarda.esVigente(token)) setCargando(false);
    }
  }, [empleadoId, permisos.verDetalles, guarda]);

  useEffect(() => {
    guarda.activar(empleadoId);
    setDatos(null);
    setForm({ ...DETALLE_PERSONAL_VACIO });
    setCargando(false);
    setErrorCarga("");
    setFamNombre("");
    setFamParentesco("");
    setEstTitulo("");
    setEstInstitucion("");
    setCargoId(empleado?.cargoId ?? "");
    setCorreo(empleado?.correo ?? "");
    setTipoContrato(empleado?.tipoContrato ?? "");
    cargar();
    // Al cerrar o desmontar se invalida lo que siga en vuelo.
    return () => guarda.activar(null);
    // Solo se reinicia al abrir/cambiar de colaborador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empleadoId]);

  const correoRequerido = correoRequeridoParaCargo(cargos, cargoId || null);
  // Si el cargo actual ya está inactivo no viene en las opciones; se muestra su nombre.
  const etiquetaCargoActual = empleado?.cargoId === cargoId ? empleado?.cargo : undefined;

  const guardarLaboral = async () => {
    if (!empleado) return;
    const v = validarCorreoColaborador(correo, correoRequerido, empleado.empresaId);
    if (!v.ok) {
      toast.error(v.message);
      return;
    }
    const cambios: { cargoId?: string; correo?: string; tipoContrato?: string } = {};
    if (cargoId && cargoId !== (empleado.cargoId ?? "")) cambios.cargoId = cargoId;
    if (v.correo !== (empleado.correo ?? "")) cambios.correo = v.correo;
    if (tipoContrato !== (empleado.tipoContrato ?? "")) cambios.tipoContrato = tipoContrato;
    if (Object.keys(cambios).length === 0) {
      toast.info("No hay cambios por guardar.");
      return;
    }
    setGuardandoLaboral(true);
    try {
      await onEditarCargoCorreo(empleado.id, cambios);
      toast.success("Datos laborales actualizados.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el colaborador.");
    } finally {
      setGuardandoLaboral(false);
    }
  };

  const guardarDetalle = async () => {
    if (!empleadoId) return;
    setGuardandoDetalle(true);
    try {
      await fetchAuth(`/gestion-humana/empleados/${empleadoId}/detalles`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      toast.success("Detalles guardados.");
      await cargar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar los detalles.");
    } finally {
      setGuardandoDetalle(false);
    }
  };

  const ejecutar = async (accion: () => Promise<unknown>, errorPorDefecto: string) => {
    try {
      await accion();
      await cargar();
      return true;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : errorPorDefecto);
      return false;
    }
  };

  const base = `/gestion-humana/empleados/${empleadoId}`;

  const agregarFamiliar = async () => {
    if (!famNombre.trim() || !famParentesco.trim()) return;
    const ok = await ejecutar(
      () =>
        fetchAuth(`${base}/familiares`, {
          method: "POST",
          body: JSON.stringify({ nombre: famNombre, parentesco: famParentesco }),
        }),
      "Error al agregar el familiar.",
    );
    if (ok) {
      setFamNombre("");
      setFamParentesco("");
    }
  };

  const agregarEstudio = async () => {
    if (!estTitulo.trim()) return;
    const ok = await ejecutar(
      () =>
        fetchAuth(`${base}/estudios`, {
          method: "POST",
          body: JSON.stringify({ titulo: estTitulo, institucion: estInstitucion }),
        }),
      "Error al agregar el estudio.",
    );
    if (ok) {
      setEstTitulo("");
      setEstInstitucion("");
    }
  };

  const subir = async (
    archivo: File,
    tipo: "CERTIFICADO_BANCARIO" | "SOPORTE_ESTUDIO",
    estudioId?: string,
  ) => {
    const errorArchivo = validarArchivoAdjunto(archivo);
    if (errorArchivo) {
      toast.error(errorArchivo);
      return;
    }
    const fd = new FormData();
    fd.append("tipo", tipo);
    if (estudioId) fd.append("estudioId", estudioId);
    fd.append("archivo", archivo);
    const ok = await ejecutar(
      () => fetchAuthUpload(`${base}/documentos`, fd),
      "Error al subir el documento.",
    );
    if (ok) toast.success("Documento adjuntado.");
  };

  const descargar = async (doc: DocumentoApi) => {
    try {
      const blob = await fetchAuthBlob(`${base}/documentos/${doc.id}/archivo`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al descargar el documento.");
    }
  };

  const eliminarDocumento = (doc: DocumentoApi) =>
    ejecutar(
      () => fetchAuth(`${base}/documentos/${doc.id}`, { method: "DELETE" }),
      "Error al eliminar el documento.",
    );

  const certificado = datos?.documentos.find((d) => d.tipo === "CERTIFICADO_BANCARIO");
  const puedeVerDocs = datos?.puedeVerDocumentos ?? false;

  return (
    <Dialog open={!!empleado} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-slate-200">
        <DialogHeader>
          <DialogTitle className="text-slate-900 font-bold">
            Detalles — {empleado?.nombres} {empleado?.apellidos}
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Cédula de ciudadanía {empleado?.documento}. Información personal sensible: el acceso
            queda registrado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {permisos.editarCargoCorreo && empleado && (
            <section className={SECCION} aria-labelledby="det-laboral">
              <h4 id="det-laboral" className={TITULO}>
                Datos laborales
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="det-cargo" className="text-xs font-semibold text-slate-700">
                    Cargo
                  </Label>
                  <Combobox
                    id="det-cargo"
                    options={cargos.map((c) => ({ value: c.id, label: c.nombre }))}
                    value={cargoId}
                    onValueChange={setCargoId}
                    selectedLabel={etiquetaCargoActual}
                    placeholder="Selecciona un cargo"
                    searchPlaceholder="Buscar cargo..."
                    emptyText="No hay cargos activos."
                    clearable={false}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="det-correo" className="text-xs font-semibold text-slate-700">
                    Correo corporativo{correoRequerido ? " *" : " (opcional)"}
                  </Label>
                  <Input
                    id="det-correo"
                    type="email"
                    value={correo}
                    required={correoRequerido}
                    onChange={(e) => setCorreo(e.target.value)}
                    className={INPUT}
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="det-tipo-contrato"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Tipo de contrato
                  </Label>
                  <Combobox
                    id="det-tipo-contrato"
                    options={opcionesSeguridadSocial.tiposContrato.map((n) => ({
                      value: n,
                      label: n,
                    }))}
                    value={tipoContrato}
                    onValueChange={setTipoContrato}
                    selectedLabel={tipoContrato || undefined}
                    placeholder="Selecciona un tipo de contrato"
                    searchPlaceholder="Buscar..."
                    emptyText="Sin opciones. Agrégalas en Gestión de información."
                  />
                </div>
              </div>
              <Button size="sm" onClick={guardarLaboral} disabled={guardandoLaboral}>
                Guardar datos laborales
              </Button>
            </section>
          )}

          {permisos.verDetalles && (
            <>
              {cargando && !datos && <p className="text-xs text-slate-500">Cargando detalles...</p>}
              {errorCarga && <p className="text-xs font-semibold text-slate-900">{errorCarga}</p>}

              {datos && (
                <>
                  <section className={SECCION} aria-labelledby="det-personal">
                    <h4 id="det-personal" className={TITULO}>
                      Información personal
                    </h4>
                    <DetallePersonalCampos
                      idPrefix="det"
                      valor={form}
                      onChange={setForm}
                      opciones={opcionesSeguridadSocial}
                      disabled={!permisos.editarDetalles}
                    />
                    {permisos.editarDetalles && (
                      <Button size="sm" onClick={guardarDetalle} disabled={guardandoDetalle}>
                        Guardar información
                      </Button>
                    )}
                  </section>

                  <section className={SECCION} aria-labelledby="det-familia">
                    <h4 id="det-familia" className={TITULO}>
                      Núcleo familiar
                    </h4>
                    <ul className="space-y-1">
                      {datos.familiares.map((f) => (
                        <li
                          key={f.id}
                          className="flex items-center justify-between text-xs text-slate-800"
                        >
                          <span>
                            {f.nombre} <span className="text-slate-500">· {f.parentesco}</span>
                          </span>
                          {permisos.editarDetalles && (
                            <Button
                              size="xs"
                              variant="ghost"
                              aria-label={`Eliminar familiar ${f.nombre}`}
                              onClick={() =>
                                ejecutar(
                                  () =>
                                    fetchAuth(`${base}/familiares/${f.id}`, { method: "DELETE" }),
                                  "Error al eliminar el familiar.",
                                )
                              }
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </li>
                      ))}
                      {datos.familiares.length === 0 && (
                        <li className="text-xs text-slate-500">Sin familiares registrados.</li>
                      )}
                    </ul>
                    {permisos.editarDetalles && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1 flex-1 min-w-40">
                          <Label
                            htmlFor="fam-nombre"
                            className="text-xs font-semibold text-slate-700"
                          >
                            Nombre
                          </Label>
                          <Input
                            id="fam-nombre"
                            value={famNombre}
                            maxLength={255}
                            onChange={(e) => setFamNombre(e.target.value)}
                            className={INPUT}
                          />
                        </div>
                        <div className="space-y-1 w-40">
                          <Label
                            htmlFor="fam-parentesco"
                            className="text-xs font-semibold text-slate-700"
                          >
                            Parentesco
                          </Label>
                          <Input
                            id="fam-parentesco"
                            value={famParentesco}
                            maxLength={50}
                            onChange={(e) => setFamParentesco(e.target.value)}
                            className={INPUT}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={agregarFamiliar}
                          disabled={!famNombre.trim() || !famParentesco.trim()}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Agregar
                        </Button>
                      </div>
                    )}
                  </section>

                  <section className={SECCION} aria-labelledby="det-estudios">
                    <h4 id="det-estudios" className={TITULO}>
                      Estudios
                    </h4>
                    <ul className="space-y-2">
                      {datos.estudios.map((e) => {
                        const soportes = datos.documentos.filter((d) => d.estudioId === e.id);
                        return (
                          <li key={e.id} className="text-xs text-slate-800 space-y-1">
                            <div className="flex items-center justify-between">
                              <span>
                                {e.titulo}
                                {e.institucion && (
                                  <span className="text-slate-500"> · {e.institucion}</span>
                                )}
                              </span>
                              {permisos.editarDetalles && (
                                // D-03: con soportes también hace falta gestionar documentos. El
                                // tooltip va en el span: un botón deshabilitado no recibe el puntero.
                                <span
                                  title={
                                    soportes.length > 0 && !permisos.gestionarDocumentos
                                      ? AVISO_ESTUDIO_CON_SOPORTES
                                      : undefined
                                  }
                                >
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    aria-label={
                                      soportes.length > 0 && !permisos.gestionarDocumentos
                                        ? `Eliminar estudio ${e.titulo}: ${AVISO_ESTUDIO_CON_SOPORTES}`
                                        : `Eliminar estudio ${e.titulo}`
                                    }
                                    disabled={soportes.length > 0 && !permisos.gestionarDocumentos}
                                    onClick={() =>
                                      ejecutar(
                                        () =>
                                          fetchAuth(`${base}/estudios/${e.id}`, {
                                            method: "DELETE",
                                          }),
                                        "Error al eliminar el estudio.",
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pl-2">
                              {soportes.map((d) => (
                                <span key={d.id} className="inline-flex items-center gap-1">
                                  <Paperclip className="h-3 w-3 text-slate-400" />
                                  {puedeVerDocs ? (
                                    <button
                                      type="button"
                                      className="underline text-slate-900"
                                      onClick={() => descargar(d)}
                                    >
                                      {d.nombre}
                                    </button>
                                  ) : (
                                    <span>{d.nombre}</span>
                                  )}
                                  {permisos.gestionarDocumentos && (
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      aria-label={`Eliminar soporte ${d.nombre}`}
                                      onClick={() => eliminarDocumento(d)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </span>
                              ))}
                              {permisos.gestionarDocumentos && (
                                <SelectorArchivo
                                  etiqueta="Adjuntar soporte"
                                  etiquetaAccesible={`Adjuntar soporte del estudio ${e.titulo}`}
                                  onArchivo={(f) => subir(f, "SOPORTE_ESTUDIO", e.id)}
                                />
                              )}
                            </div>
                          </li>
                        );
                      })}
                      {datos.estudios.length === 0 && (
                        <li className="text-xs text-slate-500">Sin estudios registrados.</li>
                      )}
                    </ul>
                    {permisos.editarDetalles && (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1 flex-1 min-w-40">
                          <Label
                            htmlFor="est-titulo"
                            className="text-xs font-semibold text-slate-700"
                          >
                            Título / estudio
                          </Label>
                          <Input
                            id="est-titulo"
                            value={estTitulo}
                            maxLength={255}
                            onChange={(e) => setEstTitulo(e.target.value)}
                            className={INPUT}
                          />
                        </div>
                        <div className="space-y-1 flex-1 min-w-40">
                          <Label
                            htmlFor="est-institucion"
                            className="text-xs font-semibold text-slate-700"
                          >
                            Institución (opcional)
                          </Label>
                          <Input
                            id="est-institucion"
                            value={estInstitucion}
                            maxLength={255}
                            onChange={(e) => setEstInstitucion(e.target.value)}
                            className={INPUT}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={agregarEstudio}
                          disabled={!estTitulo.trim()}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Agregar
                        </Button>
                      </div>
                    )}
                  </section>

                  {(puedeVerDocs || permisos.gestionarDocumentos) && (
                    <section className={SECCION} aria-labelledby="det-banco">
                      <h4 id="det-banco" className={TITULO}>
                        Certificado bancario
                      </h4>
                      {certificado ? (
                        <div className="flex items-center gap-2 text-xs text-slate-800">
                          <Paperclip className="h-3 w-3 text-slate-400" />
                          <span>{certificado.nombre}</span>
                          {puedeVerDocs && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => descargar(certificado)}
                            >
                              <Download className="h-3 w-3 mr-1" /> Descargar
                            </Button>
                          )}
                          {permisos.gestionarDocumentos && (
                            <Button
                              size="xs"
                              variant="ghost"
                              aria-label="Eliminar certificado bancario"
                              onClick={() => eliminarDocumento(certificado)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Sin certificado bancario.</p>
                      )}
                      {permisos.gestionarDocumentos && (
                        <SelectorArchivo
                          etiqueta={certificado ? "Reemplazar certificado" : "Adjuntar certificado"}
                          etiquetaAccesible="Adjuntar certificado bancario"
                          onArchivo={(f) => subir(f, "CERTIFICADO_BANCARIO")}
                        />
                      )}
                      <p className="text-[11px] text-slate-400">
                        PDF, PNG, JPG o WEBP de hasta 10 MB. Los archivos son privados.
                      </p>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
