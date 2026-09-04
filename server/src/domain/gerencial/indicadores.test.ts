import { describe, it, expect } from "vitest";
import {
  construirIndicadoresGerenciales,
  resumirPorCategoria,
  type EntradasCentroGerencial,
} from "./indicadores";

function entradasVacias(): EntradasCentroGerencial {
  return {
    finanzas: {
      totalCxP: 0,
      valorVencido: 0,
      valorProximoAVencer: 0,
      concentracionTopProveedor: null,
      nombreTopProveedor: null,
    },
    ventas: {
      disponible: false,
      netoActual: 0,
      netoAnterior: 0,
      variacionNetaPct: null,
      documentos: 0,
      productosTendenciaFuerte: 0,
      productosPerdiendoRotacion: 0,
      mesesHistoriaDisponibles: 0,
    },
    inventario: {
      disponible: false,
      totalValor: 0,
      totalValorVendible: 0,
      totalComprometidoValor: 0,
      valorExceso: 0,
      valorObsolescencia: 0,
    },
    produccion: {
      disponible: false,
      resumenProducir: { cantidad: 0, unidades: 0, impacto: 0 },
      resumenNoProducir: { cantidad: 0, unidades: 0, impacto: 0 },
      planesPorEstado: {},
    },
    compras: {
      disponible: false,
      resumenComprar: { cantidad: 0, unidades: 0, impacto: 0 },
      solicitudesPendientes: 0,
      cotizacionesPendientes: 0,
    },
    riesgos: {
      disponible: false,
      resumenLiquidar: { cantidad: 0, unidades: 0, impacto: 0 },
      resumenRiesgoQuiebre: { cantidad: 0, unidades: 0, impacto: 0 },
      facturasVencidasCantidad: 0,
      patronesRecurrentesCantidad: 0,
    },
  };
}

describe("construirIndicadoresGerenciales", () => {
  it("con todo vacío/no disponible, siempre incluye el indicador base de finanzas (CxP=0) y nada más de las categorías no disponibles", () => {
    const indicadores = construirIndicadoresGerenciales(entradasVacias());
    expect(indicadores).toHaveLength(2); // finanzas.cxp_total + compras.solicitudes_pendientes (siempre presentes)
    expect(indicadores.some((i) => i.id === "finanzas.cxp_total")).toBe(true);
  });

  it("marca 'finanzas.cxp_vencida' como crítico solo cuando hay valor vencido real", () => {
    const entradas = entradasVacias();
    entradas.finanzas.totalCxP = 50_000_000;
    entradas.finanzas.valorVencido = 12_000_000;
    const indicadores = construirIndicadoresGerenciales(entradas);
    const vencida = indicadores.find((i) => i.id === "finanzas.cxp_vencida");
    expect(vencida?.nivel).toBe("critico");
    expect(vencida?.valor).toBe(12_000_000);
  });

  it("ventas: no genera ningún indicador cuando disponible=false (Siesa no configurada)", () => {
    const entradas = entradasVacias();
    entradas.ventas.disponible = false;
    entradas.ventas.netoActual = 999; // aunque venga con datos, disponible=false los descarta
    const indicadores = construirIndicadoresGerenciales(entradas);
    expect(indicadores.some((i) => i.categoria === "ventas")).toBe(false);
  });

  it("ventas: calidadDatos refleja los meses de historia real, no un valor fijo", () => {
    const entradas = entradasVacias();
    entradas.ventas = {
      disponible: true,
      netoActual: 2_400_000_000,
      netoAnterior: 2_136_000_000,
      variacionNetaPct: 12.4,
      documentos: 340,
      productosTendenciaFuerte: 0,
      productosPerdiendoRotacion: 0,
      mesesHistoriaDisponibles: 2,
    };
    const [ventas] = construirIndicadoresGerenciales(entradas).filter(
      (i) => i.categoria === "ventas",
    );
    expect(ventas.calidadDatos).toBe("BAJA"); // 2 meses < 3
    expect(ventas.tendencia).toBe("subida");
    expect(ventas.variacionPct).toBe(12.4);
  });

  it("inventario: capital inmovilizado es crítico cuando hay obsolescencia real, no solo exceso", () => {
    const entradas = entradasVacias();
    entradas.inventario = {
      disponible: true,
      totalValor: 7_098_000_000,
      totalValorVendible: 5_000_000_000,
      totalComprometidoValor: 196_000_000,
      valorExceso: 243_000_000,
      valorObsolescencia: 608_000_000,
    };
    const capital = construirIndicadoresGerenciales(entradas).find(
      (i) => i.id === "inventario.capital_inmovilizado",
    );
    expect(capital?.valor).toBe(243_000_000 + 608_000_000);
    expect(capital?.nivel).toBe("critico");
  });

  it("producción: planes activos suma solo Aprobada + En producción, no todos los estados", () => {
    const entradas = entradasVacias();
    entradas.produccion = {
      disponible: true,
      resumenProducir: { cantidad: 5, unidades: 1000, impacto: 780_000_000 },
      resumenNoProducir: { cantidad: 0, unidades: 0, impacto: 0 },
      planesPorEstado: {
        Planificada: 2,
        Aprobada: 3,
        "En producción": 1,
        Terminada: 4,
        Cancelada: 1,
      },
    };
    const planes = construirIndicadoresGerenciales(entradas).find(
      (i) => i.id === "produccion.planes_activos",
    );
    expect(planes?.valor).toBe(4); // 3 Aprobada + 1 En producción
  });

  it("riesgos: no genera indicador de liquidación/quiebre cuando el conteo es 0, aunque disponible=true", () => {
    const entradas = entradasVacias();
    entradas.riesgos.disponible = true;
    const riesgos = construirIndicadoresGerenciales(entradas).filter(
      (i) => i.categoria === "riesgos",
    );
    expect(riesgos).toHaveLength(0);
  });

  it("ninguna acción apunta a rutas inexistentes en el sistema actual (validación de contrato mínimo)", () => {
    const entradas = entradasVacias();
    entradas.finanzas.valorVencido = 1;
    entradas.finanzas.totalCxP = 1;
    const RUTAS_VALIDAS = [
      "/analitica",
      "/facturas",
      "/proveedores",
      "/inventario",
      "/plan-produccion",
      "/solicitudes-compra",
      "/toma-fisica",
    ];
    for (const i of construirIndicadoresGerenciales(entradas)) {
      if (i.accion) expect(RUTAS_VALIDAS).toContain(i.accion.ruta);
    }
  });
});

describe("resumirPorCategoria", () => {
  it("cuenta críticos y altos por categoría, incluyendo categorías sin ningún indicador (cantidad 0)", () => {
    const entradas = entradasVacias();
    entradas.finanzas.totalCxP = 1;
    entradas.finanzas.valorVencido = 1;
    const resumen = resumirPorCategoria(construirIndicadoresGerenciales(entradas));
    const finanzas = resumen.find((r) => r.categoria === "finanzas")!;
    expect(finanzas.criticos).toBe(1);
    const ventas = resumen.find((r) => r.categoria === "ventas")!;
    expect(ventas.cantidad).toBe(0);
  });
});
