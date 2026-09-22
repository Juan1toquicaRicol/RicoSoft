import { z } from "zod";

/**
 * Lógica pura (sin I/O) de CatalogoValor: tipos, metadatos, precedencia
 * TENANT → GENERAL y alias de claves heredadas. El acceso a BD vive en
 * modules/catalogos/catalogos.controller.ts; aquí no se importa Prisma para
 * poder probar las reglas sin base de datos.
 */

/** Tipos de catálogo canónicos (los que define el negocio). */
export const TIPOS_CANONICOS = [
  "INCOTERM",
  "MONEDA",
  "PAIS",
  "CONDICION_PAGO",
  "METODO_PAGO",
  "UNIDAD_MEDIDA",
  "MOTIVO_NOVEDAD_DESPACHO",
  "ESTADO_COMERCIAL",
  "TIPO_OPORTUNIDAD",
] as const;

/**
 * Tipos que ya existían con datos y consumidores propios. Siguen vigentes:
 * cuando hay un equivalente canónico (PAIS_ORIGEN → PAIS, FORMA_PAGO* →
 * CONDICION_PAGO) se conservan hasta migrar los datos guardados como texto
 * (fase "Contract" del expand/migrate/contract), nunca se borran.
 */
export const TIPOS_EXISTENTES = [
  "PAIS_ORIGEN",
  "FORMA_PAGO",
  "FORMA_PAGO_VENTAS",
  "MOTIVO_NOVEDAD_IMPORTACION",
  "ACCION_CONTACTO_OPORTUNIDAD",
  "RESULTADO_CONTACTO_OPORTUNIDAD",
] as const;

export const TIPOS_CATALOGO_VALIDOS = [...TIPOS_CANONICOS, ...TIPOS_EXISTENTES] as const;
export type TipoCatalogo = (typeof TIPOS_CATALOGO_VALIDOS)[number];

export function esTipoCatalogoValido(tipo: unknown): tipo is TipoCatalogo {
  return typeof tipo === "string" && (TIPOS_CATALOGO_VALIDOS as readonly string[]).includes(tipo);
}

export interface DefinicionTipoCatalogo {
  tipo: TipoCatalogo;
  etiqueta: string;
  grupo: "General" | "Comercial" | "Importaciones" | "Logística" | "CRM";
  descripcion: string;
  /** Campos de metadata que este tipo usa (para que la UI sepa qué pedir). */
  camposMetadata: ("simbolo" | "responsabilidad" | "dias" | "documento")[];
  /** Tipo canónico que lo reemplaza a futuro, si es un tipo heredado. */
  equivalenteCanonico?: TipoCatalogo;
  /** Tipos NUEVOS: la clave debe ser un código estable MAYÚSCULAS_CON_GUION_BAJO. Los que ya
   * tenían datos/pruebas con otro formato no se endurecen retroactivamente. */
  claveCodigoEstable: boolean;
}

export const DEFINICIONES_TIPOS: DefinicionTipoCatalogo[] = [
  {
    tipo: "INCOTERM",
    etiqueta: "Incoterms",
    grupo: "Comercial",
    descripcion: "Términos internacionales de comercio.",
    camposMetadata: ["responsabilidad"],
    claveCodigoEstable: false,
  },
  {
    tipo: "MONEDA",
    etiqueta: "Monedas",
    grupo: "General",
    descripcion: "Código ISO 4217 y símbolo visual.",
    camposMetadata: ["simbolo"],
    claveCodigoEstable: false,
  },
  {
    tipo: "PAIS",
    etiqueta: "Países",
    grupo: "General",
    descripcion: "Código ISO 3166-1 alfa-2.",
    camposMetadata: [],
    claveCodigoEstable: true,
  },
  {
    tipo: "CONDICION_PAGO",
    etiqueta: "Condiciones de pago",
    grupo: "Comercial",
    descripcion: "Plazo pactado: contado o crédito a N días.",
    camposMetadata: ["dias"],
    claveCodigoEstable: true,
  },
  {
    tipo: "METODO_PAGO",
    etiqueta: "Métodos de pago",
    grupo: "Comercial",
    descripcion: "Instrumento con el que se paga (independiente de la condición de pago).",
    camposMetadata: [],
    claveCodigoEstable: false,
  },
  {
    tipo: "UNIDAD_MEDIDA",
    etiqueta: "Unidades de medida",
    grupo: "General",
    descripcion: "Unidades para cantidades de producto.",
    camposMetadata: [],
    claveCodigoEstable: false,
  },
  {
    tipo: "MOTIVO_NOVEDAD_DESPACHO",
    etiqueta: "Motivos de novedad (despachos)",
    grupo: "Logística",
    descripcion: "Motivos con los que se registra una novedad en un despacho.",
    camposMetadata: [],
    claveCodigoEstable: true,
  },
  {
    tipo: "ESTADO_COMERCIAL",
    etiqueta: "Estados comerciales",
    grupo: "Comercial",
    descripcion: "Estados de proformas, cotizaciones y pedidos comerciales.",
    camposMetadata: ["documento"],
    claveCodigoEstable: false,
  },
  {
    tipo: "TIPO_OPORTUNIDAD",
    etiqueta: "Tipos de oportunidad",
    grupo: "CRM",
    descripcion: "Clasificación de las oportunidades comerciales.",
    camposMetadata: [],
    claveCodigoEstable: true,
  },
  {
    tipo: "PAIS_ORIGEN",
    etiqueta: "Países de origen (importaciones)",
    grupo: "Importaciones",
    descripcion:
      "Heredado: las órdenes de importación guardan el nombre del país. Equivale a Países.",
    camposMetadata: [],
    equivalenteCanonico: "PAIS",
    claveCodigoEstable: false,
  },
  {
    tipo: "FORMA_PAGO",
    etiqueta: "Formas de pago (importaciones)",
    grupo: "Importaciones",
    descripcion: "Heredado: equivale a Condiciones de pago.",
    camposMetadata: [],
    equivalenteCanonico: "CONDICION_PAGO",
    claveCodigoEstable: false,
  },
  {
    tipo: "FORMA_PAGO_VENTAS",
    etiqueta: "Formas de pago (Ventas/Proformas)",
    grupo: "Comercial",
    descripcion: "Heredado: las proformas guardan este texto. Equivale a Condiciones de pago.",
    camposMetadata: [],
    equivalenteCanonico: "CONDICION_PAGO",
    claveCodigoEstable: false,
  },
  {
    tipo: "MOTIVO_NOVEDAD_IMPORTACION",
    etiqueta: "Motivos de novedad (importaciones)",
    grupo: "Importaciones",
    descripcion: "Motivos de novedad de una importación.",
    camposMetadata: [],
    claveCodigoEstable: false,
  },
  {
    tipo: "ACCION_CONTACTO_OPORTUNIDAD",
    etiqueta: "Acciones de contacto (CRM)",
    grupo: "CRM",
    descripcion: "Acciones registrables en el seguimiento de una oportunidad.",
    camposMetadata: [],
    claveCodigoEstable: false,
  },
  {
    tipo: "RESULTADO_CONTACTO_OPORTUNIDAD",
    etiqueta: "Resultados de contacto (CRM)",
    grupo: "CRM",
    descripcion: "Resultados registrables en el seguimiento de una oportunidad.",
    camposMetadata: [],
    claveCodigoEstable: false,
  },
];

export const REGEX_CLAVE_CODIGO_ESTABLE = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

export function definicionTipo(tipo: string): DefinicionTipoCatalogo | undefined {
  return DEFINICIONES_TIPOS.find((d) => d.tipo === tipo);
}

// ── Metadata ────────────────────────────────────────────────────────────────

export const esquemaMetadata = z
  .object({
    /** Símbolo visual de una moneda ("$", "US$", "€"). Nunca identifica la moneda. */
    simbolo: z.string().trim().min(1).max(10).optional(),
    /** Quién asume qué (Incoterms), texto libre corto. */
    responsabilidad: z.string().trim().min(1).max(300).optional(),
    /** Documento comercial al que aplica (estados comerciales). */
    documento: z.string().trim().min(1).max(50).optional(),
    /** Plazo en días de una condición de pago (0 = contado). */
    dias: z.number().int().min(0).max(3650).optional(),
    /** Claves heredadas equivalentes, ya presentes en datos históricos. */
    aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  })
  .strict();

export type MetadataCatalogo = z.infer<typeof esquemaMetadata>;

/** Lectura tolerante: un JSON dañado o ajeno nunca debe tumbar un listado. */
export function leerMetadata(crudo: string | null | undefined): MetadataCatalogo {
  if (!crudo) return {};
  try {
    const parseo = esquemaMetadata.safeParse(JSON.parse(crudo));
    return parseo.success ? parseo.data : {};
  } catch {
    return {};
  }
}

/** null cuando no hay nada que guardar (evita persistir "{}"). */
export function serializarMetadata(metadata: MetadataCatalogo | null | undefined): string | null {
  if (!metadata) return null;
  const limpio = Object.fromEntries(
    Object.entries(metadata).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length)),
  );
  return Object.keys(limpio).length ? JSON.stringify(limpio) : null;
}

// ── Precedencia y alias ────────────────────────────────────────────────────

export interface FilaCatalogoResoluble {
  clave: string;
  tenantId: string | null;
  activo: boolean;
  orden: number;
  metadata?: string | null;
}

/**
 * Valor efectivo para un tenant: por cada clave, la fila propia del tenant si
 * existe; si no, la GENERAL. Una fila del tenant desactivada oculta también
 * la general para ese tenant (es la forma de "apagar" un valor general solo
 * para una empresa). Filas de OTRO tenant se ignoran aunque lleguen mezcladas
 * (defensa en profundidad: la consulta ya filtra por alcance).
 */
export function resolverPrecedencia<T extends FilaCatalogoResoluble>(
  filas: T[],
  tenantId: string,
): T[] {
  const porClave = new Map<string, T>();
  for (const fila of filas) {
    if (fila.tenantId !== null && fila.tenantId !== tenantId) continue;
    const actual = porClave.get(fila.clave);
    if (!actual || (actual.tenantId === null && fila.tenantId !== null)) {
      porClave.set(fila.clave, fila);
    }
  }
  return [...porClave.values()].sort((a, b) => a.orden - b.orden || a.clave.localeCompare(b.clave));
}

/** Claves válidas = claves de los valores efectivos ACTIVOS + sus alias. */
export function clavesValidas<T extends FilaCatalogoResoluble>(
  filas: T[],
  tenantId: string,
): Set<string> {
  const validas = new Set<string>();
  for (const fila of resolverPrecedencia(filas, tenantId)) {
    if (!fila.activo) continue;
    validas.add(fila.clave);
    for (const alias of leerMetadata(fila.metadata).aliases ?? []) validas.add(alias);
  }
  return validas;
}

/**
 * Clave canónica de un valor recibido: la propia clave o, si es un alias
 * heredado (p. ej. "TON"), la clave a la que pertenece ("TN"). null si no es
 * válido para este tenant.
 */
export function claveCanonica<T extends FilaCatalogoResoluble>(
  filas: T[],
  tenantId: string,
  valor: string,
): string | null {
  const activas = resolverPrecedencia(filas, tenantId).filter((f) => f.activo);
  const directa = activas.find((f) => f.clave === valor);
  if (directa) return directa.clave;
  const porAlias = activas.find((f) => (leerMetadata(f.metadata).aliases ?? []).includes(valor));
  return porAlias?.clave ?? null;
}

/** Valida la forma de una clave nueva según el tipo. Devuelve el error o null. */
export function validarClaveNueva(tipo: TipoCatalogo, clave: string): string | null {
  if (!clave.trim()) return "clave es obligatoria.";
  if (clave.trim().length > 100) return "clave no puede superar 100 caracteres.";
  if (definicionTipo(tipo)?.claveCodigoEstable && !REGEX_CLAVE_CODIGO_ESTABLE.test(clave.trim())) {
    return "clave debe ser un código estable en MAYÚSCULAS (letras, números y guion bajo), ej. CREDITO_30D.";
  }
  return null;
}

/**
 * Alias que chocarían con una clave ACTIVA del mismo tipo (o con la propia
 * clave): dejarían el valor ambiguo — "TON" no puede ser a la vez alias de
 * "TN" y clave vigente de otra fila. Una fila inactiva (p. ej. el "TON"
 * heredado ya desactivado) no choca: ese es justo el caso que el alias cubre.
 * Devuelve los alias en conflicto.
 */
export function aliasesEnConflicto(
  aliases: string[],
  claveActual: string,
  filasDelTipo: { clave: string; tenantId: string | null; activo: boolean }[],
  tenantId: string,
): string[] {
  const clavesVigentes = new Set(
    filasDelTipo
      .filter((f) => f.activo && (f.tenantId === null || f.tenantId === tenantId))
      .map((f) => f.clave)
      .filter((clave) => clave !== claveActual),
  );
  return aliases.filter((alias) => alias === claveActual || clavesVigentes.has(alias));
}
