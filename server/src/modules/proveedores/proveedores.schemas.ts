import { z } from "zod";

const textoObligatorio = (mensaje: string) => ({
  required_error: mensaje,
  invalid_type_error: mensaje,
});

// Misma lista EXACTA que PAISES_VALIDOS en importaciones.controller.ts — país
// de origen normalizado, sin tabla propia (ver comentario ahí). Duplicado a
// propósito: no hay paquete compartido en este repo (mismo criterio que
// incoterm/moneda, ya duplicados así).
export const PAISES_VALIDOS = [
  "Alemania",
  "Arabia Saudita",
  "Argentina",
  "Bélgica",
  "Bolivia",
  "Brasil",
  "Canadá",
  "Chile",
  "China",
  "Colombia",
  "Corea del Sur",
  "Costa Rica",
  "Ecuador",
  "Emiratos Árabes Unidos",
  "España",
  "Estados Unidos",
  "Francia",
  "Guatemala",
  "Hong Kong",
  "India",
  "Indonesia",
  "Israel",
  "Italia",
  "Japón",
  "Malasia",
  "México",
  "Países Bajos",
  "Panamá",
  "Perú",
  "Polonia",
  "Portugal",
  "Reino Unido",
  "República Dominicana",
  "Singapur",
  "Sudáfrica",
  "Suiza",
  "Tailandia",
  "Taiwán",
  "Turquía",
  "Vietnam",
] as const;

export const crearProveedorSchema = z.object({
  nombre: z
    .string(textoObligatorio("El nombre del proveedor es obligatorio."))
    .trim()
    .min(1, "El nombre del proveedor es obligatorio."),
  nit: z.string(textoObligatorio("El NIT es obligatorio.")).trim().min(1, "El NIT es obligatorio."),
  contacto: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().nullish(),
  condicionesPago: z.string().nullish(),
  datosPago: z.string().nullish(),
  // Departamento dueño del proveedor; ausente/null = proveedor general,
  // visible para cualquier departamento (ver comentario en schema.prisma).
  departamentoId: z.string().nullish(),
  paisOrigen: z.enum(PAISES_VALIDOS).nullish(),
  // Etiquetas libres, ej. ["Telas", "Hilos"] — sin catálogo cerrado, ver
  // comentario en schema.prisma.
  materialesHabituales: z.array(z.string().trim().min(1)).max(50).nullish(),
});

export const actualizarProveedorSchema = z.object({
  nombre: z.string().nullish(),
  nit: z.string().nullish(),
  contacto: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().nullish(),
  condicionesPago: z.string().nullish(),
  datosPago: z.string().nullish(),
  activo: z.boolean().nullish(),
  departamentoId: z.string().nullish(),
  paisOrigen: z.enum(PAISES_VALIDOS).nullish(),
  // Etiquetas libres, ej. ["Telas", "Hilos"] — sin catálogo cerrado, ver
  // comentario en schema.prisma.
  materialesHabituales: z.array(z.string().trim().min(1)).max(50).nullish(),
});
