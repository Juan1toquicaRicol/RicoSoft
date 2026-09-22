import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Film, ImageIcon, Loader2, Paperclip, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  descargarArchivoPublicacion,
  formatTamano,
  type ArchivoPublicacion,
  type Publicacion,
} from "@/hooks/use-publicaciones";

function textoAdjuntos(archivos: ArchivoPublicacion[]) {
  return `${archivos.length} ${archivos.length === 1 ? "adjunto" : "adjuntos"}`;
}

/** Marca discreta para las tarjetas del Inicio: "esta publicación trae archivos". */
export function ChipAdjuntos({ archivos }: { archivos: ArchivoPublicacion[] }) {
  if (archivos.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
      <Paperclip className="h-3 w-3" /> {textoAdjuntos(archivos)}
    </span>
  );
}

/**
 * Los adjuntos solo se sirven por la API autenticada (no hay URL pública), y un
 * <img>/<video> no puede mandar el Bearer: se descargan como Blob y se muestran
 * con una URL local, que se libera al desmontar.
 */
function useArchivoBlobUrl(publicacionId: string, archivoId: string, activo: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    let urlCreada: string | null = null;
    setError(false);
    descargarArchivoPublicacion(publicacionId, archivoId)
      .then((blob) => {
        if (cancelado) return;
        urlCreada = URL.createObjectURL(blob);
        setUrl(urlCreada);
      })
      .catch(() => {
        if (!cancelado) setError(true);
      });
    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
      setUrl(null);
    };
  }, [publicacionId, archivoId, activo]);

  return { url, error };
}

function ImagenAdjunta({
  publicacionId,
  archivo,
}: {
  publicacionId: string;
  archivo: ArchivoPublicacion;
}) {
  const { url, error } = useArchivoBlobUrl(publicacionId, archivo.id, true);

  if (error) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-400">
        No se pudo cargar la imagen
      </div>
    );
  }
  if (!url) {
    return <div className="aspect-video animate-pulse rounded-lg bg-slate-100" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" title={archivo.nombre}>
      <img
        src={url}
        alt={archivo.nombre}
        className="aspect-video w-full rounded-lg border border-slate-200 bg-slate-50 object-cover"
      />
    </a>
  );
}

/** El video solo se descarga cuando el usuario lo pide: pueden pesar decenas de MB. */
function VideoAdjunto({
  publicacionId,
  archivo,
}: {
  publicacionId: string;
  archivo: ArchivoPublicacion;
}) {
  const [solicitado, setSolicitado] = useState(false);
  const { url, error } = useArchivoBlobUrl(publicacionId, archivo.id, solicitado);

  if (url) {
    return (
      <video
        src={url}
        controls
        autoPlay
        className="aspect-video w-full rounded-lg border border-slate-200 bg-black"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setSolicitado(true)}
      disabled={solicitado && !error}
      className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:cursor-wait"
    >
      {solicitado && !error ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <Play className="h-6 w-6" />
      )}
      <span className="max-w-full truncate px-3 text-xs font-semibold">{archivo.nombre}</span>
      <span className="text-[11px] text-slate-300">
        {error ? "No se pudo cargar. Reintentar" : `Reproducir · ${formatTamano(archivo.tamano)}`}
      </span>
    </button>
  );
}

function DocumentoAdjunto({
  publicacionId,
  archivo,
}: {
  publicacionId: string;
  archivo: ArchivoPublicacion;
}) {
  const [descargando, setDescargando] = useState(false);

  const abrir = async () => {
    setDescargando(true);
    try {
      const blob = await descargarArchivoPublicacion(publicacionId, archivo.id);
      const url = URL.createObjectURL(blob);
      if (archivo.mime === "application/pdf") {
        window.open(url, "_blank");
      } else {
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = archivo.nombre;
        enlace.click();
      }
      // El navegador ya tomó el archivo; se libera la URL un poco después.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir el documento.");
    } finally {
      setDescargando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={descargando}
      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-blue-400 hover:bg-white disabled:cursor-wait"
    >
      <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
        {descargando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{archivo.nombre}</p>
        <p className="text-[11px] text-slate-400">{formatTamano(archivo.tamano)}</p>
      </div>
    </button>
  );
}

/** Fotos en cuadrícula, luego videos y al final los documentos. */
export function ListaArchivos({
  publicacionId,
  archivos,
}: {
  publicacionId: string;
  archivos: ArchivoPublicacion[];
}) {
  const imagenes = archivos.filter((a) => a.tipo === "IMAGEN");
  const videos = archivos.filter((a) => a.tipo === "VIDEO");
  const documentos = archivos.filter((a) => a.tipo === "DOCUMENTO");

  return (
    <div className="space-y-3">
      {imagenes.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {imagenes.map((a) => (
            <ImagenAdjunta key={a.id} publicacionId={publicacionId} archivo={a} />
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid gap-2">
          {videos.map((a) => (
            <VideoAdjunto key={a.id} publicacionId={publicacionId} archivo={a} />
          ))}
        </div>
      )}
      {documentos.length > 0 && (
        <div className="grid gap-2">
          {documentos.map((a) => (
            <DocumentoAdjunto key={a.id} publicacionId={publicacionId} archivo={a} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Ícono por tipo de archivo, para listados compactos (formulario de admin). */
export function IconoTipoArchivo({ tipo }: { tipo: ArchivoPublicacion["tipo"] }) {
  if (tipo === "IMAGEN") return <ImageIcon className="h-4 w-4 text-slate-500" />;
  if (tipo === "VIDEO") return <Film className="h-4 w-4 text-slate-500" />;
  return <FileText className="h-4 w-4 text-slate-500" />;
}

/** Detalle completo de una publicación del Inicio: texto entero + adjuntos. */
export function PublicacionDetalleDialog({
  publicacion,
  onOpenChange,
}: {
  publicacion: Publicacion | null;
  onOpenChange: (abierto: boolean) => void;
}) {
  return (
    <Dialog open={publicacion !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {publicacion && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                  {publicacion.tipo}
                </Badge>
                <span className="text-[11px] text-slate-400">
                  {new Date(publicacion.fechaEvento ?? publicacion.fechaPublicacion).toLocaleString(
                    "es-CO",
                    {
                      dateStyle: "long",
                      ...(publicacion.fechaEvento ? { timeStyle: "short" } : {}),
                    },
                  )}
                </span>
              </div>
              <DialogTitle className="text-left">{publicacion.titulo}</DialogTitle>
              <DialogDescription className="sr-only">
                Detalle de la publicación y sus archivos adjuntos.
              </DialogDescription>
            </DialogHeader>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{publicacion.contenido}</p>
            {publicacion.autorNombre && (
              <p className="text-[11px] text-slate-400">Publicado por {publicacion.autorNombre}</p>
            )}
            {publicacion.archivos.length > 0 && (
              <ListaArchivos publicacionId={publicacion.id} archivos={publicacion.archivos} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
