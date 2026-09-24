import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckCircle2, Circle, Clock, Info, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { CLASES_TONO_ESTADO, tonoDeEstado, type TonoEstado } from "@/lib/estado-tono";

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
        // Tonos del semáforo de estado (tokens --estado-*): un solo lugar para el color.
        success: CLASES_TONO_ESTADO.success,
        warning: CLASES_TONO_ESTADO.warning,
        danger: CLASES_TONO_ESTADO.danger,
        info: CLASES_TONO_ESTADO.info,
        neutral: CLASES_TONO_ESTADO.neutral,
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
 * Insignia de estado. Todos los módulos pintan sus estados con el MISMO
 * semáforo oficial (ver lib/estado-tono.ts y los tokens --estado-* de
 * styles.css): tono (color) + ícono + texto — el color nunca es el único canal.
 */
const ICONO_POR_TONO: Record<TonoEstado, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  danger: XCircle,
  info: Info,
  neutral: Circle,
};

function EstadoBadge({ estado, tono }: { estado: string; tono?: TonoEstado }) {
  const tonoFinal = tono ?? tonoDeEstado(estado);
  const Icon = ICONO_POR_TONO[tonoFinal];

  return (
    <span
      data-tono={tonoFinal}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
        CLASES_TONO_ESTADO[tonoFinal],
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {estado}
    </span>
  );
}

export { Badge, badgeVariants, EstadoBadge };
