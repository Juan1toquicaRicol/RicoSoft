import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Info,
  Minus,
  Target,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/ui/stat-card";
import {
  useCentroGerencial,
  type CategoriaIndicador,
  type IndicadorGerencial,
  type NivelIndicador,
} from "@/hooks/use-gerencial";
import { useObjetivos, useResumenObjetivo } from "@/hooks/use-objetivos";
import { elegirObjetivoActivoGerencial } from "@/lib/objetivos-activo";
import { useSession } from "@/lib/session-context";
import { hasPermission } from "@/lib/session";
import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";
import { compact, money } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gerencial")({
  head: () => ({
    meta: [
      { title: "Centro Gerencial | RicoSoft" },
      {
        name: "description",
        content:
          "Centro de Control Gerencial: finanzas, ventas, inventario, producción, compras y riesgos conectados en una sola vista, con drill-down a cada módulo.",
      },
      { property: "og:title", content: "Centro Gerencial | RicoSoft" },
      {
        property: "og:description",
        content: "¿Cómo está la empresa? ¿Por qué? ¿Qué debemos hacer?",
      },
    ],
  }),
  component: CentroGerencialPage,
});

const CATEGORIA_INFO: Record<CategoriaIndicador, { label: string; orden: number }> = {
  finanzas: { label: "Finanzas", orden: 1 },
  ventas: { label: "Ventas", orden: 2 },
  inventario: { label: "Inventario", orden: 3 },
  produccion: { label: "Producción", orden: 4 },
  compras: { label: "Compras / Abastecimiento", orden: 5 },
  riesgos: { label: "Riesgos", orden: 6 },
};

const NIVEL_INFO: Record<NivelIndicador, { label: string; classes: string }> = {
  critico: { label: "Crítico", classes: "bg-red-100 text-red-700" },
  alto: { label: "Alto", classes: "bg-orange-100 text-orange-700" },
  medio: { label: "Medio", classes: "bg-amber-100 text-amber-700" },
  bajo: { label: "Bajo", classes: "bg-slate-100 text-slate-600" },
  informativo: { label: "Informativo", classes: "bg-blue-50 text-blue-700" },
};

function formatearValor(indicador: IndicadorGerencial): string {
  switch (indicador.unidad) {
    case "COP":
      return money(indicador.valor);
    case "%":
      return `${indicador.valor}%`;
    case "dias":
      return `${compact(indicador.valor)} días`;
    case "conteo":
    case "unidades":
    default:
      return compact(indicador.valor);
  }
}

function IconoTendencia({ indicador }: { indicador: IndicadorGerencial }) {
  if (indicador.tendencia === "subida") return <ArrowUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (indicador.tendencia === "bajada") return <ArrowDown className="h-3.5 w-3.5 text-red-600" />;
  if (indicador.tendencia === "estable") return <Minus className="h-3.5 w-3.5 text-slate-400" />;
  return null;
}

function TarjetaIndicador({ indicador }: { indicador: IndicadorGerencial }) {
  const navigate = useNavigate();
  const nivel = NIVEL_INFO[indicador.nivel];

  return (
    <div className="panel p-4 bg-white border-slate-200 shadow-2xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">{indicador.titulo}</p>
        <span
          className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", nivel.classes)}
        >
          {nivel.label}
        </span>
      </div>

      <p className="num mt-1.5 text-lg font-bold text-slate-900">{formatearValor(indicador)}</p>

      {indicador.variacionPct !== null && (
        <div className="mt-0.5 flex items-center gap-1 text-[11px]">
          <IconoTendencia indicador={indicador} />
          <span
            className={cn(
              "num font-semibold",
              indicador.tendencia === "subida"
                ? "text-emerald-600"
                : indicador.tendencia === "bajada"
                  ? "text-red-600"
                  : "text-slate-500",
            )}
          >
            {indicador.variacionPct >= 0 ? "+" : ""}
            {indicador.variacionPct}%
          </span>
          <span className="text-slate-400">{indicador.periodo}</span>
        </div>
      )}
      {indicador.variacionPct === null && (
        <p className="mt-0.5 text-[11px] text-slate-400">{indicador.periodo}</p>
      )}

      {indicador.impacto !== null && indicador.impacto > 0 && (
        <p className="mt-1 text-[11px] text-slate-600">
          Impacto: <span className="num font-semibold">{money(indicador.impacto)}</span>
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] text-slate-400" title={indicador.fuente}>
          {indicador.fuente}
          {indicador.calidadDatos && (
            <span
              className={cn(
                "ml-1 rounded-full px-1.5 py-0.5 font-semibold",
                indicador.calidadDatos === "ALTA"
                  ? "bg-emerald-100 text-emerald-700"
                  : indicador.calidadDatos === "MEDIA"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200 text-slate-600",
              )}
            >
              {indicador.calidadDatos}
            </span>
          )}
        </p>
        {indicador.accion && (
          <button
            type="button"
            onClick={() => navigate({ to: indicador.accion!.ruta })}
            className="shrink-0 text-[11px] font-semibold text-blue-700 hover:underline"
          >
            {indicador.accion.label}
          </button>
        )}
      </div>
    </div>
  );
}

function SeccionCategoria({
  categoria,
  indicadores,
}: {
  categoria: CategoriaIndicador;
  indicadores: IndicadorGerencial[];
}) {
  if (indicadores.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
        <Info className="h-3.5 w-3.5" /> {CATEGORIA_INFO[categoria].label}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((i) => (
          <TarjetaIndicador key={i.id} indicador={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Vistazo del objetivo comercial vigente — primera cosa que ve Gerencia al
 * entrar al Centro Gerencial (a petición explícita: "el objetivo es una
 * decisión de Gerencia, debe verse de primero"). Solo lectura, igual que el
 * resto de Centro Gerencial: el CRUD y el análisis completo (ritmo detallado,
 * comparativo anual, contribución por vendedor) viven en
 * /comercial/objetivos — acá solo se muestran los 4 KPIs mínimos para decidir
 * si vale la pena entrar a mirar el detalle, para no duplicar toda esa
 * pantalla dos veces. NINGUNA fórmula se recalcula acá: se reutiliza tal
 * cual el mismo hook (useResumenObjetivo) que usa esa pantalla, solo se
 * decide CUÁL objetivo mostrar (elegirObjetivoActivoGerencial).
 *
 * No se filtra por año calendario: un objetivo ANUAL o TRIMESTRAL puede
 * cruzar el límite de año (p. ej. oct-2025 a sep-2026) y seguir vigente hoy
 * aunque su campo `anio` sea el del año en que empezó.
 */
function ResumenObjetivosGerencial() {
  const { objetivos, loading: cargandoLista } = useObjetivos({ nivel: "EMPRESA" });
  const objetivoActivo = elegirObjetivoActivoGerencial(objetivos);
  const { resumen, loading: cargandoResumen } = useResumenObjetivo(objetivoActivo?.id ?? null);

  if (cargandoLista) return null;

  if (!objetivoActivo) {
    return (
      <div className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Target className="h-3.5 w-3.5" /> Objetivo comercial
        </h2>
        <div className="panel flex items-center justify-between gap-3 bg-white border-slate-200 p-4 shadow-2xs">
          <p className="text-xs text-slate-500">
            No hay ningún objetivo comercial de empresa configurado todavía.
          </p>
          <Link
            to="/comercial/objetivos"
            className="shrink-0 text-[11px] font-semibold text-blue-700 hover:underline"
          >
            Configurar en Objetivos →
          </Link>
        </div>
      </div>
    );
  }

  if (cargandoResumen)
    return <p className="mb-4 text-xs text-slate-500">Cargando objetivo comercial...</p>;

  // "Siesa no disponible" es un caso distinto de "sin objetivo": el
  // objetivo existe y tiene una meta, pero no se puede calcular la venta
  // real porque este tenant no tiene compañía Siesa configurada (o Siesa no
  // respondió) — nunca se debe mostrar $0 como si realmente no hubiera
  // ventas.
  if (!resumen.disponible || !resumen.cumplimiento) {
    return (
      <div className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Target className="h-3.5 w-3.5" /> Objetivo comercial
        </h2>
        <div className="panel flex items-start gap-2 bg-amber-50 border-amber-200 p-4 text-[11px] text-amber-800 shadow-2xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {resumen.motivo ||
              "No fue posible calcular la venta real de este objetivo en este momento."}
          </span>
        </div>
      </div>
    );
  }

  const { cumplimiento, ritmo } = resumen;

  return (
    <div className="mb-6">
      <Link to="/comercial/objetivos" className="block group">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-blue-700">
            <Target className="h-3.5 w-3.5" /> Objetivo comercial ·{" "}
            {objetivoActivo.tipoPeriodo.toLowerCase()}
            {objetivoActivo.estadoDerivado === "CERRADO" && " · cerrado"}
          </h2>
          <span className="text-[11px] font-semibold text-blue-700 group-hover:underline">
            Ver objetivo completo (ritmo, comparativo y vendedores) →
          </span>
        </div>

        {cumplimiento.metaValor != null && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Meta"
              value={money(cumplimiento.metaValor)}
              icon={Target}
              className="cursor-pointer transition-all hover:border-blue-400"
            />
            <StatCard
              label="Venta acumulada"
              value={money(cumplimiento.ventaRealValor ?? 0)}
              icon={TrendingUp}
              className="cursor-pointer transition-all hover:border-blue-400"
            />
            <StatCard
              label="Cumplimiento"
              value={`${cumplimiento.cumplimientoValorPct ?? 0}%`}
              icon={TrendingUp}
              enfasis={(cumplimiento.cumplimientoValorPct ?? 0) < 100 ? "default" : "atencion"}
              className="cursor-pointer transition-all hover:border-blue-400"
            />
            <StatCard
              label="Ritmo"
              value={ritmo ? ritmo.ritmo : "—"}
              hint={
                ritmo
                  ? `${ritmo.pctMetaCumplida}% vs. ${ritmo.pctTiempoTranscurrido}% del tiempo`
                  : undefined
              }
              icon={TrendingDown}
              enfasis={ritmo?.ritmo === "ATRASADO" ? "atencion" : "default"}
              className="cursor-pointer transition-all hover:border-blue-400"
            />
          </div>
        )}
      </Link>
    </div>
  );
}

function CentroGerencialPage() {
  const { centro, loading } = useCentroGerencial();
  const { user } = useSession();
  const puedeVerObjetivos = hasPermission(user, PERMISOS_SISTEMA.OBJETIVOS_VER);

  return (
    <AppShell
      title="Centro Gerencial"
      description="Cómo está la empresa, por qué, y qué debemos hacer — finanzas, ventas, inventario, producción, compras y riesgos conectados"
    >
      {/* Objetivos comerciales NO se administran aquí — Centro Gerencial es
          de solo lectura por diseño (ver gerencial.controller.ts). El CRUD
          completo vive en /comercial/objetivos; esto es solo el resumen
          ejecutivo, mostrado de primero a petición explícita de Gerencia. */}
      {puedeVerObjetivos && <ResumenObjetivosGerencial />}

      {loading && <p className="text-xs text-slate-500">Cargando...</p>}

      {!loading && centro && !centro.disponibleSiesa && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {centro.motivoSiesaNoDisponible} — se muestran solo los indicadores que no dependen de
            Siesa (finanzas, compras, producción nativa de RicoSoft).
          </span>
        </div>
      )}

      {!loading && centro && (
        <>
          {(Object.keys(CATEGORIA_INFO) as CategoriaIndicador[])
            .sort((a, b) => CATEGORIA_INFO[a].orden - CATEGORIA_INFO[b].orden)
            .map((categoria) => (
              <SeccionCategoria
                key={categoria}
                categoria={categoria}
                indicadores={centro.indicadores.filter((i) => i.categoria === categoria)}
              />
            ))}

          {centro.indicadores.length === 0 && (
            <div className="panel p-5 bg-white border-slate-200 shadow-2xs text-xs text-slate-500">
              No hay indicadores disponibles todavía.
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Cada indicador declara su fuente real (Siesa o RicoSoft) y, cuando depende de
              historial de ventas, su calidad de datos (ALTA/MEDIA/BAJA) — nunca se presenta una
              cifra como verdad absoluta si el histórico es insuficiente. Ningún botón ejecuta una
              acción automáticamente: siempre navega al módulo correspondiente para que decidas y
              confirmes.
            </span>
          </div>
        </>
      )}
    </AppShell>
  );
}
