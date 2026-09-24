import { Request, Response } from "express";
import {
  registerUserService,
  loginUserService,
  selectTenantService,
  switchTenantService,
  AuthError,
} from "./auth.service";
import { listarTenantsAccesibles } from "../../lib/permissions";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/** Mensaje genérico para errores inesperados en rutas de autenticación. */
export const MENSAJE_AUTH_INESPERADO =
  "No fue posible procesar la autenticación. Por favor, intente más tarde.";

/**
 * Respuesta de error de las rutas de autenticación. Un AuthError (controlado)
 * conserva su mensaje y el `status` propio del endpoint; cualquier otra
 * excepción (Prisma, infraestructura, bug) se registra SOLO en el log interno y
 * el cliente recibe un 500 genérico — nunca error.message crudo.
 */
function responderErrorAuth(res: Response, error: unknown, statusControlado: number, contexto: string) {
  if (error instanceof AuthError) {
    return res.status(statusControlado).json({ message: error.message });
  }
  console.error(`Error inesperado en ${contexto}:`, error);
  return res.status(500).json({ message: MENSAJE_AUTH_INESPERADO });
}

export const registerController = async (req: Request, res: Response) => {
  try {
    // La forma del body (campos presentes, tipo string) ya la valida el
    // middleware validarBody(registerSchema) en la ruta.
    const { nombre, email, password, departamentoId } = req.body;

    const nuevoUsuario = await registerUserService({ nombre, email, password, departamentoId });

    return res.status(201).json({
      message:
        "Registro recibido. Tu cuenta queda pendiente de aprobación por un administrador antes de poder iniciar sesión.",
      user: nuevoUsuario,
    });
  } catch (error) {
    return responderErrorAuth(res, error, 400, "el registro");
  }
};

// --- NUEVO CONTROLADOR DE LOGIN ---
export const loginController = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const resultado = await loginUserService({ email, password });

    if (resultado.requiresTenantSelection) {
      return res.status(200).json({
        requiresTenantSelection: true,
        selectionToken: resultado.selectionToken,
        tenants: resultado.tenants,
      });
    }

    return res.status(200).json({
      message: "Inicio de sesión exitoso.",
      token: resultado.token,
      user: resultado.user,
    });
  } catch (error) {
    return responderErrorAuth(res, error, 401, "el inicio de sesión");
  }
};

// --- SELECCIÓN DE EMPRESA (paso 2, solo cuando el login pide elegir) ---
export const selectTenantController = async (req: Request, res: Response) => {
  try {
    const { selectionToken, tenantId } = req.body;

    const resultado = await selectTenantService({ selectionToken, tenantId });
    if (resultado.requiresTenantSelection) {
      // No debería pasar (selectTenantService siempre emite sesión final),
      // pero se cubre por completitud del tipo.
      return res.status(500).json({ message: "No se pudo completar el inicio de sesión." });
    }

    return res.status(200).json({
      message: "Inicio de sesión exitoso.",
      token: resultado.token,
      user: resultado.user,
    });
  } catch (error) {
    return responderErrorAuth(res, error, 401, "la selección de empresa");
  }
};

// --- 3. SESIÓN ACTUAL (usada por el frontend para hidratar la sesión) ---
export const meController = async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({ user: req.user });
};

/**
 * Empresas a las que el usuario autenticado puede cambiarse (tenant hogar +
 * membresías activas), para poblar el selector de empresa del menú principal.
 * Recalculado siempre server-side; nunca se sirve desde algo que mandó el
 * cliente.
 */
export const tenantsAccesiblesController = async (req: AuthenticatedRequest, res: Response) => {
  const tenants = await listarTenantsAccesibles(req.user!.id);
  return res.status(200).json({ tenantActualId: req.user!.tenantId, tenants });
};

// --- CAMBIO DE EMPRESA DENTRO DE LA APP (ya con sesión activa) ---
export const switchTenantController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tenantId } = req.body;

    const resultado = await switchTenantService({ userId: req.user!.id, tenantId });
    if (resultado.requiresTenantSelection) {
      return res.status(500).json({ message: "No se pudo completar el cambio de empresa." });
    }

    return res.status(200).json({
      message: "Empresa cambiada correctamente.",
      token: resultado.token,
      user: resultado.user,
    });
  } catch (error) {
    return responderErrorAuth(res, error, 403, "el cambio de empresa");
  }
};
