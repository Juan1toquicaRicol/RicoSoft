import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { loadSessionUser, SessionUser } from "../lib/permissions";

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
}

const JWT_SECRET = process.env.JWT_SECRET;

interface AccessTokenPayload {
  sub: string;
}

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token de acceso no proporcionado." });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, JWT_SECRET as string) as AccessTokenPayload;

    const sessionUser = await loadSessionUser(decoded.sub);
    if (!sessionUser || !sessionUser.activo) {
      return res.status(401).json({ message: "Usuario inválido o inactivo." });
    }

    req.user = sessionUser;
    next();
  } catch {
    return res.status(403).json({ message: "Token inválido o expirado." });
  }
};

export const requirePermission = (permisoRequerido: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado." });
    }
    if (req.user.isSuperadmin || req.user.permisos.includes(permisoRequerido)) {
      return next();
    }
    return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
  };
};
