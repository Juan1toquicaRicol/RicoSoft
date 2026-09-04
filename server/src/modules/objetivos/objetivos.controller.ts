import { Response } from "express";
import { Prisma, Objetivo } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { TenantPrisma } from "../../lib/tenant-prisma";
import {
  leerVentasRangoSiesa,
  leerKilosRangoSiesa,
  leerVentasPorVendedorRangoSiesa,
  leerKilosPorVendedorRangoSiesa,
  leerCatalogoVendedoresSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import {
  calcularCumplimiento,
  calcularRangoComparativoAnual,
  calcularComparativoAnual,
  calcularRitmo,
} from "../../lib/objetivos-calculo";

const NIVELES_VALIDOS = ["EMPRESA", "VENDEDOR"];
const TIPOS_PERIODO_VALIDOS = ["MENSUAL", "TRIMESTRAL", "ANUAL", "PERSONALIZADO"];
const ESTADOS_VALIDOS = ["BORRADOR", "ACTIVO", "CANCELADO"];

async function resolverCiaSiesa(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  return tenant?.siesaCiaId ?? null;
}

function serializar(o: Objetivo) {
  return {
    ...o,
    metaValor: o.metaValor != null ? Number(o.metaValor) : null,
    metaVolumenKg: o.metaVolumenKg != null ? Number(o.metaVolumenKg) : null,
    metaInventario: o.metaInventario != null ? Number(o.metaInventario) : null,
    /// "CERRADO" se deriva en lectura, nunca se persiste — ver comentario
    /// del campo `estado` en schema.prisma. fechaFin es INCLUSIVE (día
    /// completo): comparar contra fechaFin+1 día, no contra fechaFin
    /// directo, porque fechaFin se guarda como medianoche UTC de ese día —
    /// comparar sin el +1 marcaría CERRADO desde la medianoche que ABRE el
    /// último día, no la que lo cierra.
    estadoDerivado:
      o.estado === "ACTIVO" && new Date(o.fechaFin).getTime() + 24 * 60 * 60 * 1000 <= Date.now()
        ? "CERRADO"
        : o.estado,
  };
}

export const listarObjetivos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { nivel, anio, estado, vendedorSiesaRowId } = req.query;
    const where: Prisma.ObjetivoWhereInput = { tenantId, eliminado: false };
    if (typeof nivel === "string" && NIVELES_VALIDOS.includes(nivel)) where.nivel = nivel;
    if (typeof anio === "string" && anio) where.anio = Number(anio);
    if (typeof estado === "string" && ESTADOS_VALIDOS.includes(estado)) where.estado = estado;
    if (typeof vendedorSiesaRowId === "string" && vendedorSiesaRowId) {
      where.vendedorSiesaRowId = Number(vendedorSiesaRowId);
    }

    const objetivos = await req.tenantPrisma!.objetivo.findMany({
      where,
      orderBy: { fechaInicio: "desc" },
      take: 500,
    });
    return res.json(objetivos.map(serializar));
  } catch (error) {
    console.error("Error al listar objetivos:", error);
    return res.status(500).json({ message: "Error al obtener objetivos." });
  }
};

export const obtenerObjetivo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const objetivo = await req.tenantPrisma!.objetivo.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!objetivo) return res.status(404).json({ message: "Objetivo no encontrado." });
    return res.json(serializar(objetivo));
  } catch (error) {
    console.error("Error al obtener objetivo:", error);
    return res.status(500).json({ message: "Error al obtener el objetivo." });
  }
};

/**
 * Resumen ejecutivo de un objetivo: meta vs. real, % cumplimiento,
 * faltante, comparativo contra el mismo rango del año anterior, y ritmo +
 * proyección lineal. Las 4 lecturas a Siesa (rango actual valor/kilos,
 * rango anterior valor/kilos) van en paralelo — mismo patrón que
 * gerencial.controller.ts.
 */
export const obtenerResumenObjetivo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const objetivo = await req.tenantPrisma!.objetivo.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!objetivo) return res.status(404).json({ message: "Objetivo no encontrado." });

    const siesaCiaId = await resolverCiaSiesa(tenantId);
    if (!siesaCiaId) {
      return res.json({
        disponible: false,
        motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      });
    }

    const vendedorSiesaRowId = objetivo.nivel === "VENDEDOR" ? objetivo.vendedorSiesaRowId : null;
    const hoy = new Date();
    const { rangoActual, rangoAnterior } = calcularRangoComparativoAnual(
      objetivo.fechaInicio,
      objetivo.fechaFin,
      hoy,
    );

    const [ventaActual, kilosActual, ventaAnterior, kilosAnterior] = await Promise.all([
      leerVentasRangoSiesa(siesaCiaId, rangoActual.desde, rangoActual.hasta, vendedorSiesaRowId),
      leerKilosRangoSiesa(siesaCiaId, rangoActual.desde, rangoActual.hasta, vendedorSiesaRowId),
      leerVentasRangoSiesa(
        siesaCiaId,
        rangoAnterior.desde,
        rangoAnterior.hasta,
        vendedorSiesaRowId,
      ),
      leerKilosRangoSiesa(siesaCiaId, rangoAnterior.desde, rangoAnterior.hasta, vendedorSiesaRowId),
    ]);

    const metaValor = objetivo.metaValor != null ? Number(objetivo.metaValor) : null;
    const metaVolumenKg = objetivo.metaVolumenKg != null ? Number(objetivo.metaVolumenKg) : null;

    const cumplimiento = calcularCumplimiento(
      metaValor,
      ventaActual.neto,
      metaVolumenKg,
      kilosActual.kilos,
    );
    const comparativo = calcularComparativoAnual(ventaActual.neto, ventaAnterior.neto);
    const comparativoVolumen = calcularComparativoAnual(kilosActual.kilos, kilosAnterior.kilos);
    const ritmo =
      metaValor != null && metaValor > 0
        ? calcularRitmo(objetivo.fechaInicio, objetivo.fechaFin, hoy, ventaActual.neto, metaValor)
        : null;

    return res.json({
      disponible: true,
      objetivo: serializar(objetivo),
      cumplimiento,
      comparativo,
      comparativoVolumen,
      ritmo,
    });
  } catch (error) {
    console.error("Error al calcular resumen del objetivo:", error);
    return res.status(500).json({ message: "Error al calcular el resumen del objetivo." });
  }
};

/**
 * Desglose por vendedor de un objetivo EMPRESA — calculado en vivo desde
 * Siesa dentro del RANGO EXACTO del objetivo (leerVentasPorVendedorRangoSiesa
 * / leerKilosPorVendedorRangoSiesa, agregación directa de todo el rango, sin
 * desglose diario ni reducción a "mes actual" — un objetivo trimestral o
 * anual necesita la venta de TODO su rango, no solo del mes en curso). NO
 * requiere que existan objetivos VENDEDOR individuales. Si además hay metas
 * VENDEDOR activas que se solapan con el rango, se unen en memoria para
 * mostrar meta/cumplimiento individual junto al aporte real.
 */
export const obtenerVendedoresObjetivo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const objetivo = await req.tenantPrisma!.objetivo.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!objetivo) return res.status(404).json({ message: "Objetivo no encontrado." });
    if (objetivo.nivel !== "EMPRESA") {
      return res
        .status(400)
        .json({ message: "El desglose por vendedor solo aplica a objetivos de nivel EMPRESA." });
    }

    const siesaCiaId = await resolverCiaSiesa(tenantId);
    if (!siesaCiaId) {
      return res.json({
        disponible: false,
        motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      });
    }

    const hoy = new Date();
    // Rango EXACTO del objetivo: si ya cerró, se usa fechaFin+1 día como
    // límite exclusivo; si sigue en curso, se corta en "hoy" (no se cuenta
    // venta futura que aún no existe).
    const hasta =
      objetivo.fechaFin < hoy ? new Date(objetivo.fechaFin.getTime() + 24 * 60 * 60 * 1000) : hoy;

    const [ventasPorVendedor, kilosPorVendedor, metasVendedor] = await Promise.all([
      leerVentasPorVendedorRangoSiesa(siesaCiaId, objetivo.fechaInicio, hasta),
      leerKilosPorVendedorRangoSiesa(siesaCiaId, objetivo.fechaInicio, hasta),
      req.tenantPrisma!.objetivo.findMany({
        where: {
          tenantId,
          eliminado: false,
          nivel: "VENDEDOR",
          estado: { not: "CANCELADO" },
          fechaInicio: { lte: objetivo.fechaFin },
          fechaFin: { gte: objetivo.fechaInicio },
        },
      }),
    ]);

    const kilosPorVendedorId = new Map(kilosPorVendedor.map((k) => [k.vendedorRowId, k.kilos]));
    const metaPorVendedorId = new Map(metasVendedor.map((m) => [m.vendedorSiesaRowId, m]));
    const totalNeto = ventasPorVendedor.reduce((acc, v) => acc + v.neto, 0);

    const filas = ventasPorVendedor
      .map((v) => {
        const meta = v.vendedorRowId != null ? metaPorVendedorId.get(v.vendedorRowId) : null;
        const metaValor = meta?.metaValor != null ? Number(meta.metaValor) : null;
        // v.neto es la venta del vendedor DENTRO DEL RANGO DEL OBJETIVO
        // EMPRESA. Si la meta individual del vendedor cubre un rango
        // distinto (traslape parcial, permitido por diseño — ver
        // existeTraslape), comparar v.neto contra esa meta mezclaría
        // períodos incompatibles y daría un % sin sentido. Solo se calcula
        // cumplimientoIndividualPct cuando el rango de la meta individual
        // coincide EXACTAMENTE con el del objetivo EMPRESA; en cualquier
        // otro caso se muestra la meta (metaIndividual) pero no un %
        // calculado sobre datos que no corresponden a ese mismo rango.
        const mismoRango =
          !!meta &&
          meta.fechaInicio.getTime() === objetivo.fechaInicio.getTime() &&
          meta.fechaFin.getTime() === objetivo.fechaFin.getTime();
        return {
          vendedorRowId: v.vendedorRowId,
          vendedorNombre: v.vendedorNombre ?? "Sin vendedor",
          venta: v.neto,
          pctParticipacion: totalNeto > 0 ? Math.round((v.neto / totalNeto) * 1000) / 10 : null,
          kilos: kilosPorVendedorId.get(v.vendedorRowId) ?? 0,
          documentos: v.documentos,
          metaIndividual: metaValor,
          cumplimientoIndividualPct:
            mismoRango && metaValor != null && metaValor > 0
              ? Math.round((v.neto / metaValor) * 1000) / 10
              : null,
        };
      })
      .sort((a, b) => b.venta - a.venta);

    return res.json({ disponible: true, vendedores: filas });
  } catch (error) {
    console.error("Error al calcular desglose por vendedor:", error);
    return res.status(500).json({ message: "Error al calcular el desglose por vendedor." });
  }
};

export const listarCatalogoVendedores = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const siesaCiaId = await resolverCiaSiesa(tenantId);
    if (!siesaCiaId) {
      return res.json({
        disponible: false,
        motivo: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada.",
      });
    }
    const vendedores = await leerCatalogoVendedoresSiesa(siesaCiaId, 12);
    return res.json({ disponible: true, vendedores });
  } catch (error) {
    console.error("Error al listar catálogo de vendedores:", error);
    return res.status(500).json({ message: "Error al obtener el catálogo de vendedores." });
  }
};

interface ObjetivoPayload {
  nivel?: string;
  tipoPeriodo?: string;
  fechaInicio?: string;
  fechaFin?: string;
  metaValor?: number | string | null;
  metaVolumenKg?: number | string | null;
  vendedorSiesaRowId?: number | string | null;
  estado?: string;
}

function validarPayloadObjetivo(body: ObjetivoPayload): string | null {
  const {
    nivel,
    tipoPeriodo,
    fechaInicio,
    fechaFin,
    metaValor,
    metaVolumenKg,
    vendedorSiesaRowId,
  } = body;

  if (!nivel || !NIVELES_VALIDOS.includes(nivel)) return "Nivel de objetivo no válido.";
  if (!tipoPeriodo || !TIPOS_PERIODO_VALIDOS.includes(tipoPeriodo))
    return "Tipo de período no válido.";
  if (!fechaInicio || !fechaFin) return "Fecha de inicio y fecha de fin son obligatorias.";
  if (new Date(fechaFin) < new Date(fechaInicio))
    return "La fecha de fin no puede ser anterior a la de inicio.";

  // == null (no !valor): un vendedorSiesaRowId de 0 es un id válido de
  // Siesa, no "sin vendedor" — !0 sería true y rechazaría un vendedor real.
  if (nivel === "VENDEDOR" && vendedorSiesaRowId == null) {
    return "Un objetivo de nivel VENDEDOR requiere un vendedor asignado.";
  }
  if (nivel === "EMPRESA" && vendedorSiesaRowId != null) {
    return "Un objetivo de nivel EMPRESA no debe tener un vendedor asignado.";
  }

  const tieneMetaValor = metaValor != null && metaValor !== "";
  const tieneMetaVolumen = metaVolumenKg != null && metaVolumenKg !== "";
  if (!tieneMetaValor && !tieneMetaVolumen) {
    return "La meta debe incluir al menos un valor monetario o un volumen en kilos.";
  }
  if (tieneMetaValor && (!Number.isFinite(Number(metaValor)) || Number(metaValor) < 0)) {
    return "La meta de valor debe ser un número no negativo.";
  }
  if (tieneMetaVolumen && (!Number.isFinite(Number(metaVolumenKg)) || Number(metaVolumenKg) < 0)) {
    return "La meta de volumen debe ser un número no negativo.";
  }

  if (body.estado !== undefined && !["BORRADOR", "ACTIVO"].includes(body.estado)) {
    return "Estado no válido para la creación de un objetivo.";
  }

  return null;
}

/** Traslape de rangos para el mismo (tenantId, nivel, vendedorSiesaRowId). */
async function existeTraslape(
  tenantPrisma: TenantPrisma,
  tenantId: string,
  nivel: string,
  vendedorSiesaRowId: number | null,
  fechaInicio: Date,
  fechaFin: Date,
  excluirId?: string,
): Promise<boolean> {
  const traslape = await tenantPrisma.objetivo.findFirst({
    where: {
      tenantId,
      eliminado: false,
      nivel,
      vendedorSiesaRowId: nivel === "VENDEDOR" ? vendedorSiesaRowId : null,
      estado: { not: "CANCELADO" },
      fechaInicio: { lte: fechaFin },
      fechaFin: { gte: fechaInicio },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
  });
  return !!traslape;
}

export const crearObjetivo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const error = validarPayloadObjetivo(req.body);
    if (error) return res.status(400).json({ message: error });

    const {
      nivel,
      vendedorSiesaRowId,
      vendedorSiesaNombre,
      tipoPeriodo,
      fechaInicio,
      fechaFin,
      metaValor,
      metaVolumenKg,
      metaInventario,
      tipoMetaInventario,
      descripcion,
      estado,
    } = req.body;

    const fInicio = new Date(fechaInicio);
    const fFin = new Date(fechaFin);
    const vendedorId = nivel === "VENDEDOR" ? Number(vendedorSiesaRowId) : null;

    if (await existeTraslape(req.tenantPrisma!, tenantId, nivel, vendedorId, fInicio, fFin)) {
      return res.status(409).json({
        message:
          "Ya existe un objetivo activo para este nivel/vendedor que se traslapa con ese rango de fechas.",
      });
    }

    const objetivo = await req.tenantPrisma!.objetivo.create({
      data: {
        tenantId,
        nivel,
        vendedorSiesaRowId: vendedorId,
        vendedorSiesaNombre: nivel === "VENDEDOR" ? vendedorSiesaNombre || null : null,
        tipoPeriodo,
        fechaInicio: fInicio,
        fechaFin: fFin,
        anio: fInicio.getUTCFullYear(),
        metaValor: metaValor != null && metaValor !== "" ? Number(metaValor) : null,
        metaVolumenKg: metaVolumenKg != null && metaVolumenKg !== "" ? Number(metaVolumenKg) : null,
        metaInventario:
          metaInventario != null && metaInventario !== "" ? Number(metaInventario) : null,
        tipoMetaInventario: tipoMetaInventario || null,
        descripcion: descripcion || null,
        estado: ESTADOS_VALIDOS.includes(estado) ? estado : "ACTIVO",
        creadoPorId: req.user!.id,
        creadoPorNombre: req.user!.nombre,
        asignadoPorId: req.user!.id,
        asignadoPorNombre: req.user!.nombre,
      },
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: nivel === "VENDEDOR" ? vendedorSiesaNombre || null : null,
        accion: "OBJETIVO_CREADO",
        entidadTipo: "Objetivo",
        entidadId: objetivo.id,
        detalle: `${req.user!.nombre} creó el objetivo ${nivel === "EMPRESA" ? "de empresa" : `de ${vendedorSiesaNombre || "vendedor"}`} (${tipoPeriodo}, ${fechaInicio} a ${fechaFin})`,
      },
    });

    return res.status(201).json(serializar(objetivo));
  } catch (error) {
    console.error("Error al crear objetivo:", error);
    return res.status(500).json({ message: "Error al crear el objetivo." });
  }
};

export const actualizarObjetivo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const existente = await req.tenantPrisma!.objetivo.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!existente) return res.status(404).json({ message: "Objetivo no encontrado." });

    const {
      fechaInicio,
      fechaFin,
      metaValor,
      metaVolumenKg,
      metaInventario,
      tipoMetaInventario,
      descripcion,
      estado,
    } = req.body;

    const fInicio = fechaInicio ? new Date(fechaInicio) : existente.fechaInicio;
    const fFin = fechaFin ? new Date(fechaFin) : existente.fechaFin;
    if (fFin < fInicio) {
      return res
        .status(400)
        .json({ message: "La fecha de fin no puede ser anterior a la de inicio." });
    }
    if (estado && !ESTADOS_VALIDOS.includes(estado)) {
      return res.status(400).json({ message: "Estado no válido." });
    }
    if (fechaInicio || fechaFin) {
      if (
        await existeTraslape(
          req.tenantPrisma!,
          tenantId,
          existente.nivel,
          existente.vendedorSiesaRowId,
          fInicio,
          fFin,
          id,
        )
      ) {
        return res.status(409).json({
          message:
            "El nuevo rango de fechas se traslapa con otro objetivo activo del mismo nivel/vendedor.",
        });
      }
    }

    const datosAnteriores: Record<string, unknown> = {};
    const datosNuevos: Record<string, unknown> = {};
    // Se construye como un registro dinámico (los campos se arman uno por
    // uno, solo si cambiaron) y se pasa como Prisma.ObjetivoUpdateInput al
    // llamar a `update` más abajo — el nombre del campo (`campo`) es
    // conocido en cada call site pero genérico aquí, así que no puede
    // tipar contra ObjetivoUpdateInput directamente sin perder esa
    // flexibilidad.
    const data: Record<string, unknown> = {};

    function registrarCambio(campo: string, valorAnterior: unknown, valorNuevo: unknown) {
      if (valorNuevo === undefined) return;
      if (String(valorAnterior ?? "") === String(valorNuevo ?? "")) return;
      datosAnteriores[campo] = valorAnterior;
      datosNuevos[campo] = valorNuevo;
      data[campo] = valorNuevo;
    }

    if (fechaInicio) registrarCambio("fechaInicio", existente.fechaInicio, fInicio);
    if (fechaFin) registrarCambio("fechaFin", existente.fechaFin, fFin);
    if (fechaInicio) data.anio = fInicio.getUTCFullYear();
    if (metaValor !== undefined) {
      registrarCambio(
        "metaValor",
        existente.metaValor,
        metaValor === "" ? null : Number(metaValor),
      );
    }
    if (metaVolumenKg !== undefined) {
      registrarCambio(
        "metaVolumenKg",
        existente.metaVolumenKg,
        metaVolumenKg === "" ? null : Number(metaVolumenKg),
      );
    }
    if (metaInventario !== undefined) {
      registrarCambio(
        "metaInventario",
        existente.metaInventario,
        metaInventario === "" ? null : Number(metaInventario),
      );
    }
    if (tipoMetaInventario !== undefined) {
      registrarCambio(
        "tipoMetaInventario",
        existente.tipoMetaInventario,
        tipoMetaInventario || null,
      );
    }
    if (descripcion !== undefined)
      registrarCambio("descripcion", existente.descripcion, descripcion || null);
    if (estado !== undefined) registrarCambio("estado", existente.estado, estado);

    if (Object.keys(data).length === 0) {
      return res.json(serializar(existente));
    }

    const objetivo = await req.tenantPrisma!.objetivo.update({
      where: { id },
      data: data as Prisma.ObjetivoUpdateInput,
    });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: existente.nivel === "VENDEDOR" ? existente.vendedorSiesaNombre : null,
        accion: "OBJETIVO_EDITADO",
        entidadTipo: "Objetivo",
        entidadId: objetivo.id,
        detalle: `${req.user!.nombre} editó el objetivo (${Object.keys(data).join(", ")})`,
        datosAnteriores: JSON.stringify(datosAnteriores),
        datosNuevos: JSON.stringify(datosNuevos),
      },
    });

    return res.json(serializar(objetivo));
  } catch (error) {
    console.error("Error al actualizar objetivo:", error);
    return res.status(500).json({ message: "Error al actualizar el objetivo." });
  }
};

export const eliminarObjetivo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const objetivo = await req.tenantPrisma!.objetivo.findFirst({
      where: { id, tenantId, eliminado: false },
    });
    if (!objetivo) return res.status(404).json({ message: "Objetivo no encontrado." });

    await req.tenantPrisma!.objetivo.update({ where: { id }, data: { eliminado: true } });

    await req.tenantPrisma!.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        usuarioAfectado: objetivo.nivel === "VENDEDOR" ? objetivo.vendedorSiesaNombre : null,
        accion: "OBJETIVO_ELIMINADO",
        entidadTipo: "Objetivo",
        entidadId: objetivo.id,
        detalle: `${req.user!.nombre} eliminó el objetivo ${objetivo.nivel === "EMPRESA" ? "de empresa" : `de ${objetivo.vendedorSiesaNombre || "vendedor"}`}`,
      },
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar objetivo:", error);
    return res.status(500).json({ message: "Error al eliminar el objetivo." });
  }
};
