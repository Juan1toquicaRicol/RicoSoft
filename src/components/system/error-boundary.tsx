import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorPage, pickErrorVariant } from "@/components/system/error-page";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Error Boundary global de React. Evita que una excepción de renderizado dej
 * e la pantalla en blanco: en vez de eso muestra la pantalla RicoSoft (variante
 * UNKNOWN/500 según el error), oculta el stack trace en producción, y permite
 * reintentar sin recargar toda la app cuando es posible.
 *
 * Complementa al errorComponent de TanStack Router (src/routes/__root.tsx),
 * que ya cubre errores lanzados dentro de loaders/render de rutas: este
 * boundary es la última red de seguridad para cualquier excepción de React
 * que escape de ese mecanismo (ej. errores en efectos o en renders fuera del
 * árbol de rutas).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Detalle técnico sólo a consola/logs, nunca en la UI de producción.
    console.error(error, info.componentStack);
    reportLovableError(error, { boundary: "global_error_boundary" });
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ErrorPage
        variant={pickErrorVariant(error)}
        onRetry={this.handleReset}
        detalleTecnico={import.meta.env.DEV ? (error.stack ?? error.message) : undefined}
      />
    );
  }
}
