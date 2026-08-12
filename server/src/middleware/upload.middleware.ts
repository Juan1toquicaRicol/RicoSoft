import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import multer from "multer";

// Los archivos se guardan en disco local, fuera del control de versiones
// (ver .gitignore). No se sirven directamente por Express: solo se acceden
// vía el endpoint autenticado GET /facturas/:id/archivo, que valida tenant
// y permiso antes de leer el archivo del disco.
export const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads", "facturas");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// El id de factura llega en la URL y se usa para nombrar una carpeta en
// disco: se valida como UUID antes de tocar el filesystem para evitar path
// traversal (p. ej. id="../../../etc").
export const validarFacturaIdParaArchivo = (req: Request, res: Response, next: NextFunction) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ message: "Identificador de factura no válido." });
  }
  next();
};

const TIPOS_PERMITIDOS: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    if (!UUID_REGEX.test(req.params.id)) {
      cb(new Error("Identificador de factura no válido."), "");
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

const multerFacturaArchivo = multer({
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
export const uploadFacturaArchivo = (req: Request, res: Response, next: NextFunction) => {
  multerFacturaArchivo(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Error al procesar el archivo.";
      return res.status(400).json({ message });
    }
    next();
  });
};
