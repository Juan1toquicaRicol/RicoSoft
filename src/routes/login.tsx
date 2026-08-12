import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, Loader2, Eye, EyeOff, User, AlertCircle, CheckCircle2 } from "lucide-react";

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

// Lista de dominios permitidos para el registro
const DOMINIOS_PERMITIDOS = ["ricol.com.co", "flexipackdecolombia.com", "greesolutions.com.co"];

interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

function Login() {
  const navigate = useNavigate();

  // Estados del formulario y conmutador
  const [isRegistering, setIsRegistering] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Carga el catálogo de departamentos al entrar en modo registro
  useEffect(() => {
    if (!isRegistering || departamentos.length > 0) return;
    fetchApi("/departamentos/publico")
      .then((data) => setDepartamentos(Array.isArray(data) ? data : []))
      .catch(() => setDepartamentos([]));
  }, [isRegistering, departamentos.length]);

  // Estados de mensajes
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Validar si el dominio es uno de los 3 autorizados
  const esDominioValido = (correo: string) => {
    const dominio = correo.split("@")[1]?.toLowerCase();
    return DOMINIOS_PERMITIDOS.includes(dominio);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    if (isRegistering) {
      // 🛑 Validación del dominio en el Frontend
      if (!esDominioValido(email)) {
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
      } catch (err: any) {
        setError(err.message || "Ocurrió un error al intentar registrar la cuenta.");
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

        // 1. Guardamos el Token (ya lo tienes así)
        if (response.token) {
          localStorage.setItem("token", response.token);
        }

        // 2. 🟢 AÑADE ESTA LÍNEA AQUÍ: Guardar la información del usuario
        if (response.user) {
          localStorage.setItem("user", JSON.stringify(response.user));
        }

        navigate({ to: "/" });
      } catch (err: any) {
        setError(err.message || "Correo o contraseña incorrectos.");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleForgotPassword = () => {
    alert(
      "Para restablecer tu contraseña, contacta al Administrador del Sistema de RicoSoft o al área de IT.",
    );
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError("");
    setSuccessMessage("");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* ── Columna Izquierda: Formulario ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 bg-white">
        {/* Logo / Marca */}
        <div className="w-full max-w-[360px]">
          <div className="flex items-center gap-3 mb-8">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl font-black text-white text-xl shadow-lg"
              style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)" }}
            >
              R
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-slate-900">RicoSoft</p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Sistema Multiempresa
              </p>
            </div>
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
            </div>

            {/* Botón Principal */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 text-sm font-bold rounded-lg shadow-md transition-all mt-2"
              style={{
                background: isLoading
                  ? "#94a3b8"
                  : "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                border: "none",
              }}
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
      <div className="hidden lg:flex flex-1 items-center justify-center bg-slate-50 border-l border-slate-200">
        <img
          src="/3logos.jpg"
          alt="Nuestras empresas"
          className="w-full h-full object-contain p-16"
        />
      </div>
    </div>
  );
}
