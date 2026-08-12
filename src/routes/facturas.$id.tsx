import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  DollarSign,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/data";
import { useFacturas, usePollingFacturas } from "@/hooks/use-facturas";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export const Route = createFileRoute("/facturas/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de Factura | RicoSoft" },
      { name: "description", content: "Trazabilidad y aprobación de la factura." },
    ],
  }),
  component: DetalleFactura,
});

function formatearTamano(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DetalleFactura() {
  const { id } = Route.useParams();
  const {
    facturas,
    loading,
    error,
    refresh,
    updateEstadoFactura,
    subirArchivoFactura,
    eliminarArchivoFactura,
    descargarArchivoFactura,
    agregarComentarioFactura,
  } = useFacturas();
  const { user } = useSession();

  // Refresca en segundo plano cada pocos segundos: si otro usuario aprueba,
  // adjunta un documento o comenta la factura, se ve reflejado sin recargar.
  usePollingFacturas(refresh);

  const factura = facturas.find((f) => f.id === id);
  const canManageArchivo = hasPermission(user, PERMISOS_SISTEMA.FACTURAS_CREAR);

  if (loading && !factura) {
    return (
      <AppShell title="Cargando factura..." description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-sm text-muted-foreground">Cargando...</div>
      </AppShell>
    );
  }

  if (!factura) {
    return (
      <AppShell title="Factura no encontrada" description="RicoSoft Contabilidad">
        <div className="panel p-12 text-center text-sm text-muted-foreground">
          <p className="font-semibold text-base mb-2">Factura no registrada</p>
          <p>{error || `No se encontró la factura ${id} en la base de datos de esta empresa.`}</p>
          <Link to="/facturas" className="mt-4 inline-block">
            <Button size="sm">Volver a Facturas</Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const campos = [
    ["Número", factura.numero],
    ["Empresa ID", factura.empresaId],
    ["Proveedor", factura.proveedor],
    ["NIT Proveedor", factura.nit],
    ["Área Responsable", factura.area],
    ["Responsable", factura.responsable],
    ["Fecha de Emisión", factura.fecha],
    ["Vencimiento", factura.vence],
    ["Moneda", factura.moneda],
    ["Prioridad", factura.prioridad],
    ["Origen", factura.origen],
  ];

  const eventosSistema = factura.historial.filter((h) => h.accion !== "Comentario");
  const comentarios = factura.historial.filter((h) => h.accion === "Comentario");

  return (
    <AppShell
      title={`Factura ${factura.numero}`}
      description={`${factura.proveedor} · Empresa ID: ${factura.empresaId}`}
      actions={
        <>
          <Link to="/facturas">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {factura.estado === "Pendiente" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  updateEstadoFactura(factura.id, "Rechazada", "Rechazada en revisión manual").catch(
                    (err: any) => alert(err.message || "Error al rechazar la factura."),
                  )
                }
                className="gap-2 text-slate-900 border-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" /> Rechazar
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  updateEstadoFactura(factura.id, "Aprobada", "Validado correctamente").catch(
                    (err: any) => alert(err.message || "Error al aprobar la factura."),
                  )
                }
                className="gap-2 bg-blue-800 hover:bg-blue-900 text-white"
              >
                <Check className="h-4 w-4" /> Aprobar Factura
              </Button>
            </>
          )}
          {factura.estado === "Aprobada" && (
            <Button
              size="sm"
              onClick={() =>
                updateEstadoFactura(factura.id, "Pagada", "Transferencia procesada").catch(
                  (err: any) => alert(err.message || "Error al registrar el pago."),
                )
              }
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <DollarSign className="h-4 w-4" /> Registrar Pago
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border mb-4">
              <h2 className="text-sm font-semibold">Datos Generales de la Factura</h2>
              <EstadoBadge estado={factura.estado} />
            </div>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {campos.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Subtotal
                </p>
                <p className="num text-base font-semibold">
                  {money(factura.subtotal, factura.moneda)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IVA</p>
                <p className="num text-base font-semibold">{money(factura.iva, factura.moneda)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Total a Pagar
                </p>
                <p className="num text-lg font-bold text-primary">
                  {money(factura.total, factura.moneda)}
                </p>
              </div>
            </div>
          </div>

          <DocumentoFactura
            facturaId={factura.id}
            archivo={factura.archivo}
            canManage={canManageArchivo}
            subirArchivoFactura={subirArchivoFactura}
            eliminarArchivoFactura={eliminarArchivoFactura}
            descargarArchivoFactura={descargarArchivoFactura}
          />

          <ComentariosFactura
            comentarios={comentarios}
            onEnviar={(texto) => agregarComentarioFactura(factura.id, texto)}
          />
        </div>

        <div className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold mb-4">Trazabilidad y Auditoría</h2>
            <ol className="space-y-4">
              {eventosSistema.map((h, i) => (
                <li key={i} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  {i < eventosSistema.length - 1 && (
                    <span className="absolute left-[4.5px] top-5 h-[calc(100%+0.5rem)] w-px bg-border" />
                  )}
                  <p className="text-xs font-semibold">{h.accion}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {h.fecha} · {h.actor}
                  </p>
                  {h.detalle && (
                    <p className="mt-1 text-xs text-muted-foreground italic">{h.detalle}</p>
                  )}
                </li>
              ))}
              {eventosSistema.length === 0 && (
                <li className="text-xs text-muted-foreground">Sin eventos registrados.</li>
              )}
            </ol>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

interface DocumentoFacturaProps {
  facturaId: string;
  archivo: {
    nombre: string;
    mime: string | null;
    tamano: number | null;
    subidoPor: string | null;
    subidoEn: string | null;
  } | null;
  canManage: boolean;
  subirArchivoFactura: (id: string, file: File) => Promise<void>;
  eliminarArchivoFactura: (id: string) => Promise<void>;
  descargarArchivoFactura: (id: string) => Promise<Blob>;
}

function DocumentoFactura({
  facturaId,
  archivo,
  canManage,
  subirArchivoFactura,
  eliminarArchivoFactura,
  descargarArchivoFactura,
}: DocumentoFacturaProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelado = false;
    let urlCreada: string | null = null;

    if (archivo) {
      setCargandoVista(true);
      descargarArchivoFactura(facturaId)
        .then((blob) => {
          if (cancelado) return;
          urlCreada = URL.createObjectURL(blob);
          setBlobUrl(urlCreada);
        })
        .catch(() => {
          if (!cancelado) setBlobUrl(null);
        })
        .finally(() => {
          if (!cancelado) setCargandoVista(false);
        });
    } else {
      setBlobUrl(null);
    }

    return () => {
      cancelado = true;
      if (urlCreada) URL.revokeObjectURL(urlCreada);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facturaId, archivo?.nombre, archivo?.subidoEn]);

  const handleSeleccionArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo("");
    setSubiendo(true);
    try {
      await subirArchivoFactura(facturaId, file);
    } catch (err: any) {
      setErrorArchivo(err.message || "Error al subir el archivo.");
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleEliminar = async () => {
    if (!confirm("¿Eliminar el documento adjunto de esta factura?")) return;
    try {
      await eliminarArchivoFactura(facturaId);
    } catch (err: any) {
      alert(err.message || "Error al eliminar el archivo.");
    }
  };

  const esImagen = archivo?.mime?.startsWith("image/");
  const esPdf = archivo?.mime === "application/pdf";

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Documento Digitalizado</h2>
        {archivo && (
          <div className="flex items-center gap-1.5">
            {blobUrl && (
              <a href={blobUrl} download={archivo.nombre}>
                <Button type="button" variant="outline" size="xs" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Descargar
                </Button>
              </a>
            )}
            {canManage && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1.5"
                  disabled={subiendo}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" /> Reemplazar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="xs"
                  className="gap-1.5"
                  onClick={handleEliminar}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleSeleccionArchivo}
      />

      {!archivo && (
        <div className="mt-4">
          {canManage ? (
            <button
              type="button"
              disabled={subiendo}
              onClick={() => fileInputRef.current?.click()}
              className="grid h-40 w-full place-items-center rounded-lg border border-dashed border-border bg-muted/30 text-center transition-colors hover:bg-muted/50 disabled:opacity-60"
            >
              <div>
                {subiendo ? (
                  <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
                ) : (
                  <Upload className="mx-auto h-7 w-7 text-primary opacity-60" />
                )}
                <p className="mt-2 text-sm font-medium">
                  {subiendo ? "Subiendo archivo..." : "Adjuntar PDF o imagen de la factura"}
                </p>
                <p className="text-xs text-muted-foreground">PDF, PNG, JPG o WEBP · máx. 10MB</p>
              </div>
            </button>
          ) : (
            <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border bg-muted/30 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
                <p className="mt-2 text-sm text-muted-foreground">Sin documento adjunto</p>
              </div>
            </div>
          )}
          {errorArchivo && <p className="mt-2 text-xs font-semibold text-slate-900">{errorArchivo}</p>}
        </div>
      )}

      {archivo && (
        <div className="mt-4">
          <p className="text-xs font-medium flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            {archivo.nombre}
            {archivo.tamano ? (
              <span className="text-muted-foreground">({formatearTamano(archivo.tamano)})</span>
            ) : null}
          </p>
          {archivo.subidoPor && (
            <p className="text-[10px] text-muted-foreground">
              Subido por {archivo.subidoPor}
              {archivo.subidoEn ? ` · ${new Date(archivo.subidoEn).toLocaleString("es-CO")}` : ""}
            </p>
          )}

          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/30">
            {cargandoVista && (
              <div className="grid h-52 place-items-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {!cargandoVista && blobUrl && esPdf && (
              <iframe src={blobUrl} title={archivo.nombre} className="h-[480px] w-full" />
            )}
            {!cargandoVista && blobUrl && esImagen && (
              <img src={blobUrl} alt={archivo.nombre} className="mx-auto max-h-[480px] w-auto" />
            )}
            {!cargandoVista && blobUrl && !esPdf && !esImagen && (
              <div className="grid h-40 place-items-center text-center">
                <div>
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Vista previa no disponible para este tipo de archivo.
                  </p>
                </div>
              </div>
            )}
            {!cargandoVista && !blobUrl && (
              <div className="grid h-40 place-items-center text-center">
                <p className="text-xs text-muted-foreground">
                  No se pudo cargar la vista previa del archivo.
                </p>
              </div>
            )}
          </div>

          {errorArchivo && <p className="mt-2 text-xs font-semibold text-slate-900">{errorArchivo}</p>}
        </div>
      )}
    </div>
  );
}

function ComentariosFactura({
  comentarios,
  onEnviar,
}: {
  comentarios: { fecha: string; actor: string; detalle?: string }[];
  onEnviar: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorComentario, setErrorComentario] = useState("");

  const handleEnviar = async () => {
    const valor = texto.trim();
    if (!valor) return;
    setErrorComentario("");
    setEnviando(true);
    try {
      await onEnviar(valor);
      setTexto("");
    } catch (err: any) {
      setErrorComentario(err.message || "Error al enviar el comentario.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="panel p-5">
      <h2 className="mb-4 flex items-center gap-1.5 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" /> Comentarios
      </h2>

      <div className="space-y-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un comentario para el equipo..."
          rows={2}
          maxLength={2000}
          className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-800"
        />
        <div className="flex items-center justify-between">
          {errorComentario ? (
            <p className="text-xs font-semibold text-slate-900">{errorComentario}</p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="xs"
            disabled={enviando || !texto.trim()}
            onClick={handleEnviar}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" /> {enviando ? "Enviando..." : "Comentar"}
          </Button>
        </div>
      </div>

      <ol className="mt-4 space-y-4 border-t border-border pt-4">
        {comentarios.map((c, i) => (
          <li key={i} className="text-xs">
            <p className="font-semibold">{c.actor}</p>
            <p className="text-[10px] text-muted-foreground">{c.fecha}</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{c.detalle}</p>
          </li>
        ))}
        {comentarios.length === 0 && (
          <li className="text-xs text-muted-foreground">Todavía no hay comentarios.</li>
        )}
      </ol>
    </div>
  );
}
