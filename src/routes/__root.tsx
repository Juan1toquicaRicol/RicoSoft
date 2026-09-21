import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ErrorPage, pickErrorVariant } from "@/components/system/error-page";
import { ErrorBoundary } from "@/components/system/error-boundary";
import { OfflinePage } from "@/components/system/offline-page";
import { useOnlineStatus } from "@/hooks/use-online-status";

function NotFoundComponent() {
  return <ErrorPage variant="404" />;
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <ErrorPage
      variant={pickErrorVariant(error)}
      onRetry={() => {
        router.invalidate();
        reset();
      }}
      detalleTecnico={import.meta.env.DEV ? (error.stack ?? error.message) : undefined}
    />
  );
}

import { TenantProvider } from "../lib/tenant-context";
import { SessionProvider } from "../lib/session-context";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "RicoSoft · Sistema Integrado Multiempresa" },
      {
        name: "description",
        content:
          "Sistema modular centralizado para gestión de 3 empresas: Gestión Humana, Contabilidad y Compras.",
      },
      { property: "og:title", content: "RicoSoft · Sistema Integrado Multiempresa" },
      {
        property: "og:description",
        content:
          "Gestión Humana, Recepción de Facturas, Solicitudes de Compra y Servicios Activos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/icono.ico", type: "image/x-icon" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const online = useOnlineStatus();

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TenantProvider>
          <ErrorBoundary>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
          </ErrorBoundary>
          <Toaster position="top-right" richColors closeButton />
          {/* Aviso NO bloqueante de sin-conexión: navigator.onLine puede dar
              falso positivo en red local (ver use-online-status.ts), así que
              esto nunca debe tapar la pantalla ni impedir usar RicoSoft —
              solo informa en una esquina. No cierra sesión, no borra estado. */}
          {!online && <OfflinePage onRetry={() => window.location.reload()} />}
        </TenantProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
