import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import multer from "multer";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TIPOS_PERMITIDOS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

// M-03 (hardening 2026-09-02): el mimetype de `file.mimetype` es un header
// que declara el cliente (Content-Type del multipart) — no dice nada sobre
// el contenido real del archivo. Se detecta el tipo real leyendo los
// primeros bytes (magic bytes/file signature) del archivo YA escrito en
// disco por multer, y se compara contra lo declarado. Solo cubre los 4
// tipos que este sistema permite (no una librería de detección genérica),
// a propósito: es lo mínimo necesario para cerrar el hallazgo sin agregar
// una dependencia nueva.
export function detectarTipoRealPorMagicBytes(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.toString("latin1", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Lee solo los primeros bytes del archivo (no el archivo completo) — basta
 * para identificar la firma, sin importar cuán grande sea el archivo. */
function leerCabeceraArchivo(rutaArchivo: string, bytes = 16): Buffer {
  const fd = fs.openSync(rutaArchivo, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const leidos = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, leidos);
  } finally {
    fs.closeSync(fd);
  }
}

// Carpeta compartida de subidas temporales: todo archivo aterriza aquí
// primero, ANTES de que el controller confirme que el recurso destino
// pertenece al tenant autenticado. Nunca se escribe directamente en
// uploads/<carpeta>/<id>/ desde multer — eso solo ocurre después de que el
// controller valida tenant/permiso y llama a moverArchivoDefinitivo() (ver
// más abajo). Así, un intento contra un id de otro tenant nunca deja un
// archivo, ni siquiera transitoriamente, dentro de la carpeta real de ese
// recurso.
const UPLOADS_TMP_DIR = path.join(__dirname, "..", "..", "uploads", "_tmp");

/**
 * Mueve un archivo ya recibido en la carpeta temporal a su ubicación
 * definitiva uploads/<carpeta>/<resourceId>/. Debe llamarse únicamente
 * DESPUÉS de que el controller confirmó que `resourceId` pertenece al
 * tenant autenticado — es el único punto donde un archivo entra a la
 * carpeta real de un recurso. Devuelve la ruta relativa a guardar en BD
 * (mismo formato que antes: "<resourceId>/<nombreArchivo>").
 */
export function moverArchivoDefinitivo(
  uploadsDir: string,
  archivo: Express.Multer.File,
  resourceId: string,
): string {
  const dirDefinitivo = path.join(uploadsDir, resourceId);
  fs.mkdirSync(dirDefinitivo, { recursive: true });
  const destino = path.join(dirDefinitivo, archivo.filename);
  fs.renameSync(archivo.path, destino);
  return path.join(resourceId, archivo.filename);
}

/**
 * Construye el middleware de subida de un solo archivo (PDF/imagen) para un
 * recurso identificado por :id en la URL. El archivo se escribe primero en
 * una carpeta temporal compartida (UPLOADS_TMP_DIR), nunca directamente en
 * uploads/<carpeta>/<id>/ — el controller es quien mueve el archivo a su
 * ubicación definitiva, y solo después de validar que el recurso pertenece
 * al tenant autenticado (ver moverArchivoDefinitivo). Los archivos no se
 * sirven directamente por Express: solo se acceden vía el endpoint
 * autenticado correspondiente, que valida tenant y permiso antes de leer el
 * archivo del disco.
 */
function crearUploadArchivo(carpeta: string) {
  const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads", carpeta);

  // El id llega en la URL: se valida como UUID antes de tocar el filesystem
  // para evitar path traversal (p. ej. id="../../../etc") y para rechazar
  // pronto un id claramente inválido, aunque la pertenencia real al tenant
  // solo se confirma más adelante en el controller.
  const validarIdParaArchivo = (req: Request, res: Response, next: NextFunction) => {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(400).json({ message: "Identificador no válido." });
    }
    next();
  };

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOADS_TMP_DIR, { recursive: true });
      cb(null, UPLOADS_TMP_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = TIPOS_PERMITIDOS[file.mimetype] || path.extname(file.originalname) || "";
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  });

  const multerArchivo = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      if (!TIPOS_PERMITIDOS[file.mimetype]) {
        cb(new Error("Solo se permiten archivos PDF, PNG, JPG o WEBP."));
        return;
      }
      cb(null, true);
    },
  }).single("archivo");

  // Envuelve el middleware de multer para que cualquier error (tipo no
  // permitido, archivo > 10MB, id inválido) responda JSON consistente con el
  // resto de la API, en vez de dejar que Express lo trate como error genérico.
  const uploadArchivo = (req: Request, res: Response, next: NextFunction) => {
    multerArchivo(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "Error al procesar el archivo.";
        return res.status(400).json({ message });
      }

      const archivo = (req as Request & { file?: Express.Multer.File }).file;
      if (archivo) {
        const cabecera = leerCabeceraArchivo(archivo.path);
        const tipoReal = detectarTipoRealPorMagicBytes(cabecera);
        if (tipoReal !== archivo.mimetype) {
          fs.unlink(archivo.path, () => {});
          return res.status(400).json({
            message:
              "El contenido del archivo no corresponde al tipo declarado (PDF/PNG/JPG/WEBP). Verifica que el archivo no esté corrupto o renombrado.",
          });
        }
      }

      next();
    });
  };

  return { UPLOADS_DIR, validarIdParaArchivo, uploadArchivo };
}

const facturaArchivo = crearUploadArchivo("facturas");
export const UPLOADS_DIR = facturaArchivo.UPLOADS_DIR;
export const validarFacturaIdParaArchivo = facturaArchivo.validarIdParaArchivo;
export const uploadFacturaArchivo = facturaArchivo.uploadArchivo;

const cotizacionSolicitud = crearUploadArchivo("solicitudes-compra");
export const UPLOADS_DIR_COTIZACIONES = cotizacionSolicitud.UPLOADS_DIR;
export const validarSolicitudIdParaArchivo = cotizacionSolicitud.validarIdParaArchivo;
export const uploadCotizacionSolicitud = cotizacionSolicitud.uploadArchivo;

const comprobantePago = crearUploadArchivo("pagos");
export const UPLOADS_DIR_COMPROBANTES = comprobantePago.UPLOADS_DIR;
export const validarPagoIdParaArchivo = comprobantePago.validarIdParaArchivo;
export const uploadComprobantePago = comprobantePago.uploadArchivo;

// Documento de una cotización de proveedor (una de las 3 recogidas para una
// solicitud de compra antes de aprobarla): :id en la URL es el id de la
// propia SolicitudCompra, no el de la cotización (que todavía no existe
// cuando se sube el archivo; el controlador la crea junto con los metadatos).
const cotizacionProveedor = crearUploadArchivo("cotizaciones-proveedor");
export const UPLOADS_DIR_COTIZACIONES_PROVEEDOR = cotizacionProveedor.UPLOADS_DIR;
export const validarSolicitudIdParaCotizacionProveedor = cotizacionProveedor.validarIdParaArchivo;
export const uploadCotizacionProveedor = cotizacionProveedor.uploadArchivo;

// Documentos del expediente aduanero (DIM/factura comercial/certificado de
// origen): :id en la URL es el loteId, no el id del expediente, para poder
// subir el primer documento antes de que el expediente exista todavía (el
// controlador lo crea vía upsert). Los tres documentos de un mismo lote
// conviven en la misma carpeta sin colisión (multer ya genera un nombre de
// archivo único por subida).
const documentoExpediente = crearUploadArchivo("expedientes-aduaneros");
export const UPLOADS_DIR_EXPEDIENTES = documentoExpediente.UPLOADS_DIR;
export const validarExpedienteIdParaArchivo = documentoExpediente.validarIdParaArchivo;
export const uploadDocumentoExpediente = documentoExpediente.uploadArchivo;

// Documento de un visto bueno aduanero (INVIMA/ICA/etc.): :id es el id del
// propio VistoBuenoAduanero.
const documentoVistoBueno = crearUploadArchivo("vistos-buenos-aduaneros");
export const UPLOADS_DIR_VISTOS_BUENOS = documentoVistoBueno.UPLOADS_DIR;
export const validarVistoBuenoIdParaArchivo = documentoVistoBueno.validarIdParaArchivo;
export const uploadDocumentoVistoBueno = documentoVistoBueno.uploadArchivo;

// Documentos iniciales de una OrdenCompraIntl (Cotización/Proforma Invoice/
// Oferta comercial/Otros): :id en la URL es el id de la propia orden (que
// SÍ ya existe cuando se sube el primer documento — a diferencia del
// patrón de cotizacion-proveedor, aquí no hace falta crear nada al vuelo).
// A diferencia de expedientes/vistos-buenos (un archivo por campo fijo),
// puede haber varios documentos del mismo tipo, así que cada subida crea
// una fila nueva en OrdenCompraIntlDocumento en vez de reemplazar una ruta
// existente (ver controller).
const documentoOrdenCompraIntl = crearUploadArchivo("ordenes-compra-intl");
export const UPLOADS_DIR_ORDENES_COMPRA_INTL = documentoOrdenCompraIntl.UPLOADS_DIR;
export const validarOrdenIdParaArchivo = documentoOrdenCompraIntl.validarIdParaArchivo;
export const uploadDocumentoOrdenCompraIntl = documentoOrdenCompraIntl.uploadArchivo;

// ---------------------------------------------------------------------------
// Adjuntos de Publicaciones (Home): fotos, videos y documentos, varios por
// solicitud. Se mantiene aparte de crearUploadArchivo() porque allí el
// contrato es "un solo PDF/imagen de 10MB"; aquí se aceptan más tipos y un
// tope mayor para video, y cada archivo se valida por su contenido real.
// ---------------------------------------------------------------------------

/**
 * multer (busboy) decodifica el nombre del multipart como latin1: un "Acta
 * años.pdf" llega como "Acta aÃ±os.pdf". Se re-decodifica a UTF-8.
 */
export function nombreArchivoUtf8(nombre: string): string {
  return Buffer.from(nombre, "latin1").toString("utf8").slice(0, 255);
}

export type TipoArchivoPublicacion = "IMAGEN" | "VIDEO" | "DOCUMENTO";

const MIME_OOXML = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const MIME_OLE = [
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
];

const TIPOS_PUBLICACION: Record<string, { ext: string; tipo: TipoArchivoPublicacion }> = {
  "image/png": { ext: ".png", tipo: "IMAGEN" },
  "image/jpeg": { ext: ".jpg", tipo: "IMAGEN" },
  "image/webp": { ext: ".webp", tipo: "IMAGEN" },
  "image/gif": { ext: ".gif", tipo: "IMAGEN" },
  "video/mp4": { ext: ".mp4", tipo: "VIDEO" },
  "video/webm": { ext: ".webm", tipo: "VIDEO" },
  "video/quicktime": { ext: ".mov", tipo: "VIDEO" },
  "application/pdf": { ext: ".pdf", tipo: "DOCUMENTO" },
  "application/msword": { ext: ".doc", tipo: "DOCUMENTO" },
  "application/vnd.ms-excel": { ext: ".xls", tipo: "DOCUMENTO" },
  "application/vnd.ms-powerpoint": { ext: ".ppt", tipo: "DOCUMENTO" },
  [MIME_OOXML[0]]: { ext: ".docx", tipo: "DOCUMENTO" },
  [MIME_OOXML[1]]: { ext: ".xlsx", tipo: "DOCUMENTO" },
  [MIME_OOXML[2]]: { ext: ".pptx", tipo: "DOCUMENTO" },
};

export const MAX_ARCHIVOS_POR_SUBIDA_PUBLICACION = 10;
export const MAX_ARCHIVOS_POR_PUBLICACION = 20;
const MAX_BYTES_VIDEO = 100 * 1024 * 1024;
const MAX_BYTES_OTROS = 25 * 1024 * 1024;

export function tipoArchivoPublicacion(mime: string): TipoArchivoPublicacion | null {
  return TIPOS_PUBLICACION[mime]?.tipo ?? null;
}

/**
 * true si los primeros bytes del archivo son coherentes con el mime que
 * declaró el cliente. Los .docx/.xlsx/.pptx son ZIP (no hay firma propia de
 * cada uno), así que solo se puede confirmar "es un ZIP" para los tres.
 */
export function contenidoCoincideConMime(cabecera: Buffer, mime: string): boolean {
  if (TIPOS_PERMITIDOS[mime]) return detectarTipoRealPorMagicBytes(cabecera) === mime;
  if (mime === "image/gif") {
    const firma = cabecera.toString("latin1", 0, 6);
    return firma === "GIF87a" || firma === "GIF89a";
  }
  if (mime === "video/mp4" || mime === "video/quicktime") {
    return cabecera.length >= 12 && cabecera.toString("latin1", 4, 8) === "ftyp";
  }
  if (mime === "video/webm") {
    return (
      cabecera.length >= 4 &&
      cabecera[0] === 0x1a &&
      cabecera[1] === 0x45 &&
      cabecera[2] === 0xdf &&
      cabecera[3] === 0xa3
    );
  }
  if (MIME_OOXML.includes(mime)) {
    return cabecera.length >= 4 && cabecera[0] === 0x50 && cabecera[1] === 0x4b;
  }
  if (MIME_OLE.includes(mime)) {
    return (
      cabecera.length >= 8 &&
      cabecera[0] === 0xd0 &&
      cabecera[1] === 0xcf &&
      cabecera[2] === 0x11 &&
      cabecera[3] === 0xe0 &&
      cabecera[4] === 0xa1 &&
      cabecera[5] === 0xb1 &&
      cabecera[6] === 0x1a &&
      cabecera[7] === 0xe1
    );
  }
  return false;
}

const PUBLICACIONES_UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads", "publicaciones");
export const UPLOADS_DIR_PUBLICACIONES = PUBLICACIONES_UPLOADS_DIR;

export const validarPublicacionIdParaArchivo = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (
    !UUID_REGEX.test(req.params.id) ||
    (req.params.archivoId && !UUID_REGEX.test(req.params.archivoId))
  ) {
    return res.status(400).json({ message: "Identificador no válido." });
  }
  next();
};

const multerPublicacion = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOADS_TMP_DIR, { recursive: true });
      cb(null, UPLOADS_TMP_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = TIPOS_PUBLICACION[file.mimetype]?.ext ?? "";
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_BYTES_VIDEO, files: MAX_ARCHIVOS_POR_SUBIDA_PUBLICACION },
  fileFilter: (_req, file, cb) => {
    if (!TIPOS_PUBLICACION[file.mimetype]) {
      cb(
        new Error(
          `"${nombreArchivoUtf8(file.originalname)}": tipo no permitido. Usa imágenes (PNG, JPG, WEBP, GIF), videos (MP4, WEBM, MOV) o documentos (PDF, Word, Excel, PowerPoint).`,
        ),
      );
      return;
    }
    cb(null, true);
  },
}).array("archivos", MAX_ARCHIVOS_POR_SUBIDA_PUBLICACION);

function mensajeErrorSubida(err: unknown): string {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE")
      return "Un archivo supera el tamaño máximo permitido (100 MB para video, 25 MB para el resto).";
    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
      return `Solo puedes subir hasta ${MAX_ARCHIVOS_POR_SUBIDA_PUBLICACION} archivos a la vez.`;
    }
  }
  return err instanceof Error ? err.message : "Error al procesar los archivos.";
}

/**
 * Recibe varios archivos (campo "archivos") en la carpeta temporal y valida
 * cada uno (tamaño por tipo + contenido real). Si CUALQUIERA falla, se borran
 * todos los de la solicitud: la subida es todo-o-nada. Igual que
 * crearUploadArchivo, el controller es quien luego los mueve a su carpeta
 * definitiva, y solo después de validar el tenant de la publicación.
 */
export const uploadArchivosPublicacion = (req: Request, res: Response, next: NextFunction) => {
  multerPublicacion(req, res, (err: unknown) => {
    const archivos = ((req as Request & { files?: Express.Multer.File[] }).files ?? []).slice();
    const rechazar = (message: string) => {
      archivos.forEach((a) => fs.unlink(a.path, () => {}));
      return res.status(400).json({ message });
    };

    if (err) return rechazar(mensajeErrorSubida(err));

    for (const archivo of archivos) {
      const esVideo = TIPOS_PUBLICACION[archivo.mimetype]?.tipo === "VIDEO";
      if (!esVideo && archivo.size > MAX_BYTES_OTROS) {
        return rechazar(
          `"${nombreArchivoUtf8(archivo.originalname)}" supera los 25 MB permitidos para fotos y documentos.`,
        );
      }
      if (!contenidoCoincideConMime(leerCabeceraArchivo(archivo.path), archivo.mimetype)) {
        return rechazar(
          `El contenido de "${nombreArchivoUtf8(archivo.originalname)}" no corresponde al tipo declarado. Verifica que no esté corrupto o renombrado.`,
        );
      }
    }

    next();
  });
};
