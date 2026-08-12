import { Request, Response } from "express";
import { registerUserService, loginUserService } from "./auth.service";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

export const registerController = async (req: Request, res: Response) => {
  try {
    const { nombre, email, password, departamentoId } = req.body;

    if (!email || !password || !nombre || !departamentoId) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios, incluido el departamento." });
    }

    const nuevoUsuario = await registerUserService({ nombre, email, password, departamentoId });

    return res.status(201).json({
      message: "Usuario registrado exitosamente en la base de datos.",
      user: nuevoUsuario,
    });
  } catch (error: any) {
    return res.status(400).json({ message: error.message || "Error al registrar el usuario." });
  }
};

// --- NUEVO CONTROLADOR DE LOGIN ---
export const loginController = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "El correo y la contraseña son requeridos." });
    }

    const { token, user } = await loginUserService({ email, password });

    return res.status(200).json({
      message: "Inicio de sesión exitoso.",
      token,
      user,
    });
  } catch (error: any) {
    return res.status(401).json({ message: error.message || "Error al iniciar sesión." });
  }
};

// --- 3. SESIÓN ACTUAL (usada por el frontend para hidratar la sesión) ---
export const meController = async (req: AuthenticatedRequest, res: Response) => {
  return res.status(200).json({ user: req.user });
};
