import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePedidosComprometidosTodos, type PedidoComprometido } from "@/hooks/use-inventario";
import { formatCantidad } from "@/lib/data";
import { requirePermisoGuard } from "@/lib/route-guards";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

export const Route = createFileRoute("/inventario_/comprometidos")({
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.ANALITICA_VER),
  // ?pedido=<número Siesa>: prefiltra la tabla (enlace desde Gestión Comercial → Pedidos).
  validateSearch: (search: Record<string, unknown>): { pedido?: string } => ({
    pedido:
      typeof search.pedido === "string" || typeof search.pedido === "number"
        ? String(search.pedido)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Comprometido en Siesa | RicoSoft" },
      {
        name: "description",
        content: "Detalle completo de los pedidos de venta que Siesa tiene comprometidos.",
      },
    ],
  }),
  component: InventarioComprometidos,
});

const ETIQUETAS_FLAGS: Array<{ campo: keyof PedidoComprometido; etiqueta: string }> = [
  { campo: "indUltEstadoAprobado", etiqueta: "Aprobado" },
  { campo: "indBackorderDocto", etiqueta: "Backorder docto" },
  { campo: "indBackorderLinea", etiqueta: "Backorder línea" },
  { campo: "indRetenidoMargen", etiqueta: "Retenido margen" },
  { campo: "indRetenidoCupo", etiqueta: "Retenido cupo" },
  { campo: "indRetenidoMora", etiqueta: "Retenido mora" },
  { campo: "indRetenidoBloqueo", etiqueta: "Retenido bloqueo" },
  { campo: "indRetenidoAnticipo", etiqueta: "Retenido anticipo" },
  { campo: "indRemisionado", etiqueta: "Remisionado" },
  { campo: "indFacturado", etiqueta: "Facturado" },
];

function FilaPedido({ p }: { p: PedidoComprometido }) {
  const flagsActivos = ETIQUETAS_FLAGS.filter(({ campo }) => p[campo] === true);

  return (
    <TableRow>
      <TableCell className="align-top text-xs font-semibold text-slate-800">
        {p.numeroDocumento}
        {p.tipoDocto !== null && (
          <span className="ml-1 text-[10px] font-normal text-slate-400">tipo {p.tipoDocto}</span>
        )}
      </TableCell>
      <TableCell className="align-top text-xs text-slate-700">{p.clienteNombre ?? "—"}</TableCell>
      <TableCell className="align-top text-xs text-slate-700">
        <div className="min-w-0">
          <p className="truncate font-medium">{p.descripcion ?? "Producto sin descripción"}</p>
          {p.referencia && <p className="text-[11px] text-slate-400">{p.referencia}</p>}
        </div>
      </TableCell>
      <TableCell className="num align-top pr-3 text-right text-xs text-slate-600">
        {formatCantidad(p.cantidadPedida, null)}
      </TableCell>
      <TableCell className="num align-top pr-3 text-right text-xs font-semibold text-slate-800">
        {formatCantidad(p.cantidadComprometida, null)}
      </TableCell>
      <TableCell className="num align-top pr-3 text-right text-xs text-slate-600">
        {formatCantidad(p.cantidadRemisionada, null)}
      </TableCell>
      <TableCell className="num align-top pr-3 text-right text-xs text-slate-600">
        {formatCantidad(p.cantidadFacturada, null)}
      </TableCell>
      <TableCell className="align-top text-xs text-slate-600">
        {p.fechaPedido
          ? new Date(p.fechaPedido).toLocaleDateString("es-CO", { timeZone: "UTC" })
          : "—"}
      </TableCell>
      <TableCell className="align-top text-xs text-slate-600">
        {p.fechaEntrega
          ? new Date(p.fechaEntrega).toLocaleDateString("es-CO", { timeZone: "UTC" })
          : "—"}
      </TableCell>
      <TableCell className="align-top text-xs text-slate-600">{p.vendedorNombre ?? "—"}</TableCell>
      <TableCell className="align-top">
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
          {p.estado}
        </Badge>
      </TableCell>
      <TableCell className="align-top">
        {flagsActivos.length === 0 ? (
          <span className="text-[10px] text-slate-400">Sin retenciones/backorder</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {flagsActivos.map(({ campo, etiqueta }) => (
              <Badge
                key={campo}
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] text-amber-800 whitespace-nowrap"
              >
                {etiqueta}
              </Badge>
            ))}
          </div>
        )}
        <p className="mt-1 text-[10px] whitespace-nowrap text-slate-400">
          Línea: {p.indEstadoLinea ?? "—"} · Docto: {p.indEstadoDocto ?? "—"}
        </p>
      </TableCell>
    </TableRow>
  );
}

const FILAS_POR_PAGINA = 30;

function InventarioComprometidos() {
  const { datos, loading, error } = usePedidosComprometidosTodos();
  const { pedido: pedidoInicial } = Route.useSearch();
  const [busqueda, setBusqueda] = useState(pedidoInicial ?? "");
  const [pagina, setPagina] = useState(1);

  const pedidosFiltrados = useMemo(() => {
    const pedidos = datos?.pedidos ?? [];
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return pedidos;
    return pedidos.filter((p) =>
      [
        p.numeroDocumento?.toString(),
        p.clienteNombre,
        p.referencia,
        p.descripcion,
        p.vendedorNombre,
        p.estado,
      ]
        .filter(Boolean)
        .some((campo) => campo!.toLowerCase().includes(termino)),
    );
  }, [datos, busqueda]);

  useEffect(() => {
    setPagina(1);
  }, [busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(pedidosFiltrados.length / FILAS_POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const pedidosPagina = pedidosFiltrados.slice(
    (paginaActual - 1) * FILAS_POR_PAGINA,
    paginaActual * FILAS_POR_PAGINA,
  );

  return (
    <AppShell
      title="Pedidos que generan compromiso"
      description="Detalle completo, sin resumir, de los pedidos de venta que Siesa tiene comprometidos hoy"
      actions={
        <Link to="/inventario">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a Inventario
          </span>
        </Link>
      }
    >
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
        El comprometido corresponde a cantidades que Siesa tiene reservadas en pedidos de venta. El
        estado del pedido puede variar — no significa "pedido confirmado".
      </div>

      {loading && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando pedidos comprometidos...
        </p>
      )}

      {!loading && error && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {error}
        </div>
      )}

      {!loading && !error && datos && !datos.disponible && (
        <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
          {datos.motivo ?? "No fue posible consultar el detalle en este momento."}
        </div>
      )}

      {!loading && !error && datos?.disponible && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Filtrar por pedido, cliente, referencia, descripción, vendedor o estado..."
              className="h-9 max-w-md text-xs"
            />
            <p className="text-[11px] text-slate-500">
              Total comprometido en este detalle:{" "}
              <span className="num font-semibold text-slate-700">
                {formatCantidad(datos.totalCantidadComprometida ?? 0, null)}
              </span>{" "}
              · {pedidosFiltrados.length} de {datos.pedidos?.length ?? 0} línea(s)
              {busqueda ? " (filtradas)" : ""} — informativo, no reemplaza el valor de la tarjeta
              principal de Inventario.
            </p>
          </div>

          {(datos.pedidos?.length ?? 0) === 0 ? (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
              No hay pedidos de venta con compromiso activo en este momento.
            </div>
          ) : (
            <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader className="bg-slate-100/80">
                    <TableRow className="hover:bg-slate-100/80">
                      <TableHead className="w-24 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Pedido
                      </TableHead>
                      <TableHead className="w-40 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Cliente
                      </TableHead>
                      <TableHead className="w-56 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Producto
                      </TableHead>
                      <TableHead className="w-20 pr-3 text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Pedida
                      </TableHead>
                      <TableHead className="w-28 pr-3 text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Comprometida
                      </TableHead>
                      <TableHead className="w-28 pr-3 text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Remisionada
                      </TableHead>
                      <TableHead className="w-20 pr-3 text-right text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Facturada
                      </TableHead>
                      <TableHead className="w-24 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Fecha pedido
                      </TableHead>
                      <TableHead className="w-24 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Fecha entrega
                      </TableHead>
                      <TableHead className="w-32 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Vendedor
                      </TableHead>
                      <TableHead className="w-28 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Estado
                      </TableHead>
                      <TableHead className="w-64 text-[11px] uppercase tracking-wider text-slate-600 font-bold">
                        Flags / datos técnicos
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedidosPagina.map((p) => (
                      <FilaPedido key={p.pvDoctoRowId + "-" + p.itemRowId} p={p} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-2">
                <p className="text-[11px] text-slate-500">
                  Página {paginaActual} de {totalPaginas}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={paginaActual <= 1}
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                  </button>
                  <button
                    type="button"
                    disabled={paginaActual >= totalPaginas}
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
