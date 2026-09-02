import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.middleware";
import { getTenantPrisma } from "../lib/tenant-prisma";

/**
 * Cuelga req.tenantPrisma, un cliente Prisma con enforcement automático de
 * tenantId para el catálogo curado de modelos (ver lib/tenant-prisma.ts).
 * Debe montarse DESPUÉS de authenticateJWT (necesita req.user.tenantId ya
 * resuelto). Piloto: por ahora ningún controller lo consume — se agrega
 * aquí para que esté disponible cuando se empiece a migrar módulo por
 * módulo, sin tener que tocar cada archivo de rutas dos veces.
 */
export function attachTenantPrisma(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado." });
  }
  req.tenantPrisma = getTenantPrisma(req.user.tenantId);
  next();
}
