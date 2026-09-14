import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, Circle, Clock, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * Insignia de estado. La identidad visual del sistema es negro/blanco/gris
 * con azul solo como acento: los estados NO se diferencian por un semáforo
 * de colores (verde/rojo/ámbar), sino por ícono + peso visual (relleno vs.
 * contorno) + texto, y el azul se reserva para el estado "informativo/
 * resuelto positivamente" (uso permitido de acento explícitamente).
 */
type EstadoCategoria = "positivo" | "pendiente" | "negativo" | "neutro";

const CATEGORIA_POR_ESTADO: Record<string, EstadoCategoria> = {
  Aprobada: "positivo",
  Aprobado: "positivo",
  Activo: "positivo",
  "Al día": "positivo",
  "Paz y Salvo": "positivo",
  Pagada: "positivo",
  Comprado: "positivo",
  Facturada: "positivo",
  Recibida: "positivo",
  Pendiente: "pendiente",
  "En Cotización": "pendiente",
  "Por vencer": "pendiente",
  "Pendiente Renovación": "pendiente",
  Rechazada: "negativo",
  Rechazado: "negativo",
  Vencido: "negativo",
  Inactivo: "negativo",
  Confirmada: "pendiente",
  "En tránsito": "pendiente",
  "En puerto": "pendiente",
  "En inspección": "pendiente",
  "En trámite": "pendiente",
  "Liberado pre-compra": "pendiente",
  "Levante autorizado": "positivo",
  Nacionalizado: "positivo",
  Cerrada: "positivo",
  Anulada: "negativo",

  // Estados crudos del enum EstadoDespacho (Despachos pasa el valor del
  // enum tal cual, no una etiqueta traducida) y estado de novedad.
  RECIBIDO: "neutro",
  PREPARANDO: "neutro",
  PREPARADO: "neutro",
  PENDIENTE_CARGUE: "neutro",
  CARGANDO: "pendiente",
  CARGADO: "pendiente",
  DESPACHADO: "pendiente",
  EN_TRANSITO: "pendiente",
  ENTREGADO: "positivo",
  ENTREGA_PARCIAL: "pendiente",
  DEVUELTO: "negativo",
  CANCELADO: "negativo",
  ABIERTA: "pendiente",
  RESUELTA: "positivo",
};

const ESTILOS_POR_CATEGORIA: Record<EstadoCategoria, string> = {
  positivo: "border-blue-200 bg-blue-50 text-blue-800",
  pendiente: "border-slate-300 bg-slate-100 text-slate-700",
  negativo: "border-transparent bg-slate-900 text-white",
  neutro: "border-slate-300 bg-white text-slate-600",
};

const ICONO_POR_CATEGORIA: Record<EstadoCategoria, LucideIcon> = {
  positivo: CheckCircle2,
  pendiente: Clock,
  negativo: XCircle,
  neutro: Circle,
};

function EstadoBadge({ estado }: { estado: string }) {
  const categoria = CATEGORIA_POR_ESTADO[estado] ?? "neutro";
  const Icon = ICONO_POR_CATEGORIA[categoria];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        ESTILOS_POR_CATEGORIA[categoria],
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {estado}
    </span>
  );
}

export { Badge, badgeVariants, EstadoBadge };
