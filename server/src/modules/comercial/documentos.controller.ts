import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { listarDocumentosSchema } from "./comercial.schemas";
import { formatearNumeroCotizacion, formatearNumeroPedido } from "./cotizaciones.controller";

type DocumentoBandeja = {
  tipo: "cotizacion" | "proforma" | "pedido";
  id: string;
  numero: string;
  cliente: string;
  fecha: Date;
  estado: string;
  valor: number;
  documentoRelacionado: string | null;
  erp: string | null;
};

/** GET /comercial/documentos — bandeja agregada de Cotizaciones/Proformas/
 * Pedidos comerciales, paginada SIEMPRE (sección 14 del encargo: nunca
 * findMany sin paginación sobre tablas comerciales). tenantId sale SOLO de
 * req.user — nunca del query. La paginación se aplica por tipo en la
 * consulta a BD y se recorta/ordena en memoria al combinar — con volúmenes
 * moderados por tenant esto es aceptable; si el volumen crece, cada tipo ya
 * tiene su propio endpoint paginado real (listarCotizaciones/listarPedidos/
 * listarProformas) para consultas más grandes. */
export const listarDocumentosComerciales = async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.user!.tenantId;
  const parseo = listarDocumentosSchema.safeParse(req.query);
  if (!parseo.success) {
    return res.status(400).json({ message: parseo.error.errors[0]?.message ?? "Datos inválidos." });
  }
  const { tipo, estado, clienteRowId, vendedorNombre, desde, hasta, search, page, pageSize } =
    parseo.data;

  const filtroFecha =
    desde || hasta
      ? {
          gte: desde ?? undefined,
          lte: hasta ?? undefined,
        }
      : undefined;

  const documentos: DocumentoBandeja[] = [];

  // Cada tipo de documento se agrega solo si el usuario tiene el VER de su
  // propia sección — el permiso de entrada a este endpoint (requireAnyPermission
  // en comercial.routes.ts) solo garantiza acceso a AL MENOS una sección, no a
  // las tres. Sin este filtro, alguien con únicamente pedidos_comerciales.ver
  // vería también las cotizaciones y proformas de todo el tenant.
  const puede = (permiso: string) =>
    req.user!.isSuperadmin || req.user!.permisos.includes(permiso);
  const puedeVerCotizaciones = puede(PERMISOS_SISTEMA.COTIZACIONES_VER);
  const puedeVerProformas = puede(PERMISOS_SISTEMA.PROFORMAS_VER);
  const puedeVerPedidos = puede(PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER);

  if ((tipo === "todos" || tipo === "cotizacion") && puedeVerCotizaciones) {
    const cotizaciones = await prisma.cotizacion.findMany({
      where: {
        tenantId,
        ...(estado ? { estado } : {}),
        ...(clienteRowId !== undefined ? { clienteRowId } : {}),
        ...(vendedorNombre ? { vendedorNombre: { contains: vendedorNombre } } : {}),
        ...(filtroFecha ? { fecha: filtroFecha } : {}),
        ...(search
          ? { OR: [{ clienteNombre: { contains: search } }, { erpNumero: { contains: search } }] }
          : {}),
      },
      include: { items: true },
      orderBy: { fecha: "desc" },
      take: 500,
    });
    for (const c of cotizaciones) {
      const valor = c.items.reduce(
        (acc, it) => acc + Number(it.cantidad) * Number(it.precioUnitario),
        0,
      );
      documentos.push({
        tipo: "cotizacion",
        id: c.id,
        numero: formatearNumeroCotizacion(c.numero),
        cliente: c.clienteNombre,
        fecha: c.fecha,
        estado: c.estado,
        valor,
        documentoRelacionado: null,
        erp: c.erpNumero,
      });
    }
  }

  if ((tipo === "todos" || tipo === "proforma") && puedeVerProformas) {
    const proformas = await prisma.proforma.findMany({
      where: {
        tenantId,
        ...(estado ? { estado } : {}),
        ...(clienteRowId !== undefined ? { clienteRowId } : {}),
        ...(vendedorNombre ? { vendedorNombre: { contains: vendedorNombre } } : {}),
        ...(filtroFecha ? { createdAt: filtroFecha } : {}),
        ...(search
          ? {
              OR: [
                { clienteNombre: { contains: search } },
                { erpDocumentoNumero: { contains: search } },
              ],
            }
          : {}),
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    for (const p of proformas) {
      const valor = p.items.reduce(
        (acc, it) => acc + Number(it.cantidad) * Number(it.precioUnitario),
        0,
      );
      documentos.push({
        tipo: "proforma",
        id: p.id,
        numero: String(p.numero),
        cliente: p.clienteNombre,
        fecha: p.createdAt,
        estado: p.estado,
        valor,
        documentoRelacionado: p.cotizacionNumero,
        erp: p.erpDocumentoNumero,
      });
    }
  }

  if ((tipo === "todos" || tipo === "pedido") && puedeVerPedidos) {
    const pedidos = await prisma.pedidoComercial.findMany({
      where: {
        tenantId,
        ...(estado ? { estado } : {}),
        ...(clienteRowId !== undefined ? { clienteRowId } : {}),
        ...(vendedorNombre ? { vendedorNombre: { contains: vendedorNombre } } : {}),
        ...(filtroFecha ? { fecha: filtroFecha } : {}),
        ...(search
          ? { OR: [{ clienteNombre: { contains: search } }, { erpNumero: { contains: search } }] }
          : {}),
      },
      include: { items: true, proforma: { select: { numero: true } } },
      orderBy: { fecha: "desc" },
      take: 500,
    });
    for (const p of pedidos) {
      const valor = p.items.reduce(
        (acc, it) => acc + Number(it.cantidad) * Number(it.precioUnitario),
        0,
      );
      documentos.push({
        tipo: "pedido",
        id: p.id,
        numero: formatearNumeroPedido(p.numero),
        cliente: p.clienteNombre,
        fecha: p.fecha,
        estado: p.estado,
        valor,
        documentoRelacionado: p.proforma ? String(p.proforma.numero) : null,
        erp: p.erpNumero,
      });
    }
  }

  documentos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  const total = documentos.length;
  const paginados = documentos.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  return res.json({ items: paginados, page, pageSize, total });
};
