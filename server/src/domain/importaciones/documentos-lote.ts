/**
 * Tipos de documento de un lote de importación que NO tienen columna fija en
 * ExpedienteAduanero (ver LoteImportacionDocumento). La clave es el slug de la
 * URL; el valor es la etiqueta que se guarda en LoteImportacionDocumento.tipo.
 *
 * La OBLIGATORIEDAD de cada tipo no está definida (puede depender del
 * material, el proveedor, el país o la clasificación): este módulo solo
 * almacena archivos y nunca bloquea un flujo por la ausencia de uno.
 */
export const ETIQUETA_BL_AWB = "B/L o AWB";
export const ETIQUETA_COA = "Certificado de análisis (COA)";

export const TIPOS_DOCUMENTO_LOTE: Record<string, string> = {
  "bl-awb": ETIQUETA_BL_AWB,
  "certificado-analisis": ETIQUETA_COA,
  otros: "Otros",
};
