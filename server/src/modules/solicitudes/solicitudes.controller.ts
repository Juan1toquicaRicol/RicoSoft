import fs from "fs";
import path from "path";
import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import {
  UPLOADS_DIR_COTIZACIONES,
  moverArchivoDefinitivo,
} from "../../middleware/upload.middleware";
import { crearNotificacion, notificarPorPermiso } from "../../lib/notificaciones";
import { crearItemDeTrabajo, resolverItemDeTrabajo } from "../../lib/inbox";
import { ESTADOS_SC_VINCULABLES_A_FACTURA } from "../facturas/facturas.controller";

// "Facturada" no se alcanza a través de PATCH /:id/estado (no tiene entrada
// en TRANSICIONES): la establece internamente facturas.controller.ts cuando
// se vincula una factura a una solicitud ya Aprobada/Comprada, de forma
// atómica junto con la aprobación automática de esa factura.
// "Recibida" tampoco: solo se alcanza vía confirmarRecepcionSolicitud, la
// confirmación del propio solicitante de que recibió el producto/servicio
// físicamente, una vez la factura vinculada ya está "Pagada".
const ESTADOS_VALIDOS = [
  "Pendiente",
  "En Cotización",
  "Aprobada",
  "Rechazada",
  "Comprado",
  "Facturada",
  "Recibida",
];
const PRIORIDADES_VALIDAS = ["Baja", "Media", "Alta", "Urgente"];

// Traduce la prioridad de negocio de la solicitud (ya existente, no
// inventada) a la prioridad del Inbox — ver lib/inbox.ts.
const PRIORIDAD_INBOX: Record<string, "CRITICA" | "ALTA" | "MEDIA" | "BAJA"> = {
  Urgente: "CRITICA",
  Alta: "ALTA",
  Media: "MEDIA",
  Baja: "BAJA",
};

// Antes se exigían exactamente 3 cotizaciones de proveedor para poder
// aprobar. Regla relajada a petición del negocio: basta con al menos 1
// cotización y una elegida como ganadora — el tope máximo de 3 (para no
// alargar el cuadro comparativo indefinidamente) se mantiene en
// cotizaciones.controller.ts (MAX_COTIZACIONES), sin relación con esto.
const MIN_COTIZACIONES_REQUERIDAS = 1;
const MAX_COTIZACIONES_COMPARATIVO = 3;

// Estados que aún requieren gestión: se muestran en "Solicitudes de compra".
const ESTADOS_ACTIVOS = ["Pendiente", "En Cotización"];
// Estados ya resueltos: se muestran en "Historia de compras" y ya no aparecen
// en el listado de solicitudes activas. Ninguna solicitud se elimina de la
// base de datos; solo cambia su campo `estado`.
const ESTADOS_HISTORICOS = ["Aprobada", "Rechazada", "Comprado", "Facturada", "Recibida"];

const TRANSICIONES: Record<string, { desde: string[]; permiso: string }> = {
  Aprobada: {
    desde: ["Pendiente", "En Cotización"],
    permiso: PERMISOS_SISTEMA.SOLICITUDES_APROBAR,
  },
  Rechazada: {
    desde: ["Pendiente", "En Cotización"],
    permiso: PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR,
  },
  Comprado: { desde: ["Aprobada"], permiso: PERMISOS_SISTEMA.SOLICITUDES_COMPRAR },
};

// Transiciones que registran quién resolvió la solicitud y cuándo.
const TRANSICIONES_DE_RESOLUCION = new Set(["Aprobada", "Rechazada"]);

// No se expone `cotizacionRuta` (ruta interna en disco): se sirve solo a
// través del endpoint autenticado GET /:id/archivo, igual que en facturas.
function serializar(s: any) {
  const {
    cotizacionRuta,
    cotizacionNombre,
    cotizacionMime,
    cotizacionTamano,
    cotizacionSubidoPorNombre,
    cotizacionSubidoEn,
    recepcionConfirmadaPorId,
    recepcionConfirmadaPorNombre,
    recepcionConfirmadaEn,
    recepcionComentario,
    facturas,
    cotizacionesProveedor,
    ...resto
  } = s;
  const cotizacionesProv = Array.isArray(cotizacionesProveedor) ? cotizacionesProveedor : [];
  return {
    ...resto,
    valorEstimado: Number(s.valorEstimado),
    cotizacion: cotizacionNombre
      ? {
          nombre: cotizacionNombre,
          mime: cotizacionMime,
          tamano: cotizacionTamano,
          subidoPor: cotizacionSubidoPorNombre,
          subidoEn: cotizacionSubidoEn,
        }
      : null,
    // Resumen del cuadro comparativo: cuántas cotizaciones de proveedor hay
    // registradas y si ya hay una ganadora elegida — lo que necesita el
    // frontend para habilitar/deshabilitar el botón "Aprobar" sin tener que
    // pedir el detalle completo de cada cotización.
    cotizacionesResumen: {
      total: cotizacionesProv.length,
      minimo: MIN_COTIZACIONES_REQUERIDAS,
      maximo: MAX_COTIZACIONES_COMPARATIVO,
      tieneGanadora: cotizacionesProv.some((c: any) => c.esGanadora),
    },
    // Factura final que se paga, si ya se registró (una solicitud "Comprado"
    // puede seguir sin factura hasta que llegue la factura del proveedor).
    factura:
      Array.isArray(facturas) && facturas.length > 0
        ? { id: facturas[0].id, numero: facturas[0].numero, estado: facturas[0].estado }
        : null,
    // Confirmación del solicitante original de que recibió físicamente el
    // producto/servicio (ver confirmarRecepcionSolicitud).
    recepcion: s.recepcionConfirmadaEn
      ? {
          confirmadaPor: s.recepcionConfirmadaPorNombre,
          confirmadaEn: s.recepcionConfirmadaEn,
          comentario: s.recepcionComentario,
        }
      : null,
  };
}

const INCLUDE_FACTURA_VINCULADA = {
  facturas: {
    where: { eliminado: false },
    select: { id: true, numero: true, estado: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  cotizacionesProveedor: {
    select: { id: true, esGanadora: true },
  },
};

/**
 * Solicitudes activas (Pendiente / En Cotización): son las únicas visibles
 * en "Solicitudes de compra". En cuanto se aprueban o rechazan dejan de
 * aparecer aquí y pasan a "Historia de compras".
 */
export const listarSolicitudes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId } = req.query;
    const where: any = { tenantId, estado: { in: ESTADOS_ACTIVOS }, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;

    const solicitudes = await req.tenantPrisma!.solicitudCompra.findMany({
      where,
      include: INCLUDE_FACTURA_VINCULADA,
      orderBy: { fechaSolicitud: "desc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });
    return res.json(solicitudes.map(serializar));
  } catch (error) {
    console.error("Error al listar solicitudes de compra:", error);
    return res.status(500).json({ message: "Error al obtener solicitudes de compra." });
  }
};

/**
 * Una solicitud puntual por id, en cualquier estado (activa o histórica) —
 * respalda la página de detalle (/solicitudes-compra/:id), que necesita
 * poder abrirse directo (o recargarse) sin depender de que el registro esté
 * en la página que listarSolicitudes/listarHistorialCompras haya cargado.
 */
export const obtenerSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
      include: INCLUDE_FACTURA_VINCULADA,
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    return res.json(serializar(solicitud));
  } catch (error) {
    console.error("Error al obtener la solicitud de compra:", error);
    return res.status(500).json({ message: "Error al obtener la solicitud de compra." });
  }
};

/**
 * Historia de compras: consulta de solo lectura sobre las solicitudes ya
 * resueltas (aprobadas, rechazadas o compradas). Reutiliza la misma tabla
 * SolicitudCompra -- no existe una tabla de historial separada -- filtrando
 * por estado, para no perder ni duplicar información.
 */
export const listarHistorialCompras = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { empresaId, estado, area, solicitante, desde, hasta } = req.query;

    const where: any = { tenantId, estado: { in: ESTADOS_HISTORICOS }, eliminado: false };
    if (typeof empresaId === "string" && empresaId) where.empresaId = empresaId;
    if (typeof estado === "string" && ESTADOS_HISTORICOS.includes(estado)) where.estado = estado;
    if (typeof area === "string" && area) where.area = { contains: area };
    if (typeof solicitante === "string" && solicitante)
      where.solicitante = { contains: solicitante };
    if (typeof desde === "string" && desde) {
      where.fechaResolucion = { ...(where.fechaResolucion || {}), gte: new Date(desde) };
    }
    if (typeof hasta === "string" && hasta) {
      const hastaFin = new Date(hasta);
      hastaFin.setHours(23, 59, 59, 999);
      where.fechaResolucion = { ...(where.fechaResolucion || {}), lte: hastaFin };
    }

    // Paginación real: a diferencia de "Solicitudes activas" (acotado por
    // naturaleza — Pendiente/En Cotización se resuelven, nunca se acumulan),
    // el historial crece indefinidamente con la antigüedad del tenant, así
    // que sí necesita paginación real. Se activa con `page`; sin él, se
    // conserva el comportamiento anterior (array + tope de seguridad) para
    // no romper ningún consumidor existente que todavía no lo pida.
    if (typeof req.query.page !== "undefined") {
      const pageNum = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);
      const pageSizeNum = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
      );

      const [historial, total] = await Promise.all([
        req.tenantPrisma!.solicitudCompra.findMany({
          where,
          include: INCLUDE_FACTURA_VINCULADA,
          orderBy: { fechaResolucion: "desc" },
          skip: (pageNum - 1) * pageSizeNum,
          take: pageSizeNum,
        }),
        req.tenantPrisma!.solicitudCompra.count({ where }),
      ]);

      return res.json({
        items: historial.map(serializar),
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        totalPages: Math.ceil(total / pageSizeNum),
      });
    }

    const historial = await req.tenantPrisma!.solicitudCompra.findMany({
      where,
      include: INCLUDE_FACTURA_VINCULADA,
      orderBy: { fechaResolucion: "desc" },
      take: 1000, // tope de seguridad para consumidores que no piden `page` todavía
    });
    return res.json(historial.map(serializar));
  } catch (error) {
    console.error("Error al listar historia de compras:", error);
    return res.status(500).json({ message: "Error al obtener la historia de compras." });
  }
};

/**
 * Solicitudes de compra que todavía pueden recibir una factura — punto de
 * entrada del selector "Solicitud de compra relacionada" en Recepcionar
 * Factura. Reutiliza ESTADOS_SC_VINCULABLES_A_FACTURA (misma lista que usa
 * facturas.controller.ts al vincular), así que nunca hay dos criterios de
 * "vinculable" desincronizados. Prioriza el proveedor de la factura si se
 * indica `proveedorId` — no expone el catálogo completo del tenant.
 *
 * "Facturación pendiente" se calcula con SUM(Factura.total) de las facturas
 * activas (no eliminadas, no Rechazada — una factura rechazada nunca llegó
 * a facturar nada) ya vinculadas a cada solicitud; solo se listan
 * solicitudes con saldoPendiente > 0. Es un cálculo exacto (no aproximado):
 * los datos actuales (Factura.solicitudCompraId + Factura.total) alcanzan
 * para determinarlo sin ambigüedad.
 */
export const listarSolicitudesDisponiblesParaFactura = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const tenantId = req.user!.tenantId;
    const proveedorId =
      typeof req.query.proveedorId === "string" && req.query.proveedorId
        ? req.query.proveedorId
        : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const where: any = {
      tenantId,
      eliminado: false,
      estado: { in: ESTADOS_SC_VINCULABLES_A_FACTURA },
    };
    if (proveedorId) where.proveedorId = proveedorId;
    if (search) {
      where.OR = [
        { item: { contains: search } },
        { descripcion: { contains: search } },
        { proveedor: { contains: search } },
      ];
    }

    const solicitudes = await req.tenantPrisma!.solicitudCompra.findMany({
      where,
      select: {
        id: true,
        empresaId: true,
        item: true,
        descripcion: true,
        proveedorId: true,
        proveedor: true,
        valorEstimado: true,
        estado: true,
        fechaSolicitud: true,
      },
      orderBy: { fechaSolicitud: "desc" },
      take: 200, // tope de seguridad, mismo criterio que el resto de listados no paginados de este módulo
    });
    if (solicitudes.length === 0) return res.json([]);

    const totales = await req.tenantPrisma!.factura.groupBy({
      by: ["solicitudCompraId"],
      where: {
        tenantId,
        eliminado: false,
        estado: { not: "Rechazada" },
        solicitudCompraId: { in: solicitudes.map((s) => s.id) },
      },
      _sum: { total: true },
    });
    const facturadoPorSolicitud = new Map<string, number>(
      totales
        .filter((t) => t.solicitudCompraId)
        .map((t) => [t.solicitudCompraId as string, Number(t._sum.total ?? 0)]),
    );

    const disponibles = solicitudes
      .map((s) => {
        const valorEstimado = Number(s.valorEstimado);
        const facturado = facturadoPorSolicitud.get(s.id) ?? 0;
        return {
          id: s.id,
          empresaId: s.empresaId,
          item: s.item,
          descripcion: s.descripcion,
          proveedorId: s.proveedorId,
          proveedor: s.proveedor,
          valorEstimado,
          estado: s.estado,
          fechaSolicitud: s.fechaSolicitud,
          facturado,
          saldoPendiente: valorEstimado - facturado,
        };
      })
      .filter((s) => s.saldoPendiente > 0);

    return res.json(disponibles);
  } catch (error) {
    console.error("Error al listar solicitudes disponibles para factura:", error);
    return res.status(500).json({ message: "Error al obtener solicitudes disponibles." });
  }
};

export const crearSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const {
      empresaId,
      area,
      solicitanteId,
      proveedorId,
      item,
      descripcion,
      cantidad,
      valorEstimado,
      prioridad,
    } = req.body;

    if (!empresaId || !area || !solicitanteId || !item) {
      return res.status(400).json({ message: "Faltan campos obligatorios de la solicitud." });
    }
    const cant = Number(cantidad);
    const valor = Number(valorEstimado);
    if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(valor) || valor < 0) {
      return res
        .status(400)
        .json({ message: "Cantidad y valor estimado deben ser números válidos." });
    }

    // El solicitante se elige en el formulario, pero nunca se confía en el
    // nombre que mande el cliente: se busca el usuario real por id dentro del
    // mismo tenant y su nombre se toma de la base de datos (evita ids de otro
    // tenant o nombres inventados).
    // User está deliberadamente fuera de MODELOS_TENANT_SCOPED (lecturas
    // cross-tenant legítimas en otros módulos, ver tenant-prisma.ts) — se
    // mantiene con el cliente global, con el mismo filtro manual de
    // tenantId que ya tenía antes de esta migración.
    const solicitanteUsuario = await prisma.user.findFirst({
      where: { id: solicitanteId, tenantId, activo: true },
    });
    if (!solicitanteUsuario) {
      return res.status(400).json({ message: "El solicitante seleccionado no es válido." });
    }

    // El proveedor es opcional (muchas solicitudes se crean antes de saber a
    // quién se le va a comprar), pero si se envía debe existir en el mismo
    // tenant. El nombre se toma siempre del catálogo, nunca del texto que
    // mande el cliente — mismo principio que Facturas.
    let proveedorNombre: string | null = null;
    if (proveedorId) {
      const proveedorDb = await req.tenantPrisma!.proveedor.findFirst({
        where: { id: proveedorId, tenantId, activo: true },
      });
      if (!proveedorDb) {
        return res
          .status(404)
          .json({ message: "El proveedor seleccionado no existe o está inactivo." });
      }
      proveedorNombre = proveedorDb.nombre;
    }

    const solicitud = await req.tenantPrisma!.solicitudCompra.create({
      data: {
        tenantId,
        empresaId,
        area,
        solicitanteId: solicitanteUsuario.id,
        solicitante: solicitanteUsuario.nombre,
        proveedorId: proveedorId || null,
        proveedor: proveedorNombre,
        item,
        descripcion: descripcion || null,
        cantidad: cant,
        valorEstimado: valor,
        prioridad: PRIORIDADES_VALIDAS.includes(prioridad) ? prioridad : "Media",
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_CREADA",
        detalle: `${req.user!.nombre} registró la solicitud de compra "${item}"`,
      },
    });

    await notificarPorPermiso(
      tenantId,
      PERMISOS_SISTEMA.SOLICITUDES_APROBAR,
      {
        tipo: "SOLICITUD_COMPRA_PENDIENTE",
        titulo: "Nueva solicitud de compra pendiente",
        mensaje: `${solicitanteUsuario.nombre} solicitó "${item}" (${solicitud.empresaId}).`,
        enlace: "/solicitudes-compra",
      },
      { excluirUsuarioId: req.user!.id },
    );

    await crearItemDeTrabajo(req.tenantPrisma!, {
      tenantId,
      tipo: "SOLICITUD_COMPRA_PENDIENTE",
      categoria: "APROBACION",
      sourceModule: "solicitudes",
      sourceEntityTipo: "SolicitudCompra",
      sourceEntityId: solicitud.id,
      titulo: `Solicitud de compra "${item}" pendiente de aprobación`,
      descripcion: `${solicitanteUsuario.nombre} · ${solicitud.empresaId}`,
      prioridad: PRIORIDAD_INBOX[solicitud.prioridad] || "MEDIA",
      asignadoPermiso: PERMISOS_SISTEMA.SOLICITUDES_APROBAR,
      enlace: `/solicitudes-compra/${solicitud.id}`,
    });

    return res.status(201).json(serializar(solicitud));
  } catch (error) {
    console.error("Error al crear solicitud de compra:", error);
    return res.status(500).json({ message: "Error al registrar la solicitud de compra." });
  }
};

export const cambiarEstadoSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { estado: nuevoEstado, comentario } = req.body;

    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    const transicion = TRANSICIONES[nuevoEstado];
    if (!transicion) {
      return res
        .status(400)
        .json({ message: `No se puede establecer el estado "${nuevoEstado}" directamente.` });
    }

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    if (!transicion.desde.includes(solicitud.estado)) {
      return res
        .status(409)
        .json({ message: `No se puede pasar de "${solicitud.estado}" a "${nuevoEstado}".` });
    }

    const tienePermiso = req.user!.isSuperadmin || req.user!.permisos.includes(transicion.permiso);
    if (!tienePermiso) {
      return res.status(403).json({ message: "No tienes permiso para realizar esta acción." });
    }

    // Quien crea la solicitud no puede ser quien la aprueba/rechaza, aunque
    // tenga el permiso — separación de funciones básica de control interno.
    // No aplica a "Comprado": ese paso lo suele ejecutar el mismo comprador
    // que gestionó la solicitud, y ya viene después de una aprobación de
    // otra persona.
    if (
      TRANSICIONES_DE_RESOLUCION.has(nuevoEstado) &&
      solicitud.solicitanteId &&
      solicitud.solicitanteId === req.user!.id
    ) {
      return res.status(403).json({
        message: "No puedes aprobar o rechazar una solicitud que tú mismo creaste.",
      });
    }

    // Regla de cotizaciones: una solicitud no puede aprobarse sin al menos
    // MIN_COTIZACIONES_REQUERIDAS cotización(es) de proveedor y una elegida
    // como ganadora en el cuadro comparativo (antes se exigían exactamente
    // 3; relajado a pedido del negocio — con 1 o 2 cotizaciones también se
    // puede aprobar si hay ganadora). Se valida en el backend (aquí)
    // independientemente de que el frontend ya bloquee el botón por UX.
    if (nuevoEstado === "Aprobada") {
      const cotizaciones = await req.tenantPrisma!.cotizacionProveedor.findMany({
        where: { solicitudCompraId: id, tenantId },
      });
      if (cotizaciones.length < MIN_COTIZACIONES_REQUERIDAS) {
        return res.status(409).json({
          message: `Se requiere al menos ${MIN_COTIZACIONES_REQUERIDAS} cotización de proveedor para aprobar esta solicitud (hay ${cotizaciones.length}).`,
        });
      }
      if (!cotizaciones.some((c) => c.esGanadora)) {
        return res.status(409).json({
          message:
            "Selecciona la cotización ganadora en el cuadro comparativo antes de aprobar la solicitud.",
        });
      }
    }

    const data: any = { estado: nuevoEstado };
    if (TRANSICIONES_DE_RESOLUCION.has(nuevoEstado)) {
      data.fechaResolucion = new Date();
      data.resueltoPorId = req.user!.id;
      data.resueltoPorNombre = req.user!.nombre;
      data.comentarioResolucion =
        typeof comentario === "string" && comentario.trim() ? comentario.trim() : null;
    }

    const actualizada = await req.tenantPrisma!.solicitudCompra.update({
      where: { id },
      data,
    });

    // La solicitud dejó de necesitar aprobación (fue aprobada o rechazada) —
    // resuelve el ítem de Inbox desde el mismo lugar donde el estado real
    // cambió, nunca a mano desde el propio Inbox.
    if (TRANSICIONES_DE_RESOLUCION.has(nuevoEstado)) {
      await resolverItemDeTrabajo(req.tenantPrisma!, {
        tenantId,
        sourceModule: "solicitudes",
        sourceEntityId: id,
        tipo: "SOLICITUD_COMPRA_PENDIENTE",
        resolvedByUsuarioId: req.user!.id,
      });
    }

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: `SOLICITUD_COMPRA_${nuevoEstado.toUpperCase().replace(/ /g, "_")}`,
        detalle: `${req.user!.nombre} cambió la solicitud "${solicitud.item}" a "${nuevoEstado}"`,
        entidadTipo: "SolicitudCompra",
        entidadId: id,
        datosAnteriores: JSON.stringify({ estado: solicitud.estado }),
        datosNuevos: JSON.stringify({
          estado: nuevoEstado,
          comentarioResolucion: data.comentarioResolucion ?? null,
        }),
      },
    });

    // Avisa a quien la solicitó que ya se resolvió (Aprobada/Rechazada/
    // Comprado; "En Cotización" sigue siendo un estado activo, no una
    // resolución final, así que no genera notificación).
    if (solicitud.solicitanteId && ESTADOS_HISTORICOS.includes(nuevoEstado)) {
      await crearNotificacion({
        tenantId,
        usuarioId: solicitud.solicitanteId,
        tipo: "SOLICITUD_COMPRA_RESUELTA",
        titulo: `Tu solicitud fue ${nuevoEstado.toLowerCase()}`,
        mensaje: `"${solicitud.item}" fue ${nuevoEstado.toLowerCase()} por ${req.user!.nombre}.`,
        enlace: "/historia-compras",
      });
    }

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al cambiar estado de solicitud:", error);
    return res.status(500).json({ message: "Error al actualizar la solicitud." });
  }
};

/**
 * Confirmación del solicitante original de que recibió físicamente el
 * producto/servicio pedido. Cierra el ciclo Solicitud -> Cotizaciones ->
 * Aprobación -> Factura -> Pago -> Recepción. A diferencia del resto de
 * transiciones (que requieren un permiso de gestión), esta es self-service:
 * solo el propio solicitante puede confirmarla, sin importar sus permisos,
 * y solo cuando ya existe una factura vinculada totalmente pagada.
 */
export const confirmarRecepcionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { comentario } = req.body;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
      include: {
        facturas: {
          where: { eliminado: false },
          select: { id: true, numero: true, estado: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    if (!solicitud.solicitanteId || solicitud.solicitanteId !== req.user!.id) {
      return res.status(403).json({
        message: "Solo quien creó la solicitud puede confirmar la recepción del producto.",
      });
    }

    if (solicitud.estado !== "Facturada") {
      return res.status(409).json({
        message: `No se puede confirmar la recepción desde el estado "${solicitud.estado}".`,
      });
    }

    const facturaVinculada = solicitud.facturas[0];
    if (!facturaVinculada || facturaVinculada.estado !== "Pagada") {
      return res.status(409).json({
        message:
          "La factura vinculada a esta solicitud todavía no está totalmente pagada; no se puede confirmar la recepción.",
      });
    }

    const actualizada = await req.tenantPrisma!.solicitudCompra.update({
      where: { id },
      data: {
        estado: "Recibida",
        recepcionConfirmadaPorId: req.user!.id,
        recepcionConfirmadaPorNombre: req.user!.nombre,
        recepcionConfirmadaEn: new Date(),
        recepcionComentario:
          typeof comentario === "string" && comentario.trim() ? comentario.trim() : null,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_RECIBIDA",
        detalle: `${req.user!.nombre} confirmó la recepción del producto de la solicitud "${solicitud.item}" (factura "${facturaVinculada.numero}").`,
        entidadTipo: "SolicitudCompra",
        entidadId: id,
      },
    });

    return res.json(serializar(actualizada));
  } catch (error) {
    console.error("Error al confirmar recepción de solicitud de compra:", error);
    return res.status(500).json({ message: "Error al confirmar la recepción." });
  }
};

/**
 * Elimina (soft-delete) una solicitud de compra, ya sea activa o histórica.
 * No se borra de la base de datos: se marca `eliminado` para conservar la
 * trazabilidad y deja de aparecer en el listado activo ni en la historia.
 */
export const eliminarSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) return res.status(404).json({ message: "Solicitud no encontrada." });

    await req.tenantPrisma!.solicitudCompra.update({ where: { id }, data: { eliminado: true } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_ELIMINADA",
        detalle: `${req.user!.nombre} eliminó la solicitud de compra "${solicitud.item}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar solicitud de compra:", error);
    return res.status(500).json({ message: "Error al eliminar la solicitud de compra." });
  }
};

/**
 * Recibe la cotización (PDF/imagen) adjunta a la solicitud de compra. El
 * middleware de multer ya guardó el archivo en disco antes de llegar aquí;
 * este handler solo valida que la solicitud exista en el tenant del usuario
 * y actualiza los metadatos. Si ya tenía una cotización, la anterior se
 * borra del disco (se reemplaza, no se acumulan versiones huérfanas).
 */
export const subirCotizacionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const archivo = (req as any).file as Express.Multer.File | undefined;

    if (!archivo) {
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud) {
      fs.unlink(archivo.path, () => {});
      return res.status(404).json({ message: "Solicitud no encontrada." });
    }

    if (solicitud.cotizacionRuta) {
      fs.unlink(path.join(UPLOADS_DIR_COTIZACIONES, solicitud.cotizacionRuta), () => {});
    }

    // Tenant ya confirmado: recién acá se mueve el archivo de la carpeta
    // temporal a la carpeta real de esta solicitud.
    const cotizacionRuta = moverArchivoDefinitivo(UPLOADS_DIR_COTIZACIONES, archivo, id);

    const actualizada = await req.tenantPrisma!.solicitudCompra.update({
      where: { id },
      data: {
        cotizacionNombre: archivo.originalname,
        cotizacionRuta,
        cotizacionMime: archivo.mimetype,
        cotizacionTamano: archivo.size,
        cotizacionSubidoPorNombre: req.user!.nombre,
        cotizacionSubidoEn: new Date(),
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "SOLICITUD_COMPRA_COTIZACION_ADJUNTADA",
        detalle: `${req.user!.nombre} adjuntó la cotización "${archivo.originalname}" a la solicitud "${solicitud.item}"`,
      },
    });

    return res.status(201).json(serializar(actualizada));
  } catch (error) {
    console.error("Error al subir cotización de solicitud de compra:", error);
    return res.status(500).json({ message: "Error al subir la cotización." });
  }
};

/**
 * Sirve la cotización adjunta para visualizarla/descargarla. Nunca se expone
 * un path público directo: siempre se busca la solicitud por tenant primero
 * y se lee del disco la ruta ya validada que quedó guardada en la BD.
 */
export const obtenerCotizacionSolicitud = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const solicitud = await req.tenantPrisma!.solicitudCompra.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!solicitud || !solicitud.cotizacionRuta) {
      return res.status(404).json({ message: "Esta solicitud no tiene una cotización adjunta." });
    }

    const rutaAbsoluta = path.join(UPLOADS_DIR_COTIZACIONES, solicitud.cotizacionRuta);
    if (!fs.existsSync(rutaAbsoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    res.setHeader("Content-Type", solicitud.cotizacionMime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(solicitud.cotizacionNombre || "cotizacion")}"`,
    );
    return res.sendFile(rutaAbsoluta);
  } catch (error) {
    console.error("Error al obtener cotización de solicitud de compra:", error);
    return res.status(500).json({ message: "Error al obtener la cotización." });
  }
};
