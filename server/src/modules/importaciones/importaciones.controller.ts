import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

const INCOTERMS_VALIDOS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const MONEDAS_VALIDAS = ["USD", "EUR", "CNY", "GBP", "JPY"];
const ESTADOS_ORDEN_VALIDOS = ["Borrador", "Confirmada", "Cerrada", "Anulada"];
// Solo los estados previos a la llegada física se cambian a mano desde
// actualizarEstadoLote. "Liberado pre-compra" lo asigna recibirPreCompraPlanta
// y "Nacionalizado" lo asigna liquidarCosteoImportacion: ninguno de los dos
// se puede saltar a mano, porque cada uno dispara su propio efecto de negocio
// (crear costeo provisional / costeo definitivo).
const ESTADOS_TRANSITO_MANUAL = ["En tránsito", "En puerto", "En inspección"];
const ESTADOS_LOTE_LIQUIDABLES = ["En puerto", "En inspección", "Liberado pre-compra"];

const numero = (valor: unknown): number => Number(valor ?? 0);

function calcularCantidadValida(cantidad: number, contexto: string) {
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new Error(`La cantidad del ítem "${contexto}" debe ser un número mayor a cero.`);
  }
}

const serializarItem = (item: any) => ({
  id: item.id,
  descripcion: item.descripcion,
  subpartidaArancelariaId: item.subpartidaArancelariaId,
  subpartida: item.subpartida
    ? { id: item.subpartida.id, subpartida: item.subpartida.subpartida, descripcion: item.subpartida.descripcion }
    : null,
  cantidad: numero(item.cantidad),
  pesoKg: item.pesoKg !== null && item.pesoKg !== undefined ? numero(item.pesoKg) : null,
  volumenM3: item.volumenM3 !== null && item.volumenM3 !== undefined ? numero(item.volumenM3) : null,
  valorUnitarioFob: numero(item.valorUnitarioFob),
});

const serializarCosteo = (c: any) => ({
  id: c.id,
  itemId: c.itemId,
  valorCifUsd: numero(c.valorCifUsd),
  trmLiquidacion: numero(c.trmLiquidacion),
  valorCifCop: numero(c.valorCifCop),
  arancelCop: numero(c.arancelCop),
  ivaTotalCop: numero(c.ivaTotalCop),
  ivaDescontableCop: numero(c.ivaDescontableCop),
  ivaCapitalizableCop: numero(c.ivaCapitalizableCop),
  fletesNacionalesCop: numero(c.fletesNacionalesCop),
  agenciamientoCop: numero(c.agenciamientoCop),
  otrosCostosCop: numero(c.otrosCostosCop),
  diferenciaCambioCop: numero(c.diferenciaCambioCop),
  cantidad: numero(c.cantidad),
  costoTotalCop: numero(c.costoTotalCop),
  costoUnitarioCop: numero(c.costoUnitarioCop),
  esProvisional: c.esProvisional,
  fechaLiquidacion: c.fechaLiquidacion,
});

const serializarVistoBueno = (v: any) => ({
  id: v.id,
  entidad: v.entidad,
  numero: v.numero,
  estado: v.estado,
  fecha: v.fecha,
  archivo: v.archivoNombre ? { nombre: v.archivoNombre, mime: v.archivoMime, tamano: v.archivoTamano } : null,
});

const serializarExpediente = (e: any) => ({
  id: e.id,
  numeroDIM: e.numeroDIM,
  fechaDIM: e.fechaDIM,
  certificadoOrigenTlc: e.certificadoOrigenTlc,
  fechaLevante: e.fechaLevante,
  estado: e.estado,
  documentos: {
    dim: e.dimNombre ? { nombre: e.dimNombre, mime: e.dimMime, tamano: e.dimTamano } : null,
    facturaComercial: e.facturaComercialNombre
      ? { nombre: e.facturaComercialNombre, mime: e.facturaComercialMime, tamano: e.facturaComercialTamano }
      : null,
    certificadoOrigen: e.certificadoOrigenNombre
      ? { nombre: e.certificadoOrigenNombre, mime: e.certificadoOrigenMime, tamano: e.certificadoOrigenTamano }
      : null,
  },
  vistosBuenos: (e.vistosBuenos ?? []).map(serializarVistoBueno),
});

const serializarLote = (l: any) => ({
  id: l.id,
  ordenCompraId: l.ordenCompraId,
  blAwb: l.blAwb,
  contenedor: l.contenedor,
  precinto: l.precinto,
  puertoOrigen: l.puertoOrigen,
  puertoDestino: l.puertoDestino,
  naviera: l.naviera,
  fechaEmbarque: l.fechaEmbarque,
  fechaLlegadaEstimada: l.fechaLlegadaEstimada,
  fechaLlegadaReal: l.fechaLlegadaReal,
  estado: l.estado,
  expediente: l.expediente ? serializarExpediente(l.expediente) : null,
  costeos: (l.costeos ?? []).map(serializarCosteo),
});

const serializarOrden = (o: any) => ({
  id: o.id,
  numeroOrden: o.numeroOrden,
  incoterm: o.incoterm,
  proveedorExtranjero: o.proveedorExtranjero,
  paisOrigen: o.paisOrigen,
  moneda: o.moneda,
  trmPactada: numero(o.trmPactada),
  valorEstimadoTotal: numero(o.valorEstimadoTotal),
  estado: o.estado,
  observaciones: o.observaciones,
  responsable: o.responsableUsuario ? { id: o.responsableUsuario.id, nombre: o.responsableUsuario.nombre } : null,
  createdAt: o.createdAt,
  items: (o.items ?? []).map(serializarItem),
  lotes: (o.lotes ?? []).map(serializarLote),
  historial: (o.historial ?? []).map((h: any) => ({
    fecha: h.createdAt,
    actor: h.actor,
    accion: h.accion,
    detalle: h.detalle,
  })),
});

const INCLUDE_ORDEN_DETALLE = {
  responsableUsuario: { select: { id: true, nombre: true } },
  items: { include: { subpartida: true } },
  lotes: {
    include: {
      expediente: { include: { vistosBuenos: true } },
      costeos: { orderBy: { fechaLiquidacion: "desc" as const } },
    },
  },
  historial: { orderBy: { createdAt: "asc" as const } },
};

export const listarOrdenesCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { estado, search } = req.query;

    const where: any = { tenantId, eliminado: false };
    if (typeof estado === "string" && ESTADOS_ORDEN_VALIDOS.includes(estado)) where.estado = estado;
    if (typeof search === "string" && search.trim()) {
      const term = search.trim();
      where.OR = [{ numeroOrden: { contains: term } }, { proveedorExtranjero: { contains: term } }];
    }

    const ordenes = await prisma.ordenCompraIntl.findMany({
      where,
      include: {
        responsableUsuario: { select: { id: true, nombre: true } },
        lotes: { include: { expediente: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json(ordenes.map(serializarOrden));
  } catch (error) {
    console.error("Error al listar órdenes de compra internacionales:", error);
    return res.status(500).json({ message: "Error al obtener las órdenes de compra internacionales." });
  }
};

export const obtenerOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({
      where: { id: req.params.id, tenantId, eliminado: false },
      include: INCLUDE_ORDEN_DETALLE,
    });
    if (!orden) return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    return res.json(serializarOrden(orden));
  } catch (error) {
    console.error("Error al obtener orden de compra internacional:", error);
    return res.status(500).json({ message: "Error al obtener la orden de compra internacional." });
  }
};

/**
 * Registra la orden con un estimado de landed cost calculado solo con datos
 * ya conocidos al momento de comprar (FOB + arancel base de la subpartida,
 * si el ítem la tiene asignada). Flete nacional y agenciamiento no se
 * incluyen aquí porque no se conocen hasta la liquidación definitiva.
 */
export const crearOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { numeroOrden, incoterm, proveedorExtranjero, paisOrigen, moneda, trmPactada, observaciones, items } =
      req.body;

    if (!INCOTERMS_VALIDOS.includes(incoterm)) {
      return res.status(400).json({ message: `Incoterm inválido. Valores permitidos: ${INCOTERMS_VALIDOS.join(", ")}.` });
    }
    if (!MONEDAS_VALIDAS.includes(moneda)) {
      return res.status(400).json({ message: `Moneda inválida. Valores permitidos: ${MONEDAS_VALIDAS.join(", ")}.` });
    }
    const trm = numero(trmPactada);
    if (!Number.isFinite(trm) || trm <= 0) {
      return res.status(400).json({ message: "La TRM pactada debe ser un número mayor a cero." });
    }

    // Solo las órdenes activas cuentan para la unicidad del número: una orden
    // eliminada (soft-delete) no debe bloquear para siempre volver a usarlo.
    const existente = await prisma.ordenCompraIntl.findFirst({ where: { tenantId, numeroOrden, eliminado: false } });
    if (existente) {
      return res.status(409).json({ message: `Ya existe una orden activa con el número "${numeroOrden}".` });
    }

    for (const item of items) {
      calcularCantidadValida(numero(item.cantidad), item.descripcion);
    }

    const subpartidaIds = [...new Set(items.map((i: any) => i.subpartidaArancelariaId).filter(Boolean))] as string[];
    const subpartidas = subpartidaIds.length
      ? await prisma.clasificacionArancelariaMatriz.findMany({ where: { id: { in: subpartidaIds }, activo: true } })
      : [];
    const tarifaPorSubpartida = new Map(subpartidas.map((s) => [s.id, numero(s.tarifaArancelariaBase)]));

    let valorEstimadoTotal = 0;
    for (const item of items) {
      const fobCop = numero(item.cantidad) * numero(item.valorUnitarioFob) * trm;
      const tarifa = item.subpartidaArancelariaId ? tarifaPorSubpartida.get(item.subpartidaArancelariaId) ?? 0 : 0;
      valorEstimadoTotal += fobCop + fobCop * (tarifa / 100);
    }

    const orden = await prisma.ordenCompraIntl.create({
      data: {
        tenantId,
        numeroOrden,
        incoterm,
        proveedorExtranjero,
        paisOrigen,
        moneda,
        trmPactada: trm,
        valorEstimadoTotal,
        observaciones: observaciones ?? null,
        responsableId: req.user!.id,
        items: {
          create: items.map((item: any) => ({
            descripcion: item.descripcion,
            subpartidaArancelariaId: item.subpartidaArancelariaId ?? null,
            cantidad: numero(item.cantidad),
            pesoKg: item.pesoKg != null ? numero(item.pesoKg) : null,
            volumenM3: item.volumenM3 != null ? numero(item.volumenM3) : null,
            valorUnitarioFob: numero(item.valorUnitarioFob),
          })),
        },
        historial: {
          create: [{ actor: req.user!.nombre, accion: "Orden creada", detalle: `Landed cost estimado: $${valorEstimadoTotal.toLocaleString("es-CO")}` }],
        },
      },
      include: INCLUDE_ORDEN_DETALLE,
    });

    return res.status(201).json(serializarOrden(orden));
  } catch (error) {
    console.error("Error al crear orden de compra internacional:", error);
    const message = error instanceof Error ? error.message : "Error al crear la orden de compra internacional.";
    return res.status(400).json({ message });
  }
};

export const crearLoteImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({ where: { id: req.params.id, tenantId, eliminado: false } });
    if (!orden) return res.status(404).json({ message: "Orden de compra internacional no encontrada." });
    if (orden.estado === "Anulada" || orden.estado === "Cerrada") {
      return res.status(400).json({ message: `No se pueden registrar lotes en una orden en estado "${orden.estado}".` });
    }

    const { blAwb, contenedor, precinto, puertoOrigen, puertoDestino, naviera, fechaEmbarque, fechaLlegadaEstimada } =
      req.body;

    const lote = await prisma.loteImportacion.create({
      data: {
        tenantId,
        ordenCompraId: orden.id,
        blAwb,
        contenedor: contenedor ?? null,
        precinto: precinto ?? null,
        puertoOrigen,
        puertoDestino,
        naviera: naviera ?? null,
        fechaEmbarque: fechaEmbarque ? new Date(fechaEmbarque) : null,
        fechaLlegadaEstimada: fechaLlegadaEstimada ? new Date(fechaLlegadaEstimada) : null,
      },
    });

    await prisma.importacionHistorial.create({
      data: { ordenCompraId: orden.id, actor: req.user!.nombre, accion: "Lote registrado", detalle: `BL/AWB ${blAwb}` },
    });

    if (orden.estado === "Borrador") {
      await prisma.ordenCompraIntl.update({ where: { id: orden.id }, data: { estado: "Confirmada" } });
    }

    return res.status(201).json(serializarLote(lote));
  } catch (error) {
    console.error("Error al crear lote de importación:", error);
    return res.status(500).json({ message: "Error al registrar el lote de importación." });
  }
};

/**
 * Solo mueve estados previos a la llegada física (En tránsito/En
 * puerto/En inspección). "Liberado pre-compra" y "Nacionalizado" tienen
 * endpoints dedicados porque cada uno crea el costeo correspondiente.
 */
export const actualizarEstadoLote = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { estado } = req.body;

    if (!ESTADOS_TRANSITO_MANUAL.includes(estado)) {
      return res.status(400).json({
        message: `Estado inválido para cambio manual. Usa: ${ESTADOS_TRANSITO_MANUAL.join(", ")}. Los estados "Liberado pre-compra" y "Nacionalizado" se asignan desde sus propios endpoints.`,
      });
    }

    const lote = await prisma.loteImportacion.findFirst({ where: { id: req.params.id, tenantId } });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (!ESTADOS_TRANSITO_MANUAL.includes(lote.estado)) {
      return res.status(400).json({ message: `El lote ya está en estado "${lote.estado}" y no puede volver a tránsito manual.` });
    }

    const actualizado = await prisma.loteImportacion.update({ where: { id: lote.id }, data: { estado } });

    await prisma.importacionHistorial.create({
      data: { ordenCompraId: lote.ordenCompraId, actor: req.user!.nombre, accion: "Cambio de estado de tránsito", detalle: `${lote.estado} → ${estado}` },
    });

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al actualizar estado del lote:", error);
    return res.status(500).json({ message: "Error al actualizar el estado del lote." });
  }
};

/**
 * Ingreso físico a planta antes de la factura/liquidación final. Genera un
 * costeo PROVISIONAL por ítem (FOB * TRM pactada, sin arancel/flete/
 * agenciamiento porque aún no se conocen) para que el inventario tenga un
 * costo de referencia inmediato; liquidarCosteoImportacion agrega después la
 * fila definitiva sin borrar esta.
 */
export const recibirPreCompraPlanta = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { include: { items: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (lote.estado === "Liberado pre-compra" || lote.estado === "Nacionalizado") {
      return res.status(400).json({ message: `El lote ya fue recibido en planta (estado actual: "${lote.estado}").` });
    }

    const trmPactada = numero(lote.ordenCompra.trmPactada);

    const costeosProvisionales = lote.ordenCompra.items.map((item) => {
      const cantidad = numero(item.cantidad);
      const valorCifUsd = cantidad * numero(item.valorUnitarioFob);
      const valorCifCop = valorCifUsd * trmPactada;
      return {
        tenantId,
        loteId: lote.id,
        itemId: item.id,
        valorCifUsd,
        trmLiquidacion: trmPactada,
        valorCifCop,
        arancelCop: 0,
        ivaTotalCop: 0,
        cantidad,
        costoTotalCop: valorCifCop,
        costoUnitarioCop: valorCifCop / cantidad,
        esProvisional: true,
      };
    });

    await prisma.$transaction([
      prisma.loteImportacion.update({
        where: { id: lote.id },
        data: { estado: "Liberado pre-compra", fechaLlegadaReal: lote.fechaLlegadaReal ?? new Date() },
      }),
      prisma.costeoImportacionDetalle.createMany({ data: costeosProvisionales }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Recibido en planta (pre-compra)",
          detalle: `Lote ${lote.blAwb}: costeo provisional generado para ${costeosProvisionales.length} ítem(s).`,
        },
      }),
    ]);

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: { expediente: { include: { vistosBuenos: true } }, costeos: true },
    });

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al recibir pre-compra en planta:", error);
    return res.status(500).json({ message: "Error al registrar el ingreso a planta." });
  }
};

/**
 * Liquidación definitiva del landed cost (NIC 2), prorrateada por ítem según
 * su participación en el valor FOB del lote. Registra además la diferencia
 * en cambio (NIC 21) entre la TRM pactada en la orden y la TRM real de
 * nacionalización. No borra el costeo provisional: agrega la fila definitiva
 * (esProvisional=false) para conservar la trazabilidad de la estimación.
 */
export const liquidarCosteoImportacion = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const lote = await prisma.loteImportacion.findFirst({
      where: { id: req.params.id, tenantId },
      include: { ordenCompra: { include: { items: true } } },
    });
    if (!lote) return res.status(404).json({ message: "Lote de importación no encontrado." });
    if (!ESTADOS_LOTE_LIQUIDABLES.includes(lote.estado)) {
      return res.status(400).json({
        message: `No se puede liquidar un lote en estado "${lote.estado}". Debe estar en: ${ESTADOS_LOTE_LIQUIDABLES.join(", ")}.`,
      });
    }

    const items = lote.ordenCompra.items;
    if (items.length === 0) {
      return res.status(400).json({ message: "La orden no tiene ítems para liquidar." });
    }

    const {
      trmLiquidacion,
      valorCifTotalUsd,
      arancelTotalCop,
      ivaTotalCop,
      ivaDescontableCop,
      fletesNacionalesCop,
      agenciamientoCop,
      otrosCostosCop,
    } = req.body;

    const trmLiq = numero(trmLiquidacion);
    const trmPactada = numero(lote.ordenCompra.trmPactada);
    const sumFobUsd = items.reduce((acc, item) => acc + numero(item.cantidad) * numero(item.valorUnitarioFob), 0);
    if (sumFobUsd <= 0) {
      return res.status(400).json({ message: "El valor FOB total de la orden debe ser mayor a cero para prorratear costos." });
    }

    const totalIvaDescontable = numero(ivaDescontableCop);
    const totalFletes = numero(fletesNacionalesCop);
    const totalAgenciamiento = numero(agenciamientoCop);
    const totalOtros = numero(otrosCostosCop);
    const totalArancel = numero(arancelTotalCop);
    const totalIva = numero(ivaTotalCop);
    const totalCif = numero(valorCifTotalUsd);

    const costeosDefinitivos = items.map((item) => {
      const cantidad = numero(item.cantidad);
      const fobUsdItem = cantidad * numero(item.valorUnitarioFob);
      const participacion = fobUsdItem / sumFobUsd;

      const valorCifUsd = totalCif * participacion;
      const valorCifCop = valorCifUsd * trmLiq;
      const arancelCop = totalArancel * participacion;
      const ivaTotalCopItem = totalIva * participacion;
      const ivaDescontableCopItem = totalIvaDescontable * participacion;
      const ivaCapitalizableCop = ivaTotalCopItem - ivaDescontableCopItem;
      const fletesNacionalesCopItem = totalFletes * participacion;
      const agenciamientoCopItem = totalAgenciamiento * participacion;
      const otrosCostosCopItem = totalOtros * participacion;
      const diferenciaCambioCop = (trmLiq - trmPactada) * fobUsdItem;

      const costoTotalCop =
        valorCifCop +
        arancelCop +
        ivaCapitalizableCop +
        fletesNacionalesCopItem +
        agenciamientoCopItem +
        otrosCostosCopItem +
        diferenciaCambioCop;

      return {
        tenantId,
        loteId: lote.id,
        itemId: item.id,
        valorCifUsd,
        trmLiquidacion: trmLiq,
        valorCifCop,
        arancelCop,
        ivaTotalCop: ivaTotalCopItem,
        ivaDescontableCop: ivaDescontableCopItem,
        ivaCapitalizableCop,
        fletesNacionalesCop: fletesNacionalesCopItem,
        agenciamientoCop: agenciamientoCopItem,
        otrosCostosCop: otrosCostosCopItem,
        diferenciaCambioCop,
        cantidad,
        costoTotalCop,
        costoUnitarioCop: costoTotalCop / cantidad,
        esProvisional: false,
        liquidadoPorId: req.user!.id,
      };
    });

    await prisma.$transaction([
      prisma.costeoImportacionDetalle.createMany({ data: costeosDefinitivos }),
      prisma.loteImportacion.update({ where: { id: lote.id }, data: { estado: "Nacionalizado" } }),
      prisma.importacionHistorial.create({
        data: {
          ordenCompraId: lote.ordenCompraId,
          actor: req.user!.nombre,
          accion: "Costeo de importación liquidado",
          detalle: `Lote ${lote.blAwb}: costo total landed $${costeosDefinitivos
            .reduce((acc, c) => acc + c.costoTotalCop, 0)
            .toLocaleString("es-CO")}`,
        },
      }),
    ]);

    const actualizado = await prisma.loteImportacion.findUnique({
      where: { id: lote.id },
      include: { expediente: { include: { vistosBuenos: true } }, costeos: { orderBy: { fechaLiquidacion: "desc" } } },
    });

    return res.json(serializarLote(actualizado));
  } catch (error) {
    console.error("Error al liquidar costeo de importación:", error);
    return res.status(500).json({ message: "Error al liquidar el costeo de importación." });
  }
};

export const anularOrdenCompraIntl = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const orden = await prisma.ordenCompraIntl.findFirst({ where: { id: req.params.id, tenantId, eliminado: false } });
    if (!orden) return res.status(404).json({ message: "Orden de compra internacional no encontrada." });

    await prisma.ordenCompraIntl.update({ where: { id: orden.id }, data: { estado: "Anulada", eliminado: true } });
    await prisma.importacionHistorial.create({
      data: { ordenCompraId: orden.id, actor: req.user!.nombre, accion: "Orden anulada" },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al anular orden de compra internacional:", error);
    return res.status(500).json({ message: "Error al anular la orden de compra internacional." });
  }
};
