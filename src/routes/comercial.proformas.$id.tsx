import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileDown, PackagePlus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useProforma,
  useEliminarProforma,
  useAsignarDocumentoErpProforma,
} from "@/hooks/use-proformas";
import { useAccionesPedido } from "@/hooks/use-comercial";
import { money } from "@/lib/data";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requirePermisoGuard } from "@/lib/route-guards";

export const Route = createFileRoute("/comercial/proformas/$id")({
  // Antes esta ruta no tenía guard de frontend: se apoyaba enteramente en
  // que el backend rechazara el fetch. Se agrega el mismo patrón que
  // cotizaciones/$id y pedidos/$id para bloquear también la navegación
  // directa por URL antes de intentar cargar datos.
  beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.PROFORMAS_VER),
  head: () => ({
    meta: [{ title: "Proforma | RicoSoft" }],
  }),
  component: ProformaImpresion,
});

// Ancho de las 11 columnas (A-K) de la plantilla Excel original
// (public/Factura Proforma 3889...xlsx), en las mismas unidades de ancho de
// columna de Excel — se usan tal cual como fracciones del grid para que las
// cajas queden con las mismas proporciones que la hoja original.
const COLS = "9fr 10.14fr 14.57fr 13.86fr 15.43fr 12.14fr 11.57fr 16.57fr 9.71fr 17fr 11.71fr";

function Celda({
  col,
  row,
  className,
  children,
}: {
  col: string;
  row?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div style={{ gridColumn: col, gridRow: row }} className={className}>
      {children}
    </div>
  );
}

/**
 * Reproduce la distribución exacta de la plantilla "Factura Proforma"
 * (public/Factura Proforma 3889...xlsx: 11 columnas A-K, cajas con borde
 * para cada sección) usando un grid CSS con las mismas proporciones de
 * columna que el Excel — "Descargar PDF" genera el archivo en el navegador
 * (html2canvas-pro + jsPDF) e "Imprimir directamente" usa window.print().
 */
function ProformaImpresion() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { proforma, loading, error, refresh } = useProforma(id);
  const { user } = useSession();
  const accionesPedido = useAccionesPedido();
  const { eliminar, loading: eliminando } = useEliminarProforma();
  const [creandoPedido, setCreandoPedido] = useState(false);
  const puedeCrearPedido = hasPermission(user, PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR);
  const puedeManipularProforma = hasPermission(user, PERMISOS_SISTEMA.PROFORMAS_GESTIONAR);

  const eliminarProformaDefinitivamente = async () => {
    if (!proforma) return;
    if (
      !window.confirm(
        `Esto elimina PERMANENTEMENTE la proforma ${proforma.numero}. No se puede deshacer. ¿Continuar?`,
      )
    ) {
      return;
    }
    try {
      await eliminar(proforma.id);
      toast.success(`Proforma ${proforma.numero} eliminada.`);
      navigate({ to: "/ventas" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible eliminar la proforma.");
    }
  };

  const crearPedidoDesdeProforma = async () => {
    if (!proforma) return;
    setCreandoPedido(true);
    try {
      const pedido = await accionesPedido.crearDesdeProforma(proforma.id);
      toast.success(`Pedido ${pedido.numeroFormateado ?? pedido.numero} creado desde esta proforma.`);
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible crear el pedido.");
    } finally {
      setCreandoPedido(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="Proforma" description="Cargando...">
        <p className="text-xs text-slate-500">Cargando proforma...</p>
      </AppShell>
    );
  }

  if (error || !proforma) {
    return (
      <AppShell title="Proforma" description="No encontrada">
        <p className="text-xs text-slate-500">{error || "Proforma no encontrada."}</p>
        <Link
          to="/ventas"
          className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline"
        >
          Volver a Ventas
        </Link>
      </AppShell>
    );
  }

  // Totales SIEMPRE los que ya calculó y persistió el backend
  // (domain/ventas/proforma-calculo.ts vía serializarProforma) — esta vista
  // nunca recalcula nada, solo los muestra.
  const { totalBruto, subtotal, iva, retencionFuente, retencionIva, retencionIca, total } =
    proforma;

  const imprimirDirecto = () => window.print();

  // Genera y descarga un PDF real (carta) de la hoja, sin diálogo de impresión.
  const descargarPdf = async () => {
    const hoja = document.getElementById("hoja-proforma");
    if (!hoja) return;
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(hoja, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "mm", format: "letter" });
    const margen = 12;
    const ancho = pdf.internal.pageSize.getWidth() - margen * 2;
    const altoMax = pdf.internal.pageSize.getHeight() - margen * 2;
    let w = ancho;
    let h = (canvas.height * w) / canvas.width;
    if (h > altoMax) {
      h = altoMax;
      w = (canvas.width * h) / canvas.height;
    }
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", margen, margen, w, h);
    const fecha = new Date(proforma.createdAt).toISOString().slice(0, 10);
    const cliente = proforma.clienteNombre.replace(/[\\/:*?"<>|]+/g, "").trim();
    pdf.save(`Proforma ${proforma.numero} - ${cliente} - ${fecha}.pdf`);
  };

  const etq = "text-[7px] font-bold uppercase tracking-tight";
  const val = "text-[8px]";
  const caja = "border border-slate-500 px-1 py-0.5";

  return (
    <AppShell
      title={`Proforma ${proforma.numero}`}
      description="Vista de impresión — misma distribución que la plantilla Factura Proforma"
      actions={
        <>
          <Link to="/ventas">
            <Button size="sm" variant="outline" className="gap-1.5 print:hidden">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 print:hidden">
                <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void descargarPdf()}>
                <FileDown className="mr-2 h-3.5 w-3.5" /> Descargar PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={imprimirDirecto}>
                <Printer className="mr-2 h-3.5 w-3.5" /> Imprimir directamente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {puedeCrearPedido && proforma.estado === "activa" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 print:hidden"
              disabled={creandoPedido}
              onClick={() => void crearPedidoDesdeProforma()}
            >
              <PackagePlus className="h-3.5 w-3.5" /> Crear Pedido
            </Button>
          )}
        </>
      }
    >
      {/* Documentos relacionados — Cotización → Proforma(s) → Pedido(s),
          navegable, oculto en impresión (sección 11 del encargo). */}
      <div className="mx-auto mb-4 max-w-[900px] rounded-lg border border-slate-200 bg-white p-4 text-xs print:hidden">
        <h3 className="font-semibold text-slate-800">Documentos relacionados</h3>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Cotización:</span>
            {proforma.cotizacion ? (
              <Link to="/comercial/cotizaciones/$id" params={{ id: proforma.cotizacion.id }}>
                <Badge variant="outline">COT-{String(proforma.cotizacion.numero).padStart(5, "0")}</Badge>
              </Link>
            ) : (
              <span className="text-slate-400">Sin cotización</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Proforma:</span>
            <Badge variant="outline">{proforma.numero}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Pedido(s):</span>
            {proforma.pedidosComerciales && proforma.pedidosComerciales.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {proforma.pedidosComerciales.map((p) => (
                  <Link key={p.id} to="/comercial/pedidos/$id" params={{ id: p.id }}>
                    <Badge variant="outline">PC-{String(p.numero).padStart(5, "0")}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <span className="text-slate-400">Sin pedido</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">ERP:</span>
            {proforma.erpDocumentoNumero ? (
              <span className="text-slate-400">{proforma.erpDocumentoNumero}</span>
            ) : puedeManipularProforma ? (
              <AsignarErpProforma proformaId={proforma.id} onAsignado={refresh} />
            ) : (
              <span className="text-slate-400">No sincronizado con ERP</span>
            )}
          </div>
        </div>
        {user?.isSuperadmin && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              disabled={eliminando}
              onClick={() => void eliminarProformaDefinitivamente()}
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar definitivamente
            </Button>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: letter; margin: 12mm; }
          body * { visibility: hidden; }
          #hoja-proforma, #hoja-proforma * { visibility: visible; }
          #hoja-proforma { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div
        id="hoja-proforma"
        className="mx-auto max-w-[900px] bg-white p-6 text-slate-900 shadow-2xs print:shadow-none"
      >
        {/* Encabezado — logo arriba a la izquierda con la información de la
            compañía DEBAJO del logo (no a su derecha); caja FACTURA
            PROFORMA / Número / Fecha / Página arriba a la derecha. */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col items-start">
            <img src="/ricol-logo-proforma.png" alt="Ricol" className="h-10 w-auto" />
            <div className="mt-1 text-left leading-tight">
              <p className="text-[8px] font-bold">805006906-5</p>
              <p className="text-[7px]">
                Principal: CL 15 N° 27A - 176 BL 9 BG 4 Acopi-Yumbo PBX (57-2) 695 4565
              </p>
              <p className="text-[7px]">
                Bogotá: CL 24A Sur N° 70B - 43 B/Carvajal Tel. (57-1) 5634795
              </p>
              <p className="text-[7px]">
                Medellín: Tel. (57-4) 366 6160 e-mail: servicioalcliente@ricol.com.co
              </p>
              <p className="text-[7px]">www.ricol.com.co - Yumbo - Colombia</p>
              <p className="mt-0.5 text-[7px]">NO GRAN CONTRIBUYENTE</p>
              <p className="text-[7px] font-bold">IVA REGIMEN COMUN</p>
              <p className="text-[7px]">ACTIVIDAD COMERCIAL 203-26 TARIFA ICA 7.7X1000 Cali</p>
              <p className="text-[7px]">ACTIVIDAD COMERCIAL 2-08 TARIFA ICA 10X1000 Yumbo</p>
              <p className="text-[7px]">ACTIVIDAD INDUSTRIAL 1-03 TARIFA ICA 7X1000 Yumbo</p>
            </div>
          </div>

          <div className={cn(caja, "flex w-56 shrink-0 flex-col")}>
            <p className="text-center text-[9px] font-bold">FACTURA PROFORMA</p>
            <div className="mt-1 grid grid-cols-2 gap-x-1 text-[8px]">
              <span className="font-bold">Número:</span>
              <span className="text-right">{proforma.numero}</span>
              <span className="font-bold">Fecha:</span>
              <span className="text-right">
                {new Date(proforma.createdAt).toLocaleString("es-CO", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              <span className="font-bold">Página:</span>
              <span className="text-right">1 de 1</span>
            </div>
          </div>
        </div>

        {/* Cotización origen — solo se muestra si la proforma nació de una
            cotización vinculada (CRM/Siesa); no altera el resto del diseño. */}
        {(proforma.cotizacionNumero || proforma.erpDocumentoNumero) && (
          <p className="mt-1 text-[8px] text-slate-600">
            {proforma.cotizacionNumero && <>Cotización: {proforma.cotizacionNumero}</>}
            {proforma.cotizacionNumero && proforma.erpDocumentoNumero && "  ·  "}
            {proforma.erpDocumentoNumero && <>Documento ERP: {proforma.erpDocumentoNumero}</>}
          </p>
        )}

        {/* Caja Cliente — misma cuadrícula que A16:K27 de la plantilla */}
        <div className="mt-2 grid border border-slate-500" style={{ gridTemplateColumns: COLS }}>
          <Celda col="1 / 2" row="1" className={cn(etq, "border-r border-slate-300 px-1 py-0.5")}>
            Cliente:
          </Celda>
          <Celda col="2 / 6" row="1" className={cn(val, "px-1 py-0.5 font-semibold")}>
            {proforma.clienteNombre}
          </Celda>
          <Celda col="6 / 9" row="1" className={cn(etq, "border-l border-slate-300 px-1 py-0.5")}>
            Forma de pago
          </Celda>
          <Celda col="9 / 10" row="1" className={cn(val, "px-1 py-0.5")}></Celda>
          <Celda col="10 / 12" row="1" className={cn(etq, "border-l border-slate-300 px-1 py-0.5")}>
            Fecha vcto.
          </Celda>

          <Celda col="1 / 2" row="2" className={cn(etq, "border-r border-slate-300 px-1 py-0.5")}>
            Contacto:
          </Celda>
          <Celda col="2 / 6" row="2" className={cn(val, "px-1 py-0.5")}>
            {proforma.contacto || "—"}
          </Celda>
          <Celda col="6 / 9" row="2" className={cn(val, "border-l border-slate-300 px-1 py-0.5")}>
            {proforma.formaPago || "—"}
          </Celda>
          <Celda col="10 / 12" row="2" className={cn(val, "border-l border-slate-300 px-1 py-0.5")}>
            {proforma.fechaVencimiento
              ? new Date(proforma.fechaVencimiento).toLocaleDateString("es-CO")
              : "—"}
          </Celda>

          <Celda
            col="1 / 2"
            row="3"
            className={cn(etq, "border-r border-t border-slate-300 px-1 py-0.5")}
          >
            Nit o C.C.:
          </Celda>
          <Celda col="2 / 4" row="3" className={cn(val, "border-t border-slate-300 px-1 py-0.5")}>
            {proforma.clienteNit || "—"}
          </Celda>
          <Celda col="4 / 6" row="3" className={cn(etq, "border-t border-slate-300 px-1 py-0.5")}>
            Código:
          </Celda>
          <Celda
            col="6 / 9"
            row="3"
            className={cn(etq, "border-l border-t border-slate-300 px-1 py-0.5")}
          >
            Vendedor:
          </Celda>

          <Celda col="1 / 2" row="4" className={cn(etq, "border-r border-slate-300 px-1 py-0.5")}>
            Dirección:
          </Celda>
          <Celda col="2 / 6" row="4" className={cn(val, "px-1 py-0.5")}>
            {proforma.direccion || "—"}
          </Celda>
          <Celda
            col="6 / 12"
            row="4 / 6"
            className={cn(
              val,
              "flex items-center justify-center border-l border-slate-300 px-1 py-0.5 font-semibold",
            )}
          >
            {proforma.vendedorNombre || "—"}
          </Celda>

          <Celda col="1 / 2" row="5" className={cn(etq, "border-r border-slate-300 px-1 py-0.5")}>
            Ciudad:
          </Celda>
          <Celda col="2 / 6" row="5" className={cn(val, "px-1 py-0.5")}>
            {proforma.ciudad || "—"}
          </Celda>

          <Celda
            col="1 / 2"
            row="6"
            className={cn(etq, "border-r border-t border-slate-300 px-1 py-0.5")}
          >
            Teléfono:
          </Celda>
          <Celda col="2 / 5" row="6" className={cn(val, "border-t border-slate-300 px-1 py-0.5")}>
            {proforma.telefono || "—"}
          </Celda>
          <Celda col="6 / 7" row="6" className={cn(etq, "border-t border-slate-300 px-1 py-0.5")}>
            OC.Nro
          </Celda>
          <Celda col="7 / 8" row="6" className={cn(etq, "border-t border-slate-300 px-1 py-0.5")}>
            Docto.Alt.
          </Celda>
          <Celda col="8 / 10" row="6" className={cn(etq, "border-t border-slate-300 px-1 py-0.5")}>
            Remisiones
          </Celda>
          <Celda col="10 / 12" row="6" className={cn(etq, "border-t border-slate-300 px-1 py-0.5")}>
            Moneda
          </Celda>

          <Celda
            col="1 / 2"
            row="7"
            className={cn(etq, "border-r border-t border-slate-300 px-1 py-0.5")}
          >
            Fax:
          </Celda>
          <Celda
            col="2 / 6"
            row="7"
            className={cn(val, "border-t border-slate-300 px-1 py-0.5")}
          ></Celda>
          <Celda col="6 / 7" row="7" className={cn(val, "border-t border-slate-300 px-1 py-0.5")}>
            {proforma.ocNumero || "—"}
          </Celda>
          <Celda col="7 / 8" row="7" className={cn(val, "border-t border-slate-300 px-1 py-0.5")}>
            {proforma.documentoAlterno || "—"}
          </Celda>
          <Celda col="8 / 10" row="7" className={cn(val, "border-t border-slate-300 px-1 py-0.5")}>
            {proforma.remisiones || "—"}
          </Celda>
          <Celda col="10 / 12" row="7" className={cn(val, "border-t border-slate-300 px-1 py-0.5")}>
            {proforma.moneda}
          </Celda>
        </div>

        {/* Tabla de ítems — mismas columnas que A30:K31 de la plantilla */}
        <div
          className="mt-2 grid border border-slate-500 [&>div]:border-slate-400"
          style={{ gridTemplateColumns: COLS }}
        >
          <Celda col="1 / 5" row="1" className={cn(etq, "border-b px-1 py-0.5 text-center")}>
            Item
          </Celda>
          <Celda
            col="5 / 6"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            BOD
          </Celda>
          <Celda
            col="6 / 7"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            U.M.
          </Celda>
          <Celda
            col="7 / 8"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            Cantidad
          </Celda>
          <Celda
            col="8 / 9"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            Precio unit.
          </Celda>
          <Celda
            col="9 / 10"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            Dscto
          </Celda>
          <Celda
            col="10 / 11"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            Sub Total
          </Celda>
          <Celda
            col="11 / 12"
            row="1"
            className={cn(etq, "border-b border-l px-1 py-0.5 text-center")}
          >
            Iva %
          </Celda>

          {proforma.items.map((it, idx) => {
            const subLinea = it.cantidad * it.precioUnitario * (1 - it.descuentoPct / 100);
            const fila = idx + 2;
            return (
              <div key={idx} style={{ display: "contents" }}>
                <Celda col="1 / 5" row={String(fila)} className={cn(val, "border-t px-1 py-0.5")}>
                  {it.referencia ? `${it.referencia} - ` : ""}
                  {it.descripcion}
                </Celda>
                <Celda
                  col="5 / 6"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-center")}
                >
                  {it.bodega || "—"}
                </Celda>
                <Celda
                  col="6 / 7"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-center")}
                >
                  {it.unidadMedida || "—"}
                </Celda>
                <Celda
                  col="7 / 8"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-right")}
                >
                  {it.cantidad.toLocaleString("es-CO")}
                </Celda>
                <Celda
                  col="8 / 9"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-right")}
                >
                  {money(it.precioUnitario)}
                </Celda>
                <Celda
                  col="9 / 10"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-right")}
                >
                  {it.descuentoPct}%
                </Celda>
                <Celda
                  col="10 / 11"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-right")}
                >
                  {money(subLinea)}
                </Celda>
                <Celda
                  col="11 / 12"
                  row={String(fila)}
                  className={cn(val, "border-t border-l px-1 py-0.5 text-right")}
                >
                  {it.ivaPct}%
                </Celda>
              </div>
            );
          })}
        </div>

        {/* Totales — misma cuadrícula que A32:K34 de la plantilla */}
        <div className="mt-2 grid border border-slate-500" style={{ gridTemplateColumns: COLS }}>
          <Celda
            col="1 / 4"
            row="1"
            className={cn(etq, "border-b border-slate-300 px-1 py-0.5 text-center")}
          >
            Total bruto
          </Celda>
          <Celda
            col="4 / 6"
            row="1"
            className={cn(etq, "border-b border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            Descuentos
          </Celda>
          <Celda
            col="6 / 7"
            row="1"
            className={cn(etq, "border-b border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            Sub total
          </Celda>
          <Celda
            col="7 / 9"
            row="1"
            className={cn(etq, "border-b border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            Vlr impuestos
          </Celda>
          <Celda
            col="9 / 10"
            row="1"
            className={cn(etq, "border-b border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            Vlr retención
          </Celda>
          <Celda
            col="10 / 12"
            row="1"
            className={cn(etq, "border-b border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            Total
          </Celda>

          <Celda col="1 / 4" row="2" className={cn(val, "px-1 py-0.5 text-center font-semibold")}>
            {money(totalBruto)}
          </Celda>
          <Celda
            col="4 / 6"
            row="2"
            className={cn(val, "border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            {money(totalBruto - subtotal)}
          </Celda>
          <Celda
            col="6 / 7"
            row="2"
            className={cn(val, "border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            {money(subtotal)}
          </Celda>
          <Celda
            col="7 / 9"
            row="2"
            className={cn(val, "border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            {money(iva)}
          </Celda>
          <Celda
            col="9 / 10"
            row="2"
            className={cn(val, "border-l border-slate-300 px-1 py-0.5 text-center")}
          >
            {money(retencionFuente + retencionIva + retencionIca)}
          </Celda>
          <Celda
            col="10 / 12"
            row="2"
            className={cn(val, "border-l border-slate-300 px-1 py-0.5 text-center font-bold")}
          >
            {money(total)}
          </Celda>
        </div>

        {/* Retención — igual a A36:K38 de la plantilla, solo si aplica alguna */}
        {(proforma.aplicaRetencion || proforma.aplicaRetencionIva || proforma.aplicaIca) && (
          <div className="mt-2 border border-slate-500">
            <p className={cn(etq, "border-b border-slate-300 px-1 py-0.5")}>RETENCIÓN:</p>
            {proforma.aplicaRetencion && (
              <div className="flex justify-between px-1 py-0.5 text-[8px]">
                <span>RETENCIÓN EN LA FUENTE DEL {proforma.retencionPct}%</span>
                <span className="font-semibold">{money(retencionFuente)}</span>
              </div>
            )}
            {proforma.aplicaRetencionIva && (
              <div className="flex justify-between px-1 py-0.5 text-[8px]">
                <span>RETENCIÓN DE IVA DEL {proforma.retencionIvaPct}%</span>
                <span className="font-semibold">{money(retencionIva)}</span>
              </div>
            )}
            {proforma.aplicaIca && (
              <div className="flex justify-between px-1 py-0.5 text-[8px]">
                <span>RETENCION DEL ICA ({proforma.icaPct}%)</span>
                <span className="font-semibold">{money(retencionIca)}</span>
              </div>
            )}
          </div>
        )}

        {/* Observaciones — igual a A40:K42 de la plantilla */}
        <div className="mt-2 border border-slate-500 px-1 py-1">
          <p className={etq}>OBSERVACIONES:</p>
          <p className="min-h-[14px] text-[8px]">{proforma.observaciones || ""}</p>
        </div>

        {/* Firmas — igual a C50:I54 de la plantilla */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-[8px]">
          <div>
            <p className="font-semibold">{proforma.creadoPorNombre}</p>
            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-slate-400 pt-1">
              <span>FIRMA</span>
              <span>SELLO</span>
            </div>
            <p className="mt-1 font-bold">E L A B O R A D O</p>
          </div>
          <div>
            <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-400 pt-1">
              <span>RECIBI</span>
              <span>FIRMA</span>
              <span>SELLO</span>
            </div>
            <p className="mt-1 font-bold">A C E P T A D A</p>
            <p>Cliente</p>
          </div>
        </div>

        {/* Pie legal — igual a A57:K58 de la plantilla */}
        <p className="mt-6 text-center text-[7px] text-slate-500">
          LOS CHEQUES DEVUELTOS TENDRAN SANCION DEL 20% SEGÚN ARTICULO 731 DEL CODIGO DE COMERCIO.
          <br />
          SE COBRA INTERESES DE MORA A LA TASA MAXIMA LEGAL VIGENTE A PARTIR DE LA FECHA DE
          VENCIMIENTO.
        </p>
      </div>
    </AppShell>
  );
}

/** Input compacto para vincular a mano el CDV de Siesa cuando el buscador
 * automático (al crear la proforma) no lo encontró — ver sección "asignar
 * documentos del ERP". El rowid SIEMPRE se revalida contra Siesa en backend. */
function AsignarErpProforma({
  proformaId,
  onAsignado,
}: {
  proformaId: string;
  onAsignado: () => Promise<void>;
}) {
  const { asignar, loading } = useAsignarDocumentoErpProforma();
  const [valor, setValor] = useState("");
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <button
        type="button"
        className="text-xs text-emerald-700 underline hover:text-emerald-800"
        onClick={() => setEditando(true)}
      >
        Sin documento ERP · vincular a mano
      </button>
    );
  }

  const confirmar = async () => {
    if (!valor.trim()) return;
    try {
      await asignar(proformaId, valor.trim());
      toast.success("Documento ERP vinculado.");
      setEditando(false);
      setValor("");
      await onAsignado();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible vincular el documento.");
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="rowid del CDV en Siesa"
        className="h-7 w-40 text-xs"
      />
      <Button type="button" size="sm" className="h-7 text-xs" disabled={loading} onClick={() => void confirmar()}>
        Guardar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-xs"
        onClick={() => setEditando(false)}
      >
        Cancelar
      </Button>
    </div>
  );
}
