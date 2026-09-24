import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Loader2,
  Eye,
  EyeOff,
  User,
  AlertCircle,
  CheckCircle2,
  Mail,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
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

/** Panel gráfico compartido por el login, registro y selección de empresa. */
function PanelMarca() {
  return (
    <aside
      aria-label="Empresas del Grupo Ricol"
      className="relative hidden min-h-screen overflow-hidden bg-[#eaf8fc] lg:flex lg:w-[58%] lg:flex-none items-center justify-center"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(20,116,190,0.10) 1.5px, transparent 1.7px), radial-gradient(ellipse at 52% 45%, rgba(255,255,255,0.96) 0%, rgba(246,253,255,0.82) 48%, transparent 76%)",
          backgroundSize: "26px 26px, 100% 100%",
        }}
      />

      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 900 1000"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="login-blue" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#0879e8" />
            <stop offset="1" stopColor="#11c6df" />
          </linearGradient>
          <linearGradient id="login-green" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#a8df00" />
            <stop offset="1" stopColor="#08a957" />
          </linearGradient>
          <linearGradient id="login-ribbon" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#0876e8" />
            <stop offset="0.42" stopColor="#00bbd6" />
            <stop offset="0.72" stopColor="#8dcf16" />
            <stop offset="1" stopColor="#f2d900" />
          </linearGradient>
        </defs>
        <path d="M0 0h360C270 118 151 143 0 223z" fill="url(#login-blue)" />
        <path d="M0 0h287C214 91 119 126 0 174z" fill="#0878df" opacity=".9" />
        <path d="M0 0h372C276 126 156 157 0 242" fill="none" stroke="white" strokeWidth="5" />
        <circle cx="810" cy="-18" r="145" fill="url(#login-green)" />
        <circle cx="810" cy="-18" r="178" fill="none" stroke="#70bb18" strokeWidth="5" />
        <path
          d="M-38 804c173-11 243 76 379 116 149 44 209-10 324-69 86-45 150-68 235-62v211H-38z"
          fill="url(#login-ribbon)"
        />
        <path
          d="M-42 855c170-9 248 76 386 116 144 42 226-12 335-69 89-47 149-69 226-66"
          fill="none"
          stroke="white"
          strokeWidth="5"
        />
        <path
          d="M-35 896c152 6 239 90 372 112 144 24 224-41 350-104 85-42 145-57 220-54v150H-35z"
          fill="#0874d8"
        />
        <path d="M310 1000c117-57 184-144 325-186 91-27 168-31 242-17v203z" fill="#13a953" />
        <path d="M450 1000c117-68 185-136 323-170 37-9 70-14 104-17v187z" fill="#f52e43" />
        <circle cx="886" cy="589" r="92" fill="#8ed519" opacity=".76" />
        <circle cx="886" cy="589" r="57" fill="#13a953" opacity=".78" />
        <circle cx="844" cy="282" r="47" fill="#24c2e7" opacity=".55" />
      </svg>

      <div
        aria-hidden="true"
        className="absolute right-[2%] top-[22%] h-32 w-32 rounded-full border border-white/70 bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-blue-600/10"
      />
      <div
        aria-hidden="true"
        className="absolute right-[8%] top-[39%] h-5 w-5 rounded-full bg-lime-500"
      />
      <div
        aria-hidden="true"
        className="absolute left-[13%] top-[48%] h-44 w-44 rounded-full bg-sky-200/30"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[24%] left-[13%] h-24 w-24 rounded-full border-[5px] border-white/80"
      />
      <svg
        aria-hidden="true"
        className="absolute inset-y-0 left-0 h-full w-[9%]"
        viewBox="0 0 90 1000"
        preserveAspectRatio="none"
      >
        <path
          d="M0 0h16c18 102 48 174 48 295 0 192 16 313-8 477-7 83-26 154-43 228H0z"
          fill="white"
        />
      </svg>
    </aside>
  );
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
  const [recordarCorreo, setRecordarCorreo] = useState(false);

  useEffect(() => {
    const correoGuardado = localStorage.getItem("ricosoft.login.correo");
    if (correoGuardado) {
      setEmail(correoGuardado);
      setRecordarCorreo(true);
    }
  }, []);

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

        setSuccessMessage(
          "Cuenta registrada. Queda pendiente de aprobación por un administrador antes de poder iniciar sesión.",
        );
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

        if (recordarCorreo) localStorage.setItem("ricosoft.login.correo", email.trim());
        else localStorage.removeItem("ricosoft.login.correo");

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
      <div className="min-h-screen bg-white flex">
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-white px-6 py-10 sm:px-10 lg:w-[42%] lg:flex-none lg:px-14">
          <div className="w-full max-w-[440px]">
            <div className="mb-8">
              <span className="text-[2.25rem] font-extrabold tracking-tight text-blue-950">
                RicoSoft
              </span>
            </div>

            <div className="mb-7">
              <h1 className="text-[1.7rem] font-bold tracking-tight text-slate-900">
                ¿Con cuál empresa entras?
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Puedes cambiar de empresa cuando quieras.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              {tenantsOrdenados.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={tenantSeleccionando !== null}
                  onClick={() => handleSeleccionarTenant(t.id)}
                  className="flex min-h-[68px] w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold leading-5 text-slate-900 break-words">
                        {t.nombre}
                      </span>
                      {t.id === ultimaEmpresaId && (
                        <span className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                          Última vez
                        </span>
                      )}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" /> Activa
                    </span>
                  </span>
                  {tenantSeleccionando === t.id ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-700">
                      Entrar <ArrowRight className="h-4 w-4" />
                    </span>
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

        <PanelMarca />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex">
      {/* ── Columna Izquierda: Formulario ── */}
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-white px-6 py-10 sm:px-10 lg:w-[42%] lg:flex-none lg:px-14">
        <div className="w-full max-w-[420px]">
          <div className="mb-10">
            <span className="text-[2.25rem] font-extrabold tracking-tight text-blue-950">
              RicoSoft
            </span>
          </div>

          {/* Encabezado Dinámico */}
          <div className="mb-7">
            <h1 className="text-2xl font-extrabold tracking-tight text-blue-950 sm:text-3xl">
              {isRegistering ? "Crear una cuenta" : "Bienvenido a RicoSoft"}
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              {isRegistering
                ? "Con tu correo corporativo."
                : "Plataforma interna de gestión para los colaboradores del Grupo Ricol."}
            </p>
          </div>

          {/* Alertas de Error o Éxito */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-800 font-semibold">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
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

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                Correo corporativo
              </Label>
              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder=""
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-[58px] rounded-xl border-slate-200 bg-white pl-12 text-sm shadow-sm transition-colors focus:bg-white"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Contraseña
                </Label>
              </div>
              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-[58px] rounded-xl border-slate-200 bg-white pl-12 pr-12 text-sm shadow-sm transition-colors focus:bg-white"
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

            {!isRegistering && (
              <label className="flex cursor-pointer items-center gap-3 pt-1 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={recordarCorreo}
                  onChange={(event) => setRecordarCorreo(event.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 accent-blue-600 focus:ring-blue-500"
                />
                <span>Recordarme en este equipo</span>
              </label>
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

            {/* Botón Principal */}
            <Button
              type="submit"
              disabled={isLoading}
              className="mt-2 h-[62px] w-full rounded-xl bg-gradient-to-r from-blue-700 to-sky-500 text-base font-bold shadow-lg shadow-blue-700/15 transition-all hover:from-blue-800 hover:to-sky-600 disabled:bg-slate-400"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isRegistering ? "Registrando..." : "Ingresando..."}
                </span>
              ) : isRegistering ? (
                "Registrar cuenta"
              ) : (
                <span className="flex items-center justify-center gap-4">
                  Ingresar a RicoSoft <ArrowRight className="h-6 w-6" />
                </span>
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
          </form>
        </div>
      </div>

      {/* ── Columna Derecha: identidad de marca ── */}
      <PanelMarca />
    </div>
  );
}
