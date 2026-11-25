import { prisma } from "../../config/prisma";
import type { BuzonImportaciones } from "@prisma/client";
import { GoogleWorkspaceEmailProvider } from "../../integrations/email/google-workspace-email-provider";
import type { EmailProvider } from "../../integrations/email/email-provider";
import {
  puedeActivar,
  puedeAprobar,
  puedeConsultarGmail,
  puedeElegirEtiqueta,
  puedePausar,
  validarDireccionBuzon,
  validarLimitesBuzon,
  LIMITES_BUZON,
  type EstadoBuzon,
} from "./buzones-importaciones.reglas";

/**
 * Servicio de buzones de la Bandeja. Los buzones pertenecen al tenant guardado
 * en cada fila (Ricol), nunca al tenant que envía la petición. Quien opera es
 * Sistemas (permiso + operadorBandeja en el router); aquí se verifica además
 * que el buzón sea del tenant del operador antes de tocarlo.
 */

export interface ActorBuzon {
  id: string;
  tenantId: string;
}

export type ErrorBuzon =
  | { codigo: "NO_ENCONTRADO"; mensaje: string }
  | { codigo: "VALIDACION"; mensaje: string }
  | { codigo: "CONFLICTO"; mensaje: string }
  | { codigo: "ESTADO_INVALIDO"; mensaje: string }
  | { codigo: "GMAIL_NO_DISPONIBLE"; mensaje: string }
  | { codigo: "ETIQUETA_INVALIDA"; mensaje: string };

export type ResultadoBuzon = { ok: true; buzon: BuzonImportaciones } | { ok: false; error: ErrorBuzon };

/** Proveedor de un buzón: la interfaz de lectura más, opcionalmente, listar etiquetas. */
export type ProveedorBuzon = EmailProvider & {
  probarConexion?: () => Promise<{ id: string; nombre: string }[]>;
};

/** Fábrica del proveedor de Gmail por buzón. En tests se reemplaza por un falso. */
let fabricaProveedor: (direccion: string) => ProveedorBuzon = (direccion) =>
  new GoogleWorkspaceEmailProvider(direccion);

export function proveedorParaBuzon(direccion: string): ProveedorBuzon {
  return fabricaProveedor(direccion);
}

/** Solo para tests: reemplaza la fábrica de proveedores de Gmail. */
export function _establecerFabricaProveedorParaTests(
  fabrica: ((direccion: string) => ProveedorBuzon) | null,
): void {
  fabricaProveedor = fabrica ?? ((direccion) => new GoogleWorkspaceEmailProvider(direccion));
}

/** Solo buzones de este tenant. Devuelve null si no existe o es de otro tenant. */
export async function obtenerBuzonDelTenant(
  buzonId: string,
  tenantId: string,
): Promise<BuzonImportaciones | null> {
  return prisma.buzonImportaciones.findFirst({ where: { id: buzonId, tenantId } });
}

export function filtroResponsableBuzon(tenantId: string) {
  return {
    activo: true,
    OR: [{ tenantId }, { membresias: { some: { tenantId, activo: true } } }],
  };
}

/** El responsable debe estar activo y pertenecer al tenant del buzón. */
export async function responsableValido(tenantId: string, usuarioId: string): Promise<boolean> {
  const usuario = await prisma.user.findFirst({
    where: { id: usuarioId, ...filtroResponsableBuzon(tenantId) },
    select: { id: true },
  });
  return Boolean(usuario);
}

function errorEstado(mensaje: string): ErrorBuzon {
  return { codigo: "ESTADO_INVALIDO", mensaje };
}

export async function registrarBuzon(
  actor: ActorBuzon,
  datos: {
    direccion: string;
    responsableUsuarioId?: string | null;
    correosPorCiclo?: number;
    adjuntosPorCiclo?: number;
    timeoutSegundos?: number;
  },
): Promise<ResultadoBuzon> {
  const direccion = validarDireccionBuzon(datos.direccion);
  if (!direccion.ok || !direccion.direccion) {
    return { ok: false, error: { codigo: "VALIDACION", mensaje: direccion.mensaje ?? "Dirección inválida." } };
  }
  const limites = {
    correosPorCiclo: datos.correosPorCiclo ?? LIMITES_BUZON.correosPorCiclo.defecto,
    adjuntosPorCiclo: datos.adjuntosPorCiclo ?? LIMITES_BUZON.adjuntosPorCiclo.defecto,
    timeoutSegundos: datos.timeoutSegundos ?? LIMITES_BUZON.timeoutSegundos.defecto,
  };
  const validacionLimites = validarLimitesBuzon(limites);
  if (!validacionLimites.ok) {
    return { ok: false, error: { codigo: "VALIDACION", mensaje: validacionLimites.mensaje! } };
  }
  if (datos.responsableUsuarioId && !(await responsableValido(actor.tenantId, datos.responsableUsuarioId))) {
    return {
      ok: false,
      error: { codigo: "VALIDACION", mensaje: "El responsable debe estar activo y pertenecer a la empresa del buzón." },
    };
  }
  const existente = await prisma.buzonImportaciones.findUnique({ where: { direccion: direccion.direccion } });
  if (existente) {
    return { ok: false, error: { codigo: "CONFLICTO", mensaje: "Ese buzón ya está registrado." } };
  }

  const buzon = await prisma.$transaction(async (tx) => {
    const creado = await tx.buzonImportaciones.create({
      data: {
        direccion: direccion.direccion!,
        tenantId: actor.tenantId,
        responsableUsuarioId: datos.responsableUsuarioId ?? null,
        registradoPorId: actor.id,
        estado: "REGISTRADO",
        ...limites,
      },
    });
    await tx.auditoria.create({
      data: {
        tenantId: actor.tenantId,
        usuarioId: actor.id,
        accion: "IMPORTACION_BUZON_REGISTRADO",
        detalle: `Buzón registrado: ${creado.direccion}`,
        datosNuevos: JSON.stringify({ buzonId: creado.id, direccion: creado.direccion }),
      },
    });
    return creado;
  });
  return { ok: true, buzon };
}

async function cambiarEstado(
  buzon: BuzonImportaciones,
  actor: ActorBuzon,
  destino: EstadoBuzon,
  datos: Partial<Pick<BuzonImportaciones, "aprobadoPorId" | "etiquetaId" | "etiquetaNombre">>,
  accion: string,
): Promise<ResultadoBuzon> {
  const actualizado = await prisma.$transaction(async (tx) => {
    const cambio = await tx.buzonImportaciones.updateMany({
      where: { id: buzon.id, tenantId: actor.tenantId, estado: buzon.estado, etiquetaId: buzon.etiquetaId },
      data: { estado: destino, ...datos },
    });
    if (!cambio.count) return null;
    const fila = await tx.buzonImportaciones.findUniqueOrThrow({ where: { id: buzon.id } });
    await tx.auditoria.create({
      data: {
        tenantId: actor.tenantId,
        usuarioId: actor.id,
        accion,
        detalle: `Buzón ${buzon.direccion}: ${buzon.estado} → ${destino}`,
        datosNuevos: JSON.stringify({ buzonId: buzon.id, estado: destino }),
      },
    });
    return fila;
  });
  return actualizado
    ? { ok: true, buzon: actualizado }
    : { ok: false, error: { codigo: "CONFLICTO", mensaje: "El buzón cambió. Actualiza su estado." } };
}

export async function aprobarBuzon(buzon: BuzonImportaciones, actor: ActorBuzon): Promise<ResultadoBuzon> {
  if (!puedeAprobar(buzon.estado as EstadoBuzon)) {
    return { ok: false, error: errorEstado("Solo se aprueban buzones registrados.") };
  }
  return cambiarEstado(buzon, actor, "APROBADO", { aprobadoPorId: actor.id }, "IMPORTACION_BUZON_APROBADO");
}

/** Consulta Gmail para este buzón. Solo tras la aprobación de Sistemas. */
export async function probarConexionBuzon(
  buzon: BuzonImportaciones,
): Promise<{ ok: true; etiquetas: { id: string; nombre: string }[] } | { ok: false; error: ErrorBuzon }> {
  if (!puedeConsultarGmail(buzon.estado as EstadoBuzon)) {
    return { ok: false, error: errorEstado("El buzón debe estar aprobado antes de probar la conexión.") };
  }
  try {
    const proveedor = proveedorParaBuzon(buzon.direccion);
    if (!proveedor.probarConexion) throw new Error("El proveedor no permite listar etiquetas.");
    const etiquetas = await proveedor.probarConexion();
    return { ok: true, etiquetas };
  } catch {
    return {
      ok: false,
      error: { codigo: "GMAIL_NO_DISPONIBLE", mensaje: "No se pudo verificar el buzón en Gmail." },
    };
  }
}

export async function elegirEtiquetaBuzon(
  buzon: BuzonImportaciones,
  actor: ActorBuzon,
  etiquetaId: string,
): Promise<ResultadoBuzon> {
  if (!puedeElegirEtiqueta(buzon.estado as EstadoBuzon)) {
    return { ok: false, error: errorEstado("El buzón debe estar aprobado para elegir etiqueta.") };
  }
  if (buzon.estado === "ACTIVO") {
    return { ok: false, error: errorEstado("Pausa el buzón antes de cambiar su etiqueta.") };
  }
  const conexion = await probarConexionBuzon(buzon);
  if (!conexion.ok) return conexion;
  const etiqueta = conexion.etiquetas.find((e) => e.id === etiquetaId);
  if (!etiqueta) {
    return { ok: false, error: { codigo: "ETIQUETA_INVALIDA", mensaje: "Selecciona una etiqueta existente del buzón." } };
  }
  const actualizado = await prisma.$transaction(async (tx) => {
    const cambio = await tx.buzonImportaciones.updateMany({
      where: { id: buzon.id, tenantId: actor.tenantId, estado: buzon.estado, etiquetaId: buzon.etiquetaId },
      data: { etiquetaId: etiqueta.id, etiquetaNombre: etiqueta.nombre },
    });
    if (!cambio.count) return null;
    const fila = await tx.buzonImportaciones.findUniqueOrThrow({ where: { id: buzon.id } });
    await tx.auditoria.create({
      data: {
        tenantId: actor.tenantId,
        usuarioId: actor.id,
        accion: "IMPORTACION_BUZON_ETIQUETA_ELEGIDA",
        detalle: `Buzón ${buzon.direccion}: etiqueta "${etiqueta.nombre}"`,
        datosNuevos: JSON.stringify({ buzonId: buzon.id, etiquetaId: etiqueta.id }),
      },
    });
    return fila;
  });
  return actualizado
    ? { ok: true, buzon: actualizado }
    : { ok: false, error: { codigo: "CONFLICTO", mensaje: "El buzón cambió. Actualiza su estado." } };
}

export async function activarBuzon(buzon: BuzonImportaciones, actor: ActorBuzon): Promise<ResultadoBuzon> {
  if (!puedeActivar(buzon.estado as EstadoBuzon, buzon.etiquetaId)) {
    return {
      ok: false,
      error: errorEstado("Para activar, el buzón debe estar aprobado y tener una etiqueta elegida."),
    };
  }
  return cambiarEstado(buzon, actor, "ACTIVO", {}, "IMPORTACION_BUZON_ACTIVADO");
}

export async function pausarBuzon(buzon: BuzonImportaciones, actor: ActorBuzon): Promise<ResultadoBuzon> {
  if (!puedePausar(buzon.estado as EstadoBuzon)) {
    return { ok: false, error: errorEstado("Solo se pausan buzones activos.") };
  }
  return cambiarEstado(buzon, actor, "PAUSADO", {}, "IMPORTACION_BUZON_PAUSADO");
}

export async function cambiarResponsableBuzon(
  buzon: BuzonImportaciones,
  actor: ActorBuzon,
  usuarioId: string | null,
): Promise<ResultadoBuzon> {
  if (usuarioId && !(await responsableValido(actor.tenantId, usuarioId))) {
    return {
      ok: false,
      error: { codigo: "VALIDACION", mensaje: "El responsable debe estar activo y pertenecer a la empresa del buzón." },
    };
  }
  const actualizado = await prisma.$transaction(async (tx) => {
    const fila = await tx.buzonImportaciones.update({
      where: { id: buzon.id },
      data: { responsableUsuarioId: usuarioId },
    });
    await tx.auditoria.create({
      data: {
        tenantId: actor.tenantId,
        usuarioId: actor.id,
        accion: "IMPORTACION_BUZON_RESPONSABLE_CAMBIADO",
        detalle: `Buzón ${buzon.direccion}: responsable actualizado`,
        datosNuevos: JSON.stringify({ buzonId: buzon.id, responsableUsuarioId: usuarioId }),
      },
    });
    return fila;
  });
  return { ok: true, buzon: actualizado };
}
