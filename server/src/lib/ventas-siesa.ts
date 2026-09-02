import type {
  VentaMensualSiesa,
  TopClienteVentaSiesa,
  VentaDiariaVendedorSiesa,
  ActividadMensualClienteSiesa,
  ActividadMensualKilosClienteSiesa,
  UltimaCompraClienteSiesa,
} from "../modules/integraciones-siesa/siesa-ventas.service";

const DIA_MS = 24 * 60 * 60 * 1000;

export interface ResumenVentasCalculado {
  disponible: true;
  periodoActual: {
    anio: number;
    mes: number;
    bruto: number;
    dscto: number;
    /** bruto - dscto, SIN IVA. */
    neto: number;
    documentos: number;
    ticketPromedio: number;
  };
  periodoAnterior: { anio: number; mes: number; neto: number } | null;
  /** null cuando no hay período anterior o su valor fue 0 (no se divide por cero). */
  variacionNetaPct: number | null;
  serieMensual: {
    anio: number;
    mes: number;
    bruto: number;
    neto: number;
    documentos: number;
  }[];
  topClientes: TopClienteVentaSiesa[];
}

/**
 * Combina la serie mensual (ya agregada en SQL Server) con el top de
 * clientes del mes actual en el resumen que consume el frontend. Función
 * pura — sin I/O — para poder probarla con datos fabricados sin depender
 * del túnel VPN hacia Siesa.
 */
export function calcularResumenVentas(
  serieCompleta: VentaMensualSiesa[],
  topClientes: TopClienteVentaSiesa[],
  ahora: Date,
): ResumenVentasCalculado {
  // UTC, no local: mismo criterio que la construcción de los rangos de
  // consulta en el controller (Siesa guarda fechas como medianoche UTC).
  const anioActual = ahora.getUTCFullYear();
  const mesActual = ahora.getUTCMonth() + 1;
  const actual = serieCompleta.find((m) => m.anio === anioActual && m.mes === mesActual) ?? null;

  let anioAnterior = anioActual;
  let mesAnterior = mesActual - 1;
  if (mesAnterior === 0) {
    mesAnterior = 12;
    anioAnterior -= 1;
  }
  const anterior =
    serieCompleta.find((m) => m.anio === anioAnterior && m.mes === mesAnterior) ?? null;

  const netoActual = actual?.neto ?? 0;
  const netoAnterior = anterior?.neto ?? 0;
  // Denominador cero manejado explícitamente: sin período anterior con
  // ventas > 0, la variación no es un porcentaje interpretable.
  const variacionNetaPct =
    anterior && netoAnterior > 0
      ? Math.round(((netoActual - netoAnterior) / netoAnterior) * 1000) / 10
      : null;

  const documentos = actual?.documentos ?? 0;
  const ticketPromedio = documentos > 0 ? netoActual / documentos : 0;

  return {
    disponible: true,
    periodoActual: {
      anio: anioActual,
      mes: mesActual,
      bruto: actual?.bruto ?? 0,
      dscto: actual?.dscto ?? 0,
      neto: netoActual,
      documentos,
      ticketPromedio,
    },
    periodoAnterior: anterior ? { anio: anioAnterior, mes: mesAnterior, neto: netoAnterior } : null,
    variacionNetaPct,
    serieMensual: serieCompleta.slice(-7).map((m) => ({
      anio: m.anio,
      mes: m.mes,
      bruto: m.bruto,
      neto: m.neto,
      documentos: m.documentos,
    })),
    topClientes,
  };
}

export interface ResumenVendedorVentas {
  vendedorRowId: number | null;
  vendedorNombre: string | null;
  hoy: number;
  ayer: number;
  ultimos7Dias: number;
  mesActual: number;
  documentosMesActual: number;
}

function inicioDiaUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Resume ventas diarias por vendedor (hoy / ayer / últimos 7 días / mes
 * actual) a partir de filas ya agregadas por vendedor+día en SQL Server.
 * Función pura — sin I/O — probada con datos fabricados. Ordena por venta
 * del mes actual descendente (ranking gerencial: quién está vendiendo más
 * este mes).
 */
export function calcularVentasPorVendedor(
  filas: VentaDiariaVendedorSiesa[],
  ahora: Date,
): ResumenVendedorVentas[] {
  const hoy = inicioDiaUTC(ahora);
  const ayer = new Date(hoy.getTime() - DIA_MS);
  const hace7 = new Date(hoy.getTime() - 6 * DIA_MS); // ventana de 7 días: hoy + 6 anteriores
  const anioActual = ahora.getUTCFullYear();
  const mesActual = ahora.getUTCMonth();

  const porVendedor = new Map<string, ResumenVendedorVentas>();
  for (const f of filas) {
    const clave = String(f.vendedorRowId ?? f.vendedorNombre ?? "sin-vendedor");
    let resumen = porVendedor.get(clave);
    if (!resumen) {
      resumen = {
        vendedorRowId: f.vendedorRowId,
        vendedorNombre: f.vendedorNombre,
        hoy: 0,
        ayer: 0,
        ultimos7Dias: 0,
        mesActual: 0,
        documentosMesActual: 0,
      };
      porVendedor.set(clave, resumen);
    }

    const dia = inicioDiaUTC(new Date(f.dia));
    if (dia.getTime() === hoy.getTime()) resumen.hoy += f.neto;
    if (dia.getTime() === ayer.getTime()) resumen.ayer += f.neto;
    if (dia.getTime() >= hace7.getTime() && dia.getTime() <= hoy.getTime()) {
      resumen.ultimos7Dias += f.neto;
    }
    if (dia.getUTCFullYear() === anioActual && dia.getUTCMonth() === mesActual) {
      resumen.mesActual += f.neto;
      resumen.documentosMesActual += f.documentos;
    }
  }

  return [...porVendedor.values()].sort((a, b) => b.mesActual - a.mesActual);
}

function mesesAtras(ahora: Date, n: number): { anio: number; mes: number } {
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - n, 1));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
}

function claveMes(m: { anio: number; mes: number }): string {
  return `${m.anio}-${m.mes}`;
}

export interface ClienteEnRiesgoSiesa {
  clienteRowId: number;
  clienteNombre: string | null;
  diasInactivo: number;
  /** Promedio mensual (venta/kilos) durante los meses en que sí compró, de los últimos 3 completos. */
  promedioMensualNeto: number;
  promedioMensualKilos: number;
  /** promedio mensual × (diasInactivo / 30) — estimado, no una cifra contable exacta. */
  ventaEstimadaPerdida: number;
  kilosEstimadosPerdidos: number;
  severidad: "alta" | "media";
}

export interface CaidaClienteTopSiesa {
  clienteRowId: number | null;
  clienteNombre: string | null;
  netoUltimoMes: number;
  netoMesAnterior: number;
  caidaPct: number;
}

export interface RiesgoComercialSiesa {
  clientesInactivos: ClienteEnRiesgoSiesa[];
  caidasClientesTop: CaidaClienteTopSiesa[];
  /** Suma de ventaEstimadaPerdida sobre TODOS los clientes en riesgo detectados, no solo los mostrados en clientesInactivos. */
  totalVentaEnRiesgo: number;
  totalKilosEnRiesgo: number;
}

/**
 * Clientes en riesgo comercial: recurrentes que dejaron de comprar (con una
 * estimación de cuánta venta y cuántos kilos se están dejando de hacer por
 * esa inactividad), y caídas fuertes mes a mes en clientes top. Función
 * pura — sin I/O — probada con datos fabricados.
 *
 * "Recurrente" = compró en al menos 2 de los últimos 3 meses YA
 * COMPLETADOS (nunca el mes actual, que está parcial y siempre se vería
 * bajo por los días que faltan). "Inactivo" = más de 45 días sin comprar
 * desde su última compra real (leerUltimaCompraClientesSiesa, ventana de 12
 * meses). Un cliente que solo compró una vez no cuenta: evita falsos
 * positivos sobre compradores ocasionales que nunca fueron recurrentes.
 *
 * La "venta/kilos estimados perdidos" es una PROYECCIÓN simple (promedio
 * mensual histórico × meses de inactividad), no una cifra contable — se
 * comunica como estimado en toda la interfaz que consuma este dato.
 *
 * "Caída fuerte" = un cliente entre los top 5 por venta del último mes
 * completo, cuya venta cayó 40% o más frente al mes anterior a ese (nunca
 * se compara contra el mes actual parcial, por la misma razón).
 *
 * Los clientes sin rowid (ventas de mostrador/anónimas) no entran en
 * "clientes en riesgo": no hay forma confiable de identificarlos entre la
 * consulta de actividad mensual y la de última compra.
 */
export function calcularClientesEnRiesgoSiesa(
  actividad: ActividadMensualClienteSiesa[],
  actividadKilos: ActividadMensualKilosClienteSiesa[],
  ultimasCompras: UltimaCompraClienteSiesa[],
  ahora: Date,
): RiesgoComercialSiesa {
  const mes1 = mesesAtras(ahora, 1);
  const mes2 = mesesAtras(ahora, 2);
  const mes3 = mesesAtras(ahora, 3);
  const mesesCompletos = [mes1, mes2, mes3];

  const porCliente = new Map<
    string,
    { rowId: number | null; nombre: string | null; porMes: Map<string, number> }
  >();
  for (const a of actividad) {
    const clave = String(a.clienteRowId ?? a.clienteNombre ?? "sin-cliente");
    let c = porCliente.get(clave);
    if (!c) {
      c = { rowId: a.clienteRowId, nombre: a.clienteNombre, porMes: new Map() };
      porCliente.set(clave, c);
    }
    const claveM = `${a.anio}-${a.mes}`;
    c.porMes.set(claveM, (c.porMes.get(claveM) ?? 0) + a.neto);
  }

  const kilosPorCliente = new Map<number, Map<string, number>>();
  for (const k of actividadKilos) {
    if (k.clienteRowId === null) continue;
    let porMes = kilosPorCliente.get(k.clienteRowId);
    if (!porMes) {
      porMes = new Map();
      kilosPorCliente.set(k.clienteRowId, porMes);
    }
    const claveM = `${k.anio}-${k.mes}`;
    porMes.set(claveM, (porMes.get(claveM) ?? 0) + k.kilos);
  }

  // Caída fuerte: top 5 por venta del último mes completo, vs. el mes anterior a ese.
  const caidasClientesTop: CaidaClienteTopSiesa[] = [...porCliente.values()]
    .map((c) => ({ ...c, netoUltimo: c.porMes.get(claveMes(mes1)) ?? 0 }))
    .filter((c) => c.netoUltimo > 0)
    .sort((a, b) => b.netoUltimo - a.netoUltimo)
    .slice(0, 5)
    .map((c) => {
      const netoAnterior = c.porMes.get(claveMes(mes2)) ?? 0;
      if (netoAnterior <= 0) return null;
      const variacion = (c.netoUltimo - netoAnterior) / netoAnterior;
      if (variacion > -0.4) return null;
      return {
        clienteRowId: c.rowId,
        clienteNombre: c.nombre,
        netoUltimoMes: c.netoUltimo,
        netoMesAnterior: netoAnterior,
        caidaPct: Math.round(Math.abs(variacion) * 1000) / 10,
      };
    })
    .filter((c): c is CaidaClienteTopSiesa => c !== null);

  // Inactividad: clientes recurrentes (>=2 de los últimos 3 meses completos) sin comprar hace >45 días.
  const todosLosInactivos: ClienteEnRiesgoSiesa[] = [];
  for (const c of porCliente.values()) {
    if (c.rowId === null) continue;
    const mesesActivos = mesesCompletos.filter((m) => (c.porMes.get(claveMes(m)) ?? 0) > 0);
    if (mesesActivos.length < 2) continue;
    const ultima = ultimasCompras.find((u) => u.clienteRowId === c.rowId)?.ultimaCompra;
    if (!ultima) continue;
    const diasInactivo = Math.floor((ahora.getTime() - new Date(ultima).getTime()) / DIA_MS);
    if (diasInactivo <= 45) continue;

    const kilosPorMes = kilosPorCliente.get(c.rowId);
    const promedioMensualNeto =
      mesesActivos.reduce((acc, m) => acc + (c.porMes.get(claveMes(m)) ?? 0), 0) / mesesActivos.length;
    const mesesConKilos = mesesActivos.filter((m) => (kilosPorMes?.get(claveMes(m)) ?? 0) > 0);
    const promedioMensualKilos =
      mesesConKilos.length > 0
        ? mesesConKilos.reduce((acc, m) => acc + (kilosPorMes?.get(claveMes(m)) ?? 0), 0) /
          mesesConKilos.length
        : 0;
    const factorMeses = diasInactivo / 30;

    todosLosInactivos.push({
      clienteRowId: c.rowId,
      clienteNombre: c.nombre,
      diasInactivo,
      promedioMensualNeto,
      promedioMensualKilos,
      ventaEstimadaPerdida: promedioMensualNeto * factorMeses,
      kilosEstimadosPerdidos: promedioMensualKilos * factorMeses,
      severidad: diasInactivo > 90 ? "alta" : "media",
    });
  }

  const totalVentaEnRiesgo = todosLosInactivos.reduce((acc, c) => acc + c.ventaEstimadaPerdida, 0);
  const totalKilosEnRiesgo = todosLosInactivos.reduce((acc, c) => acc + c.kilosEstimadosPerdidos, 0);
  const clientesInactivos = [...todosLosInactivos]
    .sort((a, b) => b.ventaEstimadaPerdida - a.ventaEstimadaPerdida)
    .slice(0, 8);

  return { clientesInactivos, caidasClientesTop, totalVentaEnRiesgo, totalKilosEnRiesgo };
}
