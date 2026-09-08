import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const MS_DIA = 24 * 60 * 60 * 1000;

function diasEntre(desde: Date, hasta: Date) {
  return Math.round((hasta.getTime() - desde.getTime()) / MS_DIA);
}

/**
 * Qué tan cerca está una fecha de vencimiento/renovación. Por defecto, sin
 * semáforo de colores (regla de diseño del sistema, ver badge.tsx): la barra
 * se llena con gris que se oscurece a negro a medida que se acerca o se pasa
 * la fecha, y el ícono cambia de forma (reloj → alerta) en vez de cambiar de
 * color. `ventanaDias` es la distancia a partir de la cual se considera
 * "lejos" (0% de la barra); por defecto 30 días.
 *
 * `semaforo` (opt-in, no cambia el default en Facturas/Importaciones) usa en
 * cambio gris/naranja/rojo/negro — pedido puntualmente para "Próxima
 * renovación" en Servicios y Suscripciones.
 */
export function BarraVencimiento({
  fecha,
  ventanaDias = 30,
  etiquetaVencido = "Venció",
  className,
  semaforo = false,
}: {
  fecha: string | Date | null | undefined;
  ventanaDias?: number;
  etiquetaVencido?: string;
  className?: string;
  semaforo?: boolean;
}) {
  if (!fecha) return <span className="text-[11px] text-slate-400">—</span>;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaLimite = new Date(fecha);
  fechaLimite.setHours(0, 0, 0, 0);
  const diasRestantes = diasEntre(hoy, fechaLimite);

  const vencido = diasRestantes < 0;
  const progreso = vencido
    ? 100
    : Math.max(0, Math.min(100, ((ventanaDias - diasRestantes) / ventanaDias) * 100));

  // Semáforo: gris (bien) -> naranja (dentro de poco) -> rojo (urgente) ->
  // negro (vencido). Los umbrales son proporcionales a `ventanaDias` (a 30
  // días: urgente <= 6 días, dentro de poco <= 15 días).
  const urgenciaSemaforo: "bien" | "pronto" | "urgente" | "vencido" = vencido
    ? "vencido"
    : diasRestantes <= ventanaDias * 0.2
      ? "urgente"
      : diasRestantes <= ventanaDias * 0.5
        ? "pronto"
        : "bien";

  const urgencia: "lejos" | "cerca" | "vencido" = vencido
    ? "vencido"
    : diasRestantes <= ventanaDias * 0.3
      ? "cerca"
      : "lejos";

  const colorRelleno = semaforo
    ? {
        bien: "bg-slate-300",
        pronto: "bg-orange-500",
        urgente: "bg-red-600",
        vencido: "bg-slate-900",
      }[urgenciaSemaforo]
    : { lejos: "bg-slate-300", cerca: "bg-slate-600", vencido: "bg-slate-900" }[urgencia];
  const Icon = (semaforo ? urgenciaSemaforo === "vencido" : urgencia === "vencido")
    ? AlertTriangle
    : Clock;

  const texto = vencido
    ? `${etiquetaVencido} hace ${Math.abs(diasRestantes)} día${Math.abs(diasRestantes) === 1 ? "" : "s"}`
    : diasRestantes === 0
      ? "Vence hoy"
      : `${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`;

  const colorTexto = semaforo
    ? {
        bien: "text-slate-500",
        pronto: "text-orange-600",
        urgente: "text-red-600",
        vencido: "text-slate-900",
      }[urgenciaSemaforo]
    : vencido
      ? "text-slate-900"
      : "text-slate-500";

  return (
    <div className={cn("flex items-center gap-1.5 min-w-[110px]", className)}>
      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden shrink-0">
        <div
          className={cn("h-full rounded-full transition-all", colorRelleno)}
          style={{ width: `${progreso}%` }}
        />
      </div>
      <span
        className={cn(
          "text-[10px] font-semibold whitespace-nowrap flex items-center gap-0.5",
          colorTexto,
        )}
      >
        <Icon className="h-2.5 w-2.5 shrink-0" />
        {texto}
      </span>
    </div>
  );
}
