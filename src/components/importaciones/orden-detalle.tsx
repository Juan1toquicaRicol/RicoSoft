import { AlertTriangle, CheckCircle2, Circle, Clock } from "lucide-react";

import { Badge, EstadoBadge } from "@/components/ui/badge";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";
import { ETIQUETA_RESPONSABLE_TIPO, type OrdenCompraIntl } from "@/hooks/use-importaciones";
import { useCatalogo } from "@/hooks/use-catalogos";

function formatearFechaUTC(valor: string | Date): string {
  const fecha = new Date(valor);
  const dia = String(fecha.getUTCDate()).padStart(2, "0");
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const anio = fecha.getUTCFullYear();
  return `${dia}/${mes}/${anio}`;
}

/* ------------------------------------------------------------------ */
/* 1. HEADER / CENTRO DE CONTROL                                       */
/* ------------------------------------------------------------------ */

function Dato({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-900">{value}</p>
      {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function ImportacionHeader({ orden }: { orden: OrdenCompraIntl }) {
  const atencion = orden.situacionActual.atencion;
  return (
    <div
      className={cn(
        "panel rounded-lg border p-5 shadow-2xs",
        atencion ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Orden</p>
            <p className="text-lg font-extrabold text-slate-900">{orden.codigo}</p>
            {orden.numeroOrden !== orden.codigo && (
              <p className="text-[11px] text-slate-500">{orden.numeroOrden}</p>
            )}
          </div>
          <div className="h-10 w-px bg-slate-200 hidden sm:block" />
          <Dato label="Proveedor" value={orden.proveedorExtranjero} sub={orden.paisOrigen} />
          <div className="h-10 w-px bg-slate-200 hidden sm:block" />
          <Dato
            label="Responsable"
            value={orden.responsable?.nombre ?? orden.situacionActual.responsable ?? "—"}
          />
          <div className="h-10 w-px bg-slate-200 hidden sm:block" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado</p>
            <div className="mt-0.5">
              <EstadoBadge estado={orden.estado} />
            </div>
          </div>
        </div>

        {(orden.situacionActual.proximaAccion || atencion) && (
          <div
            className={cn(
              "rounded-md border px-3 py-2",
              atencion ? "border-amber-300 bg-amber-100/60" : "border-blue-200 bg-blue-50",
            )}
          >
            <p
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider",
                atencion ? "text-amber-700" : "text-blue-700",
              )}
            >
              {atencion ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {atencion ? "Atención" : "Próxima acción"}
            </p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">
              {atencion || orden.situacionActual.proximaAccion}
            </p>
            {atencion && orden.situacionActual.diasRetraso != null && (
              <p className="text-[11px] text-amber-700">
                {orden.situacionActual.diasRetraso} día(s) de retraso
              </p>
            )}
            {atencion && orden.situacionActual.proximaAccion && (
              <p className="mt-1 text-[11px] text-slate-600">
                Próxima acción: {orden.situacionActual.proximaAccion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. RESUMEN EJECUTIVO                                                */
/* ------------------------------------------------------------------ */

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">{titulo}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">{children}</dl>
    </div>
  );
}

function Campo({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-bold text-slate-900" title={sub}>
        {value}
      </dd>
      {sub && <p className="truncate text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function ImportacionResumen({ orden }: { orden: OrdenCompraIntl }) {
  const pesoTotal = orden.items.reduce((acc, it) => acc + (it.pesoKg ?? 0), 0);
  const lotesConEta = orden.lotes.filter((l) => l.fechaLlegadaEstimada || l.tracking.etaActual);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Bloque titulo="Operación">
        <Campo
          label="Fecha de la orden"
          value={orden.fechaOrden ? formatearFechaUTC(orden.fechaOrden) : "—"}
        />
        <Campo label="Proveedor" value={orden.proveedorExtranjero} />
        <Campo label="Responsable" value={orden.responsable?.nombre ?? "—"} />
        <Campo label="País de origen" value={orden.paisOrigen} />
      </Bloque>

      <Bloque titulo="Comercial">
        <Campo label="Moneda" value={orden.moneda} />
        <Campo label="FOB total" value={money(orden.valorEstimadoTotal, orden.moneda)} />
        <Campo
          label="TRM pactada"
          value={orden.trmPactada.toLocaleString("es-CO")}
          sub={
            orden.tasaCambioFecha
              ? `${formatearFechaUTC(orden.tasaCambioFecha)}${orden.tasaCambioFuente ? ` · ${orden.tasaCambioFuente}` : ""}`
              : undefined
          }
        />
        <Campo label="Incoterm" value={orden.incoterm} sub={orden.lugarPactado ?? undefined} />
        <Campo
          label="Forma / condición de pago"
          value={orden.formaPago ?? "—"}
          sub={orden.condicionPago ?? undefined}
        />
        {orden.detallePago && (
          <div className="col-span-2">
            <dt className="text-[10px] uppercase font-semibold text-slate-500">Detalle de pago</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-[11px] text-slate-700">
              {orden.detallePago}
            </dd>
          </div>
        )}
      </Bloque>

      <Bloque titulo="Logística">
        <Campo
          label="Fecha requerida de llegada"
          value={orden.fechaRequeridaLlegada ? formatearFechaUTC(orden.fechaRequeridaLlegada) : "—"}
        />
        <Campo
          label="Peso total"
          value={pesoTotal > 0 ? `${pesoTotal.toLocaleString("es-CO")} kg` : "—"}
        />
        <Campo label="Cantidad de ítems" value={orden.items.length} />
        <Campo
          label="Embarque / ETA"
          value={orden.lotes.length === 0 ? "Sin lotes" : `${orden.lotes.length} lote(s)`}
          sub={
            lotesConEta.length > 0
              ? lotesConEta
                  .map(
                    (l) =>
                      `${l.blAwb}: ${
                        l.tracking.etaActual
                          ? new Date(l.tracking.etaActual).toLocaleDateString("es-CO")
                          : l.fechaLlegadaEstimada
                            ? new Date(l.fechaLlegadaEstimada).toLocaleDateString("es-CO")
                            : "—"
                      }`,
                  )
                  .join(" · ")
              : undefined
          }
        />
      </Bloque>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. PROGRESO DE LA IMPORTACIÓN                                       */
/* ------------------------------------------------------------------ */

type EstadoEtapaVisual = "completada" | "actual" | "pendiente" | "novedad";

interface EtapaVisual {
  nombre: string;
  estado: EstadoEtapaVisual;
}

/**
 * Deriva el progreso PURAMENTE a partir de datos ya cargados en memoria
 * (orden.estado, lote.estado, lote.expediente.estado, orden.pagos) — no
 * introduce ninguna máquina de estados nueva en backend, solo interpreta lo
 * que ya existe para pintar un avance visual aproximado.
 */
function derivarEtapas(orden: OrdenCompraIntl): EtapaVisual[] {
  const hayNovedadAbierta = orden.novedades.some((n) => n.estado !== "Resuelta");
  const lotes = orden.lotes;

  const ordenConfirmada = orden.estado !== "Borrador";
  const hayLotes = lotes.length > 0;
  const estadosTransito: string[] = [
    "En puerto",
    "En inspección",
    "Liberado pre-compra",
    "Nacionalizado",
  ];
  const algunEnTransitoOMas = lotes.some(
    (l) => estadosTransito.includes(l.estado) || l.estado === "En tránsito",
  );
  const algunPasoTransito = lotes.some((l) => estadosTransito.includes(l.estado));
  const algunLevantado = lotes.some((l) => l.expediente?.estado === "Levantado");
  const algunNacionalizado = lotes.some((l) => l.estado === "Nacionalizado");
  const hayPagos = orden.pagos.length > 0;
  const todosPagosPagados =
    hayPagos && orden.pagos.every((p) => p.estado === "Pagado" || p.estado === "Anulado");
  const cerrada = orden.estado === "Cerrada";
  const anulada = orden.estado === "Anulada";

  const marcar = (completada: boolean, actual: boolean): EstadoEtapaVisual => {
    if (anulada) return completada ? "completada" : "pendiente";
    if (completada) return "completada";
    if (actual) return "actual";
    return "pendiente";
  };

  const etapas: EtapaVisual[] = [
    { nombre: "Orden", estado: marcar(true, false) },
    { nombre: "Documentación", estado: marcar(ordenConfirmada, !ordenConfirmada) },
    { nombre: "Embarque", estado: marcar(hayLotes, ordenConfirmada && !hayLotes) },
    { nombre: "Tránsito", estado: marcar(algunPasoTransito, hayLotes && !algunPasoTransito) },
    { nombre: "Aduana", estado: marcar(algunLevantado, algunEnTransitoOMas && !algunLevantado) },
    {
      nombre: "Nacionalización",
      estado: marcar(algunNacionalizado, algunLevantado && !algunNacionalizado),
    },
    { nombre: "Pagos", estado: marcar(todosPagosPagados, hayPagos && !todosPagosPagados) },
    {
      nombre: "Cierre",
      estado: marcar(cerrada, algunNacionalizado && todosPagosPagados && !cerrada),
    },
  ];

  if (hayNovedadAbierta && !cerrada) {
    const idxActual = etapas.findIndex((e) => e.estado === "actual");
    if (idxActual >= 0) etapas[idxActual].estado = "novedad";
  }

  return etapas;
}

const ICONO_ETAPA: Record<EstadoEtapaVisual, typeof CheckCircle2> = {
  completada: CheckCircle2,
  actual: Clock,
  pendiente: Circle,
  novedad: AlertTriangle,
};

const ESTILO_ETAPA: Record<EstadoEtapaVisual, string> = {
  completada: "border-blue-200 bg-blue-50 text-blue-700",
  actual: "border-slate-900 bg-slate-900 text-white",
  pendiente: "border-slate-200 bg-white text-slate-400",
  novedad: "border-amber-300 bg-amber-50 text-amber-700",
};

export function ImportacionProgreso({ orden }: { orden: OrdenCompraIntl }) {
  const etapas = derivarEtapas(orden);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        Progreso de la importación
      </p>
      <div className="flex items-start gap-1 overflow-x-auto pb-1">
        {etapas.map((etapa, idx) => {
          const Icon = ICONO_ETAPA[etapa.estado];
          return (
            <div key={etapa.nombre} className="flex items-center flex-1 min-w-[92px]">
              <div className="flex flex-col items-center gap-1 flex-1">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                    ESTILO_ETAPA[etapa.estado],
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <p
                  className={cn(
                    "text-center text-[10px] font-semibold leading-tight",
                    etapa.estado === "pendiente" ? "text-slate-400" : "text-slate-700",
                  )}
                >
                  {etapa.nombre}
                </p>
              </div>
              {idx < etapas.length - 1 && (
                <span
                  className={cn(
                    "mx-1 h-px flex-1 shrink-0",
                    etapa.estado === "completada" ? "bg-blue-200" : "bg-slate-200",
                  )}
                  style={{ minWidth: 12 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 4. ACCIONES PENDIENTES                                              */
/* ------------------------------------------------------------------ */

export function ImportacionAccionesPendientes({ orden }: { orden: OrdenCompraIntl }) {
  const { data: motivosNovedad } = useCatalogo("MOTIVO_NOVEDAD_IMPORTACION");
  const etiquetaTipoNovedad = (clave: string) =>
    motivosNovedad.find((m) => m.clave === clave)?.etiqueta ?? clave;

  const actividadesPendientes = orden.actividades
    .filter((a) => a.estado === "Pendiente" || a.estado === "EnCurso")
    .sort((a, b) => {
      if (!a.fechaLimite) return 1;
      if (!b.fechaLimite) return -1;
      return new Date(a.fechaLimite).getTime() - new Date(b.fechaLimite).getTime();
    })
    .slice(0, 5);

  const novedadesAbiertas = orden.novedades
    .filter((n) => n.estado !== "Resuelta")
    .sort((a, b) => (a.prioridad === "Alta" ? -1 : b.prioridad === "Alta" ? 1 : 0))
    .slice(0, 5);

  const pagosPendientes = orden.pagos.filter((p) => p.estado === "Pendiente").slice(0, 5);

  const sinNada =
    actividadesPendientes.length === 0 &&
    novedadesAbiertas.length === 0 &&
    pagosPendientes.length === 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
        Acciones pendientes
      </p>

      {sinNada ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" /> Sin acciones pendientes.
        </p>
      ) : (
        <div className="space-y-3">
          {actividadesPendientes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Actividades</p>
              <ul className="space-y-1">
                {actividadesPendientes.map((a) => {
                  const vencida = a.fechaLimite && new Date(a.fechaLimite).getTime() < Date.now();
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]",
                        vencida ? "border-amber-300 bg-amber-50" : "border-slate-200",
                      )}
                    >
                      <span className="truncate font-semibold text-slate-800">{a.nombre}</span>
                      <span className="shrink-0 text-slate-500">
                        {ETIQUETA_RESPONSABLE_TIPO[a.responsableTipo]}
                        {a.fechaLimite &&
                          ` · ${new Date(a.fechaLimite).toLocaleDateString("es-CO")}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {novedadesAbiertas.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Novedades</p>
              <ul className="space-y-1">
                {novedadesAbiertas.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]",
                      n.prioridad === "Alta"
                        ? "border-red-300 bg-red-50"
                        : "border-amber-200 bg-amber-50",
                    )}
                  >
                    <span className="truncate font-semibold text-slate-800">
                      {etiquetaTipoNovedad(n.tipo)}
                    </span>
                    <span className="shrink-0 text-slate-500">Prioridad {n.prioridad}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pagosPendientes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Pagos</p>
              <ul className="space-y-1">
                {pagosPendientes.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="truncate font-semibold text-slate-800">{p.concepto}</span>
                    <span className="shrink-0 text-slate-500">{money(p.valor, p.moneda)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. MERCANCÍA                                                        */
/* ------------------------------------------------------------------ */

export function ImportacionMercanciaResumen({ orden }: { orden: OrdenCompraIntl }) {
  const pesoTotal = orden.items.reduce((acc, it) => acc + (it.pesoKg ?? 0), 0);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-[10px] uppercase font-bold text-slate-500">FOB total</p>
        <p className="num mt-0.5 text-sm font-bold text-slate-900">
          {money(orden.valorEstimadoTotal, orden.moneda)}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-[10px] uppercase font-bold text-slate-500">Peso físico total</p>
        <p className="num mt-0.5 text-sm font-bold text-slate-900">
          {pesoTotal > 0 ? `${pesoTotal.toLocaleString("es-CO")} kg` : "—"}
        </p>
        <p className="text-[10px] text-slate-500">
          Distinto de la cantidad comercial de cada ítem.
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-[10px] uppercase font-bold text-slate-500">Ítems</p>
        <p className="num mt-0.5 text-sm font-bold text-slate-900">{orden.items.length}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Estados vacíos reutilizables por pestaña                            */
/* ------------------------------------------------------------------ */

export function EstadoVacioPestana({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-10 text-center">
      <p className="text-sm font-bold text-slate-700">{titulo}</p>
      <p className="max-w-sm text-xs text-slate-500">{descripcion}</p>
      {accion}
    </div>
  );
}

export function TabCounterBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <Badge
      variant="outline"
      className="ml-1.5 h-4 min-w-4 items-center justify-center rounded-full border-slate-300 bg-slate-100 px-1 text-[10px] font-bold text-slate-600"
    >
      {n}
    </Badge>
  );
}
