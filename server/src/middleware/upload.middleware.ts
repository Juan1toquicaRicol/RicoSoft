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

/**
 * Construye el middleware de subida de un solo archivo (PDF/imagen) para un
 * recurso identificado por :id en la URL, guardado en disco bajo
 * uploads/<carpeta>/<id>/. Los archivos no se sirven directamente por
 * Express: solo se acceden vía el endpoint autenticado correspondiente, que
 * valida tenant y permiso antes de leer el archivo del disco.
 */
function crearUploadArchivo(carpeta: string) {
  const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads", carpeta);

  // El id llega en la URL y se usa para nombrar una carpeta en disco: se
  // valida como UUID antes de tocar el filesystem para evitar path
  // traversal (p. ej. id="../../../etc").
  const validarIdParaArchivo = (req: Request, res: Response, next: NextFunction) => {
    if (!UUID_REGEX.test(req.params.id)) {
      return res.status(400).json({ message: "Identificador no válido." });
    }
    next();
  };

  const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
      if (!UUID_REGEX.test(req.params.id)) {
        cb(new Error("Identificador no válido."), "");
        return;
      }
      const dir = path.join(UPLOADS_DIR, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
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
