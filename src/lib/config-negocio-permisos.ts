import { PERMISOS_SISTEMA } from "@/lib/auth-permissions";

/**
 * Permisos de Configuración → "Config. de negocio", en UN solo lugar para que
 * el guard de entrada, la entrada del menú y las acciones de edición no puedan
 * divergir (hallazgo P2 de la auditoría RBAC):
 *
 *  - Umbrales de inventario: se leen con analitica.ver O inventario.configurar
 *    y se EDITAN con inventario.configurar.
 *  - Retenciones/consecutivo comercial: se leen con proformas.ver O
 *    configuracion.editar y se EDITAN con configuracion.editar.
 *
 * La pantalla es accesible para quien pueda EDITAR alguna de sus secciones
 * (cada sección se muestra y habilita según su propio permiso). El backend
 * aplica exactamente las mismas reglas (inventario.routes.ts y
 * proformas.routes.ts).
 */
export const PERMISOS_ENTRADA_CONFIG_NEGOCIO = [
  PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR,
  PERMISOS_SISTEMA.CONFIGURACION_EDITAR,
] as const;

export interface AccesoConfigNegocio {
  /** Puede entrar a la pantalla (edita al menos una sección). */
  puedeEntrar: boolean;
  /** Sección de umbrales de inventario visible y editable. */
  puedeEditarInventario: boolean;
  /** Sección comercial visible y editable. */
  puedeEditarComercial: boolean;
}

export function accesoConfigNegocio(tienePermiso: (permiso: string) => boolean): AccesoConfigNegocio {
  const puedeEditarInventario = tienePermiso(PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR);
  const puedeEditarComercial = tienePermiso(PERMISOS_SISTEMA.CONFIGURACION_EDITAR);
  return {
    puedeEntrar: puedeEditarInventario || puedeEditarComercial,
    puedeEditarInventario,
    puedeEditarComercial,
  };
}
