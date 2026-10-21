import { DOMINIOS_PERMITIDOS, DOMINIO_POR_EMPRESA, esDominioCorporativoValido } from "./dominios";

/**
 * Normaliza el nombre de un cargo para la unicidad por tenant: sin tildes,
 * en minúsculas y con espacios colapsados. "  Analista  de Nómina " y
 * "analista de nomina" son el mismo cargo. El nombre visible se guarda
 * aparte (solo con trim/colapso de espacios, conservando tildes y mayúsculas).
 */
export function normalizarNombreCargo(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function limpiarNombreCargo(nombre: string): string {
  return nombre.replace(/\s+/g, " ").trim();
}

export type ResultadoCorreoColaborador =
  { ok: true; correo: string | null } | { ok: false; message: string };

/**
 * Regla única del correo del colaborador según su cargo (backend):
 *  - cargo con correoCorporativoRequerido=true (o sin cargo del catálogo,
 *    comportamiento histórico): el correo es obligatorio.
 *  - cargo con correoCorporativoRequerido=false: opcional; vacío => null.
 *  - Si se diligencia, siempre debe ser de un dominio corporativo.
 */
export function validarCorreoColaborador(
  correo: unknown,
  correoRequerido: boolean,
  empresaId?: string | null,
): ResultadoCorreoColaborador {
  const limpio = typeof correo === "string" ? correo.trim().toLowerCase() : "";
  if (!limpio) {
    return correoRequerido
      ? { ok: false, message: "El correo corporativo es obligatorio para este cargo." }
      : { ok: true, correo: null };
  }
  // Con una empresa conocida (RC/FL/GR) solo vale el dominio de ESA empresa.
  const dominioEmpresa = empresaId ? DOMINIO_POR_EMPRESA[empresaId] : undefined;
  if (dominioEmpresa) {
    if (limpio.split("@")[1] !== dominioEmpresa) {
      return {
        ok: false,
        message: `El correo debe ser del dominio de la empresa seleccionada (@${dominioEmpresa}).`,
      };
    }
    return { ok: true, correo: limpio };
  }
  if (!esDominioCorporativoValido(limpio)) {
    return {
      ok: false,
      message: `El correo debe ser corporativo (${DOMINIOS_PERMITIDOS.map((d) => `@${d}`).join(", ")}). No se permiten correos personales.`,
    };
  }
  return { ok: true, correo: limpio };
}
