/**
 * Bandeja Inteligente de Importaciones (V1) — abstracción de extracción de
 * información desde un documento. Igual que EmailProvider: toda la Bandeja
 * programa contra esta interfaz, nunca contra un SDK de IA concreto.
 *
 * Orden de extracción pedido por la especificación (parser determinístico →
 * OCR → IA): V1 implementa SOLO el primer escalón
 * (RegexDocumentExtractionProvider, texto de PDF/plano vía reglas) porque el
 * repositorio no tiene hoy ninguna integración de IA ni de OCR (confirmado
 * en la auditoría previa) y no hay proveedor/API key decidido — agregar uno
 * sin esa decisión de negocio violaría "no agregar una dependencia nueva sin
 * decisión" del propio audit. La interfaz queda lista para que un futuro
 * `OpenAiDocumentExtractionProvider`/`AnthropicDocumentExtractionProvider`
 * se conecte sin tocar el resto del pipeline — ver
 * server/docs/bandeja-importaciones.md, sección IA.
 */

export interface CampoExtraido {
  campo: string;
  valor: string;
  pagina?: number;
  /** 0-1. El proveedor determinístico usa 1.0 (coincidencia exacta de
   * patrón) — un futuro proveedor de IA reportaría su propia confianza real. */
  confianza: number;
  /** Fragmento de texto de origen que sustenta el valor — nunca se le
   * reenvía a ningún motor como instrucción, solo se persiste como dato
   * (ver ImportacionExtraccion.evidencia). */
  evidencia: string;
}

export interface ResultadoExtraccion {
  motorUsado: string;
  campos: CampoExtraido[];
}

export interface DocumentExtractionProvider {
  readonly nombre: string;
  /** `mimeType` decide si el proveedor puede intentar algo con este
   * archivo — un proveedor determinístico de texto declina un .docx
   * escaneado, por ejemplo. */
  puedeProcesar(mimeType: string): boolean;
  extraer(contenido: Buffer, mimeType: string): Promise<ResultadoExtraccion>;
}
