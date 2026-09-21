import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge, EstadoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/data";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { requireAnyPermisoGuard } from "@/lib/route-guards";
import { useDocumentosComerciales, type DocumentoBandeja } from "@/hooks/use-comercial";
import { CotizacionDialog } from "@/components/cotizacion-dialog";
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

const TABS: {
  value: DocumentoBandeja["tipo"] | "todos";
  label: string;
  permiso?: string;
}[] = [
  { value: "todos", label: "Todos" },
  { value: "cotizacion", label: "Cotizaciones", permiso: PERMISOS_SISTEMA.COTIZACIONES_VER },
  { value: "proforma", label: "Proformas", permiso: PERMISOS_SISTEMA.PROFORMAS_VER },
  {
    value: "pedido",
    label: "Pedidos",
    permiso: PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
  },
];

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

function GestionComercial() {
  const { user } = useSession();
  // Cada pestaña exige su propio VER de sección — un usuario con, por
  // ejemplo, solo pedidos_comerciales.ver entra a la bandeja (gracias al
  // beforeLoad con requireAnyPermisoGuard) pero no debe ver ni poder elegir
  // las pestañas de Cotizaciones o Proformas.
  const tabsVisibles = TABS.filter((t) => !t.permiso || hasPermission(user, t.permiso));
  const puedeCrearCotizacion = hasPermission(user, PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR);

  const [tab, setTab] = useState<DocumentoBandeja["tipo"] | "todos">("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Si el tab activo (persistido en estado local) deja de ser válido para
  // este usuario — p. ej. "todos" nunca se oculta, pero si un día se elige
  // recordar el último tab por localStorage esto evita quedar atascado en
  // una pestaña sin permiso — se cae de vuelta a "todos".
  const tabEfectivo = tabsVisibles.some((t) => t.value === tab) ? tab : "todos";

  const { items, total, loading, error } = useDocumentosComerciales({
    tipo: tabEfectivo,
    search: search || undefined,
    page,
    pageSize,
  });

  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AppShell
      title="Gestión Comercial"
      description="Cotizaciones, Proformas y Pedidos comerciales en un solo lugar."
      actions={puedeCrearCotizacion ? <CotizacionDialog /> : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {tabsVisibles.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={tabEfectivo === t.value ? "default" : "outline"}
              onClick={() => {
                setTab(t.value);
                setPage(1);
              }}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Documento relacionado</TableHead>
                <TableHead>ERP</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs text-slate-500">
                    Cargando...
                  </TableCell>
                </TableRow>
              )}
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs text-red-600">
                    {error}
                  </TableCell>
                </TableRow>
              )}
              {!loading && !error && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-xs text-slate-500">
                    Sin documentos comerciales todavía.
                  </TableCell>
                </TableRow>
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
                    <EstadoBadge estado={doc.estado} />
                  </TableCell>
                  <TableCell className="text-right">{money(doc.valor)}</TableCell>
                  <TableCell>{doc.documentoRelacionado || "Sin documento relacionado"}</TableCell>
                  <TableCell>{doc.erp || "No sincronizado con ERP"}</TableCell>
                  <TableCell className="text-right">
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
    </AppShell>
  );
}
