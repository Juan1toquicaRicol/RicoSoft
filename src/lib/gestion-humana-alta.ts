import { DETALLE_PERSONAL_VACIO, type DetallePersonalForm } from "@/lib/detalle-personal";

// Lógica pura del diálogo "Registrar colaborador" (sin React) para poder probarla:
// detección de cambios pendientes, decisión al cerrar y guardado en dos fases
// (crear colaborador una sola vez + detalles/adjuntos reintentables).

export interface EmpFormAlta {
  empresaId: string;
  documento: string;
  nombres: string;
  apellidos: string;
  correo: string;
  cargoId: string;
  tipoContrato: string;
  area: string;
  fechaContratacion: string;
  salarioActual: number;
}

export interface FamiliarAlta {
  nombre: string;
  parentesco: string;
}

export interface EstudioAlta {
  titulo: string;
  institucion: string;
  archivo?: File;
  /** Presente si el estudio ya se creó en el servidor y solo falta su soporte. */
  estudioId?: string;
}

export interface BorradorDetallesAlta {
  detalle: DetallePersonalForm;
  familiares: FamiliarAlta[];
  estudios: EstudioAlta[];
  certificado: File | null;
}

export const SALARIO_INICIAL_ALTA = 2000000;

/** Valores iniciales del alta (también los de un formulario recién descartado o guardado). */
export function empFormInicial(
  empresaActiva: string,
  areaPorDefecto: string,
  fechaHoyISO: string,
): EmpFormAlta {
  return {
    empresaId: empresaActiva === "ALL" ? "RC" : empresaActiva,
    documento: "",
    nombres: "",
    apellidos: "",
    correo: "",
    cargoId: "",
    tipoContrato: "",
    area: areaPorDefecto,
    fechaContratacion: fechaHoyISO,
    salarioActual: SALARIO_INICIAL_ALTA,
  };
}

export function borradorVacio(): BorradorDetallesAlta {
  return {
    detalle: { ...DETALLE_PERSONAL_VACIO },
    familiares: [],
    estudios: [],
    certificado: null,
  };
}

export interface EntradasCambiosAlta {
  empForm: EmpFormAlta;
  base: EmpFormAlta;
  borrador: BorradorDetallesAlta;
  /** Campos y archivo del "agregar" en curso que todavía no pasaron a las listas. */
  enEdicion: { textos: string[]; archivo: File | null };
}

/** ¿Hay algo escrito, elegido o pendiente que se perdería al cerrar el alta? */
export function hayCambiosPendientesAlta({
  empForm,
  base,
  borrador,
  enEdicion,
}: EntradasCambiosAlta): boolean {
  const claves = Object.keys(base) as (keyof EmpFormAlta)[];
  if (claves.some((k) => String(empForm[k]) !== String(base[k]))) return true;
  if (hayContenidoDetalle(borrador.detalle)) return true;
  if (borrador.familiares.length > 0 || borrador.estudios.length > 0) return true;
  if (borrador.certificado) return true;
  return enEdicion.textos.some((t) => t.trim()) || enEdicion.archivo !== null;
}

export type DecisionCierreAlta = "cerrar" | "confirmar" | "ignorar";

/** Cancelar, X y Escape pasan por aquí: no se cierra mientras se guarda ni se descarta sin confirmar. */
export function resolverCierreAlta(hayCambios: boolean, guardando: boolean): DecisionCierreAlta {
  if (guardando) return "ignorar";
  return hayCambios ? "confirmar" : "cerrar";
}

function hayContenidoDetalle(d: DetallePersonalForm): boolean {
  return Object.values(d).some((v) => v.trim());
}

export interface ApiDetallesAlta {
  guardarDetalle(detalle: DetallePersonalForm): Promise<unknown>;
  agregarFamiliar(familiar: FamiliarAlta): Promise<unknown>;
  crearEstudio(estudio: { titulo: string; institucion: string }): Promise<{ id: string }>;
  subirSoporteEstudio(estudioId: string, archivo: File): Promise<unknown>;
  subirCertificadoBancario(archivo: File): Promise<unknown>;
}

export interface ResultadoDetallesAlta {
  /** Lo que NO se guardó: es el nuevo borrador para reintentar. */
  pendiente: BorradorDetallesAlta;
  guardados: string[];
  fallidos: { etiqueta: string; mensaje: string }[];
}

const mensajeDe = (err: unknown) => (err instanceof Error ? err.message : "error desconocido");

/**
 * Guarda detalles, familiares, estudios y adjuntos de un colaborador YA creado.
 * Cada paso es independiente: lo que se guarda sale del borrador y lo que falla
 * queda en `pendiente`, de modo que reintentar nunca repite lo ya guardado.
 * Los adjuntos solo se suben con `puedeGestionarDocumentos` (igual que antes).
 */
export async function guardarDetallesAlta(
  borrador: BorradorDetallesAlta,
  api: ApiDetallesAlta,
  { puedeGestionarDocumentos }: { puedeGestionarDocumentos: boolean },
): Promise<ResultadoDetallesAlta> {
  const guardados: string[] = [];
  const fallidos: { etiqueta: string; mensaje: string }[] = [];
  const pendiente = borradorVacio();

  const intentar = async (etiqueta: string, accion: () => Promise<unknown>) => {
    try {
      await accion();
      guardados.push(etiqueta);
      return true;
    } catch (err: unknown) {
      fallidos.push({ etiqueta, mensaje: mensajeDe(err) });
      return false;
    }
  };

  if (hayContenidoDetalle(borrador.detalle)) {
    const ok = await intentar("Información personal", () => api.guardarDetalle(borrador.detalle));
    if (!ok) pendiente.detalle = borrador.detalle;
  }

  for (const f of borrador.familiares) {
    const ok = await intentar(`Familiar: ${f.nombre}`, () => api.agregarFamiliar(f));
    if (!ok) pendiente.familiares.push(f);
  }

  for (const est of borrador.estudios) {
    let estudioId = est.estudioId;
    if (!estudioId) {
      const ok = await intentar(`Estudio: ${est.titulo}`, async () => {
        const creado = await api.crearEstudio({ titulo: est.titulo, institucion: est.institucion });
        estudioId = creado.id;
      });
      if (!ok) {
        pendiente.estudios.push(est);
        continue;
      }
    }
    if (est.archivo && puedeGestionarDocumentos && estudioId) {
      const id = estudioId;
      const archivo = est.archivo;
      const ok = await intentar(`Soporte del estudio: ${est.titulo}`, () =>
        api.subirSoporteEstudio(id, archivo),
      );
      if (!ok) pendiente.estudios.push({ ...est, estudioId: id });
    }
  }

  if (borrador.certificado && puedeGestionarDocumentos) {
    const archivo = borrador.certificado;
    const ok = await intentar("Certificado bancario", () => api.subirCertificadoBancario(archivo));
    if (!ok) pendiente.certificado = archivo;
  }

  return { pendiente, guardados, fallidos };
}

export interface ResultadoAlta extends ResultadoDetallesAlta {
  creadoId: string | null;
}

/**
 * Alta en dos fases. La creación del colaborador ocurre solo si aún no existe
 * (`creadoId` nulo); un reintento tras un fallo parcial pasa el `creadoId` ya
 * obtenido y solo repite lo pendiente. Si `crear` falla, el error se propaga y
 * no hay colaborador ni pendientes.
 */
export async function ejecutarAlta({
  creadoId,
  crear,
  borrador,
  crearApi,
  puedeCapturarDetalles,
  puedeGestionarDocumentos,
}: {
  creadoId: string | null;
  crear: () => Promise<{ id: string } | undefined>;
  borrador: BorradorDetallesAlta;
  crearApi: (empleadoId: string) => ApiDetallesAlta;
  puedeCapturarDetalles: boolean;
  puedeGestionarDocumentos: boolean;
}): Promise<ResultadoAlta> {
  let id = creadoId;
  if (!id) {
    const creado = await crear();
    id = creado?.id ?? null;
  }

  const hayBorrador =
    hayContenidoDetalle(borrador.detalle) ||
    borrador.familiares.length > 0 ||
    borrador.estudios.length > 0 ||
    borrador.certificado !== null;

  if (!id || !puedeCapturarDetalles || !hayBorrador) {
    return { creadoId: id, pendiente: borradorVacio(), guardados: [], fallidos: [] };
  }

  const resultado = await guardarDetallesAlta(borrador, crearApi(id), { puedeGestionarDocumentos });
  return { creadoId: id, ...resultado };
}
