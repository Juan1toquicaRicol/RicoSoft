import { describe, expect, it, vi } from "vitest";

import { DETALLE_PERSONAL_VACIO } from "./detalle-personal";
import {
  borradorVacio,
  ejecutarAlta,
  empFormInicial,
  hayCambiosPendientesAlta,
  resolverCierreAlta,
  type ApiDetallesAlta,
  type BorradorDetallesAlta,
  type EntradasCambiosAlta,
} from "./gestion-humana-alta";

const HOY = "2026-10-27";
const base = empFormInicial("RC", "Producción", HOY);

function entradas(parcial: Partial<EntradasCambiosAlta> = {}): EntradasCambiosAlta {
  return {
    empForm: { ...base },
    base,
    borrador: borradorVacio(),
    enEdicion: { textos: ["", "", "", ""], archivo: null },
    ...parcial,
  };
}

const archivo = (nombre: string) => new File(["x"], nombre, { type: "application/pdf" });

describe("hayCambiosPendientesAlta / resolverCierreAlta (descarte)", () => {
  it("un formulario intacto no tiene cambios y se cierra sin confirmar", () => {
    expect(hayCambiosPendientesAlta(entradas())).toBe(false);
    expect(resolverCierreAlta(false, false)).toBe("cerrar");
  });

  it.each([
    ["un dato del colaborador", { empForm: { ...base, nombres: "Ana" } }],
    [
      "un detalle personal",
      { borrador: { ...borradorVacio(), detalle: { ...DETALLE_PERSONAL_VACIO, eps: "X" } } },
    ],
    [
      "un familiar",
      { borrador: { ...borradorVacio(), familiares: [{ nombre: "A", parentesco: "B" }] } },
    ],
    [
      "un estudio",
      { borrador: { ...borradorVacio(), estudios: [{ titulo: "T", institucion: "" }] } },
    ],
    ["un certificado", { borrador: { ...borradorVacio(), certificado: archivo("c.pdf") } }],
    ["un campo a medio escribir", { enEdicion: { textos: ["", "", "Ing", ""], archivo: null } }],
    [
      "un archivo a medio elegir",
      { enEdicion: { textos: ["", "", "", ""], archivo: archivo("s.pdf") } },
    ],
  ] as [string, Partial<EntradasCambiosAlta>][])(
    "detecta %s y pide confirmación",
    (_n, parcial) => {
      const hay = hayCambiosPendientesAlta(entradas(parcial));
      expect(hay).toBe(true);
      expect(resolverCierreAlta(hay, false)).toBe("confirmar");
    },
  );

  it("no cierra ni pide confirmar mientras se está guardando", () => {
    expect(resolverCierreAlta(true, true)).toBe("ignorar");
    expect(resolverCierreAlta(false, true)).toBe("ignorar");
  });

  it("descarte confirmado: el estado inicial vuelve a no tener cambios", () => {
    const sucio = entradas({
      empForm: { ...base, nombres: "Ana", documento: "1" },
      borrador: { ...borradorVacio(), certificado: archivo("c.pdf") },
    });
    expect(hayCambiosPendientesAlta(sucio)).toBe(true);
    // Confirmar = volver al estado inicial completo (lo que hace reiniciarFormularioAlta).
    const limpio = entradas({ empForm: empFormInicial("RC", "Producción", HOY) });
    expect(hayCambiosPendientesAlta(limpio)).toBe(false);
  });

  it("descarte cancelado: no se modifica nada y los cambios siguen pendientes", () => {
    const sucio = entradas({ empForm: { ...base, nombres: "Ana" } });
    // «Seguir editando» no cambia el estado.
    expect(hayCambiosPendientesAlta(sucio)).toBe(true);
    expect(sucio.empForm.nombres).toBe("Ana");
  });

  it("el estado inicial usa el departamento por defecto (no vuelve a area vacía)", () => {
    expect(empFormInicial("GR", "Ventas", HOY)).toMatchObject({ empresaId: "GR", area: "Ventas" });
  });

  it("la empresa es la del tenant: nunca Ricol por defecto", () => {
    expect(empFormInicial("FL", "", HOY).empresaId).toBe("FL");
    // Tenant no identificable: vacía (el servidor la fija o rechaza), no "RC".
    expect(empFormInicial(null, "", HOY).empresaId).toBe("");
  });
});

function crearApiFalsa(fallos: Record<string, number> = {}) {
  const llamadas: string[] = [];
  let estudios = 0;
  const falla = (clave: string) => {
    if ((fallos[clave] ?? 0) > 0) {
      fallos[clave] -= 1;
      throw new Error(`falló ${clave}`);
    }
  };
  const api: ApiDetallesAlta = {
    guardarDetalle: vi.fn(async () => {
      llamadas.push("detalle");
      falla("detalle");
    }),
    agregarFamiliar: vi.fn(async (f) => {
      llamadas.push(`familiar:${f.nombre}`);
      falla(`familiar:${f.nombre}`);
    }),
    crearEstudio: vi.fn(async (e) => {
      llamadas.push(`estudio:${e.titulo}`);
      falla(`estudio:${e.titulo}`);
      estudios += 1;
      return { id: `est-${estudios}` };
    }),
    subirSoporteEstudio: vi.fn(async (id) => {
      llamadas.push(`soporte:${id}`);
      falla("soporte");
    }),
    subirCertificadoBancario: vi.fn(async () => {
      llamadas.push("certificado");
      falla("certificado");
    }),
  };
  return { api, llamadas };
}

describe("ejecutarAlta: fallo parcial y reintento", () => {
  const borrador = (): BorradorDetallesAlta => ({
    detalle: { ...DETALLE_PERSONAL_VACIO, eps: "Sura" },
    familiares: [
      { nombre: "Ana", parentesco: "Hija" },
      { nombre: "Luis", parentesco: "Hijo" },
    ],
    estudios: [{ titulo: "Ingeniería", institucion: "U", archivo: archivo("t.pdf") }],
    certificado: archivo("c.pdf"),
  });

  it("reintenta solo lo pendiente y no vuelve a crear el colaborador ni duplica lo guardado", async () => {
    const crear = vi.fn(async () => ({ id: "emp-1" }));
    const { api, llamadas } = crearApiFalsa({ "familiar:Luis": 1, soporte: 1, certificado: 1 });
    const crearApi = vi.fn(() => api);
    const comunes = {
      crear,
      crearApi,
      puedeCapturarDetalles: true,
      puedeGestionarDocumentos: true,
    };

    // 1.er intento: el colaborador se crea y fallan un familiar y los adjuntos.
    const r1 = await ejecutarAlta({ ...comunes, creadoId: null, borrador: borrador() });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(r1.creadoId).toBe("emp-1");
    expect(r1.guardados).toEqual(["Información personal", "Familiar: Ana", "Estudio: Ingeniería"]);
    expect(r1.fallidos.map((f) => f.etiqueta)).toEqual([
      "Familiar: Luis",
      "Soporte del estudio: Ingeniería",
      "Certificado bancario",
    ]);
    // Lo ya guardado sale del borrador; lo fallido se conserva (el estudio, con su id).
    expect(r1.pendiente.detalle).toEqual(DETALLE_PERSONAL_VACIO);
    expect(r1.pendiente.familiares).toEqual([{ nombre: "Luis", parentesco: "Hijo" }]);
    expect(r1.pendiente.estudios).toHaveLength(1);
    expect(r1.pendiente.estudios[0]).toMatchObject({ titulo: "Ingeniería", estudioId: "est-1" });
    expect(r1.pendiente.certificado).not.toBeNull();

    llamadas.length = 0;

    // 2.º intento con el creadoId ya obtenido: no se crea de nuevo y solo se repite lo pendiente.
    const r2 = await ejecutarAlta({ ...comunes, creadoId: r1.creadoId, borrador: r1.pendiente });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(llamadas).toEqual(["familiar:Luis", "soporte:est-1", "certificado"]);
    expect(r2.fallidos).toEqual([]);
    expect(r2.pendiente).toEqual(borradorVacio());
    // El estudio no se vuelve a crear (solo se reintenta su soporte).
    expect(api.crearEstudio).toHaveBeenCalledTimes(1);
    expect(api.agregarFamiliar).toHaveBeenCalledTimes(3); // Ana, Luis (falló), Luis (reintento)
    expect(api.guardarDetalle).toHaveBeenCalledTimes(1);
  });

  it("si falla la creación del estudio, el reintento lo crea una sola vez y sube su soporte", async () => {
    const crear = vi.fn(async () => ({ id: "emp-2" }));
    const { api } = crearApiFalsa({ "estudio:Ingeniería": 1 });
    const comunes = {
      crear,
      crearApi: () => api,
      puedeCapturarDetalles: true,
      puedeGestionarDocumentos: true,
    };
    const b: BorradorDetallesAlta = {
      ...borradorVacio(),
      estudios: [{ titulo: "Ingeniería", institucion: "U", archivo: archivo("t.pdf") }],
    };

    const r1 = await ejecutarAlta({ ...comunes, creadoId: null, borrador: b });
    expect(r1.fallidos.map((f) => f.etiqueta)).toEqual(["Estudio: Ingeniería"]);
    expect(api.subirSoporteEstudio).not.toHaveBeenCalled(); // depende del estudio

    const r2 = await ejecutarAlta({ ...comunes, creadoId: r1.creadoId, borrador: r1.pendiente });
    expect(r2.fallidos).toEqual([]);
    expect(crear).toHaveBeenCalledTimes(1);
    expect(api.subirSoporteEstudio).toHaveBeenCalledTimes(1);
  });

  it("si falla la creación del colaborador el error se propaga y no se intenta ningún detalle", async () => {
    const { api } = crearApiFalsa();
    await expect(
      ejecutarAlta({
        creadoId: null,
        crear: async () => {
          throw new Error("documento duplicado");
        },
        borrador: borrador(),
        crearApi: () => api,
        puedeCapturarDetalles: true,
        puedeGestionarDocumentos: true,
      }),
    ).rejects.toThrow("documento duplicado");
    expect(api.guardarDetalle).not.toHaveBeenCalled();
    expect(api.agregarFamiliar).not.toHaveBeenCalled();
  });

  it("sin permiso de detalles no se guardan detalles; sin permiso de documentos no se suben adjuntos", async () => {
    const { api } = crearApiFalsa();
    const sinDetalles = await ejecutarAlta({
      creadoId: null,
      crear: async () => ({ id: "emp-3" }),
      borrador: borrador(),
      crearApi: () => api,
      puedeCapturarDetalles: false,
      puedeGestionarDocumentos: true,
    });
    expect(sinDetalles.fallidos).toEqual([]);
    expect(api.guardarDetalle).not.toHaveBeenCalled();

    const sinDocs = await ejecutarAlta({
      creadoId: "emp-3",
      crear: async () => undefined,
      borrador: borrador(),
      crearApi: () => api,
      puedeCapturarDetalles: true,
      puedeGestionarDocumentos: false,
    });
    expect(sinDocs.fallidos).toEqual([]);
    expect(api.subirSoporteEstudio).not.toHaveBeenCalled();
    expect(api.subirCertificadoBancario).not.toHaveBeenCalled();
  });

  it("sin nada que guardar solo crea el colaborador", async () => {
    const { api } = crearApiFalsa();
    const crear = vi.fn(async () => ({ id: "emp-4" }));
    const r = await ejecutarAlta({
      creadoId: null,
      crear,
      borrador: borradorVacio(),
      crearApi: () => api,
      puedeCapturarDetalles: true,
      puedeGestionarDocumentos: true,
    });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ creadoId: "emp-4", guardados: [], fallidos: [] });
  });
});
