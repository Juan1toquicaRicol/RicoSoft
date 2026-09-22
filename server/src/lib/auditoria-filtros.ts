import type { Prisma } from "@prisma/client";

/**
 * Filtros y clasificación de la consulta de Auditoría. El modelo `Auditoria`
 * no tiene columnas de módulo ni de resultado (y ya hay cientos de acciones
 * escritas por todo el código), así que ambos se DERIVAN de `accion`:
 *  - módulo: por prefijo del nombre de la acción (MODULOS_AUDITORIA);
 *  - resultado: FALLIDO si la acción registra un fallo (LOGIN_FALLIDO, ERROR…),
 *    EXITOSO en el resto — la auditoría de RicoSoft registra hechos ya
 *    ocurridos, no intentos.
 * No se modifica ni se puede modificar un registro: este módulo solo arma
 * consultas de lectura.
 */

export interface ModuloAuditoria {
  clave: string;
  etiqueta: string;
  /** Prefijos de `accion` (o nombres completos) que pertenecen al módulo. */
  prefijos: string[];
}

export const MODULOS_AUDITORIA: ModuloAuditoria[] = [
  { clave: "AUTENTICACION", etiqueta: "Autenticación", prefijos: ["LOGIN_", "PASSWORD_"] },
  {
    clave: "SEGURIDAD",
    etiqueta: "Usuarios y seguridad",
    prefijos: [
      "USUARIO_",
      "ROL_",
      "PERMISO_CREADO",
      "PERMISO_EDITADO",
      "PERMISO_ELIMINADO",
      "DEPARTAMENTO_",
      "PERFIL_",
      "MEMBRESIA_",
      "MODULO_",
      "REGLA_",
    ],
  },
  { clave: "CATALOGOS", etiqueta: "Catálogos", prefijos: ["CATALOGO_", "PLANTILLA_NOTIFICACION_"] },
  { clave: "PUBLICACIONES", etiqueta: "Publicaciones", prefijos: ["PUBLICACION_"] },
  {
    clave: "COMERCIAL",
    etiqueta: "Comercial y crédito",
    prefijos: [
      "COTIZACION_",
      "PROFORMA_",
      "PEDIDO_COMERCIAL_",
      "OPORTUNIDAD_",
      "COMPROMISO_",
      "CREDITO_",
      "OBJETIVO_",
    ],
  },
  {
    clave: "COMPRAS",
    etiqueta: "Compras y proveedores",
    prefijos: [
      "SOLICITUD_COMPRA_",
      "PROVEEDOR_",
      "REQUISITO_PROVEEDOR_",
      "PEDIDO_RECIBIDO",
      "SERVICIO_",
    ],
  },
  { clave: "FACTURACION", etiqueta: "Facturación y pagos", prefijos: ["FACTURA_", "PAGO_"] },
  { clave: "IMPORTACIONES", etiqueta: "Importaciones", prefijos: ["IMPORTACION_"] },
  { clave: "LOGISTICA", etiqueta: "Logística y despachos", prefijos: ["NOVEDAD_"] },
  {
    clave: "INVENTARIO",
    etiqueta: "Inventario y producción",
    prefijos: [
      "TOMA_FISICA_",
      "ITEM_CLASIFICACION",
      "CLASIFICACION_ITEM_",
      "PLAN_PRODUCCION_",
      "PROYECCION_",
      "ANALISIS_",
      "PARAMETROS_NEGOCIO_",
    ],
  },
  {
    clave: "GESTION_HUMANA",
    etiqueta: "Gestión humana",
    prefijos: ["EMPLEADO_", "BIOMETRICO_", "FALTA_", "PERMISO_LABORAL_", "GESTION_LIQUIDACION_"],
  },
  {
    clave: "INTEGRACIONES",
    etiqueta: "Integraciones",
    prefijos: ["SINCRONIZACION_SIESA_"],
  },
  { clave: "AUDITORIA", etiqueta: "Auditoría", prefijos: ["AUDITORIA_"] },
];

const MODULO_OTROS = { clave: "OTROS", etiqueta: "Otros" };

export function derivarModulo(accion: string): { clave: string; etiqueta: string } {
  const modulo = MODULOS_AUDITORIA.find((m) => m.prefijos.some((p) => accion.startsWith(p)));
  return modulo ? { clave: modulo.clave, etiqueta: modulo.etiqueta } : MODULO_OTROS;
}

export type ResultadoAuditoria = "EXITOSO" | "FALLIDO";

const ACCION_FALLIDA = /(^|_)(FALLIDO|FALLIDA|ERROR)(_|$)/;

export function derivarResultado(accion: string): ResultadoAuditoria {
  return ACCION_FALLIDA.test(accion) ? "FALLIDO" : "EXITOSO";
}

export interface FiltroAuditoria {
  /** YYYY-MM-DD (inclusive, 00:00:00.000Z). */
  desde?: string;
  /** YYYY-MM-DD (inclusive, 23:59:59.999Z). */
  hasta?: string;
  /** Subcadena de la acción. */
  accion?: string;
  usuarioId?: string;
  /** Clave de MODULOS_AUDITORIA, o "OTROS". */
  modulo?: string;
  entidadTipo?: string;
  entidadId?: string;
}

export const REGEX_FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Error de validación de un filtro, o null si es válido. */
export function validarFiltroAuditoria(f: FiltroAuditoria): string | null {
  for (const [campo, valor] of [
    ["desde", f.desde],
    ["hasta", f.hasta],
  ] as const) {
    if (valor && (!REGEX_FECHA_ISO.test(valor) || Number.isNaN(Date.parse(`${valor}T00:00:00Z`)))) {
      return `${campo} debe ser una fecha YYYY-MM-DD válida.`;
    }
  }
  if (f.desde && f.hasta && f.desde > f.hasta) {
    return "desde no puede ser posterior a hasta.";
  }
  if (
    f.modulo &&
    f.modulo !== MODULO_OTROS.clave &&
    !MODULOS_AUDITORIA.some((m) => m.clave === f.modulo)
  ) {
    return "modulo no es válido.";
  }
  return null;
}

/**
 * WHERE de la consulta de auditoría. El tenant es SIEMPRE el de la sesión:
 * ningún filtro puede levantarlo. Los filtros se combinan con AND explícito
 * (varios usan su propia clave OR/AND y un spread se pisaría).
 */
export function construirWhereAuditoria(
  tenantId: string,
  f: FiltroAuditoria,
): Prisma.AuditoriaWhereInput {
  const condiciones: Prisma.AuditoriaWhereInput[] = [{ tenantId }];

  if (f.desde) condiciones.push({ createdAt: { gte: new Date(`${f.desde}T00:00:00.000Z`) } });
  if (f.hasta) condiciones.push({ createdAt: { lte: new Date(`${f.hasta}T23:59:59.999Z`) } });
  if (f.accion) condiciones.push({ accion: { contains: f.accion } });
  if (f.usuarioId) condiciones.push({ usuarioId: f.usuarioId });
  if (f.entidadTipo) condiciones.push({ entidadTipo: f.entidadTipo });
  if (f.entidadId) condiciones.push({ entidadId: f.entidadId });

  if (f.modulo) {
    if (f.modulo === MODULO_OTROS.clave) {
      // "Otros" = ninguna acción cae en un prefijo de módulo conocido.
      const todos = MODULOS_AUDITORIA.flatMap((m) => m.prefijos);
      condiciones.push({ NOT: { OR: todos.map((p) => ({ accion: { startsWith: p } })) } });
    } else {
      const modulo = MODULOS_AUDITORIA.find((m) => m.clave === f.modulo);
      if (modulo) {
        condiciones.push({ OR: modulo.prefijos.map((p) => ({ accion: { startsWith: p } })) });
      }
    }
  }

  return { AND: condiciones };
}
