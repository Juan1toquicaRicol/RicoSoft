import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fix puntual: t430_cm_pv_docto guarda TANTO cotizaciones (f430_id_tipo_docto
 * = 'CDV') como pedidos (f430_id_tipo_docto = 'PDV'), con consecutivos
 * numerados de forma INDEPENDIENTE entre ambos tipos — así que un CDV y un
 * PDV pueden compartir el mismo f430_consec_docto. buscarCotizacionesSiesa y
 * leerCotizacionSiesa deben filtrar SIEMPRE por f430_id_tipo_docto = 'CDV'
 * para no devolver por error el PDV homónimo.
 *
 * Este test mockea la capa de BD (getSiesaPool) con una tabla en memoria que
 * contiene un CDV y un PDV con el MISMO consecutivo. El mock aplica el
 * filtro CDV solo si la consulta real generada por el servicio lo incluye en
 * el SQL — así, si alguien quita ese filtro del servicio, este test falla.
 */

interface FilaFake {
  f430_rowid: number;
  f430_id_cia: number;
  f430_consec_docto: number;
  f430_id_tipo_docto: "CDV" | "PDV";
  f430_rowid_tercero_fact: number;
}

const CIA_ID = 900950;
const CONSEC_COMPARTIDO = 34147;

const CDV: FilaFake = {
  f430_rowid: 501,
  f430_id_cia: CIA_ID,
  f430_consec_docto: CONSEC_COMPARTIDO,
  f430_id_tipo_docto: "CDV",
  f430_rowid_tercero_fact: 1,
};

const PDV_HOMONIMO: FilaFake = {
  f430_rowid: 999,
  f430_id_cia: CIA_ID,
  f430_consec_docto: CONSEC_COMPARTIDO, // mismo consecutivo que el CDV
  f430_id_tipo_docto: "PDV",
  f430_rowid_tercero_fact: 2,
};

const TABLA: FilaFake[] = [CDV, PDV_HOMONIMO];

function crearRequestFake() {
  const inputs: Record<string, unknown> = {};
  const request = {
    input(nombre: string, valor: unknown) {
      inputs[nombre] = valor;
      return request;
    },
    async query(sql: string) {
      // Consulta de LÍNEAS (t431) — no relevante para estos casos, se
      // devuelve vacío para no romper leerCotizacionSiesa.
      if (sql.includes("FROM t431_cm_pv_movto")) {
        return { recordset: [] };
      }

      const exigeCdv = /f430_id_tipo_docto\s*=\s*'CDV'/.test(sql);
      let filas = TABLA.filter((f) => f.f430_id_cia === inputs.ciaId);
      if (exigeCdv) {
        filas = filas.filter((f) => f.f430_id_tipo_docto === "CDV");
      }

      if (sql.includes("TOP (@top)")) {
        // buscarCotizacionesSiesa
        const consec = inputs.consec as number;
        if (consec !== -1) {
          filas = filas.filter((f) => f.f430_consec_docto === consec);
        }
      } else {
        // leerCotizacionSiesa (encabezado, por rowid)
        filas = filas.filter((f) => f.f430_rowid === inputs.rowId);
      }

      return {
        recordset: filas.map((f) => ({
          cotizacionIdExterno: f.f430_rowid,
          cotizacionNumero: f.f430_consec_docto,
          clienteRowId: f.f430_rowid_tercero_fact,
          clienteNombre: "Cliente Demo",
          clienteNit: "900123456-1",
          fecha: new Date("2026-09-01"),
          condicionPagoDescripcion: null,
          vendedorNombre: null,
        })),
      };
    },
  };
  return request;
}

const poolFake = {
  request: vi.fn(() => crearRequestFake()),
};

vi.mock("../../config/siesa", () => ({
  getSiesaPool: vi.fn(async () => poolFake),
}));

// eslint-disable-next-line import/first
import { buscarCotizacionesSiesa, leerCotizacionSiesa } from "./siesa-pedidos.service";

describe("siesa-pedidos.service — filtro CDV vs PDV homónimo", () => {
  beforeEach(() => {
    poolFake.request.mockClear();
  });

  it("A. buscarCotizacionesSiesa encuentra el CDV existente por consecutivo", async () => {
    const resultados = await buscarCotizacionesSiesa(CIA_ID, "34147");
    expect(resultados).toHaveLength(1);
    expect(resultados[0].cotizacionIdExterno).toBe(String(CDV.f430_rowid));
    expect(resultados[0].cotizacionNumero).toBe("COT-34147");
  });

  it("A. leerCotizacionSiesa encuentra el CDV existente por f430_rowid", async () => {
    const detalle = await leerCotizacionSiesa(CIA_ID, String(CDV.f430_rowid));
    expect(detalle).not.toBeNull();
    expect(detalle!.cotizacionIdExterno).toBe(String(CDV.f430_rowid));
  });

  it("B. buscarCotizacionesSiesa NO devuelve el PDV homónimo con el mismo consecutivo", async () => {
    const resultados = await buscarCotizacionesSiesa(CIA_ID, "34147");
    expect(resultados.every((r) => r.cotizacionIdExterno !== String(PDV_HOMONIMO.f430_rowid))).toBe(
      true,
    );
    expect(resultados).toHaveLength(1);
  });

  it("C. el f430_rowid retornado corresponde al CDV, no al PDV", async () => {
    const resultados = await buscarCotizacionesSiesa(CIA_ID, "34147");
    expect(resultados[0].cotizacionIdExterno).toBe(String(CDV.f430_rowid));

    // Intentar leer directamente el rowid del PDV homónimo como si fuera una
    // cotización debe fallar (no existe como CDV).
    const comoCdv = await leerCotizacionSiesa(CIA_ID, String(PDV_HOMONIMO.f430_rowid));
    expect(comoCdv).toBeNull();
  });
});
