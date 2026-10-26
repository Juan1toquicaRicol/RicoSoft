/**
 * Validación de los montos que llegan al liquidar el costeo definitivo de un
 * lote — función pura. Antes se hacía Number(valor ?? 0) sin comprobar nada:
 * un texto no numérico producía NaN y fallaba al guardar con un 500 genérico,
 * y un monto negativo se aceptaba en silencio.
 *
 * Solo rechaza lo que es inválido por definición (no numérico, negativo, TRM o
 * CIF no positivos, IVA descontable mayor al IVA total). No introduce reglas de
 * negocio: la composición del costo y el tratamiento del IVA siguen siendo los
 * de liquidarCosteoImportacion.
 */

export interface MontosLiquidacionEntrada {
  trmLiquidacion: unknown;
  valorCifTotalUsd: unknown;
  arancelTotalCop: unknown;
  ivaTotalCop: unknown;
  ivaDescontableCop?: unknown;
  fletesNacionalesCop?: unknown;
  agenciamientoCop?: unknown;
  otrosCostosCop?: unknown;
}

export interface MontosLiquidacion {
  trmLiquidacion: number;
  valorCifTotalUsd: number;
  arancelTotalCop: number;
  ivaTotalCop: number;
  ivaDescontableCop: number;
  fletesNacionalesCop: number;
  agenciamientoCop: number;
  otrosCostosCop: number;
}

export type ResultadoMontosLiquidacion =
  { ok: true; montos: MontosLiquidacion } | { ok: false; mensaje: string };

function aNumero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === "string" && valor.trim() === "") return Number.NaN;
  return Number(valor);
}

export function validarMontosLiquidacion(
  entrada: MontosLiquidacionEntrada,
): ResultadoMontosLiquidacion {
  const campos: Array<[keyof MontosLiquidacion, string, boolean]> = [
    ["trmLiquidacion", "La TRM de liquidación", true],
    ["valorCifTotalUsd", "El valor CIF total (USD)", true],
    ["arancelTotalCop", "El arancel total", false],
    ["ivaTotalCop", "El IVA total", false],
    ["ivaDescontableCop", "El IVA descontable", false],
    ["fletesNacionalesCop", "Los fletes nacionales", false],
    ["agenciamientoCop", "El agenciamiento", false],
    ["otrosCostosCop", "Los otros costos", false],
  ];

  const montos = {} as MontosLiquidacion;
  for (const [campo, etiqueta, estrictamentePositivo] of campos) {
    const valor = aNumero(entrada[campo]);
    if (!Number.isFinite(valor)) {
      return { ok: false, mensaje: `${etiqueta} debe ser un número válido.` };
    }
    if (estrictamentePositivo ? valor <= 0 : valor < 0) {
      return {
        ok: false,
        mensaje: estrictamentePositivo
          ? `${etiqueta} debe ser mayor a cero.`
          : `${etiqueta} no puede ser negativo.`,
      };
    }
    montos[campo] = valor;
  }

  if (montos.ivaDescontableCop > montos.ivaTotalCop) {
    return { ok: false, mensaje: "El IVA descontable no puede superar el IVA total." };
  }
  return { ok: true, montos };
}
