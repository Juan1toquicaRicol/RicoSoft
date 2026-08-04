import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión | Facturaflow" },
      { name: "description", content: "Acceso seguro a la plataforma empresarial de gestión y aprobación de facturas." },
      { property: "og:title", content: "Iniciar sesión | Facturaflow" },
      { property: "og:description", content: "Autenticación corporativa con roles y permisos granulares." },
    ],
  }),
  component: Login,
});

function Login() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Facturaflow</p>
              <p className="text-[11px] text-muted-foreground">Gestión documental y financiera</p>
            </div>
          </div>

          <h1 className="mt-10 text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Usa tu cuenta corporativa para continuar.</p>

          <div className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo corporativo</Label>
              <Input id="email" type="email" placeholder="nombre@empresa.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" placeholder="••••••••" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch id="recordar" defaultChecked />
                <Label htmlFor="recordar" className="text-xs font-normal text-muted-foreground">
                  Recordar sesión
                </Label>
              </div>
              <button className="text-xs font-medium text-primary hover:underline">¿Olvidaste tu contraseña?</button>
            </div>
            <Link to="/" className="block">
              <Button className="w-full">Ingresar</Button>
            </Link>
            <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Conexión cifrada · 2FA disponible próximamente
            </p>
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:block">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--chart-2) 0%, transparent 45%), radial-gradient(circle at 75% 70%, var(--chart-5) 0%, transparent 50%)",
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-12 text-primary-foreground">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Cada factura, clasificada y enrutada automáticamente.
          </h2>
          <p className="mt-4 max-w-md text-sm opacity-80">
            Recepción con OCR, motor de reglas configurable, flujos de aprobación auditables y proyección financiera en
            tiempo real.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6 border-t border-primary-foreground/20 pt-8 text-sm">
            <div>
              <p className="num text-2xl font-semibold">1.284</p>
              <p className="opacity-70">facturas / mes</p>
            </div>
            <div>
              <p className="num text-2xl font-semibold">1,8 d</p>
              <p className="opacity-70">ciclo de aprobación</p>
            </div>
            <div>
              <p className="num text-2xl font-semibold">99,9%</p>
              <p className="opacity-70">trazabilidad</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
