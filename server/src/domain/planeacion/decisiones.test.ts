import { describe, it, expect } from "vitest";
import { construirDecisionesPlaneacion } from "./decisiones";
import type { ResumenInventarioSiesa } from "../../lib/inventario-siesa";

const resumenVacio: ResumenInventarioSiesa = {
  totalValor: 0,
  totalValorVendible: 0,
  totalComprometidoValor: 0,
  buckets: {
    vendible: { valor: 0, items: 0 },
    exceso: { valor: 0, items: 0 },
    obsolescencia: { valor: 0, items: 0 },
    sin_movimiento: { valor: 0, items: 0 },
    servicio: { valor: 0, items: 0 },
    repuesto: { valor: 0, items: 0 },
    insumo: { valor: 0, items: 0 },
  },
  topRiesgo: [],
};

function baseParams(overrides: Partial<Parameters<typeof construirDecisionesPlaneacion>[0]> = {}) {
  return {
    resumenInventario: resumenVacio,
    pronostico: [],
    produccionRecomendada: [],
    necesidadesAbastecimiento: [],
    riesgoRuptura: [],
    bom: [],
    existencias: [],
    ...overrides,
  };
}

describe("construirDecisionesPlaneacion", () => {
  it("con todo vacío, devuelve listas y resúmenes en cero sin lanzar", () => {
    const { decisiones, resumen } = construirDecisionesPlaneacion(baseParams());
    expect(decisiones).toEqual([]);
    expect(resumen.producir).toEqual({ cantidad: 0, unidades: 0, impacto: 0 });
    expect(resumen.liquidar).toEqual({ cantidad: 0, unidades: 0, impacto: 0 });
  });

  it("genera una decisión 'producir' a partir de producción recomendada, con impacto en $ usando el costo unitario real", () => {
    const { decisiones, resumen } = construirDecisionesPlaneacion(
      baseParams({
        produccionRecomendada: [
          {
            itemRowId: 1,
            descripcion: "Producto A",
            referencia: null,
            unidadMedida: "UND",
            demandaProyectada: 500,
            pedidosComprometidos: 50,
            inventarioDisponible: 180,
            cantidadPendienteEntrar: 40,
            produccionRecomendada: 410,
          },
        ],
        existencias: [
          {
            itemRowId: 1,
            descripcion: "Producto A",
            referencia: null,
            cantidadExistente: 180,
            cantidadComprometida: 50,
            cantidadPendienteEntrar: 40,
            valorTotal: 1_800_000,
            fechaUltimaVenta: null,
            esVendible: true,
            naturaleza: "producto",
          },
        ],
      }),
    );
    const d = decisiones.find((x) => x.tipo === "producir");
    expect(d?.cantidad).toBe(410);
    // costoUnitario = 1.800.000/180 = 10.000 -> impacto = 410*10.000
    expect(d?.impacto).toBe(4_100_000);
    expect(resumen.producir.cantidad).toBe(1);
  });

  it("genera 'producir' con deficit productivo cuando el BOM limita la capacidad real", () => {
    const { decisiones } = construirDecisionesPlaneacion(
      baseParams({
        produccionRecomendada: [
          {
            itemRowId: 1,
            descripcion: "Producto A",
            referencia: null,
            unidadMedida: "UND",
            demandaProyectada: 400,
            pedidosComprometidos: 0,
            inventarioDisponible: 0,
            cantidadPendienteEntrar: 0,
            produccionRecomendada: 400,
          },
        ],
        bom: [
          {
            itemPadreRowId: 1,
            componenteRowId: 10,
            descripcionComponente: "Materia Y",
            referenciaComponente: null,
            cantBase: 100,
            cantRequerida: 100,
            pctDesperdicio: 0,
          },
        ],
        existencias: [
          {
            itemRowId: 10,
            descripcion: "Materia Y",
            referencia: null,
            cantidadExistente: 250,
            cantidadComprometida: 0,
            cantidadPendienteEntrar: 0,
            valorTotal: 0,
            fechaUltimaVenta: null,
            esVendible: false,
            naturaleza: "insumo",
          },
        ],
      }),
    );
    const d = decisiones.find((x) => x.tipo === "producir");
    expect(d?.cantidad).toBe(250); // limitado por la materia prima, no los 400 recomendados
    expect(d?.prioridad).toBe("alta");
    expect(d?.motivo).toContain("Materia Y");
    expect(d?.detalle.materialLimitante).toBe("Materia Y");
    expect(d?.detalle.deficitProductivo).toBe(150);
    expect(d?.accion).toEqual({
      tipo: "plan-produccion",
      itemRowId: 1,
      descripcion: "Producto A",
      cantidad: 250,
    });
  });

  it("genera decisiones 'comprar' desde las necesidades de abastecimiento", () => {
    const { decisiones, resumen } = construirDecisionesPlaneacion(
      baseParams({
        necesidadesAbastecimiento: [
          {
            componenteRowId: 10,
            descripcion: "Materia Y",
            referencia: null,
            cantidadNecesaria: 300,
            cantidadDisponible: 250,
            deficit: 50,
          },
        ],
      }),
    );
    const d = decisiones.find((x) => x.tipo === "comprar");
    expect(d?.cantidad).toBe(50);
    expect(resumen.comprar.cantidad).toBe(1);
    expect(d?.accion.tipo).toBe("solicitud-compra");
  });

  it("genera decisiones 'liquidar' y 'no_producir' desde el mismo topRiesgo, sin duplicar la lógica de clasificación", () => {
    const resumenConRiesgo: ResumenInventarioSiesa = {
      ...resumenVacio,
      topRiesgo: [
        {
          itemRowId: 5,
          descripcion: "Producto obsoleto",
          referencia: null,
          naturaleza: "producto",
          cantidadExistente: 1250,
          cantidadComprometida: 0,
          valorTotal: 85_000_000,
          diasSinVenta: 240,
          clasificacion: "obsolescencia",
          accionRecomendada: "liquidar",
          unidadMedida: "UNID",
        },
      ],
    };
    const { decisiones, resumen } = construirDecisionesPlaneacion(
      baseParams({ resumenInventario: resumenConRiesgo }),
    );
    const liquidar = decisiones.find((d) => d.tipo === "liquidar" && d.itemRowId === 5);
    const noProducir = decisiones.find((d) => d.tipo === "no_producir" && d.itemRowId === 5);
    expect(liquidar).toBeDefined();
    expect(noProducir).toBeDefined();
    expect(resumen.liquidar.impacto).toBe(85_000_000);
    // Unidad real (no todo el catálogo es kilos) conservada hasta la decisión final.
    expect(liquidar?.unidadMedida).toBe("UNID");
    expect(noProducir?.unidadMedida).toBe("UNID");
    // "liquidar" lleva a la gestión interna (nunca a un endpoint que toque Siesa).
    expect(liquidar?.accion.tipo).toBe("gestion-liquidacion");
    expect(liquidar?.detalle.categoriaLiquidacion).toBeDefined();
    // "no_producir" solo expande detalle en la misma página, no navega a otro módulo.
    expect(noProducir?.accion.tipo).toBe("detalle");
    expect(noProducir?.detalle.diasSinVenta).toBe(240);
  });

  it("genera decisiones 'riesgo_quiebre' desde cobertura, con impacto 0 (no hay precio de venta disponible)", () => {
    const { decisiones, resumen } = construirDecisionesPlaneacion(
      baseParams({
        riesgoRuptura: [
          {
            itemRowId: 7,
            descripcion: "Producto crítico",
            referencia: null,
            unidadMedida: "UND",
            existenciaDisponible: 20,
            ventaPromedioMensual: 100,
            diasCobertura: 6,
          },
        ],
      }),
    );
    const d = decisiones.find((x) => x.tipo === "riesgo_quiebre");
    expect(d?.motivo).toContain("6 días");
    expect(resumen.riesgo_quiebre.cantidad).toBe(1);
  });

  it("la confianza de 'producir' es alta solo cuando hay al menos 6 meses de historia real de venta", () => {
    const { decisiones } = construirDecisionesPlaneacion(
      baseParams({
        pronostico: [
          {
            itemRowId: 1,
            descripcion: "A",
            referencia: null,
            unidadMedida: null,
            ventaPromedioMensual: 10,
            tendenciaPct: null,
            coeficienteVariacion: null,
            demandaIrregular: false,
            perdiendoRotacion: false,
            mesesConVenta: 8,
          },
        ],
        produccionRecomendada: [
          {
            itemRowId: 1,
            descripcion: "A",
            referencia: null,
            unidadMedida: null,
            demandaProyectada: 10,
            pedidosComprometidos: 0,
            inventarioDisponible: 0,
            cantidadPendienteEntrar: 0,
            produccionRecomendada: 10,
          },
        ],
      }),
    );
    expect(decisiones.find((d) => d.tipo === "producir")?.confianza).toBe("alta");
  });
});

describe("Fase H — enriquecimiento con ventanasDemanda/inventarioObjetivo (opcional)", () => {
  it("sin ventanasDemanda/inventarioObjetivo, las decisiones siguen generándose igual (retrocompatible)", () => {
    const { decisiones } = construirDecisionesPlaneacion(
      baseParams({
        produccionRecomendada: [
          {
            itemRowId: 1,
            descripcion: "A",
            referencia: null,
            unidadMedida: null,
            demandaProyectada: 10,
            pedidosComprometidos: 0,
            inventarioDisponible: 0,
            cantidadPendienteEntrar: 0,
            produccionRecomendada: 10,
          },
        ],
      }),
    );
    const d = decisiones.find((x) => x.tipo === "producir");
    expect(d?.fuente).toContain("Siesa");
    expect(d?.detalle.ventas30d).toBeUndefined();
  });

  it("con ventanasDemanda/inventarioObjetivo, 'producir' agrega ventas30/90/180d, stockObjetivo y calidadDatos a fuente/detalle", () => {
    const { decisiones } = construirDecisionesPlaneacion(
      baseParams({
        produccionRecomendada: [
          {
            itemRowId: 1,
            descripcion: "A",
            referencia: null,
            unidadMedida: null,
            demandaProyectada: 10,
            pedidosComprometidos: 0,
            inventarioDisponible: 0,
            cantidadPendienteEntrar: 0,
            produccionRecomendada: 10,
          },
        ],
        ventanasDemanda: [
          {
            itemRowId: 1,
            ventas30d: 300,
            ventas90d: 900,
            ventas180d: 1800,
            promedioDiario30d: 10,
            promedioSemanal30d: 70,
            promedioMensual30d: 300,
            mesesConVenta: 12,
            calidadDatos: "ALTA",
          },
        ],
        inventarioObjetivo: [
          {
            itemRowId: 1,
            stockActual: 0,
            stockObjetivo: 450,
            coberturaMeses: null,
            excedente: 0,
            deficit: 450,
            calidadDatos: "ALTA",
          },
        ],
      }),
    );
    const d = decisiones.find((x) => x.tipo === "producir");
    expect(d?.detalle.ventas30d).toBe(300);
    expect(d?.detalle.stockObjetivo).toBe(450);
    expect(d?.detalle.calidadDatos).toBe("ALTA");
    expect(d?.fuente).toContain("Calidad de datos: ALTA");
  });
});
