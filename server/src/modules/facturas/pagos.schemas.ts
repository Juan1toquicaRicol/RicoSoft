import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

// `valor` acepta number o string (el frontend puede mandar cualquiera); la
// validación de que sea un número positivo real ocurre en el controlador,
// junto con la del método de pago (que depende de la lista de métodos
// válidos, no solo de que sea texto).
export const registrarPagoSchema = z.object({
  fecha: z.string().nullish(),
  valor: z.union([z.number(), z.string()]),
  metodoPago: z.string(textoObligatorio("El método de pago es obligatorio.")),
  referencia: z.string().nullish(),
  observaciones: z.string().nullish(),
});
