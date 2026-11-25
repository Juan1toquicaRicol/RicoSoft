import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CrossChexCheckinoutRow } from "../../integrations/crosschex";

/**
 * Mockea Prisma y el adaptador CrossChex (mismo espíritu que
 * config/siesa.test.ts mockeando `mssql`): estos tests no requieren MDB real
 * ni BD real, verifican el comportamiento del servicio de importación
 * (paginación, idempotencia, avance de cursor, lock) de forma determinista.
 */

const obtenerMarcacionesDesdeMock = vi.fn();
// D-01: tenant propietario del .mdb declarado en el servidor (por defecto, el de FUENTE_FAKE).
let propietarioCrossChex: string | null = "tenant-1";

vi.mock("../../integrations/crosschex", () => ({
  obtenerMarcacionesDesde: (...args: unknown[]) => obtenerMarcacionesDesdeMock(...args),
  esTenantPropietarioCrossChex: (tenantId: string) =>
    propietarioCrossChex !== null && propietarioCrossChex === tenantId,
  leerTenantPropietarioCrossChex: () => propietarioCrossChex,
  mapearTipoMarcacion: (checkType: number) =>
    checkType === 0
      ? "ENTRADA"
      : checkType === 2
        ? "BREAK"
        : checkType === 3
          ? "FUERATIEMPO"
          : "OTRO",
  normalizarBit: (v: unknown) => (v === null || v === undefined ? null : Boolean(Number(v))),
  parsearCheckTime: (v: string) => new Date(v.replace(" ", "T") + "Z"),
  soloFecha: (v: string) => new Date(v.slice(0, 10) + "T00:00:00.000Z"),
}));

const fuenteFindUniqueMock = vi.fn();
const fuenteUpdateMock = vi.fn();
const fuenteCountMock = vi.fn();
const logGuardMock = vi.fn();
const empleadoBiometricoFindManyMock = vi.fn();
const marcacionFindManyMock = vi.fn();
const marcacionCreateManyMock = vi.fn();
const logCreateMock = vi.fn();
const logCountMock = vi.fn();
const logUpdateMock = vi.fn();
const tenantFindUniqueMock = vi.fn();

class PrismaClientKnownRequestErrorFake extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: PrismaClientKnownRequestErrorFake },
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    fuenteBiometrica: {
      findUnique: (...args: unknown[]) => fuenteFindUniqueMock(...args),
      update: (...args: unknown[]) => fuenteUpdateMock(...args),
      count: (...args: unknown[]) => fuenteCountMock(...args),
    },
    tenant: { findUnique: (...args: unknown[]) => tenantFindUniqueMock(...args) },
    empleadoBiometrico: {
      findMany: (...args: unknown[]) => empleadoBiometricoFindManyMock(...args),
    },
    marcacionBiometrica: {
      findMany: (...args: unknown[]) => marcacionFindManyMock(...args),
      createMany: (...args: unknown[]) => marcacionCreateManyMock(...args),
    },
    sincronizacionBiometricoLog: {
      create: (...args: unknown[]) => logCreateMock(...args),
      count: (...args: unknown[]) => logCountMock(...args),
      updateMany: (...args: unknown[]) => logUpdateMock(...args),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        marcacionBiometrica: {
          findMany: marcacionFindManyMock,
          createMany: marcacionCreateManyMock,
        },
        fuenteBiometrica: { update: fuenteUpdateMock },
        sincronizacionBiometricoLog: { updateMany: logGuardMock },
      }),
  },
}));

const FUENTE_FAKE = {
  id: "fuente-1",
  tenantId: "tenant-1",
  nombre: "crosschex-flexipack",
  proveedor: "anviz",
  activa: true,
  lastProcessedLogId: 0,
};

function filaCheckinout(overrides: Partial<CrossChexCheckinoutRow>): CrossChexCheckinoutRow {
  return {
    Logid: 1,
    userid: "33",
    CheckTime: "2026-09-07 08:00:00",
    CheckType: 0,
    Sensorid: 2,
    WorkType: 0,
    AttFlag: 0,
    Checked: "0",
    Exported: "0",
    OpenDoorFlag: "0",
    temperature: null,
    whynoopen: null,
    mask: null,
    ...overrides,
  };
}

describe("biometrico-import.service", () => {
  beforeEach(() => {
    propietarioCrossChex = "tenant-1";
    logCountMock.mockReset();
    logCountMock.mockResolvedValue(0);
    obtenerMarcacionesDesdeMock.mockReset();
    fuenteFindUniqueMock.mockReset();
    fuenteUpdateMock.mockReset();
    empleadoBiometricoFindManyMock.mockReset();
    marcacionFindManyMock.mockReset();
    marcacionCreateManyMock.mockReset();
    logCreateMock.mockReset();
    logUpdateMock.mockReset();
    fuenteCountMock.mockReset();
    fuenteCountMock.mockResolvedValue(1);
    logGuardMock.mockReset();
    logGuardMock.mockResolvedValue({ count: 1 });
    logUpdateMock.mockResolvedValue({ count: 1 });

    fuenteFindUniqueMock.mockResolvedValue(FUENTE_FAKE);
    empleadoBiometricoFindManyMock.mockResolvedValue([]);
    marcacionFindManyMock.mockResolvedValue([]);
    marcacionCreateManyMock.mockResolvedValue({ count: 0 });
    fuenteUpdateMock.mockResolvedValue(FUENTE_FAKE);
  });

  describe("dryRunImportacionHistorica", () => {
    it("lanza FuenteBiometricaNoEncontradaError si la fuente no existe", async () => {
      fuenteFindUniqueMock.mockResolvedValue(null);
      const { dryRunImportacionHistorica, FuenteBiometricaNoEncontradaError } =
        await import("./biometrico-import.service");

      await expect(dryRunImportacionHistorica("no-existe")).rejects.toThrow(
        FuenteBiometricaNoEncontradaError,
      );
    });

    it("no escribe nada: nunca llama createMany ni actualiza el cursor", async () => {
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce([
          filaCheckinout({ Logid: 1 }),
          filaCheckinout({ Logid: 2, CheckType: 1 }),
        ])
        .mockResolvedValueOnce([]);

      const { dryRunImportacionHistorica } = await import("./biometrico-import.service");
      await dryRunImportacionHistorica("crosschex-flexipack", 500);

      expect(marcacionCreateManyMock).not.toHaveBeenCalled();
      expect(fuenteUpdateMock).not.toHaveBeenCalled();
    });

    it("clasifica usuarios conocidos vs desconocidos y cuenta por tipo, sin inventar significado para CheckType=1", async () => {
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce([
          filaCheckinout({ Logid: 1, userid: "33", CheckType: 0 }),
          filaCheckinout({ Logid: 2, userid: "98", CheckType: 1 }),
        ])
        .mockResolvedValueOnce([]);
      empleadoBiometricoFindManyMock.mockResolvedValue([{ externalUserId: "33" }]);

      const { dryRunImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await dryRunImportacionHistorica("crosschex-flexipack", 500);

      expect(reporte.totalMarcacionesEncontradas).toBe(2);
      expect(reporte.marcacionesConUsuarioConocido).toBe(1);
      expect(reporte.marcacionesSinUsuarioConocido).toBe(1);
      expect(reporte.usuariosUnicosConocidos).toBe(1);
      expect(reporte.usuariosUnicosDesconocidos).toEqual(["98"]);
      expect(reporte.porTipo).toEqual({ ENTRADA: 1, OTRO: 1 });
      expect(reporte.primerLogid).toBe(1);
      expect(reporte.ultimoLogid).toBe(2);
    });

    it("pagina hasta que un lote viene incompleto, empezando desde lastProcessedLogId", async () => {
      fuenteFindUniqueMock.mockResolvedValue({ ...FUENTE_FAKE, lastProcessedLogId: 100 });
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce(
          Array.from({ length: 3 }, (_, i) => filaCheckinout({ Logid: 101 + i })),
        )
        .mockResolvedValueOnce([filaCheckinout({ Logid: 104 })]); // lote incompleto -> corta

      const { dryRunImportacionHistorica } = await import("./biometrico-import.service");
      await dryRunImportacionHistorica("crosschex-flexipack", 3);

      expect(obtenerMarcacionesDesdeMock).toHaveBeenNthCalledWith(1, 100, 3);
      expect(obtenerMarcacionesDesdeMock).toHaveBeenNthCalledWith(2, 103, 3);
      expect(obtenerMarcacionesDesdeMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("ejecutarImportacionHistorica", () => {
    it("lanza SincronizacionEnCursoError si ya hay un log EN_CURSO (P2002 del índice único filtrado)", async () => {
      logCreateMock.mockRejectedValue(
        new PrismaClientKnownRequestErrorFake("Unique constraint failed", "P2002"),
      );

      const { ejecutarImportacionHistorica, SincronizacionEnCursoError } =
        await import("./biometrico-import.service");

      await expect(ejecutarImportacionHistorica("crosschex-flexipack")).rejects.toThrow(
        SincronizacionEnCursoError,
      );
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("candado global: si otra fuente tiene una corrida EN_CURSO no empieza, sin crear log ni leer el MDB y sin revelar nombres", async () => {
      logCountMock.mockResolvedValue(1);
      const { ejecutarImportacionHistorica, SincronizacionEnCursoError } =
        await import("./biometrico-import.service");

      const promesa = ejecutarImportacionHistorica("crosschex-flexipack");
      await expect(promesa).rejects.toThrow(SincronizacionEnCursoError);
      await expect(promesa).rejects.toThrow(/otra sincronización biométrica en curso/);
      await expect(promesa).rejects.not.toThrow(/crosschex-flexipack/);
      expect(logCountMock).toHaveBeenCalledWith({
        where: { estado: "EN_CURSO", fuenteId: { not: FUENTE_FAKE.id } },
      });
      expect(logCreateMock).not.toHaveBeenCalled();
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("inserta marcaciones nuevas, filtra las ya existentes (idempotencia) y avanza el cursor solo tras el insert", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce([
          filaCheckinout({ Logid: 1, userid: "33" }),
          filaCheckinout({ Logid: 2, userid: "33" }),
        ])
        .mockResolvedValueOnce([]);
      // Logid=1 ya existe (reintento de una corrida previa parcialmente aplicada).
      marcacionFindManyMock.mockResolvedValueOnce([{ externalLogId: "1" }]);
      empleadoBiometricoFindManyMock.mockResolvedValue([
        { externalUserId: "33", empleadoId: "empleado-1", empleado: { empresaId: "EMP1" } },
      ]);

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await ejecutarImportacionHistorica("crosschex-flexipack");

      expect(marcacionCreateManyMock).toHaveBeenCalledTimes(1);
      const dataInsertada = marcacionCreateManyMock.mock.calls[0][0].data;
      expect(dataInsertada).toHaveLength(1);
      expect(dataInsertada[0].externalLogId).toBe("2");
      expect(dataInsertada[0].empleadoId).toBe("empleado-1");
      expect(dataInsertada[0].empresaId).toBe("EMP1");

      expect(fuenteUpdateMock).toHaveBeenCalledWith({
        where: { id: "fuente-1" },
        data: { lastProcessedLogId: 2 },
      });
      expect(reporte.insertados).toBe(1);
      expect(reporte.duplicados).toBe(1);
      expect(reporte.estado).toBe("COMPLETADO");
      expect(logUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "log-1", estado: "EN_CURSO" },
          data: expect.objectContaining({ estado: "COMPLETADO" }),
        }),
      );
    });

    it("marcaciones sin EmpleadoBiometrico asociado se insertan con empleadoId=null, nunca se descartan", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce([filaCheckinout({ Logid: 1, userid: "sin-asociar" })])
        .mockResolvedValueOnce([]);
      empleadoBiometricoFindManyMock.mockResolvedValue([]); // nadie asociado

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await ejecutarImportacionHistorica("crosschex-flexipack");

      const dataInsertada = marcacionCreateManyMock.mock.calls[0][0].data;
      expect(dataInsertada).toHaveLength(1);
      expect(dataInsertada[0].empleadoId).toBeNull();
      expect(dataInsertada[0].externalUserId).toBe("sin-asociar");
      expect(reporte.sinEmpleado).toBe(1);
    });

    it("si la transacción de un lote falla, el cursor NO avanza y el log queda FALLIDO", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock.mockResolvedValueOnce([filaCheckinout({ Logid: 1 })]);
      marcacionFindManyMock.mockRejectedValue(new Error("BD caída a mitad del lote"));

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await ejecutarImportacionHistorica("crosschex-flexipack");

      expect(fuenteUpdateMock).not.toHaveBeenCalled();
      expect(reporte.estado).toBe("FALLIDO");
      expect(logUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: "FALLIDO" }) }),
      );
    });

    it("reporta progreso por lote vía onProgreso", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce([filaCheckinout({ Logid: 1 }), filaCheckinout({ Logid: 2 })])
        .mockResolvedValueOnce([filaCheckinout({ Logid: 3 })])
        .mockResolvedValueOnce([]);

      const progresos: number[] = [];
      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      await ejecutarImportacionHistorica("crosschex-flexipack", {
        tamanoLote: 2,
        onProgreso: ({ procesados }) => progresos.push(procesados),
      });

      expect(progresos).toEqual([2, 3]);
    });

    it("sin marcaciones nuevas: termina COMPLETADO con leidos=0 y el cursor no se toca", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 42 });
      fuenteFindUniqueMock.mockResolvedValue({ ...FUENTE_FAKE, lastProcessedLogId: 42 });
      obtenerMarcacionesDesdeMock.mockResolvedValueOnce([]);

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await ejecutarImportacionHistorica("crosschex-flexipack");

      expect(reporte.estado).toBe("COMPLETADO");
      expect(reporte.leidos).toBe(0);
      expect(reporte.insertados).toBe(0);
      expect(reporte.logIdHasta).toBeNull();
      expect(fuenteUpdateMock).not.toHaveBeenCalled();
      expect(marcacionCreateManyMock).not.toHaveBeenCalled();
      expect(obtenerMarcacionesDesdeMock).toHaveBeenCalledWith(42, 1000);
    });

    it("aislamiento multi-tenant: la resolución de empleados siempre se filtra por el tenantId y proveedor de la FUENTE, nunca global", async () => {
      const fuenteTenantB = {
        ...FUENTE_FAKE,
        id: "fuente-2",
        tenantId: "tenant-B",
        proveedor: "anviz",
      };
      fuenteFindUniqueMock.mockResolvedValue(fuenteTenantB);
      propietarioCrossChex = "tenant-B";
      logCreateMock.mockResolvedValue({ id: "log-2", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock
        .mockResolvedValueOnce([filaCheckinout({ Logid: 1, userid: "33" })])
        .mockResolvedValueOnce([]);

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      await ejecutarImportacionHistorica("crosschex-otra-sede");

      expect(empleadoBiometricoFindManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-B",
            fuenteId: "fuente-2",
            proveedor: "anviz",
          }),
        }),
      );
      // Nunca se consulta EmpleadoBiometrico sin acotar por tenantId — de lo
      // contrario un externalUserId "33" del tenant A podría cruzarse por
      // error con un empleado del tenant B.
      const whereUsado = empleadoBiometricoFindManyMock.mock.calls[0][0].where;
      expect(whereUsado.tenantId).toBeDefined();
    });

    it("una fuente inactiva no se sincroniza (tampoco desde el CLI): sin log ni lectura del MDB", async () => {
      fuenteFindUniqueMock.mockResolvedValue({ ...FUENTE_FAKE, activa: false });
      const { ejecutarImportacionHistorica, FuenteBiometricaInactivaError } =
        await import("./biometrico-import.service");

      await expect(ejecutarImportacionHistorica("crosschex-flexipack")).rejects.toThrow(
        FuenteBiometricaInactivaError,
      );
      expect(logCreateMock).not.toHaveBeenCalled();
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("con más de una fuente activa en la instalación falla cerrado, sin revelar nombres", async () => {
      fuenteCountMock.mockResolvedValue(2);
      const { ejecutarImportacionHistorica, VariasFuentesBiometricasActivasError } =
        await import("./biometrico-import.service");

      const promesa = ejecutarImportacionHistorica("crosschex-flexipack");
      await expect(promesa).rejects.toThrow(VariasFuentesBiometricasActivasError);
      await expect(promesa).rejects.not.toThrow(/crosschex-flexipack/);
      expect(fuenteCountMock).toHaveBeenCalledWith({ where: { activa: true } });
      expect(logCreateMock).not.toHaveBeenCalled();
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("no enlaza marcaciones nuevas a colaboradores eliminados o liquidados", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock.mockResolvedValueOnce([filaCheckinout({ Logid: 1 })]);

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      await ejecutarImportacionHistorica("crosschex-flexipack");

      expect(empleadoBiometricoFindManyMock.mock.calls[0][0].where).toMatchObject({
        activo: true,
        empleado: { eliminado: false, estado: { not: "Liquidado" } },
      });
    });

    it("si la recuperación liberó la corrida, se detiene sin escribir el lote ni mover el cursor y no pisa el FALLIDO", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock.mockResolvedValueOnce([filaCheckinout({ Logid: 1 })]);
      logGuardMock.mockResolvedValue({ count: 0 }); // ya no está EN_CURSO
      logUpdateMock.mockResolvedValue({ count: 0 });

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await ejecutarImportacionHistorica("crosschex-flexipack");

      // El guard es una escritura (bloquea la fila del log hasta el commit del lote).
      expect(logGuardMock).toHaveBeenCalledWith({
        where: { id: "log-1", estado: "EN_CURSO" },
        data: { leidos: 1 },
      });
      expect(marcacionCreateManyMock).not.toHaveBeenCalled();
      expect(fuenteUpdateMock).not.toHaveBeenCalled();
      expect(reporte.estado).toBe("FALLIDO");
      // El cierre va acotado a EN_CURSO: no reescribe la fila ya liberada.
      expect(logUpdateMock.mock.calls[0][0].where).toEqual({ id: "log-1", estado: "EN_CURSO" });
    });

    it("registra la corrida como activa en el proceso mientras dura y la quita al terminar (también si el cierre falla)", async () => {
      const { ejecutarImportacionHistorica, idsCorridasBiometricoActivasEnProceso } =
        await import("./biometrico-import.service");
      logCreateMock.mockResolvedValue({ id: "log-9", logIdDesde: 0 });
      let durante: string[] = [];
      obtenerMarcacionesDesdeMock.mockImplementationOnce(async () => {
        durante = idsCorridasBiometricoActivasEnProceso();
        return [];
      });
      logUpdateMock.mockRejectedValue(new Error("BD caída al cerrar"));

      await expect(ejecutarImportacionHistorica("crosschex-flexipack")).rejects.toThrow(
        /BD caída al cerrar/,
      );
      expect(durante).toEqual(["log-9"]);
      expect(idsCorridasBiometricoActivasEnProceso()).toEqual([]);
    });

    it("D-01: sin propietario configurado falla cerrado antes de crear el log o leer el MDB", async () => {
      propietarioCrossChex = null;
      const { ejecutarImportacionHistorica, FuenteBiometricaSinPropietarioError } =
        await import("./biometrico-import.service");

      const promesa = ejecutarImportacionHistorica("crosschex-flexipack");
      await expect(promesa).rejects.toThrow(FuenteBiometricaSinPropietarioError);
      await expect(promesa).rejects.toThrow(/CROSSCHEX_TENANT_PROPIETARIO_ID/);
      expect(logCreateMock).not.toHaveBeenCalled();
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("D-01: una fuente de un tenant que no es el propietario configurado no se sincroniza, sin revelar quién es", async () => {
      propietarioCrossChex = "tenant-dueno";
      const { ejecutarImportacionHistorica, FuenteBiometricaSinPropietarioError } =
        await import("./biometrico-import.service");

      const promesa = ejecutarImportacionHistorica("crosschex-flexipack");
      await expect(promesa).rejects.toThrow(FuenteBiometricaSinPropietarioError);
      await expect(promesa).rejects.not.toThrow(/tenant-dueno/);
      expect(logCreateMock).not.toHaveBeenCalled();
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("D-01: el dry-run (CLI) también exige el propietario: no lee el MDB", async () => {
      propietarioCrossChex = null;
      const { dryRunImportacionHistorica, FuenteBiometricaSinPropietarioError } =
        await import("./biometrico-import.service");

      await expect(dryRunImportacionHistorica("crosschex-flexipack")).rejects.toThrow(
        FuenteBiometricaSinPropietarioError,
      );
      expect(obtenerMarcacionesDesdeMock).not.toHaveBeenCalled();
    });

    it("si la corrida se liberó después del último lote, informa FALLIDO (no COMPLETADO) aunque lo importado quedó guardado", async () => {
      logCreateMock.mockResolvedValue({ id: "log-1", logIdDesde: 0 });
      obtenerMarcacionesDesdeMock.mockResolvedValueOnce([filaCheckinout({ Logid: 1 })]);
      logUpdateMock.mockResolvedValue({ count: 0 }); // el cierre ya no encuentra la fila EN_CURSO

      const { ejecutarImportacionHistorica } = await import("./biometrico-import.service");
      const reporte = await ejecutarImportacionHistorica("crosschex-flexipack");

      expect(marcacionCreateManyMock).toHaveBeenCalledTimes(1);
      expect(reporte.estado).toBe("FALLIDO");
      expect(reporte.mensajeError).toMatch(/liberada/);
      expect(reporte.insertados).toBe(1);
    });
  });
});

// SEG-01: el script de diagnóstico de consola (explore-crosschex) también exige
// el propietario explícito y que sea una empresa registrada.
describe("exigirPropietarioCrossChexConfigurado (explore-crosschex)", () => {
  const UUID_DUENO = "0f8fad5b-d9cb-469f-a165-70867728950e";
  beforeEach(() => tenantFindUniqueMock.mockReset());

  it("sin propietario configurado falla cerrado sin consultar nada", async () => {
    propietarioCrossChex = null;
    const { exigirPropietarioCrossChexConfigurado, LecturaCrossChexNoAutorizadaError } =
      await import("./biometrico-import.service");
    const promesa = exigirPropietarioCrossChexConfigurado();
    await expect(promesa).rejects.toThrow(LecturaCrossChexNoAutorizadaError);
    await expect(promesa).rejects.toThrow(/CROSSCHEX_TENANT_PROPIETARIO_ID/);
    expect(tenantFindUniqueMock).not.toHaveBeenCalled();
  });

  it("un valor que no es uuid se rechaza sin consultar la BD", async () => {
    propietarioCrossChex = "cualquier-cosa";
    const { exigirPropietarioCrossChexConfigurado, LecturaCrossChexNoAutorizadaError } =
      await import("./biometrico-import.service");
    await expect(exigirPropietarioCrossChexConfigurado()).rejects.toThrow(
      LecturaCrossChexNoAutorizadaError,
    );
    expect(tenantFindUniqueMock).not.toHaveBeenCalled();
  });

  it("un uuid que no corresponde a ningún tenant falla cerrado", async () => {
    propietarioCrossChex = UUID_DUENO;
    tenantFindUniqueMock.mockResolvedValue(null);
    const { exigirPropietarioCrossChexConfigurado, LecturaCrossChexNoAutorizadaError } =
      await import("./biometrico-import.service");
    await expect(exigirPropietarioCrossChexConfigurado()).rejects.toThrow(
      LecturaCrossChexNoAutorizadaError,
    );
    expect(tenantFindUniqueMock).toHaveBeenCalledWith({
      where: { id: UUID_DUENO },
      select: { id: true },
    });
  });

  it("propietario configurado y existente: autoriza la lectura", async () => {
    propietarioCrossChex = UUID_DUENO;
    tenantFindUniqueMock.mockResolvedValue({ id: UUID_DUENO });
    const { exigirPropietarioCrossChexConfigurado } = await import("./biometrico-import.service");
    await expect(exigirPropietarioCrossChexConfigurado()).resolves.toBeUndefined();
  });
});
