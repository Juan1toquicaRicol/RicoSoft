import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Analítica de Importaciones sin BD (prisma simulado): comprueba que NINGÚN
 * indicador usa un dato proxy (la recepción en planta NO es la llegada a
 * puerto), que cada exclusión lleva su motivo, y que las consultas van
 * acotadas al tenant de la sesión. Las pruebas con BD real viven en
 * importaciones-analitica.integration.test.ts.
 */
const m = vi.hoisted(() => ({ ordenFindMany: vi.fn() }));

vi.mock("../../config/prisma", () => ({
  prisma: { ordenCompraIntl: { findMany: m.ordenFindMany } },
}));

import {
  alertasImportaciones,
  operacionesAnaliticaImportaciones,
  resumenAnaliticaImportaciones,
} from "./importaciones-analitica.service";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function orden(over: Record<string, unknown> = {}) {
  return {
    id: "orden-1",
    numeroOrden: "IMP-2026-001",
    codigo: "IMP-2026-001",
    paisOrigen: "China",
    fechaOrden: d("2026-01-01"),
    trmPactada: 4000,
    proveedor: { nombre: "Proveedor A" },
    proveedorExtranjero: "Proveedor A",
    items: [{ id: "item-1", cantidad: 100, valorUnitarioFob: 10 }], // FOB USD 1000
    lotes: [] as unknown[],
    ...over,
  };
}

function lote(over: Record<string, unknown> = {}) {
  return {
    id: "lote-1",
    puertoDestino: "Cartagena",
    fechaLlegadaReal: null,
    hitos: [] as Array<{ tipo: string; fecha: Date }>,
    expediente: null as null | { fechaLevante: Date | null },
    costeos: [] as unknown[],
    ...over,
  };
}

beforeEach(() => {
  m.ordenFindMany.mockReset();
});

describe("analítica de importaciones — sin datos proxy", () => {
  it("la recepción en planta (fechaLlegadaReal) NO se usa como llegada a puerto: desaduanamiento excluido sin hito", async () => {
    m.ordenFindMany.mockResolvedValue([
      orden({
        lotes: [
          lote({
            fechaLlegadaReal: d("2026-01-21"),
            expediente: { fechaLevante: d("2026-01-31") },
          }),
        ],
      }),
    ]);

    const [op] = await operacionesAnaliticaImportaciones("tenant-a", {});

    expect(op.leadTimeDias).toBeCloseTo(20, 6); // orden → recepción en planta
    expect(op.fechaRecepcionPlantaOrigen).toBe("LoteImportacion.fechaLlegadaReal");
    expect(op.fechaLlegadaPuerto).toBeNull();
    expect(op.tiempoDesaduanamientoDias).toBeNull();
    expect(op.excluidoDesaduanamiento).toBe(true);
    expect(op.motivoExclusionDesaduanamiento).toBe("SIN_HITO_LLEGADA_PUERTO");
  });

  it("con hito de llegada a puerto y levante calcula el desaduanamiento real", async () => {
    m.ordenFindMany.mockResolvedValue([
      orden({
        lotes: [
          lote({
            hitos: [
              { tipo: "LLEGADA_PUERTO", fecha: d("2026-01-15") },
              { tipo: "RECEPCION_PLANTA", fecha: d("2026-01-21") },
            ],
            expediente: { fechaLevante: d("2026-01-20") },
          }),
        ],
      }),
    ]);

    const [op] = await operacionesAnaliticaImportaciones("tenant-a", {});

    expect(op.tiempoDesaduanamientoDias).toBeCloseTo(5, 6);
    expect(op.fechaLlegadaPuertoOrigen).toBe("LoteImportacionHito.LLEGADA_PUERTO");
    expect(op.fechaLevanteOrigen).toBe("ExpedienteAduanero.fechaLevante");
    expect(op.motivoExclusionDesaduanamiento).toBeNull();
    expect(op.fechaRecepcionPlantaOrigen).toBe("LoteImportacionHito.RECEPCION_PLANTA");
  });

  it("con llegada a puerto pero sin levante: excluido por SIN_LEVANTE; con levante anterior: FECHAS_INCONSISTENTES", async () => {
    m.ordenFindMany.mockResolvedValue([
      orden({
        id: "o1",
        lotes: [lote({ hitos: [{ tipo: "LLEGADA_PUERTO", fecha: d("2026-01-15") }] })],
      }),
      orden({
        id: "o2",
        lotes: [
          lote({
            hitos: [{ tipo: "LLEGADA_PUERTO", fecha: d("2026-01-15") }],
            expediente: { fechaLevante: d("2026-01-10") },
          }),
        ],
      }),
    ]);

    const ops = await operacionesAnaliticaImportaciones("tenant-a", {});
    expect(ops.find((o) => o.ordenCompraId === "o1")!.motivoExclusionDesaduanamiento).toBe(
      "SIN_LEVANTE",
    );
    expect(ops.find((o) => o.ordenCompraId === "o2")!.motivoExclusionDesaduanamiento).toBe(
      "FECHAS_INCONSISTENTES",
    );
  });

  it("sin recepción en planta el lead time se excluye por SIN_RECEPCION_PLANTA (no usa updatedAt ni otra fecha)", async () => {
    m.ordenFindMany.mockResolvedValue([orden({ lotes: [lote()] })]);
    const [op] = await operacionesAnaliticaImportaciones("tenant-a", {});
    expect(op.leadTimeDias).toBeNull();
    expect(op.motivoExclusionLeadTime).toBe("SIN_RECEPCION_PLANTA");
  });
});

describe("analítica de importaciones — factor logístico y variación de TRM", () => {
  const costeo = (trm: number, costo: number) => ({
    itemId: "item-1",
    costoTotalCop: costo,
    trmLiquidacion: trm,
    fechaLiquidacion: d("2026-02-01"),
  });

  it("calcula factor (30%) y variación de TRM (+5%) con costeo definitivo", async () => {
    m.ordenFindMany.mockResolvedValue([
      orden({ lotes: [lote({ costeos: [costeo(4200, 5_460_000)] })] }),
    ]);
    const [op] = await operacionesAnaliticaImportaciones("tenant-a", {});
    // FOB USD 1000 × 4200 = 4.200.000 → (5.460.000 − 4.200.000) / 4.200.000 = 30 %
    expect(op.factorIncrementoLogisticoPct).toBeCloseTo(30, 6);
    expect(op.trmPactada).toBe(4000);
    expect(op.trmLiquidacion).toBeCloseTo(4200, 6);
    expect(op.variacionTrmPct).toBeCloseTo(5, 6);
  });

  it("sin costeo definitivo ambos quedan excluidos con motivo SIN_COSTEO_DEFINITIVO", async () => {
    m.ordenFindMany.mockResolvedValue([orden({ lotes: [lote()] })]);
    const [op] = await operacionesAnaliticaImportaciones("tenant-a", {});
    expect(op.factorIncrementoLogisticoPct).toBeNull();
    expect(op.variacionTrmPct).toBeNull();
    expect(op.motivoExclusionFactorLogistico).toBe("SIN_COSTEO_DEFINITIVO");
    expect(op.motivoExclusionVariacionTrm).toBe("SIN_COSTEO_DEFINITIVO");
  });

  it("pondera la TRM de liquidación por el FOB de cada lote", async () => {
    m.ordenFindMany.mockResolvedValue([
      orden({
        lotes: [
          lote({ id: "l1", costeos: [costeo(4100, 4_500_000)] }),
          lote({ id: "l2", costeos: [costeo(4300, 4_500_000)] }),
        ],
      }),
    ]);
    const [op] = await operacionesAnaliticaImportaciones("tenant-a", {});
    // Ambos lotes liquidan el mismo ítem (FOB USD 1000 cada uno) → promedio 4200.
    expect(op.trmLiquidacion).toBeCloseTo(4200, 6);
  });
});

describe("analítica de importaciones — resumen, exclusiones y aislamiento", () => {
  it("el resumen informa definición, periodo y cuántos registros se excluyeron y por qué", async () => {
    // La consulta de alertas (select.actividades) es otra: aquí no devuelve órdenes.
    const ordenes = [
      orden({
        id: "completa",
        lotes: [
          lote({
            hitos: [
              { tipo: "LLEGADA_PUERTO", fecha: d("2026-01-15") },
              { tipo: "RECEPCION_PLANTA", fecha: d("2026-01-21") },
            ],
            expediente: { fechaLevante: d("2026-01-20") },
          }),
        ],
      }),
      orden({ id: "sin-datos", lotes: [lote()] }),
    ];
    m.ordenFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
      args.select.actividades ? [] : ordenes,
    );

    const resumen = await resumenAnaliticaImportaciones("tenant-a", {
      desde: d("2025-12-01"),
      hasta: d("2026-03-01"),
    });

    expect(resumen.metadatos.periodo.baseFecha).toBe("OrdenCompraIntl.fechaOrden");
    expect(resumen.metadatos.periodo.estadosIncluidos).toEqual(["Confirmada", "Cerrada"]);
    expect(resumen.metadatos.indicadores.tiempoDesaduanamiento.definicion).toMatch(
      /no se usa la recepción en planta/,
    );
    expect(resumen.metadatos.indicadores.tiempoDesaduanamiento.exclusiones).toEqual({
      SIN_HITO_LLEGADA_PUERTO: 1,
    });
    expect(resumen.metadatos.indicadores.leadTime.exclusiones).toEqual({
      SIN_RECEPCION_PLANTA: 1,
    });
    expect(resumen.tiempoDesaduanamiento.agregado.cantidadAnalizada).toBe(1);
    expect(resumen.tiempoDesaduanamiento.agregado.cantidadExcluida).toBe(1);
    expect(resumen.tiempoDesaduanamiento.agregado.promedio).toBeCloseTo(5, 6);
  });

  it("toda consulta va acotada al tenantId de la sesión, nunca a uno recibido por filtro", async () => {
    m.ordenFindMany.mockResolvedValue([]);
    await resumenAnaliticaImportaciones("tenant-a", { proveedorId: "prov-1" });
    expect(m.ordenFindMany).toHaveBeenCalled();
    for (const [args] of m.ordenFindMany.mock.calls) {
      expect(args.where.tenantId).toBe("tenant-a");
      expect(args.where.eliminado).toBe(false);
    }
  });
});

describe("alertas de importaciones", () => {
  const ahora = d("2026-10-26");

  const loteAlerta = (over: Record<string, unknown> = {}) => ({
    id: "lote-1",
    blAwb: "BL-1",
    estado: "En tránsito",
    fechaLlegadaEstimada: d("2026-10-01"),
    etaTrackingActual: d("2026-10-20"),
    hitos: [] as Array<{ tipo: string }>,
    documentos: [] as Array<{ tipo: string }>,
    expediente: null as null | {
      dimRuta: string | null;
      facturaComercialRuta: string | null;
      certificadoOrigenRuta: string | null;
    },
    ...over,
  });

  const ordenAlerta = (lotes: unknown[], actividades: unknown[] = []) => ({
    id: "orden-1",
    numeroOrden: "IMP-2026-001",
    codigo: "IMP-2026-001",
    actividades,
    lotes,
  });

  it("marca ETA del proveedor vencida solo en lotes En tránsito sin hito de llegada a puerto", async () => {
    m.ordenFindMany.mockResolvedValue([
      ordenAlerta([
        loteAlerta({ id: "retrasado" }),
        loteAlerta({ id: "ya-en-puerto", hitos: [{ tipo: "LLEGADA_PUERTO" }] }),
        loteAlerta({ id: "no-vencido", fechaLlegadaEstimada: d("2026-12-01") }),
        loteAlerta({ id: "sin-eta", fechaLlegadaEstimada: null }),
        loteAlerta({ id: "en-puerto-manual", estado: "En puerto" }),
      ]),
    ]);

    const alertas = await alertasImportaciones("tenant-a", {}, ahora);

    expect(alertas.etaProveedorVencida.cantidad).toBe(1);
    const lote1 = alertas.etaProveedorVencida.lotes[0];
    expect(lote1.loteId).toBe("retrasado");
    expect(lote1.diasVencida).toBe(25);
    // La ETA del tracking se informa aparte; no reemplaza la del proveedor.
    expect(lote1.etaTrackingActual).toEqual(d("2026-10-20"));
    expect(lote1.fechaLlegadaEstimadaProveedor).toEqual(d("2026-10-01"));
  });

  it("cuenta actividades vencidas con la regla del motor de seguimiento", async () => {
    const actividad = (id: string, estado: string, fechaLimite: Date | null) => ({
      id,
      ordenCompraId: "orden-1",
      nombre: id,
      etapa: "Orden",
      responsableTipo: "Proveedor",
      responsableNombre: null,
      fechaLimite,
      fechaReal: null,
      estado,
      dependeDeId: null,
    });
    m.ordenFindMany.mockResolvedValue([
      ordenAlerta(
        [],
        [
          actividad("vencida", "Pendiente", d("2026-10-01")),
          actividad("completada", "Completada", d("2026-10-01")),
          actividad("vigente", "Pendiente", d("2026-12-01")),
        ],
      ),
    ]);
    const alertas = await alertasImportaciones("tenant-a", {}, ahora);
    expect(alertas.actividadesVencidas.cantidad).toBe(1);
  });

  it("el inventario de documentos no afirma obligatoriedad y cuenta lo no adjuntado", async () => {
    m.ordenFindMany.mockResolvedValue([
      ordenAlerta([
        loteAlerta({
          documentos: [{ tipo: "B/L o AWB" }],
          expediente: { dimRuta: "x", facturaComercialRuta: null, certificadoOrigenRuta: null },
        }),
      ]),
    ]);
    const alertas = await alertasImportaciones("tenant-a", {}, ahora);
    expect(alertas.documentosAdjuntos.definicion).toMatch(/NO indica obligatoriedad/);
    expect(alertas.documentosAdjuntos.lotes[0].adjuntos).toEqual({
      "B/L o AWB": true,
      "Factura comercial": false,
      DIM: true,
      "Certificado de origen": false,
      "Certificado de análisis (COA)": false,
    });
    expect(alertas.documentosAdjuntos.sinAdjuntar).toEqual({
      "Factura comercial": 1,
      "Certificado de origen": 1,
      "Certificado de análisis (COA)": 1,
    });
  });

  it("las alertas también filtran por tenant y solo órdenes Confirmadas no eliminadas", async () => {
    m.ordenFindMany.mockResolvedValue([]);
    await alertasImportaciones("tenant-a", {}, ahora);
    const [args] = m.ordenFindMany.mock.calls[0];
    expect(args.where).toMatchObject({
      tenantId: "tenant-a",
      eliminado: false,
      estado: "Confirmada",
    });
  });
});
