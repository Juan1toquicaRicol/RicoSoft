import { prisma } from "../../config/prisma";
import type { TipoClasificacion } from "./importaciones-bandeja-clasificacion.service";

/**
 * Comparación contra RequisitoProveedorImportacion (§11 de la
 * especificación) — reutiliza el modelo existente TAL CUAL, sin crear un
 * segundo motor de requisitos. Referencia VIVA (misma decisión que en
 * Fase 5.3/mejora de Importaciones): siempre los requisitos activos
 * VIGENTES del proveedor en el momento de evaluar.
 *
 * V1 NO implementa el workflow de cumplimiento (marcar un requisito como
 * "satisfecho" de forma persistente) — solo determina, para una orden dada,
 * qué requisitos obligatorios activos del proveedor no han sido cubiertos
 * todavía por NINGÚN correo ya clasificado y vinculado a esa orden. La
 * heurística de "cubierto" es intencionalmente simple en V1: la
 * clasificación de un correo (§4) se considera evidencia de que un
 * requisito de tipo DOCUMENTO cuyo nombre coincide por palabra clave con esa
 * clasificación ya llegó (ej. clasificación FACTURA cubre un requisito
 * llamado "Factura comercial"). No es NLP — es exactamente la misma clase de
 * heurística usada para clasificar el propio correo.
 */

const PALABRAS_CLAVE_POR_CLASIFICACION: Partial<Record<TipoClasificacion, string[]>> = {
  FACTURA: ["factura"],
  PACKING_LIST: ["packing", "empaque"],
  CERTIFICADO: ["certificado"],
  BL: ["bl", "conocimiento de embarque"],
  AWB: ["awb", "guia aerea", "guía aérea"],
  COTIZACION: ["cotizacion", "cotización", "quotation"],
  ORDEN_COMPRA: ["orden", "purchase order"],
};

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface EstadoRequisito {
  id: string;
  nombre: string;
  tipo: string;
  obligatorio: boolean;
  cubierto: boolean;
}

/**
 * Devuelve los requisitos activos del proveedor con su estado "cubierto"
 * frente a las clasificaciones YA vistas en los correos vinculados a la
 * orden dada. `clasificacionesVistas` son los `clasificacion` de todos los
 * ImportacionCorreo con `ordenCompraId = ordenId` (se pasa ya resuelto por
 * el llamador para no acoplar este servicio a Prisma más de lo necesario).
 */
export function evaluarRequisitos(
  requisitosActivos: { id: string; nombre: string; tipo: string; obligatorio: boolean }[],
  clasificacionesVistas: TipoClasificacion[],
): EstadoRequisito[] {
  const nombresNormalizados = requisitosActivos.map((r) => normalizar(r.nombre));

  const clasificacionCubreAlgunRequisito = (clasificacion: TipoClasificacion): number[] => {
    const palabras = PALABRAS_CLAVE_POR_CLASIFICACION[clasificacion];
    if (!palabras) return [];
    return nombresNormalizados
      .map((nombre, idx) => (palabras.some((p) => nombre.includes(normalizar(p))) ? idx : -1))
      .filter((idx) => idx >= 0);
  };

  const indicesCubiertos = new Set<number>();
  for (const clasificacion of clasificacionesVistas) {
    for (const idx of clasificacionCubreAlgunRequisito(clasificacion)) {
      indicesCubiertos.add(idx);
    }
  }

  return requisitosActivos.map((r, idx) => ({
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    obligatorio: r.obligatorio,
    cubierto: indicesCubiertos.has(idx),
  }));
}

/** Requisitos obligatorios activos del proveedor que NO están cubiertos —
 * lo que dispara REQUISITO_FALTANTE. */
export function requisitosFaltantes(estados: EstadoRequisito[]): EstadoRequisito[] {
  return estados.filter((e) => e.obligatorio && !e.cubierto);
}

/**
 * Carga los requisitos activos del proveedor + las clasificaciones de los
 * demás correos ya vinculados a la orden, y evalúa. Única función de este
 * archivo que toca Prisma directamente — el resto es lógica pura y
 * testeable sin BD.
 */
export async function evaluarRequisitosDeOrden(
  tenantId: string,
  proveedorId: string,
  ordenCompraId: string,
): Promise<EstadoRequisito[]> {
  const [requisitosActivos, correosDeLaOrden] = await Promise.all([
    prisma.requisitoProveedorImportacion.findMany({
      where: { tenantId, proveedorId, activo: true },
      select: { id: true, nombre: true, tipo: true, obligatorio: true },
      orderBy: { orden: "asc" },
    }),
    prisma.importacionCorreo.findMany({
      where: { tenantId, ordenCompraId },
      select: { clasificacion: true },
    }),
  ]);

  const clasificacionesVistas = correosDeLaOrden
    .map((c) => c.clasificacion)
    .filter((c): c is TipoClasificacion => !!c);

  return evaluarRequisitos(requisitosActivos, clasificacionesVistas);
}
