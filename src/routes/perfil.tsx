import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, KeyRound, Save, ShieldCheck, UserCircle } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAuth, setToken } from "@/lib/session";
import { useSession } from "@/lib/session-context";
import { validarPasswordSegura } from "@/lib/password";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Mi Perfil | RicoSoft" },
      { name: "description", content: "Información de la cuenta y sesión activa en RicoSoft." },
    ],
  }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user, refresh } = useSession();

  const [nombre, setNombre] = useState(user?.nombre ?? "");
  const [telefono, setTelefono] = useState(user?.telefono ?? "");
  const [guardando, setGuardando] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState("");
  const [okPerfil, setOkPerfil] = useState(false);

  const [passwordActual, setPasswordActual] = useState("");
  const [passwordNueva, setPasswordNueva] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [cambiandoPassword, setCambiandoPassword] = useState(false);
  const [errorPassword, setErrorPassword] = useState("");
  const [okPassword, setOkPassword] = useState(false);

  if (!user) return null;

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorPerfil("");
    setOkPerfil(false);
    if (!nombre.trim()) {
      setErrorPerfil("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    try {
      // Autoservicio: PATCH /usuarios/me solo permite editar nombre/teléfono
      // propios. El backend toma el id del usuario desde el JWT, nunca de la
      // petición, por lo que no es posible editar a otro usuario.
      await fetchAuth("/usuarios/me", {
        method: "PATCH",
        body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim() || null }),
      });
      await refresh();
      setOkPerfil(true);
    } catch (err: any) {
      setErrorPerfil(err.message || "Error al actualizar el perfil.");
    } finally {
      setGuardando(false);
    }
  };

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorPassword("");
    setOkPassword(false);

    if (!passwordActual || !passwordNueva || !confirmarPassword) {
      setErrorPassword("Todos los campos de contraseña son obligatorios.");
      return;
    }
    if (passwordNueva !== confirmarPassword) {
      setErrorPassword("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    const errorValidacion = validarPasswordSegura(passwordNueva);
    if (errorValidacion) {
      setErrorPassword(errorValidacion);
      return;
    }

    setCambiandoPassword(true);
    try {
      // El backend invalida el token anterior (y cualquier otra sesión
      // activa) y devuelve uno nuevo, para que esta sesión siga funcionando
      // sin forzar un relogin.
      const respuesta = await fetchAuth("/usuarios/me/password", {
        method: "PATCH",
        body: JSON.stringify({ passwordActual, passwordNueva, confirmarPassword }),
      });
      if (respuesta.token) setToken(respuesta.token);
      setOkPassword(true);
      setPasswordActual("");
      setPasswordNueva("");
      setConfirmarPassword("");
    } catch (err: any) {
      setErrorPassword(err.message || "Error al cambiar la contraseña.");
    } finally {
      setCambiandoPassword(false);
    }
  };

  return (
    <AppShell title="Mi Perfil" description="Consulta y edita tu información personal. Los datos administrativos (rol, área, permisos) solo puede modificarlos un administrador.">
      <div className="max-w-3xl space-y-6">
        {/* ── Encabezado de cuenta (solo lectura) ── */}
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="flex items-center gap-4 p-6">
            <div className="h-16 w-16 rounded-full bg-slate-900 text-white flex items-center justify-center text-2xl font-bold shrink-0">
              {user.nombre ? user.nombre[0].toUpperCase() : "U"}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 truncate">{user.nombre}</h2>
              <p className="text-slate-500 text-sm truncate">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1 border-blue-200 bg-blue-50 text-blue-800">
                  <ShieldCheck className="h-3 w-3" />
                  {user.isSuperadmin ? "Superadministrador" : (user.rol ?? "Sin rol asignado")}
                </Badge>
                <span className="text-[11px] font-semibold text-slate-400">
                  Estado: {user.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Información personal (editable) ── */}
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Información personal</h3>
          </div>
          <form onSubmit={handleGuardarPerfil} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nombre" className="text-xs font-semibold text-slate-700">
                  Nombre completo *
                </Label>
                <Input
                  id="nombre"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="h-9 text-sm border-slate-300"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="telefono" className="text-xs font-semibold text-slate-700">
                  Teléfono
                </Label>
                <Input
                  id="telefono"
                  placeholder="Ej: 3001234567"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  className="h-9 text-sm border-slate-300"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-400">Correo (no editable)</Label>
              <Input value={user.email} disabled className="h-9 text-sm border-slate-200 bg-slate-50 text-slate-500" />
            </div>

            {errorPerfil && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{errorPerfil}</AlertDescription>
              </Alert>
            )}
            {okPerfil && (
              <Alert variant="info">
                <CheckCircle2 />
                <AlertDescription>Cambios guardados correctamente.</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={guardando} className="gap-2 font-bold">
                <Save className="h-4 w-4" /> {guardando ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </div>

        {/* ── Seguridad (cambio de contraseña) ── */}
        <div className="panel bg-white border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Cambiar contraseña</h3>
          </div>
          <form onSubmit={handleCambiarPassword} className="p-6 space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="passwordActual" className="text-xs font-semibold text-slate-700">
                Contraseña actual *
              </Label>
              <Input
                id="passwordActual"
                type="password"
                autoComplete="current-password"
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                className="h-9 text-sm border-slate-300"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="passwordNueva" className="text-xs font-semibold text-slate-700">
                Nueva contraseña *
              </Label>
              <Input
                id="passwordNueva"
                type="password"
                autoComplete="new-password"
                value={passwordNueva}
                onChange={(e) => setPasswordNueva(e.target.value)}
                className="h-9 text-sm border-slate-300"
              />
              <p className="text-[11px] text-slate-400">Mínimo 8 caracteres, con mayúscula, minúscula y número.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmarPassword" className="text-xs font-semibold text-slate-700">
                Confirmar nueva contraseña *
              </Label>
              <Input
                id="confirmarPassword"
                type="password"
                autoComplete="new-password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                className="h-9 text-sm border-slate-300"
              />
            </div>

            {errorPassword && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>{errorPassword}</AlertDescription>
              </Alert>
            )}
            {okPassword && (
              <Alert variant="info">
                <CheckCircle2 />
                <AlertDescription>Contraseña actualizada correctamente.</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" variant="destructive" disabled={cambiandoPassword} className="gap-2 font-bold">
                <KeyRound className="h-4 w-4" /> {cambiandoPassword ? "Cambiando..." : "Cambiar contraseña"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
