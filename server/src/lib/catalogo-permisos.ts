import { PERMISOS_SISTEMA, PERMISOS_LEGACY } from "./permissions";

/**
 * FUENTE ÚNICA de la estructura de autorización de RicoSoft:
 *
 *   MÓDULO → SECCIÓN → VER / GESTIONAR / ESPECIALES
 *
 * Deliberadamente NO repite los códigos de permiso: cada sección declara su
 * PREFIJO y los códigos se derivan de PERMISOS_SISTEMA y se clasifican por
 * su sufijo (.ver → VER, .gestionar → GESTIONAR, el resto → ESPECIAL). Así
 * agregar un permiso al catálogo lo coloca solo en su sección, y no existe
 * una segunda lista que se pueda desincronizar. `catalogo-permisos.test.ts`
 * verifica que la cobertura sea exacta: ni un código sin sección, ni una
 * sección que reclame códigos inexistentes.
 *
 * De aquí se derivan hoy:
 *   - las dependencias VER ⊂ GESTIONAR/ESPECIAL (ver DEPENDENCIAS_PERMISO);
 *   - el módulo/nombre con que se siembra el catálogo `Permiso`;
 *   - el agrupado de la pantalla Configuración → Roles;
 *   - el permiso por defecto de cada módulo del menú.
 *
 * `exigeVer` marca las secciones ya migradas al modelo: en ellas, GESTIONAR
 * y los ESPECIALES exigen además VER. Las secciones sin la marca se comportan
 * exactamente como antes — así el modelo se replica módulo a módulo sin
 * cambiar de golpe la autorización de todo RicoSoft.
 */
export interface SeccionDef {
  clave: string;
  nombre: string;
  /** Prefijo de los códigos (antes del primer punto): "cotizaciones.*". */
  prefijo: string;
  /**
   * Cuando varias secciones comparten prefijo (p. ej. Importaciones), la
   * sección se queda solo con los códigos cuyo sufijo empieza por alguno de
   * estos fragmentos. Las secciones con `sufijos` se resuelven primero; la
   * sección sin `sufijos` del mismo prefijo recoge el resto.
   */
  sufijos?: string[];
  /** GESTIONAR y ESPECIALES exigen VER (sección ya migrada al modelo). */
  exigeVer?: boolean;
  /**
   * Código VER del que dependen sus permisos cuando NO es `${prefijo}.ver`
   * (p. ej. la aceptación de proformas vive bajo el prefijo "comercial" pero
   * exige "proformas.ver").
   */
  verDe?: string;
}

export interface ModuloDef {
  clave: string;
  nombre: string;
  secciones: SeccionDef[];
}

export const CATALOGO_MODULOS: ModuloDef[] = [
  {
    clave: "comercial",
    nombre: "Comercial",
    secciones: [
      { clave: "ventas", nombre: "Centro Comercial", prefijo: "ventas" },
      { clave: "cotizaciones", nombre: "Cotizaciones", prefijo: "cotizaciones", exigeVer: true },
      { clave: "proformas", nombre: "Proformas", prefijo: "proformas", exigeVer: true },
      {
        // Permiso de 3 segmentos (comercial.proformas.aceptar): se resuelve por
        // su prefijo "comercial" + sufijo "proformas." y depende de proformas.ver.
        clave: "proformas_aceptacion",
        nombre: "Aceptación de proformas",
        prefijo: "comercial",
        sufijos: ["proformas."],
        exigeVer: true,
        verDe: "proformas.ver",
      },
      {
        clave: "pedidos_comerciales",
        nombre: "Pedidos comerciales",
        prefijo: "pedidos_comerciales",
        exigeVer: true,
      },
      { clave: "objetivos", nombre: "Objetivos de venta", prefijo: "objetivos" },
    ],
  },
  {
    clave: "creditos",
    nombre: "Créditos de Clientes",
    secciones: [{ clave: "creditos", nombre: "Créditos", prefijo: "creditos" }],
  },
  {
    clave: "facturacion",
    nombre: "Facturación y Pagos",
    secciones: [{ clave: "facturas", nombre: "Facturas", prefijo: "facturas" }],
  },
  {
    clave: "compras",
    nombre: "Solicitudes de Compra",
    secciones: [{ clave: "solicitudes", nombre: "Solicitudes", prefijo: "solicitudes" }],
  },
  {
    clave: "servicios",
    nombre: "Servicios y Suscripciones",
    secciones: [{ clave: "servicios", nombre: "Servicios", prefijo: "servicios" }],
  },
  {
    clave: "reglas",
    nombre: "Motor de Reglas",
    secciones: [{ clave: "reglas", nombre: "Reglas de enrutamiento", prefijo: "reglas" }],
  },
  {
    clave: "despachos",
    nombre: "Despachos",
    secciones: [{ clave: "despachos", nombre: "Despachos", prefijo: "despachos" }],
  },
  {
    clave: "gestion_humana",
    nombre: "Gestión Humana",
    secciones: [
      { clave: "empleados", nombre: "Empleados", prefijo: "empleados" },
      { clave: "cargos", nombre: "Cargos", prefijo: "cargos", exigeVer: true },
      {
        clave: "gestion_informacion",
        nombre: "Gestión de información",
        prefijo: "gestion_informacion",
        exigeVer: true,
      },
      { clave: "permisos_laborales", nombre: "Permisos laborales", prefijo: "permisos_laborales" },
      { clave: "faltas", nombre: "Faltas y llamados de atención", prefijo: "faltas" },
      { clave: "biometrico", nombre: "Biométrico", prefijo: "biometrico" },
    ],
  },
  {
    clave: "analitica",
    nombre: "Analítica",
    secciones: [
      { clave: "analitica", nombre: "Analítica y Centro Gerencial", prefijo: "analitica" },
      { clave: "proyeccion", nombre: "Proyección financiera", prefijo: "proyeccion" },
    ],
  },
  {
    clave: "inventario",
    nombre: "Inventario y Producción",
    secciones: [
      { clave: "toma_fisica", nombre: "Toma física", prefijo: "toma_fisica" },
      { clave: "plan_produccion", nombre: "Plan de producción", prefijo: "plan_produccion" },
      {
        clave: "gestion_liquidacion",
        nombre: "Gestión de liquidación",
        prefijo: "gestion_liquidacion",
      },
    ],
  },
  {
    clave: "importaciones",
    nombre: "Importaciones y Exportaciones",
    secciones: [
      {
        clave: "importaciones_requisitos",
        nombre: "Requisitos de proveedor",
        prefijo: "importaciones",
        sufijos: ["requisitos_"],
      },
      {
        clave: "importaciones_correos",
        nombre: "Correos de importación",
        prefijo: "importaciones",
        sufijos: ["correos_"],
      },
      // Sin `sufijos`: recoge el resto del prefijo "importaciones".
      { clave: "importaciones", nombre: "Órdenes y embarques", prefijo: "importaciones" },
    ],
  },
  {
    clave: "administracion",
    nombre: "Administración",
    secciones: [
      { clave: "usuarios", nombre: "Usuarios", prefijo: "usuarios" },
      { clave: "roles", nombre: "Roles", prefijo: "roles" },
      { clave: "permisos", nombre: "Permisos", prefijo: "permisos" },
      { clave: "departamentos", nombre: "Departamentos", prefijo: "departamentos" },
      {
        clave: "perfiles_funcionales",
        nombre: "Perfiles funcionales",
        prefijo: "perfiles_funcionales",
      },
      {
        clave: "reglas_destinatarios",
        nombre: "Reglas de destinatarios",
        prefijo: "reglas_destinatarios",
      },
      { clave: "proveedores", nombre: "Proveedores", prefijo: "proveedores" },
      { clave: "publicaciones", nombre: "Publicaciones", prefijo: "publicaciones" },
      { clave: "modulos", nombre: "Módulos del menú", prefijo: "modulos" },
      { clave: "auditoria", nombre: "Auditoría", prefijo: "auditoria" },
      { clave: "integracion_siesa", nombre: "Integración Siesa", prefijo: "integracion_siesa" },
      { clave: "configuracion", nombre: "Configuración general", prefijo: "configuracion" },
      { clave: "inventario_config", nombre: "Parámetros de inventario", prefijo: "inventario" },
    ],
  },
];

export type TipoPermiso = "ver" | "gestionar" | "especial";

export interface PermisoResuelto {
  codigo: string;
  tipo: TipoPermiso;
  /** Sufijo del código: "ver", "gestionar", "aprobar", "requisitos_crear"... */
  accion: string;
  moduloClave: string;
  moduloNombre: string;
  seccionClave: string;
  seccionNombre: string;
  /** El permiso VER del que depende, si la sección ya exige VER. */
  dependeDe: string | null;
}

function accionDe(codigo: string): string {
  return codigo.slice(codigo.indexOf(".") + 1);
}

function prefijoDe(codigo: string): string {
  return codigo.slice(0, codigo.indexOf("."));
}

function tipoDe(accion: string): TipoPermiso {
  if (accion === "ver") return "ver";
  if (accion === "gestionar") return "gestionar";
  return "especial";
}

/**
 * Resuelve cada código vigente de PERMISOS_SISTEMA a su módulo/sección/tipo.
 * Los códigos LEGACY quedan fuera a propósito: siguen siendo válidos en
 * autorización (ver expandirLegacy) pero no forman parte de la estructura
 * que se le muestra a un administrador.
 */
function construirIndice(): Map<string, PermisoResuelto> {
  const indice = new Map<string, PermisoResuelto>();
  const codigos = Object.values(PERMISOS_SISTEMA).filter((c) => !(c in PERMISOS_LEGACY));

  const asignar = (modulo: ModuloDef, seccion: SeccionDef, codigo: string) => {
    const accion = accionDe(codigo);
    const tipo = tipoDe(accion);
    indice.set(codigo, {
      codigo,
      tipo,
      accion,
      moduloClave: modulo.clave,
      moduloNombre: modulo.nombre,
      seccionClave: seccion.clave,
      seccionNombre: seccion.nombre,
      dependeDe:
        seccion.exigeVer && tipo !== "ver" ? (seccion.verDe ?? `${seccion.prefijo}.ver`) : null,
    });
  };

  // Primero las secciones con `sufijos` (más específicas), luego las que
  // recogen el resto de su prefijo.
  for (const especificas of [true, false]) {
    for (const modulo of CATALOGO_MODULOS) {
      for (const seccion of modulo.secciones) {
        if (!!seccion.sufijos !== especificas) continue;
        for (const codigo of codigos) {
          if (indice.has(codigo)) continue;
          if (prefijoDe(codigo) !== seccion.prefijo) continue;
          if (seccion.sufijos && !seccion.sufijos.some((s) => accionDe(codigo).startsWith(s))) {
            continue;
          }
          asignar(modulo, seccion, codigo);
        }
      }
    }
  }

  return indice;
}

const INDICE = construirIndice();

/** Módulo/sección/tipo de un código, o null si no está declarado. */
export function resolverPermiso(codigo: string): PermisoResuelto | null {
  return INDICE.get(codigo) ?? null;
}

/** Todos los permisos vigentes ya resueltos, en el orden del catálogo. */
export function listarPermisosResueltos(): PermisoResuelto[] {
  return Array.from(INDICE.values());
}

/** Códigos que la estructura declara (para validar contra PERMISOS_SISTEMA). */
export function codigosDeclarados(): string[] {
  return Array.from(INDICE.keys());
}

/**
 * Dependencias VER ⊂ GESTIONAR/ESPECIAL derivadas de las secciones marcadas
 * con `exigeVer`. Sustituye a la tabla escrita a mano: una sección nueva
 * migrada al modelo solo tiene que marcarse aquí.
 */
export function construirDependencias(): Record<string, string> {
  const dependencias: Record<string, string> = {};
  for (const permiso of INDICE.values()) {
    if (permiso.dependeDe) dependencias[permiso.codigo] = permiso.dependeDe;
  }
  return dependencias;
}

export const DEPENDENCIAS_PERMISO: Record<string, string> = construirDependencias();

/**
 * Expande un permiso a la lista completa que el usuario debe tener para
 * ejercerlo (él mismo + sus prerrequisitos). Es lo que aplica
 * `requirePermission`, de modo que ninguna ruta pueda olvidar el VER de su
 * sección. Protegida contra ciclos por si se declara una dependencia
 * circular por error.
 */
export function permisosRequeridos(codigo: string): string[] {
  const requeridos = [codigo];
  let actual = DEPENDENCIAS_PERMISO[codigo];
  while (actual && !requeridos.includes(actual)) {
    requeridos.push(actual);
    actual = DEPENDENCIAS_PERMISO[actual];
  }
  return requeridos;
}

/** Nombre legible de un permiso para el catálogo y la pantalla de Roles. */
export function nombrePermiso(codigo: string): string {
  const permiso = resolverPermiso(codigo);
  const etiqueta = (accion: string) =>
    accion
      .replace(/\./g, "_")
      .split("_")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  if (!permiso) return etiqueta(codigo.replace(".", " "));
  return `${permiso.seccionNombre} · ${etiqueta(permiso.accion)}`;
}

/** Módulo con que se siembra `Permiso.modulo` (agrupador de la UI de Roles). */
export function moduloPermiso(codigo: string): string {
  return resolverPermiso(codigo)?.moduloNombre ?? "General";
}

/**
 * Permiso por defecto de un módulo del menú: basta con tener el VER de
 * CUALQUIERA de sus secciones (lista separada por comas, ver
 * modulos.controller.ts). Devuelve null si ninguna sección tiene VER.
 */
export function permisoClaveDeModulo(moduloClave: string): string | null {
  const modulo = CATALOGO_MODULOS.find((m) => m.clave === moduloClave);
  if (!modulo) return null;
  return permisoClaveDeSecciones(modulo.secciones.map((s) => s.clave));
}

/**
 * Permiso de menú para una entrada que agrupa un subconjunto de secciones
 * (p. ej. "Gestión Comercial" muestra Cotizaciones + Proformas + Pedidos,
 * pero NO Centro Comercial ni Objetivos, que tienen su propia entrada):
 * basta con tener el VER de cualquiera de ellas. Qué secciones agrupa cada
 * entrada del menú es una decisión de producto — lo que se deriva de aquí
 * son los códigos, para que no puedan quedar obsoletos ni mal escritos.
 */
export function permisoClaveDeSecciones(clavesSeccion: string[]): string | null {
  const porClave = new Map(
    CATALOGO_MODULOS.flatMap((m) => m.secciones).map((s) => [s.clave, s] as const),
  );
  const vistas = clavesSeccion
    .map((clave) => porClave.get(clave))
    .filter((s): s is SeccionDef => !!s)
    .map((s) => `${s.prefijo}.ver`)
    .filter((codigo) => INDICE.has(codigo));
  return vistas.length > 0 ? [...new Set(vistas)].join(",") : null;
}
