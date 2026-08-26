import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Valida req.body contra un esquema zod antes de llegar al controlador.
 * Solo cubre forma/tipo/formato básico (campos requeridos, tipos, email,
 * etc.); las reglas de negocio (unicidad, existencia en el tenant, política
 * de contraseñas, dominios corporativos) siguen viviendo en el controlador o
 * servicio correspondiente, no aquí.
 */
export const validarBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const resultado = schema.safeParse(req.body);
    if (!resultado.success) {
      const primerError = resultado.error.issues[0];
      return res.status(400).json({ message: primerError?.message ?? "Datos inválidos." });
    }
    req.body = resultado.data;
    next();
  };
};
