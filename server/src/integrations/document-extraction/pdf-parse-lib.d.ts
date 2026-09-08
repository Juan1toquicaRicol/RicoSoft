// El import real es a lib/pdf-parse.js (ver comentario en pdf-text.ts) — el
// paquete @types/pdf-parse solo declara el módulo raíz "pdf-parse", así que
// reexportamos su misma forma para el subpath.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
