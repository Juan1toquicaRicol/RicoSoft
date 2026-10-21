import {
  DOMINIOS_PERMITIDOS,
  DOMINIO_POR_EMPRESA,
  esDominioCorporativoValido,
} from "@/lib/dominios";

export interface CargoOpcion {
  id: string;
  nombre: string;
  correoCorporativoRequerido: boolean;
}

/**
 * ¿El correo corporativo es obligatorio para el cargo elegido? Sin cargo del
 * catálogo se conserva la regla histórica (obligatorio). Es solo la ayuda de
 * la UI: el backend (server/src/lib/cargos.ts) es quien la impone.
 */
export function correoRequeridoParaCargo(
  cargos: CargoOpcion[],
  cargoId: string | null | undefined,
): boolean {
  if (!cargoId) return true;
  const cargo = cargos.find((c) => c.id === cargoId);
  return cargo ? cargo.correoCorporativoRequerido : true;
}

/** Mismas reglas y mensajes que validarCorreoColaborador del backend. */
export function validarCorreoColaborador(
  correo: string,
  correoRequerido: boolean,
  empresaId?: string | null,
): { ok: true; correo: string } | { ok: false; message: string } {
  const limpio = correo.trim().toLowerCase();
  if (!limpio) {
    return correoRequerido
      ? { ok: false, message: "El correo corporativo es obligatorio para este cargo." }
      : { ok: true, correo: "" };
  }
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
