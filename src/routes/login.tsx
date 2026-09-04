import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Loader2, Eye, EyeOff, User, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchApi } from "@/config/api"; // Tu cliente de API
import { esDominioCorporativoValido } from "@/lib/dominios";
import { validarPasswordSegura } from "@/lib/password";
import {
  setToken,
  setUltimaEmpresaPreferida,
  getUltimaEmpresaPreferida,
  type SessionUser,
} from "@/lib/session";
import { useSession } from "@/lib/session-context";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión | RicoSoft" },
      {
        name: "description",
        content: "Acceso seguro al sistema centralizado RicoSoft Multiempresa.",
      },
    ],
  }),
  component: Login,
});

interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

interface TenantAccesible {
  id: string;
  nombre: string;
  subdomain: string;
}

function Login() {
  const navigate = useNavigate();
  const { refresh } = useSession();

  // Estados del formulario y conmutador
  const [isRegistering, setIsRegistering] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Dominio del correo que se está escribiendo (derivado, no un estado
  // propio): solo cambia de valor cuando la PARTE DEL DOMINIO del email
  // cambia, no en cada tecla del nombre de usuario antes de la arroba.
  const dominioEmail = useMemo(() => {
    const d = email.trim().toLowerCase().split("@")[1];
    return d && d.includes(".") ? d : "";
  }, [email]);

  // Carga el catálogo de departamentos de la empresa que corresponde a ese
  // dominio (backend resuelve el tenant por Tenant.dominioCorporativo —
  // nunca se manda un tenantId desde acá). Con debounce, y se limpia la
  // selección previa si el dominio cambia: un departamento elegido para
  // @ricol.com.co ya no es válido si el correo pasa a ser @flexipackdecolombia.com.
  useEffect(() => {
    if (!isRegistering) return;

    setDepartamentoId("");
    if (!dominioEmail) {
      setDepartamentos([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      fetchApi(`/departamentos/publico?dominio=${encodeURIComponent(dominioEmail)}`)
        .then((data) => setDepartamentos(Array.isArray(data) ? data : []))
        .catch(() => setDepartamentos([]));
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [isRegistering, dominioEmail]);

  // Estados de mensajes
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Cuando el usuario tiene más de una empresa accesible, el login no entra
  // directo: guarda el token corto de selección y la lista de empresas, y
  // muestra la pantalla de "elige tu empresa" en vez del dashboard.
  const [tenantSelection, setTenantSelection] = useState<{
    selectionToken: string;
    tenants: TenantAccesible[];
  } | null>(null);
  const [tenantSeleccionando, setTenantSeleccionando] = useState<string | null>(null);

  const finalizarSesion = async (response: { token: string; user: SessionUser }) => {
    setToken(response.token);

    // Se cachea localmente solo para hidratar la UI mientras carga /auth/me;
    // los permisos reales siempre se revalidan contra el backend.
    if (response.user) {
      localStorage.setItem("user", JSON.stringify(response.user));
      if (response.user.tenantId) setUltimaEmpresaPreferida(response.user.tenantId);
    }

    const primerNombre = response.user?.nombre?.split(" ")[0];
    toast.success(primerNombre ? `¡Bienvenido, ${primerNombre}!` : "¡Bienvenido a RicoSoft!", {
      description: "Sesión iniciada correctamente.",
    });

    // Refresca el SessionContext (AppShell depende de él) antes de navegar:
    // si no, el contexto sigue con user=null de antes del login y AppShell
    // rebota de inmediato de vuelta a /login.
    await refresh();
    navigate({ to: "/" });
  };

  const handleSeleccionarTenant = async (tenantId: string) => {
    if (!tenantSelection) return;
    setTenantSeleccionando(tenantId);
    setError("");
    try {
      const response = await fetchApi("/auth/select-tenant", {
        method: "POST",
        body: JSON.stringify({ selectionToken: tenantSelection.selectionToken, tenantId }),
      });
      await finalizarSesion(response);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión con esa empresa.");
      setTenantSeleccionando(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    if (isRegistering) {
      // 🛑 Validación del dominio en el Frontend
      if (!esDominioCorporativoValido(email)) {
        setError(
          "Solo se permiten correos de @ricol.com.co, @flexipackdecolombia.com o @greesolutions.com.co",
        );
        setIsLoading(false);
        return;
      }

      if (!departamentoId) {
        setError("Selecciona a qué departamento perteneces.");
        setIsLoading(false);
        return;
      }

      const errorPassword = validarPasswordSegura(password);
      if (errorPassword) {
        setError(errorPassword);
        setIsLoading(false);
        return;
      }

      try {
        // Enviar registro al Backend
        await fetchApi("/auth/register", {
          method: "POST",
          body: JSON.stringify({ nombre, email, password, departamentoId }),
        });

        setSuccessMessage("¡Cuenta registrada exitosamente! Ya puedes iniciar sesión.");
        setIsRegistering(false);
        setNombre("");
        setPassword("");
        setDepartamentoId("");
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Ocurrió un error al intentar registrar la cuenta.",
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      // 🔑 Proceso de Login
      try {
        const response = await fetchApi("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        if (response.requiresTenantSelection) {
          setTenantSelection({
            selectionToken: response.selectionToken,
            tenants: response.tenants,
          });
          return;
        }

        await finalizarSesion(response);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Correo o contraseña incorrectos.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleForgotPassword = () => {
    toast.info("¿Olvidaste tu contraseña?", {
      description:
        "Contacta al Administrador del Sistema de RicoSoft o al área de IT para restablecerla.",
    });
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError("");
    setSuccessMessage("");
  };

  if (tenantSelection) {
    // Preferencia de UX únicamente: prioriza visualmente la última empresa
    // usada, pero la lista real (a qué empresas hay acceso) siempre viene
    // del backend en tenantSelection.tenants — si el usuario perdió acceso a
    // la que tenía guardada, simplemente no aparece y no se prioriza nada.
    const ultimaEmpresaId = getUltimaEmpresaPreferida();
    const tenantsOrdenados = [...tenantSelection.tenants].sort((a, b) => {
      if (a.id === ultimaEmpresaId) return -1;
      if (b.id === ultimaEmpresaId) return 1;
      return 0;
    });

    return (
      <div className="min-h-screen bg-slate-50 flex">
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 bg-white">
          <div className="w-full max-w-[360px]">
            <div className="mb-8">
              <img
                src="/GRUPORICOL_LogoPrincipal-Photoroom.png"
                alt="Grupo Ricol"
                className="h-12 w-auto"
              />
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                RicoSoft · Sistema Multiempresa
              </p>
            </div>

            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Selecciona la empresa con la que deseas trabajar
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Tu cuenta tiene acceso a más de una empresa. Podrás cambiar de empresa después sin
                cerrar sesión.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-slate-900 border border-slate-900 flex items-start gap-2.5 text-xs text-white font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2.5">
              {tenantsOrdenados.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={tenantSeleccionando !== null}
                  onClick={() => handleSeleccionarTenant(t.id)}
                  className="w-full flex items-center justify-between h-14 px-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-blue-300 transition-colors text-left disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {t.nombre}
                      </span>
                      {t.id === ultimaEmpresaId && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-1.5 py-0.5">
                          Última vez
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Activa
                    </span>
                  </span>
                  {tenantSeleccionando === t.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-blue-700">Entrar →</span>
                  )}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setTenantSelection(null);
                setTenantSeleccionando(null);
                setError("");
              }}
              className="mt-6 text-xs font-semibold text-slate-500 hover:text-slate-700 hover:underline"
            >
              ← Volver a iniciar sesión
            </button>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 lg:sticky lg:top-0 lg:h-screen items-center justify-center bg-slate-50 border-l border-slate-200 overflow-hidden">
          <img
            src="/3logos.jpg"
            alt="Nuestras empresas"
            className="max-w-full max-h-full object-contain p-12"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Columna Izquierda: Formulario ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 bg-white">
        {/* Logo / Marca */}
        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <img
              src="/GRUPORICOL_LogoPrincipal-Photoroom.png"
              alt="Grupo Ricol"
              className="h-12 w-auto"
            />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              RicoSoft · Sistema Multiempresa
            </p>
          </div>

          {/* Encabezado Dinámico */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isRegistering ? "Crear una cuenta" : "Bienvenido de vuelta"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {isRegistering
                ? "Ingresa tus datos con tu correo corporativo autorizado."
                : "Ingresa tus credenciales para acceder al sistema."}
            </p>
          </div>

          {/* Alertas de Error o Éxito */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-slate-900 border border-slate-900 flex items-start gap-2.5 text-xs text-white font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-2.5 text-xs text-blue-800 font-semibold">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-700" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo Nombre (Solo visible en Registro) */}
            {isRegistering && (
              <div className="space-y-1.5">
                <Label htmlFor="nombre" className="text-xs font-semibold text-slate-700">
                  Nombre completo
                </Label>
                <div className="relative">
                  <Input
                    id="nombre"
                    type="text"
                    required={isRegistering}
                    placeholder="Ej. Juan Pérez"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="h-10 text-sm border-slate-200 bg-slate-50 focus:bg-white transition-colors rounded-lg shadow-none pr-10"
                  />
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Campo Departamento (Solo visible en Registro) */}
            {isRegistering && (
              <div className="space-y-1.5">
                <Label htmlFor="departamento" className="text-xs font-semibold text-slate-700">
                  Departamento
                </Label>
                <Select value={departamentoId} onValueChange={setDepartamentoId}>
                  <SelectTrigger
                    id="departamento"
                    className="h-10 text-sm border-slate-200 bg-slate-50 focus:bg-white transition-colors rounded-lg shadow-none"
                  >
                    <SelectValue placeholder="Selecciona tu departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-slate-400">
                        No hay departamentos disponibles todavía.
                      </div>
                    ) : (
                      departamentos.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                Correo corporativo
              </Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="usuario@ricol.com.co"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 text-sm border-slate-200 bg-slate-50 focus:bg-white transition-colors rounded-lg shadow-none"
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Contraseña
                </Label>
                {!isRegistering && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 text-sm border-slate-200 bg-slate-50 focus:bg-white pr-10 transition-colors rounded-lg shadow-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {isRegistering && (
                <p className="text-[11px] text-slate-400">
                  Mínimo 8 caracteres, con mayúscula, minúscula y número.
                </p>
              )}
            </div>

            {/* Botón Principal */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 text-sm font-bold rounded-lg shadow-md transition-all mt-2 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-400"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isRegistering ? "Registrando..." : "Ingresando..."}
                </span>
              ) : isRegistering ? (
                "Registrar cuenta"
              ) : (
                "Ingresar a RicoSoft"
              )}
            </Button>

            {/* Opción para alternar entre Login y Registro */}
            <div className="pt-2 text-center text-xs text-slate-600">
              {isRegistering ? (
                <p>
                  ¿Ya tienes una cuenta?{" "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="font-bold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    Inicia sesión aquí
                  </button>
                </p>
              ) : (
                <p>
                  ¿Primera vez ingresando a RicoSoft?{" "}
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="font-bold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    Regístrate aquí
                  </button>
                </p>
              )}
            </div>

            {/* Footer de seguridad */}
            <p className="flex items-center justify-center gap-1.5 pt-3 text-[11px] text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
              Conexión segura · Datos segmentados por empresa
            </p>
          </form>

          {/* Versión */}
          <p className="mt-8 text-center text-[10px] text-slate-300 font-medium tracking-widest uppercase">
            RicoSoft v1.0 — Uso interno corporativo
          </p>
        </div>
      </div>

      {/* ── Columna Derecha: Solo imagen ── */}
      <div className="hidden lg:flex flex-1 lg:sticky lg:top-0 lg:h-screen items-center justify-center bg-slate-50 border-l border-slate-200 overflow-hidden">
        <img
          src="/3logos.jpg"
          alt="Nuestras empresas"
          className="max-w-full max-h-full object-contain p-12"
        />
      </div>
    </div>
  );
}
