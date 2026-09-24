import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Envuelve un handler async de Express 4: cualquier rechazo/excepción se
 * reenvía a `next(err)` y termina en el manejador global de errores de app.ts
 * (500 genérico, o 502 uniforme para errores marcados de Siesa). Sin esto, un
 * rechazo no capturado en un handler async deja la petición COLGADA (Express 4
 * no maneja promesas rechazadas).
 *
 * El genérico permite tipar el request (p. ej. AuthenticatedRequest) sin
 * casts en cada ruta.
 */
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req as Req, res, next)).catch(next);
  };
}
