import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableMessageRow,
  TableRow,
} from "@/components/ui/table";
import { CLASES_TONO_ESTADO } from "@/lib/estado-tono";
import { cn } from "@/lib/utils";
import { money } from "@/lib/data";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requireAnyPermisoGuard } from "@/lib/route-guards";
import { useDocumentosComerciales, type DocumentoBandeja } from "@/hooks/use-comercial";
import { NuevoDocumentoMenu } from "@/components/nuevo-documento-menu";
import { SincronizarCotizacionesSiesa } from "@/components/sincronizar-cotizaciones-siesa-dialog";
import {
  tabDesdeUrl,
  tabEfectiva,
  tabsVisibles as calcularTabsVisibles,
  type TabGestion,
} from "@/lib/gestion-comercial-tabs";
import { estadoBandejaPedido } from "@/lib/estado-pedido-bandeja";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";

// Basta con VER de UNA de las 3 secciones que agrega esta bandeja
// (Cotizaciones, Proformas, Pedidos comerciales) — cada sección se filtra
// aparte más abajo, tanto en las pestañas visibles como en lo que devuelve
// el backend (ver documentos.controller.ts).
const PERMISOS_SECCION_COMERCIAL = [
  PERMISOS_SISTEMA.COTIZACIONES_VER,
  PERMISOS_SISTEMA.PROFORMAS_VER,
  PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
];

export const Route = createFileRoute("/comercial/gestion")({
  beforeLoad: requireAnyPermisoGuard(PERMISOS_SECCION_COMERCIAL),
  // ?tab=pedidos|cotizaciones|proformas|todos abre esa pestaña (p. ej. el
  // enlace de la tarjeta "Comprometido en Siesa" de Inventario).
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Gestión Comercial | RicoSoft" },
      {
        name: "description",
        content: "Bandeja de Cotizaciones, Proformas y Pedidos comerciales.",
      },
    ],
  }),
  component: GestionComercial,
});

function rutaDocumento(doc: DocumentoBandeja): string {
  if (doc.tipo === "cotizacion") return `/comercial/cotizaciones/${doc.id}`;
  if (doc.tipo === "pedido") return `/comercial/pedidos/${doc.id}`;
  return `/comercial/proformas/${doc.id}`;
}

function etiquetaTipo(tipo: DocumentoBandeja["tipo"]): string {
  if (tipo === "cotizacion") return "Cotización";
  if (tipo === "pedido") return "Pedido";
  return "Proforma";
}

/** Estado de una fila, SIEMPRE con el semáforo oficial (EstadoBadge). En la pestaña
 * Pedidos: estado operativo UnoEE si tiene PDV vinculado, "Pendiente de envío a
 * ERP" si no, o el estado comercial si Siesa no respondió. En el resto de
 * pestañas: el estado comercial de siempre. */
function EstadoDocumento({ doc, conSiesa }: { doc: DocumentoBandeja; conSiesa: boolean }) {
  if (!conSiesa || doc.tipo !== "pedido") return <EstadoBadge estado={doc.estado} />;
  return <EstadoBadge estado={estadoBandejaPedido(doc.estado, doc.compromiso).texto} />;
}

/** Bandeja de documentos comerciales (Todos/Cotizaciones/Proformas/Pedidos).
 * Se monta solo en estas pestañas: "Comprometido en Siesa" no dispara esta
 * consulta. */
function BandejaDocumentos({ tipo }: { tipo: DocumentoBandeja["tipo"] | "todos" }) {
  const esBandejaPedidos = tipo === "pedido";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Cambiar de pestaña remonta el componente (key), así que la página vuelve a 1.
  const { items, total, compromisoDisponible, loading, error } = useDocumentosComerciales({
    tipo,
    // En la pestaña Pedidos cada fila muestra su estado operativo en Siesa.
    incluirCompromiso: esBandejaPedidos,
    search: search || undefined,
    page,
    pageSize,
  });

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      {esBandejaPedidos && !compromisoDisponible && (
        <p
          role="status"
          className={cn("mt-3 rounded-md border px-3 py-2 text-xs", CLASES_TONO_ESTADO.warning)}
        >
          No fue posible consultar Siesa: se muestra el estado comercial de cada pedido.
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="Número, cliente, documento ERP..."
            className="pl-7"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <Table density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead numeric>Valor</TableHead>
                <TableHead numeric>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableMessageRow colSpan={7} kind="loading" />}
              {!loading && error && <TableMessageRow colSpan={7} kind="error" title={error} />}
              {!loading && !error && items.length === 0 && (
                <TableMessageRow
                  colSpan={7}
                  kind="empty"
                  icon={FileText}
                  title="Sin documentos comerciales todavía."
                />
              )}
              {items.map((doc) => (
                <TableRow key={`${doc.tipo}-${doc.id}`}>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" /> {etiquetaTipo(doc.tipo)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{doc.numero}</TableCell>
                  <TableCell>{doc.cliente}</TableCell>
                  <TableCell>{new Date(doc.fecha).toLocaleDateString("es-CO")}</TableCell>
                  <TableCell>
                    <EstadoDocumento doc={doc} conSiesa={esBandejaPedidos} />
                  </TableCell>
                  <TableCell numeric>{money(doc.valor)}</TableCell>
                  <TableCell numeric>
                    <Link to={rutaDocumento(doc)}>
                      <Button size="sm" variant="ghost">
                        Ver
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{total} documentos</span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span>
            Página {page} de {totalPaginas}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </>
  );
}

function GestionComercial() {
  const { user } = useSession();
  const { tab: tabUrl } = Route.useSearch();
  // Cada pestaña exige sus propios permisos — un usuario con, por ejemplo,
  // solo pedidos_comerciales.ver entra a la bandeja (gracias al beforeLoad con
  // requireAnyPermisoGuard) pero no ve las pestañas de Cotizaciones/Proformas
  const tabsVisibles = calcularTabsVisibles((permiso) => hasPermission(user, permiso));

  const [tab, setTab] = useState<TabGestion>(tabDesdeUrl(tabUrl) ?? "todos");
  // Cambia tras sincronizar con Siesa para recargar la bandeja (remonta BandejaDocumentos).
  const [refresco, setRefresco] = useState(0);

  // Si el tab activo deja de ser válido para este usuario (p. ej. un enlace
  // ?tab=pedidos sin pedidos_comerciales.ver) se cae de vuelta a "todos".
  const tabEfectivo = tabEfectiva(tab, tabsVisibles);

  return (
    <AppShell
      title="Gestión Comercial"
      description="Cotizaciones, Proformas y Pedidos comerciales en un solo lugar."
      actions={<NuevoDocumentoMenu />}
    >
      <div className="flex flex-wrap gap-1">
        {tabsVisibles.map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={tabEfectivo === t.value ? "default" : "outline"}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {tabEfectivo === "cotizacion" && (
        <div className="mt-3 flex justify-end">
          {/* Solo con cotizaciones.gestionar (el componente se oculta sin el permiso). */}
          <SincronizarCotizacionesSiesa onSincronizado={() => setRefresco((n) => n + 1)} />
        </div>
      )}
      <BandejaDocumentos key={`${tabEfectivo}-${refresco}`} tipo={tabEfectivo} />
    </AppShell>
  );
}
