import {
  leerVentasMensualesSiesa,
  leerTopClientesVentaSiesa,
  leerTopClientesPorMargenSiesa,
  leerTopVendedoresPorMargenSiesa,
  leerVentasDiariasPorVendedorSiesa,
  leerVentasPorClienteConsolidadoSiesa,
} from "../integraciones-siesa/siesa-ventas.service";
import type { ConfiguracionAnalisis, OrdenDireccion } from "./analitica-catalogo";

export interface FilaAnalisis {
  /** Etiqueta legible de la fila (nombre de cliente/vendedor, o fecha "AAAA-MM"). */
  etiqueta: string;
  /** Id de la entidad Siesa cuando aplica (rowid de cliente/vendedor) — para drill-down, null si es una fila de fecha o sin id resuelto. */
  id: number | null;
  neto?: number;
  costo?: number;
  margen?: number;
  kilos?: number;
  documentos?: number;
}

export interface ResultadoAnalisis {
  disponible: boolean;
  motivo?: string;
  filas: FilaAnalisis[];
  totales: { neto?: number; costo?: number; margen?: number; kilos?: number; documentos?: number };
}

const CAMPO_ORDEN_DEFAULT: Record<string, string> = {
  margen: "margen",
  ventas: "neto",
  clientes: "neto",
};

function ordenar(filas: FilaAnalisis[], campo: string, direccion: OrdenDireccion): FilaAnalisis[] {
  const factor = direccion === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const av = Number((a as unknown as Record<string, unknown>)[campo] ?? 0);
    const bv = Number((b as unknown as Record<string, unknown>)[campo] ?? 0);
    return (av - bv) * factor;
  });
}

function sumar(filas: FilaAnalisis[], campo: keyof FilaAnalisis): number {
  return filas.reduce((acc, f) => acc + Number(f[campo] ?? 0), 0);
}

function totalesDe(filas: FilaAnalisis[]): ResultadoAnalisis["totales"] {
  return {
    neto: sumar(filas, "neto"),
    costo: sumar(filas, "costo"),
    margen: sumar(filas, "margen"),
    kilos: sumar(filas, "kilos"),
    documentos: sumar(filas, "documentos"),
  };
}

/**
 * Ejecuta una configuración de análisis YA VALIDADA contra el catálogo
 * (ver validarConfiguracionAnalisis) reutilizando exactamente las mismas
 * consultas/agregaciones de Siesa que ya usa el resto de Analítica — nunca
 * construye SQL nuevo ni recalcula margen/ventas con otra fórmula. Toda la
 * agregación (GROUP BY) ocurre en SQL Server dentro de esas funciones; el
 * orden y el límite se aplican en Node sobre el resultado YA agregado
 * (pequeño: como máximo unos cientos de filas, nunca el detalle de
 * documentos), igual que ya hace el resto del módulo (ver
 * calcularParetoClientes).
 */
export async function ejecutarAnalisis(
  ciaId: number,
  config: ConfiguracionAnalisis,
): Promise<ResultadoAnalisis> {
  const desde = new Date(config.fechaInicio);
  const hasta = new Date(config.fechaFin);
  const orden: OrdenDireccion = config.orden ?? "desc";
  const ordenarPor = config.ordenarPor ?? CAMPO_ORDEN_DEFAULT[config.metrica] ?? "neto";
  // Tope defensivo (además de lo que ya pide cada consulta con TOP N):
  // ningún análisis descarga miles de filas al frontend.
  const limite = Math.min(500, Math.max(1, config.limite ?? 50));

  let filas: FilaAnalisis[] = [];

  if (config.metrica === "margen" && config.dimensionPrincipal === "cliente") {
    const datos = await leerTopClientesPorMargenSiesa(ciaId, desde, hasta, limite);
    filas = datos.map((d) => ({
      etiqueta: d.clienteNombre ?? "Cliente sin nombre",
      id: d.clienteRowId,
      neto: d.neto,
      costo: d.costo,
      margen: d.margen,
    }));
  } else if (config.metrica === "margen" && config.dimensionPrincipal === "vendedor") {
    const datos = await leerTopVendedoresPorMargenSiesa(ciaId, desde, hasta, limite);
    filas = datos.map((d) => ({
      etiqueta: d.vendedorNombre ?? "Sin nombre",
      id: d.vendedorRowId,
      neto: d.neto,
      costo: d.costo,
      margen: d.margen,
    }));
  } else if (config.metrica === "ventas" && config.dimensionPrincipal === "fecha") {
    const serie = await leerVentasMensualesSiesa(ciaId, desde);
    filas = serie
      .filter((m) => {
        const f = new Date(Date.UTC(m.anio, m.mes - 1, 1));
        return f >= desde && f < hasta;
      })
      .map((m) => ({
        etiqueta: `${m.anio}-${String(m.mes).padStart(2, "0")}`,
        id: null,
        neto: m.neto,
        documentos: m.documentos,
      }));
  } else if (config.metrica === "ventas" && config.dimensionPrincipal === "cliente") {
    const datos = await leerTopClientesVentaSiesa(ciaId, desde, hasta, limite);
    filas = datos.map((d) => ({
      etiqueta: d.clienteNombre ?? "Cliente sin nombre",
      id: d.clienteRowId,
      neto: d.neto,
      documentos: d.documentos,
    }));
  } else if (config.metrica === "ventas" && config.dimensionPrincipal === "vendedor") {
    const detalle = await leerVentasDiariasPorVendedorSiesa(ciaId, desde, hasta);
    const porVendedor = new Map<string, FilaAnalisis>();
    for (const d of detalle) {
      const clave = String(d.vendedorRowId ?? d.vendedorNombre ?? "sin-vendedor");
      const actual =
        porVendedor.get(clave) ??
        ({
          etiqueta: d.vendedorNombre ?? "Sin nombre",
          id: d.vendedorRowId,
          neto: 0,
          documentos: 0,
        } as FilaAnalisis);
      actual.neto = (actual.neto ?? 0) + d.neto;
      actual.documentos = (actual.documentos ?? 0) + d.documentos;
      porVendedor.set(clave, actual);
    }
    filas = [...porVendedor.values()];
  } else if (config.metrica === "clientes" && config.dimensionPrincipal === "cliente") {
    const datos = await leerVentasPorClienteConsolidadoSiesa(ciaId, desde, hasta, limite);
    filas = datos.map((d) => ({
      etiqueta: d.clienteNombre ?? "Cliente sin nombre",
      id: d.clienteRowId,
      neto: d.neto,
      costo: d.costo,
      margen: d.margen,
      kilos: d.kilos,
      documentos: d.documentos,
    }));
  } else {
    // No debería alcanzarse nunca si validarConfiguracionAnalisis ya corrió antes.
    return {
      disponible: false,
      motivo: "Combinación métrica/dimensión no soportada.",
      filas: [],
      totales: {},
    };
  }

  // Filtros opcionales de entidad exacta (vendedor/cliente) — se aplican
  // sobre el resultado YA agregado (pequeño), igual que el resto del
  // catálogo de Siesa no expone un parámetro de filtro por entidad en estas
  // consultas agregadas (a diferencia de leerHistoricoVentasSiesa, que sí
  // filtra en SQL por ser detalle paginado).
  if (config.filtros?.clienteId !== undefined) {
    filas = filas.filter((f) => f.id === config.filtros!.clienteId);
  }
  if (config.filtros?.vendedorId !== undefined) {
    filas = filas.filter((f) => f.id === config.filtros!.vendedorId);
  }

  filas = ordenar(filas, ordenarPor, orden).slice(0, limite);

  return { disponible: true, filas, totales: totalesDe(filas) };
}
