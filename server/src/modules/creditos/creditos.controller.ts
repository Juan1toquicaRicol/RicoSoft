import { Response } from "express";
import { prisma } from "../../config/prisma";
import { CreditoCliente } from "@prisma/client";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { leerSaldosAbiertosSiesa } from "../integraciones-siesa/siesa-financiero.service";
import { clasificarMonto, calcularResumenCartera } from "../../domain/creditos/clasificacion";

const ESTADOS_VALIDOS = ["Al día", "Por vencer", "Vencido", "Paz y Salvo"];
const ESTADOS_FILTRO_VALIDOS = [...ESTADOS_VALIDOS, "Todos"];

/**
 * Deriva el estado del crédito a partir del saldo y la fecha de vencimiento
 * — usado SOLO al escribir (crear/pago), para fijar el valor inicial que
 * queda guardado en BD. La lectura (listarCreditos/serializar) NUNCA confía
 * en este valor guardado: siempre lo recalcula en el momento, para que un
 * crédito no quede con una etiqueta obsoleta si nadie vuelve a tocarlo (ver
 * domain/creditos/clasificacion.ts).
 */
function calcularEstado(saldo: number, vence: Date): string {
  return clasificarMonto(saldo, vence, null).estado;
}

/** Serializa un crédito con su clasificación financiera SIEMPRE recalculada
 * en el momento de la lectura (vencido/porVencer/alDia/diasMora/estado) —
 * nunca se confía en el `estado` guardado salvo cuando es "Paz y Salvo"
 * (cierre formal explícito, ver clasificarMonto). */
function serializar(c: CreditoCliente) {
  const clasificacion = clasificarMonto(Number(c.saldo), c.vence, c.estado);
  return {
    ...c,
    cupo: Number(c.cupo),
    saldo: Number(c.saldo),
    estado: clasificacion.estado,
    vencido: clasificacion.vencido,
    porVencer: clasificacion.porVencer,
    alDia: clasificacion.alDia,
    diasMora: clasificacion.diasMora,
  };
}

export const listarCreditos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const creditos = await prisma.creditoCliente.findMany({
      where: { tenantId, eliminado: false },
      orderBy: { vence: "asc" },
      take: 1000, // límite de seguridad temporal; falta paginación real (ver auditoría)
    });

    let serializados = creditos.map(serializar);

    // El filtro de estado se aplica sobre el estado RECALCULADO (nunca el
    // guardado), por la misma razón de staleness explicada arriba.
    const estadoFiltro = typeof req.query.estado === "string" ? req.query.estado : "Todos";
    if (ESTADOS_FILTRO_VALIDOS.includes(estadoFiltro) && estadoFiltro !== "Todos") {
      serializados = serializados.filter((c) => c.estado === estadoFiltro);
    }

    return res.json(serializados);
  } catch (error) {
    console.error("Error al listar créditos:", error);
    return res.status(500).json({ message: "Error al obtener los créditos." });
  }
};

/**
 * Resumen financiero (KPIs) del crédito manual: por recaudar, vencido, por
 * vencer, al día y clientes en mora — calculado en backend a partir de las
 * MISMAS filas y la misma función de clasificación que usa listarCreditos,
 * nunca una suma aproximada distinta en el frontend. Incluye también
 * cupoTotal/utilizacionPct (KPIs existentes, conservados — "cupo" es un
 * concepto propio del crédito manual, sin equivalente en Siesa, así que no
 * se elimina, solo deja de ser el KPI principal).
 */
export const obtenerResumenCreditos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const creditos = await prisma.creditoCliente.findMany({
      where: { tenantId, eliminado: false },
      select: { cliente: true, saldo: true, vence: true, estado: true, cupo: true },
    });

    const resumen = calcularResumenCartera(
      creditos.map((c) => ({
        clave: c.cliente,
        saldo: Number(c.saldo),
        vence: c.vence,
        estadoGuardado: c.estado,
      })),
    );

    const cupoTotal = creditos.reduce((acc, c) => acc + Number(c.cupo), 0);
    const utilizacionPct = cupoTotal > 0 ? Math.round((resumen.porRecaudar / cupoTotal) * 100) : 0;

    return res.json({ ...resumen, cupoTotal, utilizacionPct });
  } catch (error) {
    console.error("Error al calcular el resumen de créditos:", error);
    return res.status(500).json({ message: "Error al calcular el resumen de créditos." });
  }
};

/**
 * Cartera real por cliente, leída en vivo de Siesa (t353_co_saldo_abierto) —
 * a diferencia de CreditoCliente (cupo/saldo llevados a mano en RicoSoft,
 * hoy vacío en todos los tenants), esto es la cartera de verdad: la suma de
 * los saldos abiertos que cada tercero le debe a la compañía. Es de SOLO
 * LECTURA — nunca se escribe en Siesa, y no existe un endpoint de "registrar
 * pago" aquí porque el pago real se registra en Siesa, no en RicoSoft.
 * Paginado y con búsqueda server-side: un tenant real puede tener miles de
 * saldos abiertos (~2000 filas para RICOL), nunca se manda todo al frontend.
 */
const RESUMEN_VACIO = { porRecaudar: 0, vencido: 0, porVencer: 0, alDia: 0, clientesEnMora: 0 };
const ESTADOS_SIESA_VALIDOS = ["Al día", "Por vencer", "Vencido"];

export const listarCarteraSiesa = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { siesaCiaId: true },
    });
    if (!tenant?.siesaCiaId) {
      return res.json({
        disponible: false,
        motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
        items: [],
        page: 1,
        pageSize: 25,
        total: 0,
        totalPages: 1,
        resumen: RESUMEN_VACIO,
      });
    }

    const search =
      typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const estadoFiltro = typeof req.query.estado === "string" ? req.query.estado : "Todos";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "25"), 10) || 25),
    );

    const saldos = (await leerSaldosAbiertosSiesa(tenant.siesaCiaId)).filter((s) => s.saldo > 0);

    // Resumen (KPIs): calculado sobre CADA documento abierto individual, no
    // sobre un saldo ya consolidado por cliente — así una obligación
    // vencida y otra vigente del mismo cliente se clasifican cada una por
    // su propia fecha, en vez de que la más urgente "contamine" el total.
    // Refleja SIEMPRE la cartera completa (ignora el filtro de búsqueda),
    // igual que un encabezado ejecutivo.
    const resumen = calcularResumenCartera(
      saldos.map((s) => ({
        clave: s.terceroNit || s.terceroNombre || String(s.terceroRowId ?? "SIN_ID"),
        saldo: s.saldo,
        vence: s.vence,
      })),
    );

    // Consolidación por cliente para la tabla: un mismo cliente puede tener
    // varias facturas/documentos abiertos en t353 — cada uno se clasifica
    // primero por su propia fecha (clasificarMonto), y LUEGO se suman los
    // buckets ya clasificados. El saldo total sigue siendo la suma simple,
    // pero vencido/porVencer/alDia nunca se derivan de una sola fecha
    // "representativa" del conjunto.
    interface ClienteAgregado {
      cliente: string;
      nit: string | null;
      saldo: number;
      vencido: number;
      porVencer: number;
      alDia: number;
      proximoVencimiento: Date;
      diasMora: number;
    }
    const porCliente = new Map<string, ClienteAgregado>();
    for (const s of saldos) {
      const clave = s.terceroNit || s.terceroNombre || String(s.terceroRowId ?? "SIN_ID");
      const c = clasificarMonto(s.saldo, s.vence, null);
      const actual = porCliente.get(clave);
      if (!actual) {
        porCliente.set(clave, {
          cliente: s.terceroNombre || "Sin nombre",
          nit: s.terceroNit,
          saldo: s.saldo,
          vencido: c.vencido,
          porVencer: c.porVencer,
          alDia: c.alDia,
          proximoVencimiento: s.vence,
          diasMora: c.diasMora,
        });
      } else {
        actual.saldo += s.saldo;
        actual.vencido += c.vencido;
        actual.porVencer += c.porVencer;
        actual.alDia += c.alDia;
        if (s.vence < actual.proximoVencimiento) actual.proximoVencimiento = s.vence;
        if (c.diasMora > actual.diasMora) actual.diasMora = c.diasMora;
      }
    }

    let clientes = [...porCliente.values()].map((c) => ({
      ...c,
      estado: c.vencido > 0 ? "Vencido" : c.porVencer > 0 ? "Por vencer" : "Al día",
    }));

    if (search) {
      clientes = clientes.filter(
        (c) =>
          c.cliente.toLowerCase().includes(search) || (c.nit || "").toLowerCase().includes(search),
      );
    }
    if (ESTADOS_SIESA_VALIDOS.includes(estadoFiltro)) {
      clientes = clientes.filter((c) => c.estado === estadoFiltro);
    }
    clientes.sort((a, b) => b.vencido - a.vencido || b.saldo - a.saldo);

    const total = clientes.length;
    const pagina = clientes.slice((page - 1) * pageSize, page * pageSize);
    const items = pagina.map((c) => ({
      cliente: c.cliente,
      nit: c.nit,
      saldo: c.saldo,
      vencido: c.vencido,
      porVencer: c.porVencer,
      alDia: c.alDia,
      diasMora: c.diasMora,
      vence: c.proximoVencimiento,
      estado: c.estado,
    }));

    return res.json({
      disponible: true,
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      resumen,
    });
  } catch (error) {
    console.error("Error al leer la cartera de Siesa:", error);
    return res.json({
      disponible: false,
      motivo: "No fue posible conectar con Siesa en este momento. Intenta de nuevo más tarde.",
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
      resumen: RESUMEN_VACIO,
    });
  }
};

export const crearCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { cliente, cupo, saldo, vence, estado } = req.body;

    if (!cliente || !vence) {
      return res.status(400).json({ message: "Cliente y fecha de vencimiento son obligatorios." });
    }
    const cupoNum = Number(cupo);
    const saldoNum = Number(saldo);
    if (!Number.isFinite(cupoNum) || cupoNum < 0 || !Number.isFinite(saldoNum) || saldoNum < 0) {
      return res.status(400).json({ message: "Cupo y saldo deben ser números no negativos." });
    }
    if (saldoNum > cupoNum) {
      return res.status(400).json({ message: "El saldo no puede ser mayor al cupo otorgado." });
    }

    const credito = await prisma.creditoCliente.create({
      data: {
        tenantId,
        cliente,
        cupo: cupoNum,
        saldo: saldoNum,
        vence: new Date(vence),
        estado: ESTADOS_VALIDOS.includes(estado)
          ? estado
          : calcularEstado(saldoNum, new Date(vence)),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_CREADO",
        detalle: `${req.user!.nombre} registró un crédito para "${cliente}"`,
      },
    });

    return res.status(201).json(serializar(credito));
  } catch (error) {
    console.error("Error al crear crédito:", error);
    return res.status(500).json({ message: "Error al registrar el crédito." });
  }
};

export const actualizarCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { saldo, estado } = req.body;

    const existente = await prisma.creditoCliente.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!existente) return res.status(404).json({ message: "Crédito no encontrado." });

    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    if (saldo !== undefined && (!Number.isFinite(Number(saldo)) || Number(saldo) < 0)) {
      return res.status(400).json({ message: "El saldo debe ser un número no negativo." });
    }

    const credito = await prisma.creditoCliente.update({
      where: { id },
      data: {
        ...(saldo !== undefined ? { saldo: Number(saldo) } : {}),
        ...(estado ? { estado } : {}),
      },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_EDITADO",
        detalle: `${req.user!.nombre} actualizó el crédito de "${credito.cliente}"`,
      },
    });

    return res.json(serializar(credito));
  } catch (error) {
    console.error("Error al actualizar crédito:", error);
    return res.status(500).json({ message: "Error al actualizar el crédito." });
  }
};

/**
 * Registra un abono al saldo pendiente del cliente (uso típico: Comercial
 * cobrando cartera). El saldo nunca queda negativo y el estado se recalcula
 * automáticamente según el saldo restante y la fecha de vencimiento.
 */
export const registrarPagoCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { monto } = req.body;

    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return res
        .status(400)
        .json({ message: "El monto del pago debe ser un número mayor a cero." });
    }

    const credito = await prisma.creditoCliente.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!credito) return res.status(404).json({ message: "Crédito no encontrado." });

    const saldoActual = Number(credito.saldo);
    if (montoNum > saldoActual) {
      return res
        .status(400)
        .json({ message: "El monto del pago no puede ser mayor al saldo pendiente." });
    }

    // Decremento atómico condicionado al saldo REAL en BD en el momento del
    // UPDATE (no al valor leído arriba, que puede estar obsoleto): dos abonos
    // concurrentes sobre el mismo crédito, de otro modo, leerían el mismo
    // saldoActual y el segundo pisaría (lost update) el descuento del
    // primero. `updateMany` con `saldo: { gte: montoNum }` en el WHERE hace
    // que SQL Server evalúe esa condición contra el valor vigente de la fila
    // en el instante de la escritura — si el otro abono ya se aplicó y dejó
    // el saldo por debajo de este monto, count queda en 0 en vez de
    // sobre-restar.
    const resultado = await prisma.$transaction(async (tx) => {
      const { count } = await tx.creditoCliente.updateMany({
        where: { id, tenantId, eliminado: false, saldo: { gte: montoNum } },
        data: { saldo: { decrement: montoNum } },
      });
      if (count === 0) return null;

      const actual = await tx.creditoCliente.findUniqueOrThrow({ where: { id } });
      const nuevoSaldo = Number(actual.saldo);
      return tx.creditoCliente.update({
        where: { id },
        data: { estado: calcularEstado(nuevoSaldo, actual.vence) },
      });
    });

    if (!resultado) {
      return res.status(409).json({
        message:
          "El saldo cambió mientras se procesaba este pago (probablemente otro abono concurrente). Verifica el saldo actual e inténtalo de nuevo.",
      });
    }
    const actualizado = resultado;
    const nuevoSaldo = Number(actualizado.saldo);

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_PAGO_REGISTRADO",
        detalle: `${req.user!.nombre} registró un pago de ${montoNum.toLocaleString("es-CO")} para "${credito.cliente}" (saldo restante: ${nuevoSaldo.toLocaleString("es-CO")})`,
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al registrar pago de crédito:", error);
    return res.status(500).json({ message: "Error al registrar el pago." });
  }
};

/**
 * Cierra formalmente el crédito como pagado en su totalidad ("paz y salvo"):
 * saldo en cero y un estado final distinto de los de flujo normal, para que
 * quede visible que el cliente recibió esa constancia.
 */
export const marcarPazYSalvoCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const credito = await prisma.creditoCliente.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!credito) return res.status(404).json({ message: "Crédito no encontrado." });

    const actualizado = await prisma.creditoCliente.update({
      where: { id },
      data: { saldo: 0, estado: "Paz y Salvo" },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_PAZ_Y_SALVO",
        detalle: `${req.user!.nombre} marcó paz y salvo para "${credito.cliente}"`,
      },
    });

    return res.json(serializar(actualizado));
  } catch (error) {
    console.error("Error al marcar paz y salvo:", error);
    return res.status(500).json({ message: "Error al marcar paz y salvo." });
  }
};

/**
 * Elimina (soft-delete) un crédito de cliente. No se borra de la base de
 * datos: se marca `eliminado` para conservar la trazabilidad y deja de
 * aparecer en el listado.
 */
export const eliminarCredito = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const credito = await prisma.creditoCliente.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!credito) return res.status(404).json({ message: "Crédito no encontrado." });

    await prisma.creditoCliente.update({ where: { id }, data: { eliminado: true } });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "CREDITO_ELIMINADO",
        detalle: `${req.user!.nombre} eliminó el crédito de "${credito.cliente}"`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar crédito:", error);
    return res.status(500).json({ message: "Error al eliminar el crédito." });
  }
};
