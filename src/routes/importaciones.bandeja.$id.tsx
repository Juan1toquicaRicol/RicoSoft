import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, FileText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import {
  useCorreoBandeja,
  abrirAdjuntoBandeja,
  type ExcepcionBandeja,
} from "@/hooks/use-importaciones-bandeja";
import { useProveedorBusqueda } from "@/hooks/use-proveedores";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { fetchAuth, hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/importaciones/bandeja/$id")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER),
  head: () => ({
    meta: [{ title: "Correo | Bandeja de Importaciones | RicoSoft" }],
  }),
  component: DetalleCorreoBandeja,
});

function DetalleCorreoBandeja() {
  const { id } = useParams({ from: "/importaciones/bandeja/$id" });
  const { user } = useSession();
  return <ContenidoCorreo key={id + "/" + user?.tenantId} id={id} />;
}

function ContenidoCorreo({ id }: { id: string }) {
  const { user } = useSession();
  const puedeResolver = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_RESOLVER);
  const puedeProcesar = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_PROCESAR);

  const { correo, loading, error, resolverExcepcion, reprocesar } = useCorreoBandeja(id);
  const [excepcionActiva, setExcepcionActiva] = useState<ExcepcionBandeja | null>(null);
  const [proveedorId, setProveedorId] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [busquedaOrden, setBusquedaOrden] = useState("");
  const [ordenes, setOrdenes] = useState<{ id: string; numeroOrden: string; estado: string }[]>([]);
  const [buscandoOrdenes, setBuscandoOrdenes] = useState(false);
  const [errorOrdenes, setErrorOrdenes] = useState("");
  const seleccionaOrden = excepcionActiva?.tipo === "ORDEN_NO_IDENTIFICADA";
  const puedeCrear = hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_CREAR);

  useEffect(() => {
    if (!seleccionaOrden) return;
    let vigente = true;
    setBuscandoOrdenes(true);
    setErrorOrdenes("");
    fetchAuth(
      "/importaciones/bandeja/correos/" + id + "/ordenes?q=" + encodeURIComponent(busquedaOrden),
    )
      .then((data) => {
        if (vigente) setOrdenes(data);
      })
      .catch((error) => {
        if (vigente) {
          setOrdenes([]);
          setErrorOrdenes(error.message);
        }
      })
      .finally(() => {
        if (vigente) setBuscandoOrdenes(false);
      });
    return () => {
      vigente = false;
    };
  }, [id, seleccionaOrden, busquedaOrden]);
  const [guardando, setGuardando] = useState(false);
  const {
    opciones: proveedorOpciones,
    loading: buscandoProveedores,
    buscar: buscarProveedores,
  } = useProveedorBusqueda();

  if (loading) {
    return (
      <AppShell title="Correo" description="Cargando...">
        <p className="text-xs text-slate-500">Cargando...</p>
      </AppShell>
    );
  }
  if (error || !correo) {
    return (
      <AppShell title="Correo" description="">
        <p className="text-xs text-red-600">{error || "Correo no encontrado."}</p>
      </AppShell>
    );
  }

  const abrirResolucion = (excepcion: ExcepcionBandeja) => {
    setOrdenId("");
    setProveedorId("");
    setBusquedaOrden("");
    setOrdenes([]);
    setExcepcionActiva(excepcion);
  };

  const handleResolver = async () => {
    if (!excepcionActiva || !(seleccionaOrden ? ordenId : proveedorId)) return;
    setGuardando(true);
    try {
      await resolverExcepcion(
        excepcionActiva.id,
        seleccionaOrden
          ? { accion: "SELECCIONAR_ORDEN", ordenCompraId: ordenId }
          : { accion: "SELECCIONAR_PROVEEDOR", proveedorId },
      );
      toast.success(seleccionaOrden ? "Correo vinculado a la orden." : "Proveedor confirmado.");
      setExcepcionActiva(null);
      setProveedorId("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al resolver la excepción.");
    } finally {
      setGuardando(false);
    }
  };

  const handleDescartar = async (excepcion: ExcepcionBandeja) => {
    try {
      await resolverExcepcion(excepcion.id, { accion: "DESCARTAR" });
      toast.success("Excepción descartada.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al descartar la excepción.");
    }
  };

  const handleReprocesar = async () => {
    try {
      await reprocesar();
      toast.success("Correo reencolado para reprocesamiento.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al reencolar el correo.");
    }
  };

  return (
    <AppShell
      title={correo.asunto}
      description={`${correo.remitente} · ${new Date(correo.fechaRecibido).toLocaleString("es-CO")}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/importaciones"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Importaciones
          </Link>
          <Link
            to="/importaciones/bandeja"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a la Bandeja
          </Link>
          {puedeCrear &&
            puedeResolver &&
            correo.proveedor &&
            !correo.ordenCompra &&
            correo.estadoProcesamiento === "REQUIERE_REVISION" && (
              <Button size="sm" asChild>
                <Link to="/importaciones/nueva" search={{ correoOrigenId: correo.id }}>
                  Crear orden desde el correo
                </Link>
              </Button>
            )}
          {puedeProcesar && correo.estadoProcesamiento === "ERROR" && (
            <Button size="sm" variant="outline" onClick={handleReprocesar} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Reprocesar
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Estado</p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {correo.estadoProcesamiento.replace(/_/g, " ")}
          </p>
        </div>
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Clasificación</p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {correo.clasificacion?.replace(/_/g, " ") ?? "—"}
          </p>
        </div>
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Proveedor</p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {correo.proveedor ? `${correo.proveedor.nombre} (NIT ${correo.proveedor.nit})` : "—"}
          </p>
        </div>
        <div className="panel bg-white border-slate-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-slate-500">Orden relacionada</p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {correo.ordenCompra ? (
              <Link
                to="/importaciones/$id"
                params={{ id: correo.ordenCompra.id }}
                className="underline"
              >
                {correo.ordenCompra.numeroOrden}
              </Link>
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>

      {correo.ultimoError && (
        <div className="mt-4 panel bg-white border-red-200 rounded-lg p-4 shadow-2xs">
          <p className="text-[10px] uppercase font-bold text-red-600">Último error</p>
          <p className="mt-1 text-xs text-red-700">{correo.ultimoError}</p>
        </div>
      )}

      {correo.excepciones.filter((e) => e.estado === "ABIERTA").length > 0 && (
        <div className="mt-4 panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="border-b border-slate-200 p-4 bg-slate-50/80">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" /> Excepciones abiertas
            </h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {correo.excepciones
              .filter((e) => e.estado === "ABIERTA")
              .map((excepcion) => (
                <li key={excepcion.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge
                        variant="outline"
                        className="border-slate-300 bg-slate-50 text-slate-700"
                      >
                        {excepcion.tipo.replace(/_/g, " ")}
                      </Badge>
                      <p className="mt-1.5 text-xs text-slate-700">{excepcion.descripcion}</p>
                    </div>
                    {puedeResolver && (
                      <div className="flex shrink-0 gap-2">
                        {excepcion.tipo === "PROVEEDOR_NO_IDENTIFICADO" && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => abrirResolucion(excepcion)}
                            className="h-7 text-[11px] font-bold"
                          >
                            Seleccionar proveedor
                          </Button>
                        )}
                        {excepcion.tipo === "ORDEN_NO_IDENTIFICADA" &&
                          correo.proveedor &&
                          !correo.ordenCompra && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => abrirResolucion(excepcion)}
                            >
                              Vincular a una orden existente
                            </Button>
                          )}
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleDescartar(excepcion)}
                          className="h-7 text-[11px] font-bold"
                        >
                          Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-4 panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="border-b border-slate-200 p-4 bg-slate-50/80">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Adjuntos</h3>
        </div>
        {correo.adjuntos.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Este correo no tiene adjuntos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {correo.adjuntos.map((adjunto) => (
              <li key={adjunto.id} className="p-4">
                <button
                  type="button"
                  onClick={() => abrirAdjuntoBandeja(correo.id, adjunto.id)}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> {adjunto.nombreOriginal}
                </button>
                <span className="ml-2 text-[11px] text-slate-500">
                  {(adjunto.tamano / 1024).toFixed(0)} KB · {adjunto.estadoExtraccion}
                </span>

                {adjunto.extracciones.length > 0 && (
                  <div className="mt-2 rounded-md border border-slate-200 overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow className="hover:bg-slate-50">
                          <TableHead className="text-[10px] px-2 py-1.5">Campo</TableHead>
                          <TableHead className="text-[10px] px-2 py-1.5">Valor</TableHead>
                          <TableHead className="text-[10px] px-2 py-1.5">Página</TableHead>
                          <TableHead className="text-[10px] px-2 py-1.5">Motor</TableHead>
                          <TableHead className="text-[10px] px-2 py-1.5">Evidencia</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adjunto.extracciones.map((ext) => (
                          <TableRow key={ext.id}>
                            <TableCell className="text-[11px] px-2 py-1.5 font-semibold">
                              {ext.campo}
                            </TableCell>
                            <TableCell className="text-[11px] px-2 py-1.5">
                              {ext.valorExtraido}
                            </TableCell>
                            <TableCell className="text-[11px] px-2 py-1.5">
                              {ext.pagina ?? "—"}
                            </TableCell>
                            <TableCell className="text-[11px] px-2 py-1.5">
                              {ext.motorUsado}
                            </TableCell>
                            <TableCell className="text-[11px] px-2 py-1.5 text-slate-500 max-w-xs truncate">
                              {ext.evidencia}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {correo.cuerpoTexto && (
        <div className="mt-4 panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="border-b border-slate-200 p-4 bg-slate-50/80">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Cuerpo del correo
            </h3>
          </div>
          <pre className="p-4 text-xs text-slate-700 whitespace-pre-wrap break-words">
            {correo.cuerpoTexto}
          </pre>
        </div>
      )}

      <Dialog open={!!excepcionActiva} onOpenChange={(open) => !open && setExcepcionActiva(null)}>
        <DialogContent className="bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold">
              {seleccionaOrden ? "Vincular a una orden existente" : "Seleccionar proveedor"}
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {seleccionaOrden
                ? "Busca una orden del proveedor confirmado por su consecutivo IMP."
                : "Elige el proveedor que corresponde al correo."}
            </DialogDescription>
          </DialogHeader>
          {seleccionaOrden ? (
            <>
              <Combobox
                value={ordenId}
                onValueChange={setOrdenId}
                placeholder="Seleccionar orden"
                searchPlaceholder="Buscar por número IMP"
                emptyText="Ninguna orden coincide."
                onSearchChange={setBusquedaOrden}
                loadingOptions={buscandoOrdenes}
                options={ordenes.map((o) => ({
                  value: o.id,
                  label: o.numeroOrden + " · " + o.estado,
                }))}
                disabled={guardando}
              />
              {errorOrdenes && (
                <p role="alert" className="text-sm text-red-700">
                  {errorOrdenes}
                </p>
              )}
            </>
          ) : (
            <>
              {!!correo.sugerenciasProveedor?.length && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Proveedores sugeridos</p>
                  {correo.sugerenciasProveedor.map((sugerencia) => (
                    <button
                      key={sugerencia.id}
                      type="button"
                      aria-pressed={proveedorId === sugerencia.id}
                      className="block w-full rounded-md border px-3 py-2 text-left text-sm aria-pressed:border-blue-700"
                      onClick={() => setProveedorId(sugerencia.id)}
                      disabled={guardando}
                    >
                      {sugerencia.nombre}
                      <span className="block text-xs text-slate-600">
                        {sugerencia.señales.map((s) => s.campo + " · " + s.detalle).join(" / ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <Combobox
                selectedLabel={
                  correo.sugerenciasProveedor?.find((s) => s.id === proveedorId)?.nombre
                }
                value={proveedorId}
                onValueChange={setProveedorId}
                placeholder="Buscar proveedor por nombre o NIT..."
                searchPlaceholder="Buscar por nombre o NIT..."
                emptyText="Ningún proveedor coincide."
                onSearchChange={buscarProveedores}
                loadingOptions={buscandoProveedores}
                options={proveedorOpciones.map((p) => ({
                  value: p.id,
                  label: `${p.nombre} (NIT ${p.nit})`,
                }))}
              />
            </>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExcepcionActiva(null)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleResolver}
              disabled={guardando || !(seleccionaOrden ? ordenId : proveedorId)}
            >
              {guardando ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
