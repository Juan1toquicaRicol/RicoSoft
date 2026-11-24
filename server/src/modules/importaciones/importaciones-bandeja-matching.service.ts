import { prisma } from "../../config/prisma";

/**
 * Matching de la Bandeja Inteligente (§8/§9/§10 de la especificación).
 * Regla común a los tres: si hay UN único candidato con evidencia
 * suficiente, "automático"; si hay varios o ninguno, excepción — nunca se
 * elige arbitrariamente (mismo principio ya aplicado en Fase 5.3 al
 * resolver un requisito ambiguo por nombre). NUNCA crea Proveedor,
 * OrdenCompraIntl ni un ítem de Siesa — todo matching es de solo lectura
 * contra catálogos existentes.
 */

export type ResultadoMatching<T> =
  { tipo: "UNICO"; valor: T } | { tipo: "AMBIGUO"; candidatos: T[] } | { tipo: "NINGUNO" };

/** El encabezado From de Gmail suele venir como `Nombre <correo@dominio>`:
 * para comparar contra Proveedor.email exacto hay que quedarse solo con la
 * dirección. */
export function extraerEmail(remitente: string): string {
  const conAngulares = remitente.match(/<([^<>\s]+@[^<>\s]+)>/);
  return (conAngulares ? conAngulares[1] : remitente).trim().toLowerCase();
}

function extraerDominio(email: string): string | null {
  const match = email.match(/@([^\s>]+)/);
  return match ? match[1].toLowerCase() : null;
}

// Rango Unicode de marcas diacríticas combinantes (U+0300-U+036F) — quita
// tildes tras normalizar a NFD, para que "Compañía" y "Compania" comparen
// igual.
const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ProveedorCandidato {
  id: string;
  tenantId: string;
  nombre: string;
  nit: string;
}

/** Construye el `where` base, incluyendo tenantId SOLO si se dio uno
 * concreto — nunca por omisión implícita de `undefined` en Prisma. */
function whereBase(tenantId: string | null) {
  return tenantId ? { tenantId, activo: true } : { activo: true };
}

/**
 * Identifica el Proveedor real a partir de las señales disponibles en el
 * correo (§8): NIT extraído > email exacto del remitente > dominio del
 * remitente > nombre normalizado. Se detiene en la primera señal que
 * produzca al menos un candidato — no se combinan señales de distinta
 * fuerza en una sola consulta (evita que un nombre parecido "gane" sobre un
 * NIT exacto de otro proveedor).
 *
 * `tenantId`: cuando ya se conoce (ej. una búsqueda futura dentro de un
 * tenant concreto), se pasa explícito y acota la búsqueda. `null` significa
 * "buscar en TODOS los tenants" — uso exclusivo y deliberado del job de
 * procesamiento de la Bandeja, que corre ANTES de que el tenant se conozca
 * (ver comentario en schema.prisma sobre ImportacionCorreo.tenantId). Nunca
 * se debe pasar null desde un endpoint HTTP autenticado de un tenant.
 */
export async function identificarProveedor(
  tenantId: string | null,
  datos: {
    remitenteEmail: string;
    nitExtraido?: string;
    nombreExtraido?: string;
    soloCorreoExacto?: boolean;
  },
): Promise<ResultadoMatching<ProveedorCandidato>> {
  const seleccionar = { id: true, tenantId: true, nombre: true, nit: true } as const;

  if (datos.nitExtraido) {
    const porNit = await prisma.proveedor.findMany({
      where: { ...whereBase(tenantId), nit: datos.nitExtraido },
      select: seleccionar,
    });
    if (porNit.length > 0) return resolverCandidatos(porNit);
  }

  const remitenteLimpio = extraerEmail(datos.remitenteEmail);
  if (remitenteLimpio) {
    const porEmail = await prisma.proveedor.findMany({
      where: { ...whereBase(tenantId), email: remitenteLimpio },
      select: seleccionar,
    });
    if (porEmail.length > 0) return resolverCandidatos(porEmail);
  }

  if (datos.soloCorreoExacto) return { tipo: "NINGUNO" };

  const dominio = extraerDominio(remitenteLimpio);
  if (dominio) {
    const candidatosConEmail = await prisma.proveedor.findMany({
      where: { ...whereBase(tenantId), email: { not: null } },
      select: { ...seleccionar, email: true },
    });
    const porDominio = candidatosConEmail.filter(
      (p) => p.email && extraerDominio(p.email) === dominio,
    );
    if (porDominio.length > 0) return resolverCandidatos(porDominio);
  }

  if (datos.nombreExtraido) {
    const objetivo = normalizarNombre(datos.nombreExtraido);
    const todos = await prisma.proveedor.findMany({
      where: whereBase(tenantId),
      select: seleccionar,
    });
    const porNombre = todos.filter((p) => normalizarNombre(p.nombre) === objetivo);
    if (porNombre.length > 0) return resolverCandidatos(porNombre);
  }

  return { tipo: "NINGUNO" };
}

function resolverCandidatos<T>(candidatos: T[]): ResultadoMatching<T> {
  if (candidatos.length === 1) return { tipo: "UNICO", valor: candidatos[0] };
  return { tipo: "AMBIGUO", candidatos };
}

type CampoProveedor = { campo: string; valor: string };

export type TipoSeñalProveedor =
  "NIT_EXACTO" | "CORREO_EXACTO" | "DOMINIO" | "NOMBRE_EXACTO" | "NOMBRE_PARECIDO" | "NIT_DISTINTO";

export interface SeñalProveedor {
  tipo: TipoSeñalProveedor;
  campo: string;
  detalle: string;
}

export interface SugerenciaProveedor {
  id: string;
  tenantId: string;
  nombre: string;
  señales: SeñalProveedor[];
}

/** Señales del documento que, por sí solas, identifican a un proveedor. */
const SEÑALES_FUERTES_DEL_DOCUMENTO: ReadonlySet<TipoSeñalProveedor> = new Set([
  "NIT_EXACTO",
  "NOMBRE_EXACTO",
]);

/**
 * Indica si el documento contradice al proveedor identificado por el correo
 * exacto del remitente. Hay conflicto cuando su NIT difiere del registrado o
 * cuando el NIT o la razón social exactos del documento corresponden a otro
 * proveedor y no a ese. Solo compara proveedores de la empresa del remitente:
 * un registro de otra empresa, aunque sea el mismo proveedor, no bloquea.
 * Función pura.
 */
export function hayConflictoIdentidadProveedor(
  remitente: { id: string; tenantId: string },
  sugerencias: readonly Pick<SugerenciaProveedor, "id" | "tenantId" | "señales">[],
): boolean {
  const mismaEmpresa = sugerencias.filter((s) => s.tenantId === remitente.tenantId);
  const tieneSeñalFuerte = (s: Pick<SugerenciaProveedor, "señales">) =>
    s.señales.some((señal) => SEÑALES_FUERTES_DEL_DOCUMENTO.has(señal.tipo));
  const propio = mismaEmpresa.find((s) => s.id === remitente.id);
  if (propio?.señales.some((señal) => señal.tipo === "NIT_DISTINTO")) return true;
  if (propio && tieneSeñalFuerte(propio)) return false;
  return mismaEmpresa.some((s) => s.id !== remitente.id && tieneSeñalFuerte(s));
}

const TERMINOS_GENERALES = new Set([
  "sas",
  "ltda",
  "company",
  "joint",
  "stock",
  "limited",
  "corp",
  "corporation",
  "inc",
  "the",
  "del",
  "and",
]);
const palabrasDistintivas = (nombre: string) =>
  new Set(
    normalizarNombre(nombre)
      .split(" ")
      .filter((p) => p.length >= 3 && !TERMINOS_GENERALES.has(p)),
  );
const normalizarIdentificador = (valor: string) => valor.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function sugerirProveedores(
  tenantId: string | null,
  datos: { remitenteEmail: string; campos: CampoProveedor[] },
): Promise<SugerenciaProveedor[]> {
  const email = extraerEmail(datos.remitenteEmail);
  const dominio = extraerDominio(email);
  const nombres = datos.campos
    .filter((x) => x.campo === "nombreProveedor")
    .map((x) => ({
      texto: normalizarNombre(x.valor),
      palabras: palabrasDistintivas(x.valor),
    }));
  const identificadores = new Set(
    datos.campos
      .filter((x) => x.campo === "nitProveedor")
      .map((x) => normalizarIdentificador(x.valor))
      .filter((x) => x.length >= 5),
  );
  if (!dominio && !nombres.length && !identificadores.size) return [];

  const proveedores = await prisma.proveedor.findMany({
    where: {
      ...whereBase(tenantId),
      ...(!nombres.length && !identificadores.size ? { email: { not: null } } : {}),
    },
    select: { id: true, tenantId: true, nombre: true, nit: true, email: true },
  });

  return proveedores
    .flatMap((p) => {
      const señales: SeñalProveedor[] = [];
      let peso = 0;
      const nit = normalizarIdentificador(p.nit);
      if (identificadores.has(nit)) {
        peso += 100;
        señales.push({
          tipo: "NIT_EXACTO",
          campo: "Identificador fiscal",
          detalle: "Coincide con el identificador del documento",
        });
      }
      const emailRegistrado = p.email ? extraerEmail(p.email) : null;
      if (email && email === emailRegistrado) {
        peso += 90;
        señales.push({
          tipo: "CORREO_EXACTO",
          campo: "Remitente",
          detalle: "Coincide con el correo registrado",
        });
      } else if (dominio && emailRegistrado && dominio === extraerDominio(emailRegistrado)) {
        peso += 20;
        señales.push({ tipo: "DOMINIO", campo: "Dominio", detalle: dominio });
      }
      const nombre = normalizarNombre(p.nombre);
      const palabras = palabrasDistintivas(p.nombre);
      const exacto = nombres.some((d) => d.texto === nombre);
      const parecido =
        palabras.size >= 2 &&
        nombres.some((d) => {
          const coincidencias = [...palabras].filter((palabra) => d.palabras.has(palabra)).length;
          return (
            coincidencias >= 2 && coincidencias / Math.max(palabras.size, d.palabras.size) >= 0.7
          );
        });
      if (exacto || parecido) {
        peso += exacto ? 40 : 25;
        señales.push({
          tipo: exacto ? "NOMBRE_EXACTO" : "NOMBRE_PARECIDO",
          campo: "Razón social",
          detalle: exacto
            ? "Coincide con el nombre del documento"
            : "Nombre parecido al del documento",
        });
      }
      if (!peso) return [];
      if (nit && identificadores.size > 0 && !identificadores.has(nit)) {
        señales.push({
          tipo: "NIT_DISTINTO",
          campo: "Identificador fiscal",
          detalle: "El identificador del documento difiere del registrado",
        });
      }
      return [{ id: p.id, tenantId: p.tenantId, nombre: p.nombre, peso, señales }];
    })
    .sort(
      (a, b) =>
        b.peso - a.peso || a.nombre.localeCompare(b.nombre, "es") || a.id.localeCompare(b.id),
    )
    .slice(0, 5)
    .map(({ peso: _peso, ...sugerencia }) => sugerencia);
}

export interface OrdenCandidata {
  id: string;
  numeroOrden: string;
  estado: string;
}

const ESTADOS_ORDEN_ABIERTOS = ["Borrador", "Confirmada"];

/**
 * Identifica la OrdenCompraIntl relacionada (§9), ya con el proveedor
 * resuelto. Prioriza coincidencia exacta/parcial del número de orden del
 * proveedor (PO extraído del documento) contra numeroOrden; si no se
 * extrajo ningún PO, cae a "¿tiene este proveedor exactamente UNA orden
 * abierta?" como señal de contexto — nunca asocia a una orden Cerrada o
 * Anulada sin que el PO coincida explícitamente.
 */
export async function identificarOrden(
  tenantId: string,
  proveedorId: string,
  numeroOrdenProveedor: string | undefined,
): Promise<ResultadoMatching<OrdenCandidata>> {
  const seleccionar = { id: true, numeroOrden: true, estado: true } as const;

  if (numeroOrdenProveedor) {
    const porNumero = await prisma.ordenCompraIntl.findMany({
      where: {
        tenantId,
        proveedorId,
        eliminado: false,
        estado: { not: "Anulada" },
        numeroOrden: { contains: numeroOrdenProveedor },
      },
      select: seleccionar,
    });
    const referencia = numeroOrdenProveedor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patron = new RegExp("(^|[^A-Za-z0-9])" + referencia + "(?=[^A-Za-z0-9]|$)", "i");
    const coincidencias = porNumero.filter((orden) => patron.test(orden.numeroOrden));
    return coincidencias.length ? resolverCandidatos(coincidencias) : { tipo: "NINGUNO" };
  }

  const abiertas = await prisma.ordenCompraIntl.findMany({
    where: { tenantId, proveedorId, eliminado: false, estado: { in: ESTADOS_ORDEN_ABIERTOS } },
    select: seleccionar,
  });
  if (abiertas.length > 0) return resolverCandidatos(abiertas);

  return { tipo: "NINGUNO" };
}
