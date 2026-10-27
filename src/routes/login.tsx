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
      aria-label="Grupo Ricol"
      className="relative hidden min-h-screen overflow-hidden bg-[#f3f8fb] lg:flex lg:w-1/2 lg:flex-none items-center justify-center"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(20,116,190,0.10) 1.5px, transparent 1.7px), radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.95) 0%, rgba(243,248,251,0.6) 55%, transparent 80%)",
          backgroundSize: "26px 26px, 100% 100%",
        }}
      />
      <img
        src="/GRUPORICOL_LogoPrincipal-Photoroom.png"
        alt="Grupo Ricol"
        className="relative w-[55%] max-w-[520px] object-contain"
      />
    </aside>
  );
}

/** Campo con etiqueta flotando sobre el borde y un adorno opcional a la derecha. */
function CampoContorno({
  id,
  label,
  adorno,
  children,
}: {
  id: string;
  label: string;
  adorno?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Label
        htmlFor={id}
        className="absolute -top-2.5 left-3 z-10 bg-white px-1.5 text-xs font-medium text-blue-600"
      >
        {label}
      </Label>
      {children}
      {adorno}
    </div>
  );
}

const CLASE_CONTROL =
  "h-[60px] rounded-md border-slate-300 bg-white px-4 text-sm shadow-none transition-colors focus-visible:border-blue-500 focus-visible:ring-0";

function Login() {
  const navigate = useNavigate();
  const { refresh } = useSession();

  // Estados del formulario y conmutador
  const [isRegistering, setIsRegistering] = useState(false);
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
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
          "Solo se permiten correos de @ricol.com.co, @flexipackdecolombia.com o @greensolutions.com.co",
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
          body: JSON.stringify({ nombres, apellidos, email, password, departamentoId }),
        });

        setSuccessMessage(
          "Cuenta registrada. Queda pendiente de aprobación por un administrador antes de poder iniciar sesión.",
        );
        setIsRegistering(false);
        setNombres("");
        setApellidos("");
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
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-white px-6 py-10 sm:px-10 lg:w-1/2 lg:flex-none lg:px-14">
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
      <div className="flex min-h-screen w-full flex-col justify-between bg-white px-6 py-10 sm:px-12 lg:w-1/2 lg:flex-none">
        <div>
          <span className="text-[1.75rem] font-extrabold tracking-tight text-blue-950">
            RicoSoft
          </span>
        </div>

        <div className="mx-auto w-full max-w-[400px] py-8">
          {/* Encabezado Dinámico */}
          <div className="mb-9">
            <p className="text-sm text-slate-600">
              {isRegistering ? "Únete a la plataforma" : "Plataforma interna del Grupo Ricol"}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {isRegistering ? "Crear una cuenta" : "Inicia sesión"}
            </h1>
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
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campo Nombre (Solo visible en Registro) */}
            {isRegistering && (
              <>
                <CampoContorno
                  id="nombres"
                  label="Nombres"
                  adorno={
                    <User className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  }
                >
                  <Input
                    id="nombres"
                    type="text"
                    required={isRegistering}
                    placeholder="Ej. Juan Carlos"
                    value={nombres}
                    onChange={(e) => setNombres(e.target.value)}
                    className={`${CLASE_CONTROL} pr-12`}
                  />
                </CampoContorno>
                <CampoContorno id="apellidos" label="Apellidos">
                  <Input
                    id="apellidos"
                    type="text"
                    required={isRegistering}
                    placeholder="Ej. Pérez Gómez"
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    className={CLASE_CONTROL}
                  />
                </CampoContorno>
              </>
            )}

            {/* Email */}
            <CampoContorno
              id="email"
              label="Correo corporativo"
              adorno={
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                />
              }
            >
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder=""
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${CLASE_CONTROL} pr-12`}
              />
            </CampoContorno>

            {/* Contraseña */}
            <div>
              <CampoContorno
                id="password"
                label="Contraseña"
                adorno={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                }
              >
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isRegistering ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${CLASE_CONTROL} pr-12`}
                />
              </CampoContorno>
              {isRegistering && (
                <p className="mt-2 text-[11px] text-slate-400">
                  Mínimo 8 caracteres, con mayúscula, minúscula y número.
                </p>
              )}
            </div>

            {!isRegistering && (
              <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={recordarCorreo}
                  onChange={(event) => setRecordarCorreo(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600 focus:ring-blue-500"
                />
                <span>Recordarme en este equipo</span>
              </label>
            )}

            {/* Campo Departamento (Solo visible en Registro) */}
            {isRegistering && (
              <CampoContorno id="departamento" label="Departamento">
                <Select value={departamentoId} onValueChange={setDepartamentoId}>
                  <SelectTrigger id="departamento" className={CLASE_CONTROL}>
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
              </CampoContorno>
            )}

            {/* Botón Principal */}
            <Button
              type="submit"
              disabled={isLoading}
              className="h-14 w-full rounded-md bg-blue-500 text-base font-semibold text-white shadow-none transition-colors hover:bg-blue-600 disabled:bg-slate-400"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isRegistering ? "Registrando..." : "Ingresando..."}
                </span>
              ) : isRegistering ? (
                "Registrar cuenta"
              ) : (
                "Ingresar"
              )}
            </Button>
          </form>
        </div>

        {/* Opción para alternar entre Login y Registro */}
        <div className="text-sm text-slate-600">
          {isRegistering ? (
            <p>
              ¿Ya tienes una cuenta?{" "}
              <button
                type="button"
                onClick={toggleMode}
                className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
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
                className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
              >
                Regístrate aquí
              </button>
            </p>
          )}
        </div>
      </div>

      {/* ── Columna Derecha: identidad de marca ── */}
      <PanelMarca />
    </div>
  );
}
