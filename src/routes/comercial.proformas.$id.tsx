import type { ReactNode } from "react";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, FileDown, PackagePlus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
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
  useAceptarProforma,
} from "@/hooks/use-proformas";
import { useAccionesPedido } from "@/hooks/use-comercial";
import { money } from "@/lib/data";
import { calcularTotalesProformaPreview } from "@/lib/proforma-calculo";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { accionesProforma } from "@/lib/proforma-estados";
import { requirePermisoGuard } from "@/lib/route-guards";
import { abreviarNombreTenant, empresaIdDeTenant, LogoEmpresa } from "@/lib/tenant-context";
import {
  calcularCortesDePagina,
  calcularEmpaquePlocks,
  calcularTotalPaginas,
  esTenantGreenSolutions,
  formatearFechaProforma,
  formatearHoraProforma,
  resolverEncabezadoCorporativoProforma,
  valorONulo,
  type SeccionMedida,
} from "./comercial.proformas.$id.logic";

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
// cajas queden con las mismas proporciones que la hoja original. Ricol y
// Flexipack SIEMPRE usan este grid, sin cambios.
const COLS = "9fr 10.14fr 14.57fr 13.86fr 15.43fr 12.14fr 11.57fr 16.57fr 9.71fr 17fr 11.71fr";

// Exclusivo de Green Solutions (ver esTenantGreenSolutions): mismo grid de
// COLS con UNA columna adicional ("Paquetes") insertada justo después de
// Cantidad — no existe una plantilla Excel original que respetar para esta
// columna nueva (es una extensión propia de Green), así que su ancho es
// libre; se eligió similar al de Bodega/U.M. por ser también un número
// corto. Nunca se usa para Ricol/Flexipack.
const COLS_GREEN =
  "9fr 10.14fr 14.57fr 13.86fr 15.43fr 12.14fr 11.57fr 9fr 16.57fr 9.71fr 17fr 11.71fr";

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

/** Par etiqueta/valor para los bloques "Información del cliente" y
 * "Condiciones comerciales" — a diferencia de la cuadrícula tipo Excel de
 * la tabla de ítems, aquí cada Campo se renderiza (o no) desde el llamador
 * según haya o no un valor real que mostrar, así que nunca queda una
 * etiqueta huérfana ni un separador residual ("TELÉFONO: | 3122596483"). */
function Campo({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[7.3px] font-semibold uppercase tracking-tight text-slate-500">{etiqueta}</p>
      <p className="text-[8.8px] text-slate-900">{children}</p>
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
  const { aceptar, loading: aceptando } = useAceptarProforma();
  const puedeCrearPedido = hasPermission(user, PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR);
  const puedeManipularProforma = hasPermission(user, PERMISOS_SISTEMA.PROFORMAS_GESTIONAR);
  // Máquina de estados: ENVIADA -> ACEPTADA -> PEDIDO_CREADO (o ANULADA). Los
  // estados inmutables (PEDIDO_CREADO, ANULADA) no muestran acciones de cambio.
  const acciones = accionesProforma(proforma?.estado ?? "", {
    gestionarProformas: puedeManipularProforma,
    aceptarProformas: hasPermission(user, PERMISOS_SISTEMA.PROFORMAS_ACEPTAR),
    gestionarPedidos: puedeCrearPedido,
  });

  const aceptarProforma = async () => {
    if (!proforma) return;
    try {
      await aceptar(proforma.id);
      toast.success(`Proforma ${proforma.numero} aceptada.`);
      await refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No fue posible aceptar la proforma.");
    }
  };

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
      navigate({ to: "/comercial/gestion" });
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
          to="/comercial/gestion"
          className="mt-2 inline-block text-xs font-semibold text-estado-info-fg hover:underline"
        >
          Volver a Gestión Comercial
        </Link>
      </AppShell>
    );
  }

  // Empresa (RC/FL/GR) del TENANT AUTENTICADO — el backend ya filtra la
  // proforma por req.user!.tenantId (obtenerProformaConItems), así que
  // user.tenantNombre es siempre la empresa dueña de este documento, nunca
  // la de otro tenant. Mismo mecanismo que ya usa AppShell para el logo/
  // nombre de la barra superior — nunca un valor fijo de Ricol (microaudit
  // "extensión de proforma Ricol→Flexipack/Green").
  const empresaId = empresaIdDeTenant(user?.tenantNombre);
  const encabezado = resolverEncabezadoCorporativoProforma(user?.tenantNombre);
  // Columna "Paquetes" (32 plocks c/u, +1% de desperdicio de construcción)
  // — EXCLUSIVA de Green Solutions, activada solo por el tenant autenticado
  // (mismo mecanismo que empresaId arriba), nunca por usuario/permiso.
  // Ricol y Flexipack quedan con la tabla de items exactamente como siempre
  // (esGreen=false → cols/offset sin efecto, totales = los del backend).
  const esGreen = esTenantGreenSolutions(user?.tenantNombre);
  const colsItems = esGreen ? COLS_GREEN : COLS;
  // Desplaza en 1 los grupos de columnas que van DESPUÉS de "Cantidad"
  // (Precio unit./Dscto%/IVA%/Subtotal) cuando la columna "Paquetes" existe.
  const offsetCols = esGreen ? 1 : 0;

  // Empaque (paquetes + cantidad documentada) por ítem — calculado UNA sola
  // vez aquí y reutilizado tanto para las celdas de la tabla como para los
  // totales de Green más abajo, en vez de llamar calcularEmpaquePlocks en
  // dos lugares distintos con el riesgo de que diverjan.
  const itemsConEmpaque = proforma.items.map((it) => ({
    ...it,
    empaque: calcularEmpaquePlocks(it.cantidad),
  }));

  // Totales: para Ricol/Flexipack, SIEMPRE los que ya calculó y persistió
  // el backend (domain/ventas/proforma-calculo.ts vía serializarProforma)
  // — esta vista nunca recalcula nada para ellos, solo los muestra, sin
  // cambios respecto de antes.
  //
  // Para Green Solutions, la cantidad efectiva de cada línea es
  // `cantidadDocumentada` (empaque + desperdicio ya resueltos), así que el
  // subtotal/IVA/retenciones/total deben reflejar esa cantidad, no la
  // cantidad solicitada que el backend persistió y con la que calculó sus
  // propios totales. Se recalculan aquí con calcularTotalesProformaPreview
  // — la MISMA función que ya usa el diálogo de creación de la proforma
  // para su preview en vivo (src/lib/proforma-calculo.ts, espejo de
  // domain/ventas/proforma-calculo.ts del backend) — nunca una fórmula de
  // descuento/IVA/retención nueva, solo la cantidad de entrada cambia.
  const totalesMostrados = esGreen
    ? calcularTotalesProformaPreview(
        itemsConEmpaque.map((it) => ({
          cantidad: it.empaque.cantidadDocumentada,
          precioUnitario: it.precioUnitario,
          descuentoPct: it.descuentoPct,
          ivaPct: it.ivaPct,
        })),
        {
          aplicaRetencion: proforma.aplicaRetencion,
          retencionPct: proforma.retencionPct,
          aplicaRetencionIva: proforma.aplicaRetencionIva,
          retencionIvaPct: proforma.retencionIvaPct,
          aplicaIca: proforma.aplicaIca,
          icaPct: proforma.icaPct,
        },
      )
    : proforma;
  const { totalBruto, subtotal, iva, retencionFuente, retencionIva, retencionIca, total } =
    totalesMostrados;

  // Ancho/alto útil de una hoja carta (215.9 x 279.4mm) con el mismo
  // margen de 12mm que usa tanto el PDF (jsPDF) como @media print
  // (@page { size: letter; margin: 12mm }) — mantenerlos iguales es lo que
  // permite usar la MISMA medición de secciones para decidir cuántas
  // páginas hacen falta en los dos caminos de salida.
  const MARGEN_MM = 12;
  const ANCHO_UTIL_MM = 215.9 - MARGEN_MM * 2;
  const ALTO_UTIL_MM = 279.4 - MARGEN_MM * 2;

  /** Mide los bloques de nivel superior de #hoja-proforma (encabezado,
   * cliente, condiciones comerciales, tabla de ítems, totales, retención,
   * observaciones, firmas, pie) en milímetros, escalando el ancho real en
   * pantalla al ancho útil de una hoja carta — se usa para decidir cuántas
   * páginas hacen falta y dónde cortar sin partir una sección a la mitad.
   * Nota deliberada: la granularidad es por SECCIÓN, no por fila individual
   * de la tabla de ítems — ver limitación documentada en el informe final
   * para el caso límite de una tabla de ítems por sí sola más alta que una
   * página completa. */
  const medirSecciones = (hoja: HTMLElement): SeccionMedida[] => {
    const hojaRect = hoja.getBoundingClientRect();
    const pxPorMm = hoja.offsetWidth / ANCHO_UTIL_MM;
    return Array.from(hoja.children).map((child) => {
      const r = (child as HTMLElement).getBoundingClientRect();
      return {
        top: (r.top - hojaRect.top) / pxPorMm,
        bottom: (r.bottom - hojaRect.top) / pxPorMm,
      };
    });
  };

  const actualizarEtiquetaPagina = (totalPaginas: number): (() => void) => {
    const span = document.getElementById("proforma-pagina-total");
    const original = span?.textContent ?? null;
    if (span) span.textContent = String(totalPaginas);
    return () => {
      if (span) span.textContent = original;
    };
  };

  // Imprime vía window.print() (@media print). La paginación real entre
  // hojas físicas la decide el motor de impresión del navegador (fuera de
  // nuestro control); esto solo corrige la etiqueta "Página 1 de N" visible
  // en el encabezado para que dependa del contenido real y no quede
  // hardcodeada en "1 de 1" cuando el documento es evidentemente más largo.
  const imprimirDirecto = () => {
    const hoja = document.getElementById("hoja-proforma");
    if (!hoja) {
      window.print();
      return;
    }
    const totalPaginas = calcularTotalPaginas(medirSecciones(hoja), ALTO_UTIL_MM);
    const restaurar = actualizarEtiquetaPagina(totalPaginas);
    window.print();
    // El diálogo de impresión es síncrono para el usuario pero no bloquea
    // el hilo de JS — restauramos en el siguiente tick para no dejar la
    // pantalla (fuera de impresión) mostrando un número distinto al que
    // tenía antes de abrir el diálogo.
    setTimeout(restaurar, 0);
  };

  // Genera y descarga un PDF real (carta) de la hoja, sin diálogo de
  // impresión. Caso común (validado con datos reales: Proforma 3903, 1
  // ítem → 1 página): una sola imagen ajustada al ancho de la hoja. Caso de
  // contenido más largo que una página: se corta el canvas en los mismos
  // límites de SECCIÓN usados para calcular totalPaginas, para no partir
  // una sección a la mitad; cada página de continuación lleva un
  // encabezado mínimo (número de proforma + página X de Y) dibujado
  // directamente por jsPDF, no una réplica completa del encabezado HTML.
  const descargarPdf = async () => {
    const hoja = document.getElementById("hoja-proforma");
    if (!hoja) return;

    const secciones = medirSecciones(hoja);
    const totalPaginas = calcularTotalPaginas(secciones, ALTO_UTIL_MM);
    const restaurarEtiqueta = actualizarEtiquetaPagina(totalPaginas);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(hoja, { scale: 2, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ unit: "mm", format: "letter" });

      if (totalPaginas <= 1) {
        let w = ANCHO_UTIL_MM;
        let h = (canvas.height * w) / canvas.width;
        if (h > ALTO_UTIL_MM) {
          h = ALTO_UTIL_MM;
          w = (canvas.width * h) / canvas.height;
        }
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGEN_MM, MARGEN_MM, w, h);
      } else {
        // Límites de cada página como offsets mm (no índices de sección):
        // [primerTop, ...cortes, últimoBottom]. Con esto un tramo NUNCA
        // puede medir más que ALTO_UTIL_MM — a diferencia de una versión
        // anterior que asumía que una "sección" siempre cabía completa en
        // una sola página y, para una tabla de ítems más alta que una
        // página, dibujaba una imagen más alta que la hoja física: lo que
        // sobraba del alto quedaba fuera del PDF sin pasar a la página
        // siguiente (contenido perdido en silencio). Ver el test de
        // regresión en comercial.proformas.$id.logic.test.ts.
        const pxPorMmCanvas = canvas.width / ANCHO_UTIL_MM;
        const cortes = calcularCortesDePagina(secciones, ALTO_UTIL_MM);
        const limites = [secciones[0].top, ...cortes, secciones[secciones.length - 1].bottom];

        for (let i = 0; i < limites.length - 1; i++) {
          const inicioMm = limites[i];
          const finMm = limites[i + 1];
          const altoTramoMm = Math.min(finMm - inicioMm, ALTO_UTIL_MM);
          const syPx = Math.max(0, Math.round(inicioMm * pxPorMmCanvas));
          const shPx = Math.max(1, Math.min(canvas.height - syPx, Math.round(altoTramoMm * pxPorMmCanvas)));

          const lienzo = document.createElement("canvas");
          lienzo.width = canvas.width;
          lienzo.height = shPx;
          const ctx = lienzo.getContext("2d");
          if (!ctx) throw new Error("No se pudo preparar el lienzo de la página.");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(canvas, 0, syPx, canvas.width, shPx, 0, 0, canvas.width, shPx);

          if (i > 0) {
            pdf.addPage();
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 120);
            pdf.text(
              `Proforma ${proforma.numero} · ${abreviarNombreTenant(user?.tenantNombre ?? encabezado.razonSocial)} · Página ${i + 1} de ${totalPaginas} (continuación)`,
              MARGEN_MM,
              MARGEN_MM - 4,
            );
          }
          pdf.addImage(lienzo.toDataURL("image/png"), "PNG", MARGEN_MM, MARGEN_MM, ANCHO_UTIL_MM, altoTramoMm);
        }
      }

      const fecha = new Date(proforma.createdAt).toISOString().slice(0, 10);
      const cliente = proforma.clienteNombre.replace(/[\\/:*?"<>|]+/g, "").trim();
      pdf.save(`Proforma ${proforma.numero} - ${cliente} - ${fecha}.pdf`);
    } finally {
      restaurarEtiqueta();
    }
  };

  // Cliente, Condiciones comerciales, Detalle de productos, Totales e
  // impuestos y Retenciones quedan un poco más compactos que el resto de la
  // hoja (encabezado, identificación, observaciones, firmas) — a pedido
  // explícito, a mitad de camino entre el tamaño original y el aumento
  // general que se hizo antes. `etqTitulo` conserva el tamaño grande SOLO
  // para el título de "Observaciones" (la única sección que reutilizaba
  // `etq` pero debía quedar igual que el resto).
  const etq = "text-[7.3px] font-bold uppercase tracking-tight text-slate-600";
  const etqTitulo = "text-[8px] font-bold uppercase tracking-tight text-slate-600";
  const val = "text-[8.8px]";
  const caja = "border border-slate-500 px-1.5 py-1";

  return (
    <AppShell
      title={`Proforma ${proforma.numero}`}
      description="Vista de impresión — misma distribución que la plantilla Factura Proforma"
      actions={
        <>
          <Link to="/comercial/gestion">
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
          {acciones.puedeAceptar && (
            <Button
              size="sm"
              className="gap-1.5 print:hidden"
              disabled={aceptando}
              onClick={() => void aceptarProforma()}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Aceptar Proforma
            </Button>
          )}
          {acciones.puedeCrearPedido && (
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
              <span className="text-slate-500">Sin cotización</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Proforma:</span>
            <Badge variant="outline">{proforma.numero}</Badge>
            <EstadoBadge estado={proforma.estado} />
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
              <span className="text-slate-500">Sin pedido</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">ERP:</span>
            {proforma.erpDocumentoNumero ? (
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-slate-700">{proforma.erpDocumentoNumero}</span>
                <EstadoBadge estado="Vinculado" />
              </span>
            ) : acciones.puedeEditar ? (
              <AsignarErpProforma proformaId={proforma.id} onAsignado={refresh} />
            ) : (
              <EstadoBadge estado="Sin vínculo" />
            )}
          </div>
        </div>
        {user?.isSuperadmin && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5 text-xs text-estado-danger-fg hover:bg-estado-danger-bg hover:text-estado-danger-fg"
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
        {/* 1. ENCABEZADO CORPORATIVO — logo con espacio de respiración y sin
            deformarlo (w-auto mantiene el aspect ratio real del archivo);
            jerarquía clara marca → razón social → contacto por sede, en vez
            de un bloque de texto denso. Mismo formato/distribución que
            siempre tuvo Ricol, ahora resuelto por empresa del tenant
            (empresaId/encabezado, arriba) en vez de texto fijo — para Ricol
            el resultado es idéntico byte a byte al de antes (mismo logo,
            mismo texto). Cada bloque opcional (régimen fiscal, sedes, web/
            correo, actividades ICA) se omite por completo si esa empresa no
            tiene ese dato todavía (ver ENCABEZADOS_CORPORATIVOS_PROFORMA en
            comercial.proformas.$id.logic.ts) — nunca se inventa ni se toma
            prestado de otra empresa. */}
        <div className="flex items-start justify-between gap-6 border-b border-slate-300 pb-3">
          <div className="flex flex-col items-start gap-2">
            {empresaId === "RC" ? (
              <img
                src="/ricol-logo-proforma.png"
                alt={encabezado.razonSocial}
                className="h-12 w-auto"
              />
            ) : (
              <LogoEmpresa empresaId={empresaId} alto={48} className="shrink-0 overflow-hidden" />
            )}
            <div className="text-left leading-snug">
              <p className="text-[9.5px] font-bold uppercase tracking-tight text-slate-900">
                {encabezado.razonSocial}
              </p>
              {(encabezado.nit || encabezado.regimenFiscal) && (
                <p className="text-[8px] text-slate-600">
                  {encabezado.nit && <>NIT {encabezado.nit}</>}
                  {encabezado.nit && encabezado.regimenFiscal && " · "}
                  {encabezado.regimenFiscal}
                </p>
              )}
              {encabezado.sedes && encabezado.sedes.length > 0 && (
                <div className="mt-1.5 grid grid-cols-1 gap-x-5 gap-y-0.5 text-[8px] text-slate-600 sm:grid-cols-3">
                  {encabezado.sedes.map((sede) => (
                    <p key={sede.etiqueta}>
                      <span className="font-semibold text-slate-700">{sede.etiqueta}:</span>{" "}
                      {sede.texto}
                    </p>
                  ))}
                </div>
              )}
              {(encabezado.web || encabezado.correo) && (
                <p className="mt-1 text-[8px] text-slate-600">
                  {[encabezado.web, encabezado.correo].filter(Boolean).join(" · ")}
                </p>
              )}
              {encabezado.actividadesIca && (
                <p className="mt-1 text-[6.8px] leading-snug text-slate-500">
                  {encabezado.actividadesIca}
                </p>
              )}
            </div>
          </div>

          {/* 2. IDENTIFICACIÓN + 11. LEYENDA DE DOCUMENTO NO FISCAL — la
              leyenda va aquí, justo debajo del título, para que sea lo
              primero que se lea y quede garantizado en la página 1 sin
              importar cuántas páginas tenga el documento. Fecha y Hora van
              en renglones separados (antes iban pegadas en un solo string
              con toLocaleString) y la Página siempre refleja el total real
              de páginas medido del contenido (ver medirSecciones), nunca
              queda hardcodeada en "1 de 1". */}
          <div className={cn(caja, "flex w-60 shrink-0 flex-col gap-1.5")}>
            <p className="text-center text-[11.5px] font-bold tracking-wide">FACTURA PROFORMA</p>
            <p className="border-y border-slate-300 py-1 text-center text-[8px] font-bold uppercase tracking-tight text-slate-700">
              Documento no válido como factura de venta
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[9.5px]">
              <span className="font-bold">Número:</span>
              <span className="text-right font-semibold">{proforma.numero}</span>
              <span className="font-bold">Fecha:</span>
              <span className="text-right">{formatearFechaProforma(proforma.createdAt)}</span>
              <span className="font-bold">Hora:</span>
              <span className="text-right">{formatearHoraProforma(proforma.createdAt)}</span>
              <span className="font-bold">Página:</span>
              <span className="text-right">
                1 de <span id="proforma-pagina-total">1</span>
              </span>
            </div>
          </div>
        </div>

        {/* 3. INFORMACIÓN DEL CLIENTE — cada campo opcional se oculta por
            completo cuando no hay un valor real que mostrar (nada de
            "TELÉFONO: | 3122596483", nada de "—" de relleno ni de
            etiquetas huérfanas como el antiguo "Código:"/"Fax:" sin dato).
            Ver esValorMostrable en comercial.proformas.$id.logic.ts —
            filtra también placeholders residuales del ERP como el
            contacto="." real de la Proforma 3903. */}
        <div className="mt-3 border border-slate-400">
          <p className={cn(etq, "border-b border-slate-300 bg-slate-50 px-2 py-1")}>
            Información del cliente
          </p>
          <div className="grid grid-cols-1 gap-x-5 gap-y-2 px-2 py-2 sm:grid-cols-3">
            <Campo etiqueta="Cliente" className="sm:col-span-2">
              <span className="font-semibold">{proforma.clienteNombre}</span>
            </Campo>
            {valorONulo(proforma.clienteNit) && (
              <Campo etiqueta="NIT / C.C.">{valorONulo(proforma.clienteNit)}</Campo>
            )}
            {valorONulo(proforma.contacto) && (
              <Campo etiqueta="Contacto">{valorONulo(proforma.contacto)}</Campo>
            )}
            {valorONulo(proforma.telefono) && (
              <Campo etiqueta="Teléfono">{valorONulo(proforma.telefono)}</Campo>
            )}
            {valorONulo(proforma.ciudad) && (
              <Campo etiqueta="Ciudad">{valorONulo(proforma.ciudad)}</Campo>
            )}
            {valorONulo(proforma.direccion) && (
              <Campo etiqueta="Dirección" className="sm:col-span-2">
                {valorONulo(proforma.direccion)}
              </Campo>
            )}
          </div>
        </div>

        {/* 4. CONDICIONES COMERCIALES — únicamente con datos que RicoSoft ya
            tiene disponibles hoy: forma de pago, moneda, vendedor, vigencia
            de la oferta (fechaVencimiento), OC del cliente, documento
            alterno, remisiones y la cotización/documento ERP de origen si
            existen. Campos que el modelo de Proforma NO soporta todavía —
            tiempo estimado de entrega, lugar de despacho, lugar de entrega,
            Incoterm — se omiten a propósito: no se inventan valores. Ver
            informe final de la tarea para lo que haría falta agregarlos. */}
        <div className="mt-2 border border-slate-400">
          <p className={cn(etq, "border-b border-slate-300 bg-slate-50 px-2 py-1")}>
            Condiciones comerciales
          </p>
          <div className="grid grid-cols-1 gap-x-5 gap-y-2 px-2 py-2 sm:grid-cols-3">
            {valorONulo(proforma.formaPago) && (
              <Campo etiqueta="Forma de pago">{valorONulo(proforma.formaPago)}</Campo>
            )}
            <Campo etiqueta="Moneda">{proforma.moneda}</Campo>
            {valorONulo(proforma.vendedorNombre) && (
              <Campo etiqueta="Vendedor">{valorONulo(proforma.vendedorNombre)}</Campo>
            )}
            {proforma.fechaVencimiento && (
              <Campo etiqueta="Vigencia de la oferta">
                {formatearFechaProforma(proforma.fechaVencimiento)}
              </Campo>
            )}
            {valorONulo(proforma.ocNumero) && (
              <Campo etiqueta="OC del cliente">{valorONulo(proforma.ocNumero)}</Campo>
            )}
            {valorONulo(proforma.documentoAlterno) && (
              <Campo etiqueta="Documento alterno">{valorONulo(proforma.documentoAlterno)}</Campo>
            )}
            {valorONulo(proforma.remisiones) && (
              <Campo etiqueta="Remisiones">{valorONulo(proforma.remisiones)}</Campo>
            )}
            {valorONulo(proforma.cotizacionNumero) && (
              <Campo etiqueta="Cotización de origen">{valorONulo(proforma.cotizacionNumero)}</Campo>
            )}
            {valorONulo(proforma.erpDocumentoNumero) && (
              <Campo etiqueta="Documento ERP">{valorONulo(proforma.erpDocumentoNumero)}</Campo>
            )}
          </div>
        </div>

        {/* 5. DETALLE DE PRODUCTOS — Referencia y Descripción ahora son
            columnas separadas (antes se mezclaban en una sola celda "REF -
            Descripción"); orden de columnas igual al pedido: Referencia,
            Descripción, Bodega, U.M., Cantidad[, Paquetes], Precio unitario,
            Descuento, IVA, Subtotal. Las descripciones largas se ajustan en
            varias líneas (sin `truncate`/`overflow-hidden`), nunca se
            cortan. El LOTE no se imprime a propósito: pertenece a
            inventario/despacho, no a la Proforma (ProformaItem no tiene ese
            campo).

            Columna "Paquetes" — EXCLUSIVA de Green Solutions (esGreen,
            arriba): cada paquete tiene 32 plocks (calcularEmpaquePlocks,
            comercial.proformas.$id.logic.ts). Para Green, "Cantidad"
            muestra la cantidad YA AJUSTADA al múltiplo de 32 (lo que el
            documento debe reflejar) y "Paquetes" el entero correspondiente
            — mismo cálculo para vista/PDF/impresión porque los 3 salen de
            este único componente. El Subtotal de la línea sigue
            calculándose con la cantidad tal como quedó registrada en el
            ítem (sin cambios a la lógica comercial existente): esta columna
            es información de empaque adicional, no altera precios/totales.
            Para Ricol/Flexipack, esGreen es false: Cantidad/offsetCols no
            tienen ningún efecto y la tabla queda exactamente como siempre. */}
        <div className="mt-3 border border-slate-400">
          <p className={cn(etq, "border-b border-slate-300 bg-slate-50 px-2 py-1")}>
            Detalle de productos
          </p>
          <div className="grid [&>div]:border-slate-300" style={{ gridTemplateColumns: colsItems }}>
            <Celda col="1 / 2" row="1" className={cn(etq, "border-b px-1 py-1 text-center")}>
              Referencia
            </Celda>
            <Celda col="2 / 5" row="1" className={cn(etq, "border-b border-l px-1 py-1 text-center")}>
              Descripción
            </Celda>
            <Celda col="5 / 6" row="1" className={cn(etq, "border-b border-l px-1 py-1 text-center")}>
              Bodega
            </Celda>
            <Celda col="6 / 7" row="1" className={cn(etq, "border-b border-l px-1 py-1 text-center")}>
              U.M.
            </Celda>
            <Celda col="7 / 8" row="1" className={cn(etq, "border-b border-l px-1 py-1 text-center")}>
              Cantidad
            </Celda>
            {esGreen && (
              <Celda
                col="8 / 9"
                row="1"
                className={cn(etq, "border-b border-l px-1 py-1 text-center")}
              >
                Paquetes
              </Celda>
            )}
            <Celda
              col={`${8 + offsetCols} / ${9 + offsetCols}`}
              row="1"
              className={cn(etq, "border-b border-l px-1 py-1 text-center")}
            >
              Precio unit.
            </Celda>
            <Celda
              col={`${9 + offsetCols} / ${10 + offsetCols}`}
              row="1"
              className={cn(etq, "border-b border-l px-1 py-1 text-center")}
            >
              Dscto %
            </Celda>
            <Celda
              col={`${10 + offsetCols} / ${11 + offsetCols}`}
              row="1"
              className={cn(etq, "border-b border-l px-1 py-1 text-center")}
            >
              IVA %
            </Celda>
            <Celda
              col={`${11 + offsetCols} / ${12 + offsetCols}`}
              row="1"
              className={cn(etq, "border-b border-l px-1 py-1 text-center")}
            >
              Subtotal
            </Celda>

            {itemsConEmpaque.map((it, idx) => {
              // Cantidad efectiva de la línea: para Green, la documentada
              // (empaque + 1% de desperdicio ya resueltos, siempre múltiplo
              // de 32) — nunca la cantidad solicitada ni la intermedia con
              // desperdicio sin redondear. Para Ricol/Flexipack, la
              // cantidad tal como está registrada, sin cambios.
              const { paquetes, cantidadDocumentada } = it.empaque;
              const cantidadEfectiva = esGreen ? cantidadDocumentada : it.cantidad;
              const subLinea = cantidadEfectiva * it.precioUnitario * (1 - it.descuentoPct / 100);
              const fila = idx + 2;
              return (
                <div key={it.id ?? idx} style={{ display: "contents" }}>
                  <Celda
                    col="1 / 2"
                    row={String(fila)}
                    className={cn(val, "border-t break-words px-1 py-1")}
                  >
                    {valorONulo(it.referencia) ?? "—"}
                  </Celda>
                  <Celda
                    col="2 / 5"
                    row={String(fila)}
                    className={cn(val, "border-t border-l break-words px-1 py-1")}
                  >
                    {it.descripcion}
                  </Celda>
                  <Celda
                    col="5 / 6"
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-center")}
                  >
                    {valorONulo(it.bodega) ?? "—"}
                  </Celda>
                  <Celda
                    col="6 / 7"
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-center")}
                  >
                    {valorONulo(it.unidadMedida) ?? "—"}
                  </Celda>
                  <Celda
                    col="7 / 8"
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-right")}
                  >
                    {cantidadEfectiva.toLocaleString("es-CO")}
                  </Celda>
                  {esGreen && (
                    <Celda
                      col="8 / 9"
                      row={String(fila)}
                      className={cn(val, "border-t border-l px-1 py-1 text-right")}
                    >
                      {paquetes.toLocaleString("es-CO")}
                    </Celda>
                  )}
                  <Celda
                    col={`${8 + offsetCols} / ${9 + offsetCols}`}
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-right")}
                  >
                    {money(it.precioUnitario)}
                  </Celda>
                  <Celda
                    col={`${9 + offsetCols} / ${10 + offsetCols}`}
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-right")}
                  >
                    {it.descuentoPct}%
                  </Celda>
                  <Celda
                    col={`${10 + offsetCols} / ${11 + offsetCols}`}
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-right")}
                  >
                    {it.ivaPct}%
                  </Celda>
                  <Celda
                    col={`${11 + offsetCols} / ${12 + offsetCols}`}
                    row={String(fila)}
                    className={cn(val, "border-t border-l px-1 py-1 text-right font-semibold")}
                  >
                    {money(subLinea)}
                  </Celda>
                </div>
              );
            })}
          </div>
        </div>

        {/* 6. TOTALES E IMPUESTOS — mismos valores que ya calculó y
            persistió el backend (domain/ventas/proforma-calculo.ts), solo
            reordenados/rotulados con más claridad: total bruto → descuentos
            → subtotal → IVA → retenciones → TOTAL del documento resaltado.
            Ninguna fórmula cambia aquí. */}
        <div className="mt-3 border border-slate-400">
          <p className={cn(etq, "border-b border-slate-300 bg-slate-50 px-2 py-1")}>
            Totales e impuestos
          </p>
          <div className="grid" style={{ gridTemplateColumns: COLS }}>
            <Celda
              col="1 / 4"
              row="1"
              className={cn(etq, "border-b border-slate-300 px-1 py-1 text-center")}
            >
              Total bruto
            </Celda>
            <Celda
              col="4 / 6"
              row="1"
              className={cn(etq, "border-b border-l border-slate-300 px-1 py-1 text-center")}
            >
              Descuentos
            </Celda>
            <Celda
              col="6 / 7"
              row="1"
              className={cn(etq, "border-b border-l border-slate-300 px-1 py-1 text-center")}
            >
              Subtotal
            </Celda>
            <Celda
              col="7 / 9"
              row="1"
              className={cn(etq, "border-b border-l border-slate-300 px-1 py-1 text-center")}
            >
              IVA
            </Celda>
            <Celda
              col="9 / 10"
              row="1"
              className={cn(etq, "border-b border-l border-slate-300 px-1 py-1 text-center")}
            >
              Retenciones
            </Celda>
            <Celda
              col="10 / 12"
              row="1"
              className={cn(
                etq,
                "border-b border-l border-slate-300 bg-slate-100 px-1 py-1 text-center",
              )}
            >
              Total documento
            </Celda>

            <Celda col="1 / 4" row="2" className={cn(val, "px-1 py-1.5 text-center")}>
              {money(totalBruto)}
            </Celda>
            <Celda
              col="4 / 6"
              row="2"
              className={cn(val, "border-l border-slate-300 px-1 py-1.5 text-center")}
            >
              {money(totalBruto - subtotal)}
            </Celda>
            <Celda
              col="6 / 7"
              row="2"
              className={cn(val, "border-l border-slate-300 px-1 py-1.5 text-center")}
            >
              {money(subtotal)}
            </Celda>
            <Celda
              col="7 / 9"
              row="2"
              className={cn(val, "border-l border-slate-300 px-1 py-1.5 text-center")}
            >
              {money(iva)}
            </Celda>
            <Celda
              col="9 / 10"
              row="2"
              className={cn(val, "border-l border-slate-300 px-1 py-1.5 text-center")}
            >
              {money(retencionFuente + retencionIva + retencionIca)}
            </Celda>
            <Celda
              col="10 / 12"
              row="2"
              className={cn(
                val,
                "border-l border-slate-300 bg-slate-100 px-1 py-1.5 text-center text-[10.6px] font-bold",
              )}
            >
              {money(total)}
            </Celda>
          </div>
        </div>

        {/* 7. RETENCIONES — mismo cálculo del backend (calcularTotalesProforma),
            solo presentado como conceptos separados con un total explícito;
            nunca se muestra como un descuento comercial. No todas las
            Proformas tienen las mismas retenciones activas (snapshot propio
            de cada una: aplicaRetencion/aplicaRetencionIva/aplicaIca). */}
        {(proforma.aplicaRetencion || proforma.aplicaRetencionIva || proforma.aplicaIca) && (
          <div className="mt-3 border border-slate-400">
            <p className={cn(etq, "border-b border-slate-300 bg-slate-50 px-2 py-1")}>
              Retenciones
            </p>
            <div className="divide-y divide-slate-200 px-2">
              {proforma.aplicaRetencion && (
                <div className="flex items-center justify-between py-1 text-[8.8px]">
                  <span>Retención en la fuente ({proforma.retencionPct}%)</span>
                  <span className="font-semibold">{money(retencionFuente)}</span>
                </div>
              )}
              {proforma.aplicaRetencionIva && (
                <div className="flex items-center justify-between py-1 text-[8.8px]">
                  <span>Retención de IVA ({proforma.retencionIvaPct}%)</span>
                  <span className="font-semibold">{money(retencionIva)}</span>
                </div>
              )}
              {proforma.aplicaIca && (
                <div className="flex items-center justify-between py-1 text-[8.8px]">
                  <span>Retención de ICA ({proforma.icaPct}%)</span>
                  <span className="font-semibold">{money(retencionIca)}</span>
                </div>
              )}
              <div className="flex items-center justify-between py-1 text-[8.8px] font-bold">
                <span>Total retenciones</span>
                <span>{money(retencionFuente + retencionIva + retencionIca)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 8. OBSERVACIONES — whitespace-pre-wrap para no colapsar saltos de
            línea de una observación con varios renglones (antes se perdían). */}
        <div className="mt-3 border border-slate-400">
          <p className={cn(etqTitulo, "border-b border-slate-300 bg-slate-50 px-2 py-1")}>
            Observaciones
          </p>
          <p className="min-h-[16px] whitespace-pre-wrap px-2 py-1.5 text-[9.5px]">
            {proforma.observaciones || ""}
          </p>
        </div>

        {/* 10. FIRMAS — más espacio vertical (mt-10 en vez de mt-6) para que
            la línea de firma no quede comprimida ni se superponga con el
            texto de abajo; se conserva toda la información legal existente
            (ELABORADO/ACEPTADA). No se inventan firmas digitales. */}
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[9.5px]">
          <div>
            <p className="text-[8px] uppercase tracking-tight text-slate-500">Elaborado por</p>
            <p className="font-semibold">{proforma.creadoPorNombre}</p>
            <div className="mt-10 grid grid-cols-2 gap-2 border-t border-slate-400 pt-1.5">
              <span>Firma</span>
              <span>Sello</span>
            </div>
            <p className="mt-1 text-[8px] font-bold tracking-widest">ELABORADO</p>
          </div>
          <div>
            <p className="text-[8px] uppercase tracking-tight text-slate-500">
              Aceptación del cliente
            </p>
            <div className="mt-10 grid grid-cols-3 gap-2 border-t border-slate-400 pt-1.5">
              <span>Recibí</span>
              <span>Firma</span>
              <span>Sello</span>
            </div>
            <p className="mt-1 text-[8px] font-bold tracking-widest">ACEPTADA</p>
          </div>
        </div>

        {/* 9. INFORMACIÓN COMERCIAL / LEGAL — mismo texto legal existente,
            no se inventan referencias legales nuevas. */}
        <p className="mt-6 text-center text-[8px] leading-relaxed text-slate-500">
          Los cheques devueltos tendrán sanción del 20% según el artículo 731 del Código de
          Comercio.
          <br />
          Se cobran intereses de mora a la tasa máxima legal vigente a partir de la fecha de
          vencimiento.
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
        className="text-xs text-estado-success-fg underline hover:no-underline"
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
