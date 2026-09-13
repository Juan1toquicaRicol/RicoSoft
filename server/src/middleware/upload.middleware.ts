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
