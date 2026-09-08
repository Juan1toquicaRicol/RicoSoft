import { prisma } from "../../config/prisma";
import {
  buscarItemsSiesa,
  type ItemBusquedaSiesa,
} from "../integraciones-siesa/siesa-inventario.service";

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
  datos: { remitenteEmail: string; nitExtraido?: string; nombreExtraido?: string },
): Promise<ResultadoMatching<ProveedorCandidato>> {
  const seleccionar = { id: true, tenantId: true, nombre: true, nit: true } as const;

  if (datos.nitExtraido) {
    const porNit = await prisma.proveedor.findMany({
      where: { ...whereBase(tenantId), nit: datos.nitExtraido },
      select: seleccionar,
    });
    if (porNit.length > 0) return resolverCandidatos(porNit);
  }

  const remitenteLimpio = datos.remitenteEmail.trim().toLowerCase();
  if (remitenteLimpio) {
    const porEmail = await prisma.proveedor.findMany({
      where: { ...whereBase(tenantId), email: remitenteLimpio },
      select: seleccionar,
    });
    if (porEmail.length > 0) return resolverCandidatos(porEmail);
  }

  const dominio = extraerDominio(datos.remitenteEmail);
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
        numeroOrden: { contains: numeroOrdenProveedor },
      },
      select: seleccionar,
    });
    if (porNumero.length > 0) return resolverCandidatos(porNumero);
  }

  const abiertas = await prisma.ordenCompraIntl.findMany({
    where: { tenantId, proveedorId, eliminado: false, estado: { in: ESTADOS_ORDEN_ABIERTOS } },
    select: seleccionar,
  });
  if (abiertas.length > 0) return resolverCandidatos(abiertas);

  return { tipo: "NINGUNO" };
}

/**
 * Matching de producto (§10) — reutiliza buscarItemsSiesa TAL CUAL, sin
 * duplicar el mecanismo de similitud (LIKE sobre descripción/referencia).
 * A diferencia de proveedor/orden, no se fuerza "único o excepción": el
 * resultado es informativo (candidatos posibles), la excepción
 * PRODUCTO_NO_IDENTIFICADO solo se levanta si la búsqueda no devuelve nada.
 */
export async function buscarProductoCandidatos(
  siesaCiaId: number,
  referenciaODescripcion: string,
): Promise<ItemBusquedaSiesa[]> {
  return buscarItemsSiesa(siesaCiaId, referenciaODescripcion, 5);
}
