import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { resolverCiaSiesa } from "../../lib/siesa-tenant";
import {
  contarFacturasCompraSiesa,
  listarFacturasCompraSiesa,
} from "../integraciones-siesa/siesa-facturas-compra.service";
import { listarFacturasSiesaSchema } from "./facturas-siesa.schemas";

/**
 * GET /facturas/siesa — consulta de SOLO LECTURA de facturas de proveedores
 * (compra/servicios) registradas en Siesa (t455_cm_factura_docto), separada
 * a propósito del CRUD nativo de Factura (facturas.controller.ts): no son
 * el mismo dato, no se cruzan por NIT/número (ver comentario del service),
 * y esta ruta nunca escribe nada — reutiliza el permiso facturas.ver porque
 * es, para quien consulta, la misma capacidad ("ver qué facturas hay").
 *
 * ciaId SIEMPRE sale de Tenant.siesaCiaId resuelto desde la sesión
 * (resolverCiaSiesa) — cualquier ciaId/tenantId en query/body se ignora.
 * Mismo patrón de respuesta que el resto de consultas Siesa de este
 * sistema (ventas.controller.ts, siesa-pedidos/remisiones): un tenant sin
 * siesaCiaId configurado o una falla de conexión responden 200 con
 * `disponible:false` + `motivo`, nunca un 500 ni un 502 — es información
 * de solo lectura, no una operación que deba fallar la petición.
 */
export const listarFacturasSiesaController = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarFacturasSiesaSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { search, desde, hasta, page, pageSize } = parseo.data;

  const siesaCiaId = await resolverCiaSiesa(tenantId);
  if (!siesaCiaId) {
    return res.json({
      disponible: false,
      motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      items: [],
      page,
      pageSize,
      total: 0,
    });
  }

  const filtros = { search, desde, hasta };
  try {
    const [items, total] = await Promise.all([
      listarFacturasCompraSiesa(siesaCiaId, filtros, page, pageSize),
      contarFacturasCompraSiesa(siesaCiaId, filtros),
    ]);
    return res.json({ disponible: true, items, page, pageSize, total });
  } catch (error) {
    console.error("Error al leer facturas de proveedores desde Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page,
      pageSize,
      total: 0,
    });
  }
};
