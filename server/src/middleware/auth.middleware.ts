import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { loadSessionUser, verificarTokenVersion, SessionUser } from "../lib/permissions";
import { permisosRequeridos } from "../lib/catalogo-permisos";
import type { TenantPrisma } from "../lib/tenant-prisma";

export interface AuthenticatedRequest extends Request {
  user?: SessionUser;
  /** Cliente Prisma con enforcement automático de tenantId — ver
   * middleware/tenant-prisma.middleware.ts. Piloto: existe en paralelo al
   * cliente global `prisma`, ningún controller lo usa todavía. */
  tenantPrisma?: TenantPrisma;
}

const JWT_SECRET = process.env.JWT_SECRET;

interface AccessTokenPayload {
  sub: string;
  tv: number;
  /** Tenant elegido en el login. Ausente en tokens emitidos antes de este
   * campo, o cuando el usuario solo tiene un tenant accesible — en ambos
   * casos loadSessionUser cae al tenant "hogar" del usuario. */
  tenantId?: string;
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

    const versionVigente = await verificarTokenVersion(decoded.sub, decoded.tv);
    if (!versionVigente) {
      return res.status(403).json({ message: "Token inválido o expirado." });
    }

    const sessionUser = await loadSessionUser(decoded.sub, decoded.tenantId);
    if (!sessionUser || !sessionUser.activo) {
      return res.status(401).json({ message: "Usuario inválido o inactivo." });
    }

    req.user = sessionUser;
    next();
  } catch {
    return res.status(403).json({ message: "Token inválido o expirado." });
  }
};

/**
 * Para acciones que cruzan el límite de un tenant (dar de alta membresías a
 * OTRA empresa, listar todas las empresas). Un permiso normal como
 * "usuarios.asignar_permisos" solo tiene sentido dentro del propio tenant;
 * esto exige el flag global isSuperadmin de la sesión activa.
 */
export const requireSuperadmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado." });
  }
  if (!req.user.isSuperadmin) {
    return res
      .status(403)
      .json({ message: "Solo un superadministrador puede realizar esta acción." });
  }
  return next();
};

/**
 * Exige un permiso Y sus prerrequisitos declarados en DEPENDENCIAS_PERMISO
 * (p. ej. "cotizaciones.gestionar" exige además "cotizaciones.ver"): no se
 * puede operar sobre una sección que no se puede ver. La expansión ocurre
 * aquí, una sola vez, para que ninguna ruta nueva pueda olvidar el
 * prerrequisito de su sección.
 */
export const requirePermission = (permisoRequerido: string) => {
  const requeridos = permisosRequeridos(permisoRequerido);
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado." });
    }
    if (req.user.isSuperadmin || requeridos.every((p) => req.user!.permisos.includes(p))) {
      return next();
    }
    return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
  };
};

/**
 * Para operaciones que cruzan dos secciones y por tanto necesitan el permiso
 * de ambas — p. ej. "crear una Proforma a partir de una Cotización" escribe
 * en las dos, así que exige gestionar en cada una. Sin esto, la operación
 * quedaba autorizada solo por la sección de entrada y se saltaba la frontera
 * de permisos de la otra. Cada permiso expande sus propios prerrequisitos.
 */
export const requireAllPermissions = (permisosRequeridosBase: string[]) => {
  const requeridos = [...new Set(permisosRequeridosBase.flatMap(permisosRequeridos))];
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado." });
    }
    if (req.user.isSuperadmin || requeridos.every((p) => req.user!.permisos.includes(p))) {
      return next();
    }
    return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
  };
};

/**
 * Igual que requirePermission, pero pasa si el usuario tiene AL MENOS UNO de
 * los permisos dados. Usado en endpoints agregados que cubren varias
 * secciones (p. ej. la bandeja comercial: cotizaciones/proformas/pedidos),
 * donde exigir un único permiso de sección dejaría afuera a alguien que solo
 * tiene visibilidad de otra de las secciones que agrega el endpoint.
 */
export const requireAnyPermission = (permisosRequeridos: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado." });
    }
    if (
      req.user.isSuperadmin ||
      permisosRequeridos.some((p) => req.user!.permisos.includes(p))
    ) {
      return next();
    }
    return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
  };
};
