import { Request, Response } from "express";
import {
  registerUserService,
  loginUserService,
  selectTenantService,
  switchTenantService,
} from "./auth.service";
import { listarTenantsAccesibles } from "../../lib/permissions";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const registerController = async (req: Request, res: Response) => {
  try {
    // La forma del body (campos presentes, tipo string) ya la valida el
    // middleware validarBody(registerSchema) en la ruta.
    const { nombre, email, password, departamentoId } = req.body;

    const nuevoUsuario = await registerUserService({ nombre, email, password, departamentoId });

    return res.status(201).json({
      message: "Usuario registrado exitosamente en la base de datos.",
      user: nuevoUsuario,
    });
  } catch (error) {
    return res.status(400).json({
      message: error instanceof Error ? error.message : "Error al registrar el usuario.",
    });
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
    return res
      .status(401)
      .json({ message: error instanceof Error ? error.message : "Error al iniciar sesión." });
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
    return res.status(401).json({
      message:
        error instanceof Error ? error.message : "No se pudo iniciar sesión con esa empresa.",
    });
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
    return res
      .status(403)
      .json({ message: error instanceof Error ? error.message : "No se pudo cambiar de empresa." });
  }
};
