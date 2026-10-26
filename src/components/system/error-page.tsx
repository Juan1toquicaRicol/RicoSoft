import type { ReactNode } from "react";
import {
  WifiOff,
  ShieldAlert,
  LockKeyhole,
  ServerCrash,
  Clock3,
  SearchX,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/config/api";

/**
 * Variantes cubiertas por la capa global de errores de RicoSoft. No agregar
 * una variante nueva sin necesidad real: la idea es que TODA la app use
 * estas siete, en vez de que cada módulo invente su propio mensaje.
 */
export type ErrorVariant = "404" | "401" | "403" | "500" | "NETWORK" | "TIMEOUT" | "UNKNOWN";

interface VariantContent {
  icon: ReactNode;
  titulo: string;
  descripcion: string;
  mostrarReintentar: boolean;
  mostrarInicio: boolean;
}

const ICON_PROPS = { className: "h-7 w-7 text-slate-700" } as const;

const VARIANTES: Record<ErrorVariant, VariantContent> = {
  "404": {
    icon: <SearchX {...ICON_PROPS} />,
    titulo: "Página no encontrada",
    descripcion: "La página que buscas no existe o ya no está disponible.",
    mostrarReintentar: false,
    mostrarInicio: true,
  },
  "401": {
    icon: <LockKeyhole {...ICON_PROPS} />,
    titulo: "Sesión requerida",
    descripcion: "Tu sesión ya no es válida. Inicia sesión nuevamente.",
    mostrarReintentar: false,
    mostrarInicio: false,
  },
  "403": {
    icon: <ShieldAlert {...ICON_PROPS} />,
    titulo: "Acceso no autorizado",
    descripcion: "No tienes permisos para acceder a esta sección.",
    mostrarReintentar: false,
    mostrarInicio: true,
  },
  "500": {
    icon: <ServerCrash {...ICON_PROPS} />,
    titulo: "Algo no salió como esperábamos",
    descripcion: "RicoSoft encontró un problema al procesar esta solicitud. Inténtalo nuevamente.",
    mostrarReintentar: true,
    mostrarInicio: true,
  },
  NETWORK: {
    icon: <WifiOff {...ICON_PROPS} />,
    titulo: "No se pudo conectar con RicoSoft",
    descripcion:
      "No fue posible comunicarnos con el servidor. Verifica la conexión e inténtalo nuevamente.",
    mostrarReintentar: true,
    mostrarInicio: false,
  },
  TIMEOUT: {
    icon: <Clock3 {...ICON_PROPS} />,
    titulo: "La operación está tardando demasiado",
    descripcion:
      "El servidor no respondió dentro del tiempo esperado. Puedes intentarlo nuevamente.",
    mostrarReintentar: true,
    mostrarInicio: false,
  },
  UNKNOWN: {
    icon: <AlertTriangle {...ICON_PROPS} />,
    titulo: "Se produjo un error inesperado",
    descripcion: "RicoSoft no pudo completar esta operación.",
    mostrarReintentar: true,
    mostrarInicio: true,
  },
};

/**
 * Deriva la variante de pantalla global a partir de un error capturado
 * (ApiError clasificado en src/config/api.ts, o un Error genérico de un
 * Error Boundary de React). Función pura, sin JSX, para poder probarla
 * fácilmente y reutilizarla desde el router y desde los boundaries.
 */
export function pickErrorVariant(error: unknown): ErrorVariant {
  if (error instanceof ApiError) {
    if (error.kind === "network") return "NETWORK";
    if (error.kind === "timeout") return "TIMEOUT";
    switch (error.status) {
      case 401:
        return "401";
      case 403:
        return "403";
      case 404:
        return "404";
      default:
        if (error.status && error.status >= 500) return "500";
        return "UNKNOWN";
    }
  }
  return "UNKNOWN";
}

interface ErrorPageProps {
  variant: ErrorVariant;
  onRetry?: () => void;
  /** Sobreescribe el título/descripción por defecto de la variante, sólo si es estrictamente necesario. */
  titulo?: string;
  descripcion?: string;
  /** Detalle técnico, SOLO visible en desarrollo (nunca en producción). */
  detalleTecnico?: string;
  /** Acción secundaria discreta (ej. "Continuar de todas formas" del overlay
   * offline) — salida de emergencia para cuando la señal de error es un
   * falso positivo y el usuario no debe quedar bloqueado. */
  onIgnore?: () => void;
  ignoreLabel?: string;
}

/**
 * Pantalla de error global de RicoSoft. Reutiliza la identidad visual del
 * AppShell/Login (icono de Grupo Ricol, "RicoSoft" + "Enterprise V1.0",
 * paleta blanco/negro/gris) para que un error se sienta parte del producto
 * y no una página HTML genérica del navegador.
 */
export function ErrorPage({
  variant,
  onRetry,
  titulo,
  descripcion,
  detalleTecnico,
  onIgnore,
  ignoreLabel,
}: ErrorPageProps) {
  const contenido = VARIANTES[variant];
  const esDev = import.meta.env.DEV;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="flex items-center justify-center gap-3">
          <img
            src="/gruporicol-icono.png"
            alt="Grupo Ricol"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <div className="text-left leading-none">
            <p className="text-sm font-bold text-black">RicoSoft</p>
            <p className="text-[10px] text-slate-500">Enterprise V1.0</p>
          </div>
        </div>

        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          {contenido.icon}
        </div>

        <h1 className="mt-4 text-lg font-semibold text-slate-900">{titulo ?? contenido.titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{descripcion ?? contenido.descripcion}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {contenido.mostrarReintentar && (
            <Button onClick={onRetry ?? (() => window.location.reload())}>Reintentar</Button>
          )}
          {contenido.mostrarInicio && (
            <Button variant="outline" onClick={() => (window.location.href = "/")}>
              Ir al inicio
            </Button>
          )}
          {variant === "401" && (
            <Button onClick={() => (window.location.href = "/login")}>Iniciar sesión</Button>
          )}
        </div>

        {onIgnore && (
          <button
            type="button"
            onClick={onIgnore}
            className="mt-4 text-xs text-slate-400 underline hover:text-slate-600"
          >
            {ignoreLabel ?? "Continuar de todas formas"}
          </button>
        )}

        {esDev && detalleTecnico && (
          <pre className="mt-6 max-h-40 overflow-auto rounded-md bg-slate-950 p-3 text-left text-[10px] text-slate-100">
            {detalleTecnico}
          </pre>
        )}
      </div>
    </div>
  );
}
