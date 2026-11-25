import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import {
  UPLOADS_DIR_EMPLEADOS_DOCUMENTOS,
  moverArchivoDefinitivo,
  nombreArchivoUtf8,
} from "../../middleware/upload.middleware";
import { PERMISOS_SISTEMA } from "../../lib/permissions";
import { permisosRequeridos } from "../../lib/catalogo-permisos";
import { normalizarNombreCargo } from "../../lib/cargos";

/**
 * Detalles sensibles del colaborador (EPS, ARL, dirección, teléfonos, núcleo
 * familiar, estudios) y sus soportes privados. Todo se resuelve contra el
 * tenant AUTENTICADO (req.user.tenantId): el colaborador, el estudio, el
 * familiar y el documento se buscan siempre con tenantId + empleadoId de la
 * URL, así que un id de otro tenant responde 404 como uno inexistente (IDOR).
 *
 * Auditoría: solo se registran nombres de campos y tipos de documento, nunca
 * valores (salud/contacto/familia) ni nombres de archivo.
 */

export const TIPOS_DOCUMENTO_EMPLEADO = ["CERTIFICADO_BANCARIO", "SOPORTE_ESTUDIO"] as const;
type TipoDocumentoEmpleado = (typeof TIPOS_DOCUMENTO_EMPLEADO)[number];

const ETIQUETA_TIPO: Record<TipoDocumentoEmpleado, string> = {
  CERTIFICADO_BANCARIO: "certificado bancario",
  SOPORTE_ESTUDIO: "soporte de estudio",
};

const CAMPOS_DETALLE = {
  eps: 150,
  arl: 150,
  fondoPensiones: 150,
  correoPersonal: 255,
  lugarNacimiento: 150,
  ciudadResidencia: 100,
  departamentoResidencia: 100,
  direccion: 255,
  telefonoPrincipal: 30,
  telefonoSecundario: 30,
} as const;
type CampoDetalle = keyof typeof CAMPOS_DETALLE;
const CAMPOS_TELEFONO: CampoDetalle[] = ["telefonoPrincipal", "telefonoSecundario"];
// EPS, ARL y fondo de pensiones se eligen del catálogo del tenant
// (CatalogoSeguridadSocial): campo del detalle -> tipo del catálogo.
const CAMPOS_CATALOGO: Partial<Record<CampoDetalle, "EPS" | "ARL" | "FONDO_PENSIONES">> = {
  eps: "EPS",
  arl: "ARL",
  fondoPensiones: "FONDO_PENSIONES",
};
const ETIQUETA_CAMPO: Partial<Record<CampoDetalle, string>> = {
  eps: "La EPS",
  arl: "La ARL",
  fondoPensiones: "El fondo de pensiones",
};
// Fechas "solo día" (fecha de nacimiento, expedición de la cédula).
const CAMPOS_FECHA = ["fechaNacimiento", "fechaExpedicionDocumento"] as const;
type CampoFecha = (typeof CAMPOS_FECHA)[number];
const ETIQUETA_FECHA: Record<CampoFecha, string> = {
  fechaNacimiento: "La fecha de nacimiento",
  fechaExpedicionDocumento: "La fecha de expedición de la cédula",
};
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" válida, no futura y posterior a 1900; null si vacía. */
function fechaOpcional(
  valor: unknown,
  etiqueta: string,
): { ok: true; valor: Date | null } | { ok: false; message: string } {
  if (valor === null || valor === undefined || valor === "") return { ok: true, valor: null };
  if (typeof valor !== "string" || !FECHA_REGEX.test(valor)) {
    return { ok: false, message: `${etiqueta} no es válida.` };
  }
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    return { ok: false, message: `${etiqueta} no es válida.` };
  }
  if (fecha.getUTCFullYear() < 1900) {
    return { ok: false, message: `${etiqueta} no es válida.` };
  }
  // Tolerancia de un día por la diferencia horaria entre cliente y servidor.
  if (fecha.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return { ok: false, message: `${etiqueta} no puede ser futura.` };
  }
  return { ok: true, valor: fecha };
}

function fechaISO(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
// Ciudades y departamentos de residencia permitidos (lista cerrada definida
// por Gestión Humana). Se compara sin tildes/mayúsculas y se guarda el valor
// canónico de la lista.
export const CIUDADES_RESIDENCIA = ["BOGOTA", "MEDELLIN", "CALI"] as const;
export const DEPARTAMENTOS_RESIDENCIA = ["VALLE DEL CAUCA", "ANTIOQUIA"] as const;
const LISTAS_CERRADAS: Partial<Record<CampoDetalle, readonly string[]>> = {
  ciudadResidencia: CIUDADES_RESIDENCIA,
  departamentoResidencia: DEPARTAMENTOS_RESIDENCIA,
};
const ETIQUETA_LISTA: Partial<Record<CampoDetalle, string>> = {
  ciudadResidencia: "La ciudad de residencia",
  departamentoResidencia: "El departamento",
};
// Formato básico de correo (el correo personal NO se restringe a dominios corporativos).
const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEFONO_REGEX = /^[0-9+\-\s()]{5,30}$/;

function textoOpcional(
  valor: unknown,
  max: number,
  etiqueta: string,
): { ok: true; valor: string | null } | { ok: false; message: string } {
  if (valor === null || valor === undefined) return { ok: true, valor: null };
  if (typeof valor !== "string") return { ok: false, message: `${etiqueta} no es válido.` };
  const limpio = valor.replace(/\s+/g, " ").trim();
  if (!limpio) return { ok: true, valor: null };
  if (limpio.length > max) {
    return { ok: false, message: `${etiqueta} no puede superar ${max} caracteres.` };
  }
  return { ok: true, valor: limpio };
}

function textoRequerido(
  valor: unknown,
  max: number,
  etiqueta: string,
): { ok: true; valor: string } | { ok: false; message: string } {
  const r = textoOpcional(valor, max, etiqueta);
  if (!r.ok) return r;
  if (r.valor === null) return { ok: false, message: `${etiqueta} es obligatorio.` };
  return { ok: true, valor: r.valor };
}

function puedeVerDocumentos(req: AuthenticatedRequest): boolean {
  const u = req.user!;
  return u.isSuperadmin || u.permisos.includes(PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_VER);
}

function borrarArchivoSilencioso(ruta: string | undefined | null) {
  if (!ruta) return;
  fs.unlink(ruta, () => {});
}

/** Ruta absoluta dentro de la carpeta privada, o null si intentara salirse de ella. */
function rutaAbsolutaSegura(rutaRelativa: string): string | null {
  const base = path.resolve(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS);
  const absoluta = path.resolve(base, rutaRelativa);
  return absoluta.startsWith(base + path.sep) ? absoluta : null;
}

/** El colaborador debe existir en el tenant autenticado. */
async function buscarEmpleado(tenantId: string, id: string) {
  return prisma.empleado.findFirst({
    where: { id, tenantId, eliminado: false },
    select: { id: true, nombres: true, apellidos: true },
  });
}

function serializarDocumento(d: {
  id: string;
  tipo: string;
  estudioId: string | null;
  archivoNombre: string;
  archivoMime: string;
  archivoTamano: number;
  createdAt: Date;
}) {
  // Nunca se devuelve archivoRuta.
  return {
    id: d.id,
    tipo: d.tipo,
    estudioId: d.estudioId,
    nombre: d.archivoNombre,
    mime: d.archivoMime,
    tamano: d.archivoTamano,
    createdAt: d.createdAt,
  };
}

export const obtenerDetallesEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const verDocs = puedeVerDocumentos(req);
    const [detalle, familiares, estudios, documentos] = await Promise.all([
      prisma.empleadoDetalle.findFirst({ where: { empleadoId: id, tenantId } }),
      prisma.empleadoFamiliar.findMany({
        where: { empleadoId: id, tenantId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.empleadoEstudio.findMany({
        where: { empleadoId: id, tenantId },
        orderBy: { createdAt: "asc" },
      }),
      verDocs
        ? prisma.empleadoDocumento.findMany({
            where: { empleadoId: id, tenantId },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
    ]);

    return res.json({
      detalle: {
        eps: detalle?.eps ?? null,
        arl: detalle?.arl ?? null,
        fondoPensiones: detalle?.fondoPensiones ?? null,
        correoPersonal: detalle?.correoPersonal ?? null,
        fechaNacimiento: fechaISO(detalle?.fechaNacimiento),
        lugarNacimiento: detalle?.lugarNacimiento ?? null,
        fechaExpedicionDocumento: fechaISO(detalle?.fechaExpedicionDocumento),
        ciudadResidencia: detalle?.ciudadResidencia ?? null,
        departamentoResidencia: detalle?.departamentoResidencia ?? null,
        direccion: detalle?.direccion ?? null,
        telefonoPrincipal: detalle?.telefonoPrincipal ?? null,
        telefonoSecundario: detalle?.telefonoSecundario ?? null,
      },
      familiares: familiares.map((f) => ({ id: f.id, nombre: f.nombre, parentesco: f.parentesco })),
      estudios: estudios.map((e) => ({ id: e.id, titulo: e.titulo, institucion: e.institucion })),
      documentos: documentos.map(serializarDocumento),
      puedeVerDocumentos: verDocs,
    });
  } catch (error) {
    console.error("Error al obtener detalles del colaborador:", error);
    return res.status(500).json({ message: "Error al obtener los detalles del colaborador." });
  }
};

export const guardarDetallesEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const body = req.body ?? {};

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    // Solo se tocan los campos enviados; vacío => null. Todos opcionales.
    const data: Partial<Record<CampoDetalle, string | null>> &
      Partial<Record<CampoFecha, Date | null>> = {};
    for (const campo of Object.keys(CAMPOS_DETALLE) as CampoDetalle[]) {
      if (!(campo in body)) continue;
      const r = textoOpcional(body[campo], CAMPOS_DETALLE[campo], campo);
      if (!r.ok) return res.status(400).json({ message: r.message });
      if (r.valor !== null && CAMPOS_TELEFONO.includes(campo) && !TELEFONO_REGEX.test(r.valor)) {
        return res.status(400).json({ message: "El teléfono no es válido." });
      }
      if (r.valor !== null && campo === "correoPersonal") {
        const correo = r.valor.toLowerCase();
        if (!CORREO_REGEX.test(correo)) {
          return res.status(400).json({ message: "El correo personal no es válido." });
        }
        data[campo] = correo;
        continue;
      }
      const lista = LISTAS_CERRADAS[campo];
      if (r.valor !== null && lista) {
        const canonico = lista.find(
          (v) => normalizarNombreCargo(v) === normalizarNombreCargo(r.valor!),
        );
        if (!canonico) {
          return res.status(400).json({
            message: `${ETIQUETA_LISTA[campo]} debe ser una de: ${lista.join(", ")}.`,
          });
        }
        data[campo] = canonico;
        continue;
      }
      data[campo] = r.valor;
    }
    for (const campo of CAMPOS_FECHA) {
      if (!(campo in body)) continue;
      const r = fechaOpcional(body[campo], ETIQUETA_FECHA[campo]);
      if (!r.ok) return res.status(400).json({ message: r.message });
      data[campo] = r.valor;
    }
    const campos = Object.keys(data);
    if (campos.length === 0) {
      return res.status(400).json({ message: "No hay cambios para aplicar." });
    }

    const actual = await prisma.empleadoDetalle.findFirst({ where: { empleadoId: id, tenantId } });

    // La expedición de la cédula no puede ser anterior al nacimiento (con los
    // valores resultantes, enviados o ya guardados).
    const nacimiento = "fechaNacimiento" in data ? data.fechaNacimiento : actual?.fechaNacimiento;
    const expedicion =
      "fechaExpedicionDocumento" in data
        ? data.fechaExpedicionDocumento
        : actual?.fechaExpedicionDocumento;
    if (nacimiento && expedicion && expedicion.getTime() < nacimiento.getTime()) {
      return res.status(400).json({
        message: "La fecha de expedición de la cédula no puede ser anterior a la de nacimiento.",
      });
    }

    // EPS/ARL/fondo: un valor NUEVO debe existir y estar activo en el catálogo
    // del tenant. Conservar el valor ya guardado (aunque luego se desactive o
    // renombre en el catálogo) no se revalida.
    for (const [campo, tipo] of Object.entries(CAMPOS_CATALOGO) as [
      CampoDetalle,
      "EPS" | "ARL" | "FONDO_PENSIONES",
    ][]) {
      const valor = data[campo];
      if (typeof valor !== "string" || valor === (actual?.[campo as "eps"] ?? null)) continue;
      const enCatalogo = await prisma.catalogoSeguridadSocial.findFirst({
        where: {
          tenantId,
          tipo,
          activo: true,
          nombreNormalizado: normalizarNombreCargo(valor),
        },
        select: { nombre: true },
      });
      if (!enCatalogo) {
        return res.status(400).json({
          message: `${ETIQUETA_CAMPO[campo]} seleccionado no está en el catálogo de Gestión de información.`,
        });
      }
      // Se guarda el nombre canónico del catálogo, no el texto tal cual llegó.
      data[campo] = enCatalogo.nombre;
    }

    await prisma.$transaction(async (tx) => {
      await tx.empleadoDetalle.upsert({
        where: { empleadoId: id },
        create: { tenantId, empleadoId: id, ...data },
        update: data,
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_DETALLES_EDITADOS",
          detalle: `${req.user!.nombre} actualizó los detalles (${campos.join(", ")}) del colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Error al guardar detalles del colaborador:", error);
    return res.status(500).json({ message: "Error al guardar los detalles del colaborador." });
  }
};

export const agregarFamiliar = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const body = req.body ?? {};

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const nombre = textoRequerido(body.nombre, 255, "El nombre del familiar");
    if (!nombre.ok) return res.status(400).json({ message: nombre.message });
    const parentesco = textoRequerido(body.parentesco, 50, "El parentesco");
    if (!parentesco.ok) return res.status(400).json({ message: parentesco.message });

    const familiar = await prisma.$transaction(async (tx) => {
      const creado = await tx.empleadoFamiliar.create({
        data: { tenantId, empleadoId: id, nombre: nombre.valor, parentesco: parentesco.valor },
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_FAMILIAR_AGREGADO",
          detalle: `${req.user!.nombre} agregó un familiar al colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
      return creado;
    });

    return res
      .status(201)
      .json({ id: familiar.id, nombre: familiar.nombre, parentesco: familiar.parentesco });
  } catch (error) {
    console.error("Error al agregar familiar:", error);
    return res.status(500).json({ message: "Error al agregar el familiar." });
  }
};

export const eliminarFamiliar = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, familiarId } = req.params;

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });
    const familiar = await prisma.empleadoFamiliar.findFirst({
      where: { id: familiarId, empleadoId: id, tenantId },
      select: { id: true },
    });
    if (!familiar) return res.status(404).json({ message: "Familiar no encontrado." });

    await prisma.$transaction(async (tx) => {
      await tx.empleadoFamiliar.delete({ where: { id: familiarId } });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_FAMILIAR_ELIMINADO",
          detalle: `${req.user!.nombre} eliminó un familiar del colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
    });

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar familiar:", error);
    return res.status(500).json({ message: "Error al eliminar el familiar." });
  }
};

export const agregarEstudio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const body = req.body ?? {};

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });

    const titulo = textoRequerido(body.titulo, 255, "El título del estudio");
    if (!titulo.ok) return res.status(400).json({ message: titulo.message });
    const institucion = textoOpcional(body.institucion, 255, "La institución");
    if (!institucion.ok) return res.status(400).json({ message: institucion.message });

    const estudio = await prisma.$transaction(async (tx) => {
      const creado = await tx.empleadoEstudio.create({
        data: { tenantId, empleadoId: id, titulo: titulo.valor, institucion: institucion.valor },
      });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_ESTUDIO_AGREGADO",
          detalle: `${req.user!.nombre} agregó un estudio al colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
      return creado;
    });

    return res
      .status(201)
      .json({ id: estudio.id, titulo: estudio.titulo, institucion: estudio.institucion });
  } catch (error) {
    console.error("Error al agregar estudio:", error);
    return res.status(500).json({ message: "Error al agregar el estudio." });
  }
};

export const MENSAJE_ESTUDIO_CON_SOPORTES_SIN_PERMISO =
  "Este estudio tiene soportes adjuntos. Para eliminarlo necesitas también el permiso de gestionar documentos del colaborador.";

/** El estudio tiene soportes y el actor no puede gestionar documentos (D-03):
 * se lanza DENTRO de la transacción para que no se borre nada. */
class EstudioConSoportesSinPermisoError extends Error {}

function puedeGestionarDocumentos(req: AuthenticatedRequest): boolean {
  if (req.user!.isSuperadmin) return true;
  return permisosRequeridos(PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_GESTIONAR).every((p) =>
    req.user!.permisos.includes(p),
  );
}

function textoSoportes(cantidad: number): string {
  if (cantidad === 0) return "";
  return cantidad === 1 ? " y su soporte" : ` y sus ${cantidad} soportes`;
}

/**
 * Elimina un estudio. Decisión D-03 (2026-11-20): sin soportes basta
 * empleados.detalles_editar (ruta); con soportes se exige además
 * empleados.documentos_gestionar, o responde 403 sin borrar nada. La auditoría
 * registra solo la cantidad de soportes borrados, nunca sus nombres.
 */
export const eliminarEstudio = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, estudioId } = req.params;

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });
    const estudio = await prisma.empleadoEstudio.findFirst({
      where: { id: estudioId, empleadoId: id, tenantId },
      select: { id: true },
    });
    if (!estudio) return res.status(404).json({ message: "Estudio no encontrado." });

    // Los soportes del estudio se borran con él (fila + archivo): un soporte
    // sin su estudio no tendría a qué asociarse. Se leen DENTRO de la
    // transacción y se borran por id: si entretanto se sube otro soporte, la FK
    // (NoAction) hace fallar el borrado del estudio y todo se revierte (409),
    // en vez de borrar la fila de un soporte cuyo archivo no se eliminaría.
    // El permiso de documentos se evalúa sobre esa misma lectura (D-03).
    const documentos = await prisma.$transaction(async (tx) => {
      const docs = await tx.empleadoDocumento.findMany({
        where: { estudioId, empleadoId: id, tenantId },
        select: { id: true, archivoRuta: true },
      });
      if (docs.length > 0 && !puedeGestionarDocumentos(req)) {
        throw new EstudioConSoportesSinPermisoError();
      }
      if (docs.length > 0) {
        await tx.empleadoDocumento.deleteMany({
          where: { id: { in: docs.map((d) => d.id) }, tenantId },
        });
      }
      await tx.empleadoEstudio.delete({ where: { id: estudioId } });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_ESTUDIO_ELIMINADO",
          detalle: `${req.user!.nombre} eliminó un estudio${textoSoportes(docs.length)} del colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
      return docs;
    });
    for (const d of documentos) {
      borrarArchivoSilencioso(rutaAbsolutaSegura(d.archivoRuta));
    }

    return res.status(204).send();
  } catch (error) {
    if (error instanceof EstudioConSoportesSinPermisoError) {
      return res.status(403).json({ message: MENSAJE_ESTUDIO_CON_SOPORTES_SIN_PERMISO });
    }
    if ((error as { code?: unknown })?.code === "P2003") {
      return res.status(409).json({
        message: "Se adjuntó un soporte a este estudio mientras se eliminaba. Vuelve a intentarlo.",
      });
    }
    console.error("Error al eliminar estudio:", error);
    return res.status(500).json({ message: "Error al eliminar el estudio." });
  }
};

/**
 * Adjunta un soporte privado. multer (upload.middleware) ya validó tipo/
 * tamaño/magic bytes y dejó el archivo en la carpeta temporal; aquí se valida
 * el tenant y solo después se mueve a la carpeta definitiva. El certificado
 * bancario es único por colaborador (subir otro reemplaza al anterior).
 */
export const subirDocumentoEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  const archivo = (req as Request & { file?: Express.Multer.File }).file;
  // Mientras el archivo siga en la carpeta temporal, cualquier error lo borra.
  let movido = false;
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;
    const { tipo, estudioId } = (req.body ?? {}) as { tipo?: unknown; estudioId?: unknown };

    if (!archivo) return res.status(400).json({ message: "No se recibió ningún archivo." });

    const rechazar = (status: number, message: string) => {
      borrarArchivoSilencioso(archivo.path);
      return res.status(status).json({ message });
    };

    if (
      typeof tipo !== "string" ||
      !(TIPOS_DOCUMENTO_EMPLEADO as readonly string[]).includes(tipo)
    ) {
      return rechazar(400, "El tipo de documento no es válido.");
    }
    const tipoDoc = tipo as TipoDocumentoEmpleado;

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return rechazar(404, "Colaborador no encontrado.");

    let estudioIdValido: string | null = null;
    if (tipoDoc === "SOPORTE_ESTUDIO") {
      if (typeof estudioId !== "string" || !estudioId) {
        return rechazar(400, "Debes indicar el estudio al que corresponde el soporte.");
      }
      const estudio = await prisma.empleadoEstudio.findFirst({
        where: { id: estudioId, empleadoId: id, tenantId },
        select: { id: true },
      });
      if (!estudio) return rechazar(404, "Estudio no encontrado.");
      estudioIdValido = estudio.id;
    } else if (estudioId !== undefined && estudioId !== null && estudioId !== "") {
      return rechazar(400, "El certificado bancario no se asocia a un estudio.");
    }

    const anteriores =
      tipoDoc === "CERTIFICADO_BANCARIO"
        ? await prisma.empleadoDocumento.findMany({
            where: { empleadoId: id, tenantId, tipo: "CERTIFICADO_BANCARIO" },
            select: { id: true, archivoRuta: true },
          })
        : [];

    // Tenant y estudio ya confirmados: recién ahora el archivo entra a su carpeta.
    const archivoRuta = moverArchivoDefinitivo(UPLOADS_DIR_EMPLEADOS_DOCUMENTOS, archivo, id);
    movido = true;
    let creado;
    try {
      creado = await prisma.$transaction(async (tx) => {
        if (anteriores.length > 0) {
          await tx.empleadoDocumento.deleteMany({
            where: { id: { in: anteriores.map((a) => a.id) }, tenantId },
          });
        }
        const doc = await tx.empleadoDocumento.create({
          data: {
            tenantId,
            empleadoId: id,
            tipo: tipoDoc,
            estudioId: estudioIdValido,
            // Reject control characters and path separators from uploaded names.
            // eslint-disable-next-line no-control-regex
            archivoNombre: nombreArchivoUtf8(archivo.originalname).replace(/[\x00-\x1f"\\/]/g, "_"),
            archivoRuta,
            archivoMime: archivo.mimetype,
            archivoTamano: archivo.size,
            subidoPorId: req.user!.id,
          },
        });
        await tx.auditoria.create({
          data: {
            tenantId,
            usuarioId: req.user!.id,
            accion: "EMPLEADO_DOCUMENTO_ADJUNTADO",
            detalle: `${req.user!.nombre} adjuntó un ${ETIQUETA_TIPO[tipoDoc]} al colaborador "${empleado.nombres} ${empleado.apellidos}"`,
            entidadTipo: "Empleado",
            entidadId: id,
          },
        });
        return doc;
      });
    } catch (error) {
      borrarArchivoSilencioso(rutaAbsolutaSegura(archivoRuta));
      throw error;
    }
    for (const a of anteriores) borrarArchivoSilencioso(rutaAbsolutaSegura(a.archivoRuta));

    return res.status(201).json(serializarDocumento(creado));
  } catch (error) {
    // Error inesperado antes de mover (p. ej. la BD al buscar el colaborador):
    // no dejar el soporte (posible certificado bancario) en uploads/_tmp.
    if (archivo && !movido) borrarArchivoSilencioso(archivo.path);
    console.error("Error al subir documento del colaborador:", error);
    return res.status(500).json({ message: "Error al subir el documento." });
  }
};

/**
 * Sirve el soporte SOLO tras validar sesión, permiso y tenant; nunca hay una
 * URL pública ni se expone la ruta del servidor. Se fuerza descarga
 * (attachment) y sin caché/sniffing por tratarse de datos personales.
 */
export const descargarDocumentoEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, documentoId } = req.params;

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });
    const doc = await prisma.empleadoDocumento.findFirst({
      where: { id: documentoId, empleadoId: id, tenantId },
    });
    if (!doc) return res.status(404).json({ message: "Documento no encontrado." });

    const absoluta = rutaAbsolutaSegura(doc.archivoRuta);
    if (!absoluta || !fs.existsSync(absoluta)) {
      return res.status(404).json({ message: "El archivo ya no está disponible en el servidor." });
    }

    // Auditoría ANTES de entregar el archivo: si no se puede registrar, no se entrega.
    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "EMPLEADO_DOCUMENTO_DESCARGADO",
        detalle: `${req.user!.nombre} descargó un ${ETIQUETA_TIPO[doc.tipo as TipoDocumentoEmpleado] ?? "documento"} del colaborador "${empleado.nombres} ${empleado.apellidos}"`,
        entidadTipo: "Empleado",
        entidadId: id,
      },
    });

    res.setHeader("Content-Type", doc.archivoMime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.archivoNombre || "documento")}`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(absoluta);
  } catch (error) {
    console.error("Error al descargar documento del colaborador:", error);
    return res.status(500).json({ message: "Error al obtener el documento." });
  }
};

export const eliminarDocumentoEmpleado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id, documentoId } = req.params;

    const empleado = await buscarEmpleado(tenantId, id);
    if (!empleado) return res.status(404).json({ message: "Colaborador no encontrado." });
    const doc = await prisma.empleadoDocumento.findFirst({
      where: { id: documentoId, empleadoId: id, tenantId },
    });
    if (!doc) return res.status(404).json({ message: "Documento no encontrado." });

    await prisma.$transaction(async (tx) => {
      await tx.empleadoDocumento.delete({ where: { id: documentoId } });
      await tx.auditoria.create({
        data: {
          tenantId,
          usuarioId: req.user!.id,
          accion: "EMPLEADO_DOCUMENTO_ELIMINADO",
          detalle: `${req.user!.nombre} eliminó un ${ETIQUETA_TIPO[doc.tipo as TipoDocumentoEmpleado] ?? "documento"} del colaborador "${empleado.nombres} ${empleado.apellidos}"`,
          entidadTipo: "Empleado",
          entidadId: id,
        },
      });
    });
    borrarArchivoSilencioso(rutaAbsolutaSegura(doc.archivoRuta));

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar documento del colaborador:", error);
    return res.status(500).json({ message: "Error al eliminar el documento." });
  }
};
