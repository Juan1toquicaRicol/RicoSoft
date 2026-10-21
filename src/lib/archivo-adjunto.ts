const MAX_BYTES = 10 * 1024 * 1024;
const TIPOS_ACEPTADOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

/** Validación rápida en el cliente; el servidor valida de nuevo tipo real y tamaño. */
export function validarArchivoAdjunto(archivo: File): string | null {
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    return "Solo se permiten archivos PDF, PNG, JPG o WEBP.";
  }
  if (archivo.size > MAX_BYTES) return "El archivo supera el máximo de 10 MB.";
  return null;
}
