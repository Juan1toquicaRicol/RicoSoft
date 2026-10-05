import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  input: vi.fn(),
  request: vi.fn(),
  resolverCia: vi.fn(),
  cotizacionFindMany: vi.fn(),
  tx: {
    cotizacion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    cotizacionItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    auditoria: { create: vi.fn() },
  },
  transaction: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    cotizacion: { findMany: mocks.cotizacionFindMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../../config/siesa", () => ({
  getSiesaPool: vi.fn(async () => ({ request: mocks.request })),
}));
vi.mock("../../lib/siesa-tenant", () => ({ resolverCiaSiesa: mocks.resolverCia }));

import { Prisma } from "@prisma/client";
import {
  VIGENCIA_COTIZACION_DIAS,
  vencimientoPorDefecto,
  LIMITE_MAXIMO_COTIZACIONES,
  SiesaCiaNoConfiguradaError,
  TAMANO_LOTE_LINEAS,
  formatearConsecutivoCotizacionSiesa,
  leerCotizacionesSiesa,
  mapearLineaSiesa,
  sincronizarCotizacionesSiesa,
} from "./cotizaciones-siesa.service";

const encabezado = (erpRowId: number, consec: number) => ({
  erpRowId,
  consec,
  clienteRowId: 2001,
  clienteNombre: " Cliente Uno ",
  clienteNit: "900123456-1 ",
  fecha: new Date("2026-09-01"),
  moneda: "COP ",
  vencimiento: new Date("2026-09-20"),
  condicionPagoId: "30D ",
  condicionPagoDescripcion: " CREDITO A 30 DIAS ",
  tasaDsctoGlobalCap: 0,
  vendedorRowId: 77,
  vendedorNombre: "Vendedora X",
});
const linea = (docRowId: number, lineaRowId: number, over: Record<string, unknown> = {}) => ({
  docRowId,
  lineaRowId,
  itemRowId: 500 + lineaRowId,
  referencia: " REF-1 ",
  descripcion: "Producto",
  unidadMedida: "KG  ",
  listaPrecio: "001",
  bodegaRowId: 4,
  tasaImpuesto: 19,
  cantidad: 10,
  precioUnitario: 1000,
  descuentoLinea: 500,
  descuentoGlobal: 500,
  impuesto: 1710,
  valorNeto: 9000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolverCia.mockResolvedValue(7);
  mocks.cotizacionFindMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(mocks.tx));
  mocks.tx.cotizacion.findFirst.mockResolvedValue(null);
  mocks.tx.cotizacion.create.mockResolvedValue({ id: "nueva-id", numero: 1 });
  mocks.tx.cotizacion.updateMany.mockResolvedValue({ count: 1 });
  const req = { input: mocks.input, query: mocks.query };
  mocks.input.mockReturnValue(req);
  mocks.request.mockReturnValue(req);
});

describe("mapeo de campos canónicos", () => {
  it("consecutivo COT-<consec>, cliente, vendedor, fecha, moneda, vencimiento y condición de pago", async () => {
    mocks.query
      .mockResolvedValueOnce({ recordset: [encabezado(100, 34147)] })
      .mockResolvedValueOnce({ recordset: [linea(100, 1)] });

    const [c] = await leerCotizacionesSiesa(7);

    expect(c.erpRowId).toBe(100);
    expect(c.consecutivo).toBe("COT-CDV-34147");
    expect(formatearConsecutivoCotizacionSiesa(34147)).toBe("COT-CDV-34147");
    expect(c.cliente).toEqual({ rowId: 2001, nombre: "Cliente Uno", nit: "900123456-1" });
    expect(c.vendedor).toEqual({ rowId: 77, nombre: "Vendedora X" });
    expect(c.fecha).toEqual(new Date("2026-09-01"));
    expect(c.moneda).toBe("COP"); // f430_id_moneda_docto (RTRIM)
    expect(c.fechaVencimiento).toEqual(new Date("2026-09-20")); // f430_fecha_vcto_cotizacion
    expect(c.vencimientoEstimado).toBe(false);
    expect(c.condicionPago).toEqual({ id: "30D", descripcion: "CREDITO A 30 DIAS" });
    expect(c.descuentoGlobalTasa).toBe(0);
  });

  it("ítem: código, cantidad, precio, descuento (valor y %), impuestos (valor y %)", () => {
    const item = mapearLineaSiesa(linea(100, 1));
    expect(item).toMatchObject({
      codigo: "REF-1",
      unidadMedida: "KG",
      listaPrecio: "001",
      bodegaRowId: 4,
      itemRowId: 501,
      cantidad: 10,
      precioUnitario: 1000,
      descuentoValor: 1000,
      descuentoPct: 10, // 1000 / (10 x 1000)
      impuestoValor: 1710,
      impuestoPct: 19, // f433_tasa (tasa real de t433)
      valorNeto: 9000,
    });
  });

  it("sin descuento ni impuesto: 0 % y null, sin dividir por cero", () => {
    const item = mapearLineaSiesa(
      linea(1, 1, { descuentoLinea: 0, descuentoGlobal: 0, impuesto: 0, valorNeto: 0, cantidad: 0, tasaImpuesto: null }),
    );
    expect(item.descuentoPct).toBe(0);
    expect(item.impuestoPct).toBeNull();
  });

  it("sin fila en t433 pero con impuesto en valor: deriva el % de valor/neto (respaldo)", () => {
    const item = mapearLineaSiesa(linea(1, 1, { tasaImpuesto: null, impuesto: 1710, valorNeto: 9000 }));
    expect(item.impuestoPct).toBe(19);
  });
});

describe("consultas en lote y acotadas a la compañía", () => {
  it("UNA consulta de encabezados (CDV, cia, TOP) + UNA de líneas para todos los documentos", async () => {
    mocks.query
      .mockResolvedValueOnce({
        recordset: [encabezado(100, 1), encabezado(101, 2), encabezado(102, 3)],
      })
      .mockResolvedValueOnce({ recordset: [linea(100, 1), linea(100, 2), linea(102, 3)] });

    const resultado = await leerCotizacionesSiesa(7, { limite: 3 });

    expect(mocks.query).toHaveBeenCalledTimes(2);
    const sqlEnc = mocks.query.mock.calls[0][0] as string;
    expect(sqlEnc).toMatch(/f430_id_tipo_docto = 'CDV'/);
    expect(sqlEnc).toMatch(/f430_id_cia = @ciaId/);
    expect(sqlEnc).toMatch(/TOP \(@limite\)/);
    expect(sqlEnc).not.toMatch(/@desde/);
    expect(sqlEnc).toMatch(/f430_id_moneda_docto/); // columna verificada en Siesa
    expect(sqlEnc).not.toMatch(/f430_id_moneda\b|f430_fecha_vto\b/); // NO existen en t430
    for (const columna of [
      "f430_fecha_vcto_cotizacion",
      "f430_id_cond_pago",
      "f430_tasa_dscto_global_cap",
      "t208_mm_condiciones_pago",
    ]) {
      expect(sqlEnc).toContain(columna);
    }
    const sqlLin = mocks.query.mock.calls[1][0] as string;
    expect(sqlLin).toMatch(/f431_rowid_pv_docto IN \(@r0, @r1, @r2\)/);
    for (const columna of [
      "f431_id_unidad_medida",
      "f431_id_lista_precio",
      "f431_rowid_bodega",
      "t433_cm_pv_movto_imp",
      "f433_tasa",
      "f433_rowid_pv_movto = m.f431_rowid",
      "f433_id_cia = @ciaId",
    ]) {
      expect(sqlLin).toContain(columna);
    }
    expect(sqlLin).not.toMatch(/t431_cm_pv_docto_linea/); // no existe en Siesa
    expect(mocks.input).toHaveBeenCalledWith("ciaId", 7);
    expect(resultado.map((c) => c.items.length)).toEqual([2, 0, 1]);
  });

  it("filtro desde agrega la condición de fecha parametrizada", async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [] });
    const desde = new Date("2026-08-01");
    await leerCotizacionesSiesa(7, { desde });
    expect(mocks.query.mock.calls[0][0]).toMatch(/f430_id_fecha >= @desde/);
    expect(mocks.input).toHaveBeenCalledWith("desde", desde);
    expect(mocks.query).toHaveBeenCalledTimes(1); // sin documentos no consulta líneas
  });

  it("el límite se acota a LIMITE_MAXIMO_COTIZACIONES", async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [] });
    await leerCotizacionesSiesa(7, { limite: 99999 });
    expect(mocks.input).toHaveBeenCalledWith("limite", LIMITE_MAXIMO_COTIZACIONES);
  });

  it("más de TAMANO_LOTE_LINEAS documentos: ceil(n/lote) consultas de líneas, nunca una por documento", async () => {
    const docs = Array.from({ length: TAMANO_LOTE_LINEAS + 1 }, (_, i) => encabezado(i + 1, i + 1));
    mocks.query.mockResolvedValueOnce({ recordset: docs }).mockResolvedValue({ recordset: [] });
    await leerCotizacionesSiesa(7);
    expect(mocks.query).toHaveBeenCalledTimes(1 + 2);
  });
});

describe("sincronizarCotizacionesSiesa (simulación)", () => {
  it("clasifica NUEVA / YA_VINCULADA por erpRowId acotado a tenantId, sin escribir", async () => {
    mocks.query
      .mockResolvedValueOnce({ recordset: [encabezado(100, 1), encabezado(101, 2)] })
      .mockResolvedValueOnce({ recordset: [] });
    mocks.cotizacionFindMany.mockResolvedValue([{ id: "cot-uuid", erpRowId: 101 }]);

    const r = await sincronizarCotizacionesSiesa("tenant-1", { limite: 10 });

    expect(mocks.resolverCia).toHaveBeenCalledWith("tenant-1");
    expect(mocks.cotizacionFindMany.mock.calls[0][0].where).toEqual({
      tenantId: "tenant-1",
      erpRowId: { in: [100, 101] },
    });
    expect(r).toMatchObject({ modo: "SIMULACION", total: 2, nuevas: 1, yaVinculadas: 1 });
    expect(
      r.cotizaciones.map((c) => [c.erpRowId, c.estadoSincronizacion, c.cotizacionId]),
    ).toEqual([
      [100, "NUEVA", null],
      [101, "YA_VINCULADA", "cot-uuid"],
    ]);
    expect(r.advertencias.join(" ")).toMatch(/vencimiento/i);
    expect(r.creadas).toBe(0);
    expect(mocks.transaction).not.toHaveBeenCalled(); // simulación: cero escrituras
  });

  it("tenant sin siesaCiaId -> SiesaCiaNoConfiguradaError y no toca Siesa", async () => {
    mocks.resolverCia.mockResolvedValue(null);
    await expect(sincronizarCotizacionesSiesa("t")).rejects.toBeInstanceOf(
      SiesaCiaNoConfiguradaError,
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("sin cotizaciones en Siesa: resultado vacío sin consultar Cotizacion", async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [] });
    const r = await sincronizarCotizacionesSiesa("t");
    expect(r).toMatchObject({ total: 0, nuevas: 0, yaVinculadas: 0, cotizaciones: [] });
    expect(mocks.cotizacionFindMany).not.toHaveBeenCalled();
  });
});

describe("moneda y vencimiento (reglas de negocio)", () => {
  it("vencimiento NULL en Siesa -> fecha + 15 días y vencimientoEstimado=true", async () => {
    mocks.query
      .mockResolvedValueOnce({ recordset: [{ ...encabezado(1, 1), vencimiento: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const [c] = await leerCotizacionesSiesa(7);
    expect(c.fechaVencimiento).toEqual(new Date("2026-09-16")); // fecha 2026-09-01 + 15
    expect(c.vencimientoEstimado).toBe(true);
  });

  it("moneda vacía -> COP por defecto; vencimiento = fecha + 15 días", async () => {
    mocks.query
      .mockResolvedValueOnce({ recordset: [{ ...encabezado(1, 1), moneda: null }] })
      .mockResolvedValueOnce({ recordset: [] });
    const [c] = await leerCotizacionesSiesa(7);
    expect(c.moneda).toBe("COP");
    expect(vencimientoPorDefecto(new Date("2026-09-20"))).toEqual(new Date("2026-10-05"));
    expect(VIGENCIA_COTIZACION_DIAS).toBe(15);
  });
});

describe("persistencia (guardar=true)", () => {
  const actor = { id: "user-1", nombre: "Ana Comercial" };
  const siesa = (rowId: number, consec: number) => [
    { recordset: [encabezado(rowId, consec)] },
    { recordset: [linea(rowId, 1), linea(rowId, 2, { impuesto: 0, valorNeto: 5000, tasaImpuesto: null })] },
  ];

  it("guardar sin actor -> error (no hay quién firme la auditoría)", async () => {
    await expect(sincronizarCotizacionesSiesa("t", { guardar: true })).rejects.toThrow(/usuario/);
  });

  it("NUEVA: crea BORRADOR con erpRowId, erpNumero COT-CDV-, ítems y auditoría en UNA transacción", async () => {
    mocks.query.mockResolvedValueOnce(siesa(100, 34147)[0]).mockResolvedValueOnce(siesa(100, 34147)[1]);

    const r = await sincronizarCotizacionesSiesa("tenant-1", { guardar: true }, actor);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    const data = mocks.tx.cotizacion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "tenant-1",
      estado: "BORRADOR",
      erpRowId: 100,
      erpTipoDocumento: "CDV",
      erpNumero: "COT-CDV-34147",
      erpEstadoSincronizacion: "VINCULADO",
      moneda: "COP",
      clienteRowId: 2001,
      clienteNombre: "Cliente Uno",
      creadoPorId: "user-1",
      creadoPorNombre: "Ana Comercial",
    });
    expect(data.fechaVencimiento).toEqual(new Date("2026-09-20"));
    expect(data.items.create).toHaveLength(2);
    expect(data.items.create[0]).toMatchObject({ orden: 0, referencia: "REF-1", cantidad: 10, precioUnitario: 1000, descuentoPct: 10, ivaPct: 19, unidadMedida: "KG", bodegaRowId: 4 });
    expect(data.items.create[1].ivaPct).toBe(0); // sin impuesto en Siesa
    expect(mocks.tx.auditoria.create.mock.calls[0][0].data).toMatchObject({
      tenantId: "tenant-1",
      usuarioId: "user-1",
      accion: "COTIZACION_SIESA_CREADA",
      entidadTipo: "Cotizacion",
      entidadId: "nueva-id",
    });
    expect(r).toMatchObject({ modo: "GUARDADO", creadas: 1, actualizadas: 0, omitidas: 0 });
    expect(r.cotizaciones[0]).toMatchObject({ resultado: "CREADA", cotizacionId: "nueva-id" });
  });

  it("YA_VINCULADA en BORRADOR: UPDATE condicional (estado = BORRADOR) + reemplazo de ítems + auditoría", async () => {
    mocks.query.mockResolvedValueOnce(siesa(100, 1)[0]).mockResolvedValueOnce(siesa(100, 1)[1]);
    mocks.cotizacionFindMany.mockResolvedValue([{ id: "cot-1", erpRowId: 100 }]);

    const r = await sincronizarCotizacionesSiesa("tenant-1", { guardar: true }, actor);

    expect(mocks.tx.cotizacion.updateMany.mock.calls[0][0].where).toEqual({
      id: "cot-1",
      tenantId: "tenant-1",
      estado: "BORRADOR",
    });
    expect(mocks.tx.cotizacionItem.deleteMany).toHaveBeenCalledWith({ where: { cotizacionId: "cot-1" } });
    expect(mocks.tx.cotizacionItem.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(mocks.tx.auditoria.create.mock.calls[0][0].data.accion).toBe("COTIZACION_SIESA_ACTUALIZADA");
    expect(mocks.tx.cotizacion.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ creadas: 0, actualizadas: 1, yaVinculadas: 1 });
  });

  it("YA_VINCULADA que dejó de ser BORRADOR: se omite sin tocar ítems ni auditar", async () => {
    mocks.query.mockResolvedValueOnce(siesa(100, 1)[0]).mockResolvedValueOnce(siesa(100, 1)[1]);
    mocks.cotizacionFindMany.mockResolvedValue([{ id: "cot-1", erpRowId: 100 }]);
    mocks.tx.cotizacion.updateMany.mockResolvedValue({ count: 0 });

    const r = await sincronizarCotizacionesSiesa("tenant-1", { guardar: true }, actor);

    expect(r.cotizaciones[0].resultado).toBe("OMITIDA_NO_BORRADOR");
    expect(r).toMatchObject({ actualizadas: 0, omitidas: 1 });
    expect(mocks.tx.cotizacionItem.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.auditoria.create).not.toHaveBeenCalled();
  });

  it("un documento que falla no interrumpe a los demás y se reporta sin filtrar el error", async () => {
    mocks.query
      .mockResolvedValueOnce({ recordset: [encabezado(100, 1), encabezado(101, 2)] })
      .mockResolvedValueOnce({ recordset: [] });
    mocks.tx.cotizacion.create
      .mockRejectedValueOnce(new Error("Can't reach database server at 192.168.0.100"))
      .mockResolvedValueOnce({ id: "ok-id", numero: 2 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const r = await sincronizarCotizacionesSiesa("t", { guardar: true }, actor);

    expect(r.creadas).toBe(1);
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0].erpRowId).toBe(100);
    expect(JSON.stringify(r.errores)).not.toMatch(/192.168|database/i);
  });

  it("la unicidad por erpRowId (carrera entre sincronizaciones) no es error: OMITIDA_CONCURRENCIA", async () => {
    mocks.query
      .mockResolvedValueOnce({ recordset: [encabezado(100, 1)] })
      .mockResolvedValueOnce({ recordset: [] });
    mocks.tx.cotizacion.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", {
        code: "P2002",
        clientVersion: "5",
        meta: { target: "Cotizacion_tenantId_erpRowId_filtered_uq" },
      }),
    );

    const r = await sincronizarCotizacionesSiesa("t", { guardar: true }, actor);

    expect(r.cotizaciones[0].resultado).toBe("OMITIDA_CONCURRENCIA");
    expect(r.errores).toEqual([]);
  });
});
