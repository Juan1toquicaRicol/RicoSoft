import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Megaphone,
  Plus,
  Search,
  Send,
  Eye,
  Trash2,
  Globe2,
  Building2,
  Paperclip,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import {
  usePublicacionesAdmin,
  type PublicacionAdmin,
  type CategoriaPublicacion,
  type EstadoPublicacion,
  type AlcancePublicacion,
  type DatosPublicacion,
  type ArchivoPublicacion,
  formatTamano,
} from "@/hooks/use-publicaciones";
import {
  ChipAdjuntos,
  IconoTipoArchivo,
  ListaArchivos,
} from "@/components/publicaciones/archivos-publicacion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/configuracion/publicaciones")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR),
  head: () => ({
    meta: [
      { title: "Publicaciones | RicoSoft" },
      {
        name: "description",
        content: "Gestiona las novedades, avisos y eventos que aparecen en el Inicio.",
      },
    ],
  }),
  component: PublicacionesConfigPage,
});

const CATEGORIA_LABEL: Record<CategoriaPublicacion, string> = {
  NOVEDAD: "Novedad",
  AVISO: "Aviso",
  EVENTO: "Evento",
};

const ESTADO_LABEL: Record<EstadoPublicacion, string> = {
  PROGRAMADA: "Programada",
  PUBLICADA: "Publicada",
  DESACTIVADA: "Desactivada",
  VENCIDA: "Vencida",
};

const ESTADO_ESTILO: Record<EstadoPublicacion, string> = {
  PROGRAMADA: "border-slate-300 bg-slate-100 text-slate-700",
  PUBLICADA: "border-blue-200 bg-blue-50 text-blue-800",
  DESACTIVADA: "border-transparent bg-slate-900 text-white",
  VENCIDA: "border-slate-300 bg-white text-slate-500",
};

function formatFecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** ISO -> valor para <input type="datetime-local">, en hora local. */
function isoParaInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SENTINEL_TODAS = "TODAS";

// Mismas reglas que el backend (upload.middleware.ts): el servidor es quien
// manda, esto solo evita subir 80 MB para enterarse de un rechazo.
const MAX_ARCHIVOS_POR_PUBLICACION = 20;
const MAX_BYTES_VIDEO = 100 * 1024 * 1024;
const MAX_BYTES_OTROS = 25 * 1024 * 1024;
const ACCEPT_ARCHIVOS =
  "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const MIME_DOCUMENTOS = [
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

function tipoDeArchivoLocal(archivo: File): ArchivoPublicacion["tipo"] | null {
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(archivo.type))
    return "IMAGEN";
  if (["video/mp4", "video/webm", "video/quicktime"].includes(archivo.type)) return "VIDEO";
  if (MIME_DOCUMENTOS.includes(archivo.type)) return "DOCUMENTO";
  return null;
}

/** Devuelve el motivo del rechazo, o null si el archivo es válido. */
function motivoRechazoArchivo(archivo: File): string | null {
  const tipo = tipoDeArchivoLocal(archivo);
  if (!tipo) return `"${archivo.name}": tipo no permitido.`;
  if (tipo === "VIDEO" && archivo.size > MAX_BYTES_VIDEO) {
    return `"${archivo.name}" supera los 100 MB permitidos para video.`;
  }
  if (tipo !== "VIDEO" && archivo.size > MAX_BYTES_OTROS) {
    return `"${archivo.name}" supera los 25 MB permitidos para fotos y documentos.`;
  }
  return null;
}

function PublicacionesConfigPage() {
  const { user: sesion } = useSession();
  const esSuperadmin = Boolean(sesion?.isSuperadmin);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaPublicacion | "">("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPublicacion | "">("");
  const [alcanceFiltro, setAlcanceFiltro] = useState<AlcancePublicacion | "">("");

  const {
    publicaciones,
    loading,
    error,
    crear,
    actualizar,
    publicarAhora,
    cambiarActivo,
    subirArchivos,
    eliminarArchivo,
    eliminar,
  } = usePublicacionesAdmin({
    q: busqueda,
    categoria: categoriaFiltro || undefined,
    estado: estadoFiltro || undefined,
    alcance: alcanceFiltro || undefined,
  });

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<PublicacionAdmin | null>(null);
  const [aEliminar, setAEliminar] = useState<PublicacionAdmin | null>(null);
  const [enVistaPrevia, setEnVistaPrevia] = useState<PublicacionAdmin | null>(null);

  const abrirCrear = () => {
    setEditando(null);
    setFormAbierto(true);
  };
  const abrirEditar = (p: PublicacionAdmin) => {
    setEditando(p);
    setFormAbierto(true);
  };

  const handlePublicar = async (p: PublicacionAdmin) => {
    try {
      await publicarAhora(p.id);
      toast.success(`"${p.titulo}" publicada.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al publicar.");
    }
  };

  const handleToggleActivo = async (p: PublicacionAdmin) => {
    try {
      await cambiarActivo(p.id, !p.activo);
      toast.success(p.activo ? `"${p.titulo}" desactivada.` : `"${p.titulo}" activada.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el estado.");
    }
  };

  const handleEliminar = async () => {
    if (!aEliminar) return;
    try {
      await eliminar(aEliminar.id);
      toast.success(`"${aEliminar.titulo}" eliminada.`);
      setAEliminar(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar.");
    }
  };

  const sinFiltrosActivos = !busqueda.trim() && !categoriaFiltro && !estadoFiltro && !alcanceFiltro;
  const sinResultados = !loading && publicaciones.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
            <Megaphone className="h-6 w-6 text-blue-600" />
            Publicaciones
          </h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Gestiona las comunicaciones y novedades que aparecen en el inicio de RicoSoft.
          </p>
        </div>
        <Button size="sm" onClick={abrirCrear} className="shrink-0 gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Nueva publicación
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar publicaciones..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select
          value={categoriaFiltro || SENTINEL_TODAS}
          onValueChange={(v) =>
            setCategoriaFiltro(v === SENTINEL_TODAS ? "" : (v as CategoriaPublicacion))
          }
        >
          <SelectTrigger className="h-9 w-44 text-xs">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_TODAS}>Todas las categorías</SelectItem>
            {Object.entries(CATEGORIA_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={estadoFiltro || SENTINEL_TODAS}
          onValueChange={(v) =>
            setEstadoFiltro(v === SENTINEL_TODAS ? "" : (v as EstadoPublicacion))
          }
        >
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_TODAS}>Todos los estados</SelectItem>
            {Object.entries(ESTADO_LABEL).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={alcanceFiltro || SENTINEL_TODAS}
          onValueChange={(v) =>
            setAlcanceFiltro(v === SENTINEL_TODAS ? "" : (v as AlcancePublicacion))
          }
        >
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder="Alcance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SENTINEL_TODAS}>Todo alcance</SelectItem>
            <SelectItem value="TENANT">Esta empresa</SelectItem>
            <SelectItem value="GENERAL">General</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm font-semibold text-slate-900">{error}</p>}

      {sinResultados ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-2xs">
          <p className="text-sm font-bold text-slate-700">
            {sinFiltrosActivos ? "Sin publicaciones" : "No hay resultados para estos filtros"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {sinFiltrosActivos
              ? "Las comunicaciones que publiques aquí aparecerán en el inicio de RicoSoft."
              : "Prueba con otra búsqueda o quita alguno de los filtros."}
          </p>
          {sinFiltrosActivos && (
            <Button size="sm" onClick={abrirCrear} className="mt-4 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Crear publicación
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Publicación</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-6 text-center text-sm text-slate-500">
                    Cargando publicaciones...
                  </TableCell>
                </TableRow>
              ) : (
                publicaciones.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => abrirEditar(p)}
                        className="text-left font-semibold text-slate-800 hover:text-blue-700 hover:underline"
                      >
                        {p.titulo}
                      </button>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{p.tipo}</span>
                        <ChipAdjuntos archivos={p.archivos} />
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{CATEGORIA_LABEL[p.categoria]}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ESTADO_ESTILO[p.estado]}>
                        {ESTADO_LABEL[p.estado]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.alcance === "GENERAL" ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          <Globe2 className="h-3 w-3" /> General
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="gap-1 border-slate-200 bg-slate-50 text-slate-600"
                        >
                          <Building2 className="h-3 w-3" /> Esta empresa
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatFecha(p.fechaPublicacion)}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatFecha(p.fechaVencimiento)}
                    </TableCell>
                    <TableCell className="text-slate-600">{formatFecha(p.fechaEvento)}</TableCell>
                    <TableCell className="space-x-1.5 whitespace-nowrap text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 px-2"
                        onClick={() => setEnVistaPrevia(p)}
                        title="Vista previa"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {p.estado !== "PUBLICADA" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 px-2"
                          onClick={() => handlePublicar(p)}
                          title="Publicar ahora"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleToggleActivo(p)}
                      >
                        {p.activo ? "Desactivar" : "Activar"}
                      </Button>
                      <button
                        onClick={() => setAEliminar(p)}
                        className="rounded-md p-1.5 align-middle text-slate-400 transition-colors hover:bg-slate-900 hover:text-white"
                        title="Eliminar publicación"
                      >
                        <Trash2 className="inline h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <FormularioPublicacion
        abierto={formAbierto}
        onOpenChange={setFormAbierto}
        // La lista se refresca tras cada cambio: se lee de ahí (y no del
        // objeto capturado al abrir) para ver los adjuntos ya actualizados.
        publicacion={
          editando ? (publicaciones.find((p) => p.id === editando.id) ?? editando) : null
        }
        esSuperadmin={esSuperadmin}
        onGuardar={async (datos, { nuevos, quitar }) => {
          if (editando) {
            await actualizar(editando.id, datos);
            for (const archivoId of quitar) await eliminarArchivo(editando.id, archivoId);
            if (nuevos.length > 0) await subirArchivos(editando.id, nuevos);
            toast.success("Publicación actualizada.");
          } else {
            const creada = await crear(datos);
            if (nuevos.length > 0) {
              try {
                await subirArchivos(creada.id, nuevos);
              } catch (err: unknown) {
                // La publicación ya existe: no se pierde el trabajo, se avisa
                // y se cierra para que el usuario la edite y reintente.
                toast.error(
                  `Publicación creada, pero no se subieron los archivos: ${
                    err instanceof Error ? err.message : "error desconocido"
                  }. Edítala para volver a intentarlo.`,
                );
                setFormAbierto(false);
                return;
              }
            }
            toast.success("Publicación creada.");
          }
          setFormAbierto(false);
        }}
      />

      <VistaPrevia publicacion={enVistaPrevia} onOpenChange={(v) => !v && setEnVistaPrevia(null)} />

      <AlertDialog open={aEliminar !== null} onOpenChange={(v) => !v && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar publicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción elimina permanentemente "{aEliminar?.titulo}". Si solo quieres que deje de
              verse en el inicio, usa "Desactivar" en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleEliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FormularioPublicacion({
  abierto,
  onOpenChange,
  publicacion,
  esSuperadmin,
  onGuardar,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  publicacion: PublicacionAdmin | null;
  esSuperadmin: boolean;
  onGuardar: (
    datos: DatosPublicacion,
    archivos: { nuevos: File[]; quitar: string[] },
  ) => Promise<void>;
}) {
  const esEdicion = publicacion !== null;
  // key en el Dialog (más abajo) remonta este formulario en cada apertura,
  // así que useState con el valor inicial calculado aquí ya refleja siempre
  // la publicación correcta sin necesitar un useEffect de sincronización.
  const [categoria, setCategoria] = useState<CategoriaPublicacion>(
    publicacion?.categoria ?? "NOVEDAD",
  );
  const [tipo, setTipo] = useState(publicacion?.tipo ?? "");
  const [titulo, setTitulo] = useState(publicacion?.titulo ?? "");
  const [contenido, setContenido] = useState(publicacion?.contenido ?? "");
  const [fechaPublicacion, setFechaPublicacion] = useState(
    isoParaInput(publicacion?.fechaPublicacion),
  );
  const [fechaVencimiento, setFechaVencimiento] = useState(
    isoParaInput(publicacion?.fechaVencimiento),
  );
  const [fechaEvento, setFechaEvento] = useState(isoParaInput(publicacion?.fechaEvento));
  const [alcance, setAlcance] = useState<AlcancePublicacion>(publicacion?.alcance ?? "TENANT");
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [archivosNuevos, setArchivosNuevos] = useState<File[]>([]);
  const [archivosAQuitar, setArchivosAQuitar] = useState<string[]>([]);
  const inputArchivosRef = useRef<HTMLInputElement>(null);

  const archivosExistentes = publicacion?.archivos ?? [];
  const totalArchivos = archivosExistentes.length - archivosAQuitar.length + archivosNuevos.length;

  const agregarArchivos = (seleccion: FileList | null) => {
    if (!seleccion) return;
    const aceptados: File[] = [];
    for (const archivo of Array.from(seleccion)) {
      const motivo = motivoRechazoArchivo(archivo);
      if (motivo) {
        toast.error(motivo);
        continue;
      }
      aceptados.push(archivo);
    }
    if (totalArchivos + aceptados.length > MAX_ARCHIVOS_POR_PUBLICACION) {
      toast.error(`Una publicación admite hasta ${MAX_ARCHIVOS_POR_PUBLICACION} archivos.`);
      return;
    }
    setArchivosNuevos((prev) => [...prev, ...aceptados]);
    // Permite volver a elegir el mismo archivo tras quitarlo.
    if (inputArchivosRef.current) inputArchivosRef.current.value = "";
  };

  const alternarQuitar = (archivoId: string) =>
    setArchivosAQuitar((prev) =>
      prev.includes(archivoId) ? prev.filter((id) => id !== archivoId) : [...prev, archivoId],
    );

  // Un publicación GENERAL solo la puede editar/crear un superadmin (misma
  // regla que el backend) — si el usuario actual no lo es y la publicación
  // que se está editando ya es GENERAL, el campo queda fijo, no editable.
  const alcanceBloqueado = esEdicion && publicacion!.alcance === "GENERAL" && !esSuperadmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !tipo.trim() || !contenido.trim()) {
      toast.error("Título, tipo y contenido son obligatorios.");
      return;
    }
    if (categoria === "EVENTO" && !fechaEvento) {
      toast.error("La fecha del evento es obligatoria para la categoría Evento.");
      return;
    }
    setGuardando(true);
    try {
      await onGuardar(
        {
          categoria,
          tipo: tipo.trim(),
          titulo: titulo.trim(),
          contenido: contenido.trim(),
          fechaPublicacion: fechaPublicacion ? new Date(fechaPublicacion).toISOString() : undefined,
          fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento).toISOString() : null,
          fechaEvento: fechaEvento ? new Date(fechaEvento).toISOString() : null,
          ...(esEdicion ? {} : { alcance }),
        },
        { nuevos: archivosNuevos, quitar: archivosAQuitar },
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar la publicación.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent
        key={publicacion?.id ?? "nueva"}
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{esEdicion ? "Editar publicación" : "Nueva publicación"}</DialogTitle>
          <DialogDescription>
            {esEdicion
              ? "Los cambios se reflejan en el Inicio de los usuarios autorizados a verla."
              : "Se publicará en el Inicio de los usuarios de tu empresa (o de todo el grupo, si eliges alcance General)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Categoría *</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as CategoriaPublicacion)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIA_LABEL).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tipo *</Label>
              <Input
                required
                placeholder="Ej: Comunicado, Seguridad, Sistemas..."
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Título *</Label>
            <Input
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Contenido *</Label>
            <Textarea
              required
              rows={5}
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Fecha de publicación</Label>
              <Input
                type="datetime-local"
                value={fechaPublicacion}
                onChange={(e) => setFechaPublicacion(e.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Vacío = se publica de inmediato. Una fecha futura la programa: no se verá en el
                Inicio hasta esa fecha.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Vencimiento</Label>
              <Input
                type="datetime-local"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-slate-400">Opcional. Deja de verse al cumplirse.</p>
            </div>
          </div>

          {categoria === "EVENTO" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Fecha del evento *</Label>
              <Input
                type="datetime-local"
                required
                value={fechaEvento}
                onChange={(e) => setFechaEvento(e.target.value)}
                className="h-9 max-w-xs text-sm"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-slate-700">
                Archivos adjuntos{" "}
                <span className="font-normal text-slate-400">
                  ({totalArchivos}/{MAX_ARCHIVOS_POR_PUBLICACION})
                </span>
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={() => inputArchivosRef.current?.click()}
              >
                <Paperclip className="h-3.5 w-3.5" /> Agregar archivos
              </Button>
              <input
                ref={inputArchivosRef}
                type="file"
                multiple
                accept={ACCEPT_ARCHIVOS}
                onChange={(e) => agregarArchivos(e.target.files)}
                className="hidden"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Fotos (PNG, JPG, WEBP, GIF), videos (MP4, WEBM, MOV) y documentos (PDF, Word, Excel,
              PowerPoint). Hasta 100 MB por video y 25 MB por foto o documento.
            </p>

            {(archivosExistentes.length > 0 || archivosNuevos.length > 0) && (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {archivosExistentes.map((a) => {
                  const quitando = archivosAQuitar.includes(a.id);
                  return (
                    <li key={a.id} className="flex items-center gap-2.5 px-3 py-2">
                      <IconoTipoArchivo tipo={a.tipo} />
                      <span
                        className={`min-w-0 flex-1 truncate text-xs ${quitando ? "text-slate-400 line-through" : "text-slate-700"}`}
                      >
                        {a.nombre}
                      </span>
                      <span className="text-[11px] text-slate-400">{formatTamano(a.tamano)}</span>
                      <button
                        type="button"
                        onClick={() => alternarQuitar(a.id)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 hover:underline"
                      >
                        {quitando ? "Deshacer" : "Quitar"}
                      </button>
                    </li>
                  );
                })}
                {archivosNuevos.map((archivo, i) => (
                  <li key={`${archivo.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                    <IconoTipoArchivo tipo={tipoDeArchivoLocal(archivo) ?? "DOCUMENTO"} />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                      {archivo.name}
                    </span>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                      Nuevo
                    </Badge>
                    <span className="text-[11px] text-slate-400">{formatTamano(archivo.size)}</span>
                    <button
                      type="button"
                      onClick={() => setArchivosNuevos((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                      title="Quitar archivo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Alcance</Label>
            {esEdicion ? (
              <p className="text-sm text-slate-600">
                {publicacion!.alcance === "GENERAL"
                  ? "General (todas las empresas)"
                  : "Esta empresa"}
                <span className="ml-1 text-[11px] text-slate-400">
                  — el alcance no se puede cambiar después de creada.
                </span>
              </p>
            ) : (
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="alcance-publicacion"
                    checked={alcance === "TENANT"}
                    onChange={() => setAlcance("TENANT")}
                    className="accent-blue-600"
                  />
                  Solo esta empresa
                </label>
                <label
                  className={`flex items-center gap-1.5 ${esSuperadmin ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                  title={
                    esSuperadmin
                      ? undefined
                      : "Solo un superadministrador puede publicar contenido general."
                  }
                >
                  <input
                    type="radio"
                    name="alcance-publicacion"
                    checked={alcance === "GENERAL"}
                    disabled={!esSuperadmin}
                    onChange={() => setAlcance("GENERAL")}
                    className="accent-blue-600"
                  />
                  General — todas las empresas del grupo
                </label>
              </div>
            )}
          </div>

          {alcanceBloqueado && (
            <p className="text-[11px] text-slate-400">
              Esta publicación es General: solo un superadministrador puede editarla.
            </p>
          )}

          <button
            type="button"
            onClick={() => setMostrarPreview((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline"
          >
            <Eye className="h-3.5 w-3.5" /> {mostrarPreview ? "Ocultar" : "Ver"} vista previa
          </button>

          {mostrarPreview && (
            <TarjetaPreview
              categoria={categoria}
              tipo={tipo || "Tipo"}
              titulo={titulo || "Título de la publicación"}
              contenido={contenido || "El contenido aparecerá aquí."}
              fechaPublicacion={fechaPublicacion ? new Date(fechaPublicacion).toISOString() : null}
              fechaEvento={fechaEvento ? new Date(fechaEvento).toISOString() : null}
              alcance={esEdicion ? publicacion!.alcance : alcance}
            />
          )}

          <DialogFooter>
            <Button type="submit" disabled={guardando || alcanceBloqueado}>
              {guardando
                ? archivosNuevos.length > 0
                  ? "Guardando y subiendo archivos..."
                  : "Guardando..."
                : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Igual composición visual que las tarjetas del Home (Megaphone/Info/Calendar
 * por categoría) para que la vista previa realmente se parezca a lo que verá
 * el usuario — sin ejecutar ninguna publicación, es puramente visual. */
function TarjetaPreview({
  categoria,
  tipo,
  titulo,
  contenido,
  fechaPublicacion,
  fechaEvento,
  alcance,
}: {
  categoria: CategoriaPublicacion;
  tipo: string;
  titulo: string;
  contenido: string;
  fechaPublicacion: string | null;
  fechaEvento: string | null;
  alcance: AlcancePublicacion;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        Vista previa · Sección "
        {categoria === "NOVEDAD"
          ? "Novedades de la organización"
          : categoria === "AVISO"
            ? "Información importante"
            : "Próximos eventos"}
        "
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
            {tipo}
          </Badge>
          <span className="text-[11px] text-slate-400">
            {categoria === "EVENTO" ? formatFecha(fechaEvento) : formatFecha(fechaPublicacion)}
          </span>
          <span className="text-[11px] text-slate-400">
            · {alcance === "GENERAL" ? "Todo el grupo" : "Esta empresa"}
          </span>
        </div>
        <h3 className="mt-1.5 text-sm font-bold text-slate-900">{titulo}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{contenido}</p>
      </div>
    </div>
  );
}

function VistaPrevia({
  publicacion,
  onOpenChange,
}: {
  publicacion: PublicacionAdmin | null;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={publicacion !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vista previa</DialogTitle>
          <DialogDescription>Así se ve aproximadamente en el Inicio.</DialogDescription>
        </DialogHeader>
        {publicacion && (
          <TarjetaPreview
            categoria={publicacion.categoria}
            tipo={publicacion.tipo}
            titulo={publicacion.titulo}
            contenido={publicacion.contenido}
            fechaPublicacion={publicacion.fechaPublicacion}
            fechaEvento={publicacion.fechaEvento}
            alcance={publicacion.alcance}
          />
        )}
        {publicacion && publicacion.archivos.length > 0 && (
          <ListaArchivos publicacionId={publicacion.id} archivos={publicacion.archivos} />
        )}
      </DialogContent>
    </Dialog>
  );
}
