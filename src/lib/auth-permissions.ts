/**
 * SISTEMA NÚCLEO DE AUTORIZACIÓN Y PERMISOS (RBAC + ABAC) - RICOSOFT
 * Define la matriz de permisos estandarizados, catálogo de áreas y el motor de cálculo
 * de permisos efectivos (Permisos del Rol + Permisos Directos - Permisos Revocados).
 */

// 1. CATÁLOGO OFICIAL DE PERMISOS GRANULARES
export const PERMISOS_SISTEMA = {
  // Módulo Usuarios
  USUARIOS_VER: "usuarios.ver",
  USUARIOS_CREAR: "usuarios.crear",
  USUARIOS_EDITAR: "usuarios.editar",
  USUARIOS_DESACTIVAR: "usuarios.desactivar",
  USUARIOS_CAMBIAR_ROL: "usuarios.cambiar_rol",
  USUARIOS_CAMBIAR_DEPARTAMENTO: "usuarios.cambiar_departamento",
  USUARIOS_ASIGNAR_PERMISOS: "usuarios.asignar_permisos",
  USUARIOS_RESET_PASSWORD: "usuarios.reset_password",
  USUARIOS_ELIMINAR: "usuarios.eliminar",

  // Módulo Roles
  ROLES_VER: "roles.ver",
  ROLES_CREAR: "roles.crear",
  ROLES_EDITAR: "roles.editar",
  ROLES_ELIMINAR: "roles.eliminar",
  ROLES_ASIGNAR_PERMISOS: "roles.asignar_permisos",

  // Módulo Permisos
  PERMISOS_VER: "permisos.ver",
  PERMISOS_GESTIONAR: "permisos.gestionar",

  // Módulo Áreas
  DEPARTAMENTOS_VER: "departamentos.ver",
  DEPARTAMENTOS_CREAR: "departamentos.crear",
  DEPARTAMENTOS_EDITAR: "departamentos.editar",
  DEPARTAMENTOS_ELIMINAR: "departamentos.eliminar",

  // Módulo Perfiles Funcionales
  PERFILES_FUNCIONALES_VER: "perfiles_funcionales.ver",
  PERFILES_FUNCIONALES_CREAR: "perfiles_funcionales.crear",
  PERFILES_FUNCIONALES_EDITAR: "perfiles_funcionales.editar",
  PERFILES_FUNCIONALES_ELIMINAR: "perfiles_funcionales.eliminar",
  PERFILES_FUNCIONALES_ASIGNAR: "perfiles_funcionales.asignar",

  // Módulo Reglas de Destinatarios
  REGLAS_DESTINATARIOS_VER: "reglas_destinatarios.ver",
  REGLAS_DESTINATARIOS_CREAR: "reglas_destinatarios.crear",
  REGLAS_DESTINATARIOS_EDITAR: "reglas_destinatarios.editar",
  REGLAS_DESTINATARIOS_ELIMINAR: "reglas_destinatarios.eliminar",

  // Módulo Proveedores
  PROVEEDORES_VER: "proveedores.ver",
  PROVEEDORES_CREAR: "proveedores.crear",
  PROVEEDORES_EDITAR: "proveedores.editar",
  PROVEEDORES_ELIMINAR: "proveedores.eliminar",

  // Módulo Configuración Global
  CONFIGURACION_VER: "configuracion.ver",
  CONFIGURACION_EDITAR: "configuracion.editar",
  CONFIGURACION_CATALOGOS: "configuracion.catalogos",
  CONFIGURACION_PLANTILLAS_NOTIFICACION: "configuracion.plantillas_notificacion",

  // Módulo Publicaciones (novedades/avisos/eventos del Home)
  PUBLICACIONES_GESTIONAR: "publicaciones.gestionar",

  // Módulo Gestión de Módulos (catálogo de módulos principales por departamento)
  MODULOS_VER: "modulos.ver",
  MODULOS_GESTIONAR: "modulos.gestionar",

  // Módulo Auditoría
  AUDITORIA_VER: "auditoria.ver",
  AUDITORIA_EXPORTAR: "auditoria.exportar",

  // Módulo Facturas
  FACTURAS_VER: "facturas.ver",
  FACTURAS_CREAR: "facturas.crear",
  FACTURAS_APROBAR: "facturas.aprobar",
  FACTURAS_RECHAZAR: "facturas.rechazar",
  FACTURAS_PAGAR: "facturas.pagar",
  FACTURAS_ELIMINAR: "facturas.eliminar",

  // Módulo Solicitudes de Compra
  SOLICITUDES_VER: "solicitudes.ver",
  SOLICITUDES_CREAR: "solicitudes.crear",
  SOLICITUDES_APROBAR: "solicitudes.aprobar",
  SOLICITUDES_RECHAZAR: "solicitudes.rechazar",
  SOLICITUDES_COMPRAR: "solicitudes.comprar",
  SOLICITUDES_ELIMINAR: "solicitudes.eliminar",

  // Módulo Servicios y Suscripciones
  SERVICIOS_VER: "servicios.ver",
  SERVICIOS_CREAR: "servicios.crear",
  SERVICIOS_EDITAR: "servicios.editar",
  SERVICIOS_ELIMINAR: "servicios.eliminar",

  // Módulo Motor de Reglas
  REGLAS_VER: "reglas.ver",
  REGLAS_CREAR: "reglas.crear",
  REGLAS_EDITAR: "reglas.editar",
  REGLAS_ELIMINAR: "reglas.eliminar",

  // Módulo Créditos de Clientes
  CREDITOS_VER: "creditos.ver",
  CREDITOS_GESTIONAR: "creditos.gestionar",
  CREDITOS_ELIMINAR: "creditos.eliminar",

  // Módulo Gestión Humana
  EMPLEADOS_VER: "empleados.ver",
  EMPLEADOS_CREAR: "empleados.crear",
  EMPLEADOS_EDITAR_SALARIO: "empleados.editar_salario",
  EMPLEADOS_LIQUIDAR: "empleados.liquidar",
  EMPLEADOS_ELIMINAR: "empleados.eliminar",
  PERMISOS_LABORALES_VER: "permisos_laborales.ver",
  PERMISOS_LABORALES_CREAR: "permisos_laborales.crear",
  PERMISOS_LABORALES_APROBAR: "permisos_laborales.aprobar",
  FALTAS_VER: "faltas.ver",
  FALTAS_CREAR: "faltas.crear",

  // Módulo Analítica y Proyección
  ANALITICA_VER: "analitica.ver",
  PROYECCION_GESTIONAR: "proyeccion.gestionar",

  // Módulo Importaciones y Exportaciones
  IMPORTACIONES_VER: "importaciones.ver",
  IMPORTACIONES_CREAR: "importaciones.crear",
  IMPORTACIONES_GESTIONAR_TRANSITO: "importaciones.gestionar_transito",
  IMPORTACIONES_RECIBIR: "importaciones.recibir",
  IMPORTACIONES_LIQUIDAR: "importaciones.liquidar",
  IMPORTACIONES_ELIMINAR: "importaciones.eliminar",
  IMPORTACIONES_REQUISITOS_VER: "importaciones.requisitos_ver",
  IMPORTACIONES_REQUISITOS_CREAR: "importaciones.requisitos_crear",
  IMPORTACIONES_REQUISITOS_EDITAR: "importaciones.requisitos_editar",
  IMPORTACIONES_REQUISITOS_ELIMINAR: "importaciones.requisitos_eliminar",
  IMPORTACIONES_CORREOS_VER: "importaciones.correos_ver",
  IMPORTACIONES_CORREOS_PROCESAR: "importaciones.correos_procesar",
  IMPORTACIONES_CORREOS_RESOLVER: "importaciones.correos_resolver",
  IMPORTACIONES_CORREOS_CONFIGURAR: "importaciones.correos_configurar",
  INTEGRACION_SIESA_VER: "integracion_siesa.ver",
  INTEGRACION_SIESA_SINCRONIZAR: "integracion_siesa.sincronizar",
  INVENTARIO_CONFIGURAR: "inventario.configurar",
  TOMA_FISICA_VER: "toma_fisica.ver",
  TOMA_FISICA_GESTIONAR: "toma_fisica.gestionar",
  PLAN_PRODUCCION_VER: "plan_produccion.ver",
  PLAN_PRODUCCION_GESTIONAR: "plan_produccion.gestionar",
  GESTION_LIQUIDACION_VER: "gestion_liquidacion.ver",
  GESTION_LIQUIDACION_GESTIONAR: "gestion_liquidacion.gestionar",
  VENTAS_VER: "ventas.ver",
  COTIZACIONES_VER: "cotizaciones.ver",
  COTIZACIONES_GESTIONAR: "cotizaciones.gestionar",
  COTIZACIONES_APROBAR: "cotizaciones.aprobar",
  PEDIDOS_COMERCIALES_VER: "pedidos_comerciales.ver",
  PEDIDOS_COMERCIALES_GESTIONAR: "pedidos_comerciales.gestionar",
  PEDIDOS_COMERCIALES_CONFIRMAR: "pedidos_comerciales.confirmar",
  PROFORMAS_VER: "proformas.ver",
  PROFORMAS_GESTIONAR: "proformas.gestionar",
  /** Aceptar una proforma (ENVIADA -> ACEPTADA): decisión comercial separada de gestionarla. */
  PROFORMAS_ACEPTAR: "comercial.proformas.aceptar",
  DESPACHOS_VER: "despachos.ver",
  DESPACHOS_GESTIONAR: "despachos.gestionar",
  OBJETIVOS_VER: "objetivos.ver",
  OBJETIVOS_CREAR: "objetivos.crear",
  OBJETIVOS_EDITAR: "objetivos.editar",
  OBJETIVOS_ELIMINAR: "objetivos.eliminar",
  OBJETIVOS_ASIGNAR: "objetivos.asignar",
  BIOMETRICO_VER: "biometrico.ver",
  BIOMETRICO_SINCRONIZAR: "biometrico.sincronizar",
  BIOMETRICO_ASOCIAR: "biometrico.asociar",
  BIOMETRICO_CONFIGURAR: "biometrico.configurar",
  CARGOS_VER: "cargos.ver",
  CARGOS_GESTIONAR: "cargos.gestionar",
  EMPLEADOS_EDITAR: "empleados.editar",
  EMPLEADOS_DETALLES_VER: "empleados.detalles_ver",
  EMPLEADOS_DETALLES_EDITAR: "empleados.detalles_editar",
  EMPLEADOS_DOCUMENTOS_VER: "empleados.documentos_ver",
  EMPLEADOS_DOCUMENTOS_GESTIONAR: "empleados.documentos_gestionar",
  GESTION_INFORMACION_VER: "gestion_informacion.ver",
  GESTION_INFORMACION_GESTIONAR: "gestion_informacion.gestionar",
} as const;

export type PermisoKey = (typeof PERMISOS_SISTEMA)[keyof typeof PERMISOS_SISTEMA];

export interface PermisoDefinicion {
  id: PermisoKey;
  modulo:
    | "Usuarios"
    | "Roles"
    | "Permisos"
    | "Departamentos"
    | "Perfiles Funcionales"
    | "Reglas de Destinatarios"
    | "Proveedores"
    | "Configuración"
    | "Publicaciones"
    | "Módulos"
    | "Auditoría"
    | "Facturas"
    | "Solicitudes de Compra"
    | "Servicios"
    | "Motor de Reglas"
    | "Créditos"
    | "Gestión Humana"
    | "Analítica"
    | "Importaciones"
    | "Integraciones"
    | "Inventario"
    | "Ventas"
    | "Comercial"
    | "Despachos"
    | "Objetivos"
    | "Biométrico";
  nombre: string;
  descripcion: string;
}

export const LISTA_PERMISOS_DEFINICION: PermisoDefinicion[] = [
  // Usuarios
  {
    id: PERMISOS_SISTEMA.USUARIOS_VER,
    modulo: "Usuarios",
    nombre: "Ver usuarios",
    descripcion: "Permite consultar la lista de usuarios y sus perfiles.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_CREAR,
    modulo: "Usuarios",
    nombre: "Crear usuarios",
    descripcion: "Permite registrar nuevos usuarios en el sistema.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_EDITAR,
    modulo: "Usuarios",
    nombre: "Editar usuarios",
    descripcion: "Permite modificar datos de usuarios existentes.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_DESACTIVAR,
    modulo: "Usuarios",
    nombre: "Activar / Desactivar usuarios",
    descripcion: "Permite cambiar el estado de acceso de un usuario.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_CAMBIAR_ROL,
    modulo: "Usuarios",
    nombre: "Cambiar rol de usuario",
    descripcion: "Permite reasignar el rol de un usuario.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_CAMBIAR_DEPARTAMENTO,
    modulo: "Usuarios",
    nombre: "Cambiar departamento de usuario",
    descripcion: "Permite modificar el departamento asignado a un usuario.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_ASIGNAR_PERMISOS,
    modulo: "Usuarios",
    nombre: "Asignar permisos individuales",
    descripcion: "Permite conceder/revocar permisos directos a un usuario.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_RESET_PASSWORD,
    modulo: "Usuarios",
    nombre: "Restablecer contraseña",
    descripcion: "Permite forzar reseteo de clave de acceso.",
  },
  {
    id: PERMISOS_SISTEMA.USUARIOS_ELIMINAR,
    modulo: "Usuarios",
    nombre: "Eliminar usuarios",
    descripcion: "Permite eliminar permanentemente la cuenta de un usuario.",
  },

  // Roles
  {
    id: PERMISOS_SISTEMA.ROLES_VER,
    modulo: "Roles",
    nombre: "Ver roles",
    descripcion: "Permite consultar la lista de roles definidos.",
  },
  {
    id: PERMISOS_SISTEMA.ROLES_CREAR,
    modulo: "Roles",
    nombre: "Crear roles",
    descripcion: "Permite agregar nuevos roles al sistema.",
  },
  {
    id: PERMISOS_SISTEMA.ROLES_EDITAR,
    modulo: "Roles",
    nombre: "Editar roles",
    descripcion: "Permite modificar la configuración de un rol.",
  },
  {
    id: PERMISOS_SISTEMA.ROLES_ELIMINAR,
    modulo: "Roles",
    nombre: "Eliminar roles",
    descripcion: "Permite remover roles no esenciales.",
  },
  {
    id: PERMISOS_SISTEMA.ROLES_ASIGNAR_PERMISOS,
    modulo: "Roles",
    nombre: "Asignar permisos a roles",
    descripcion: "Permite editar la matriz de permisos de un rol.",
  },

  // Permisos
  {
    id: PERMISOS_SISTEMA.PERMISOS_VER,
    modulo: "Permisos",
    nombre: "Ver permisos",
    descripcion: "Permite ver el catálogo global de permisos.",
  },
  {
    id: PERMISOS_SISTEMA.PERMISOS_GESTIONAR,
    modulo: "Permisos",
    nombre: "Gestionar permisos",
    descripcion: "Permite administraciones avanzadas sobre la matriz.",
  },

  // Departamentos
  {
    id: PERMISOS_SISTEMA.DEPARTAMENTOS_VER,
    modulo: "Departamentos",
    nombre: "Ver departamentos",
    descripcion: "Permite listar los departamentos de la empresa.",
  },
  {
    id: PERMISOS_SISTEMA.DEPARTAMENTOS_CREAR,
    modulo: "Departamentos",
    nombre: "Crear departamentos",
    descripcion: "Permite registrar nuevos departamentos.",
  },
  {
    id: PERMISOS_SISTEMA.DEPARTAMENTOS_EDITAR,
    modulo: "Departamentos",
    nombre: "Editar departamentos",
    descripcion: "Permite modificar nombres o estado de un departamento.",
  },
  {
    id: PERMISOS_SISTEMA.DEPARTAMENTOS_ELIMINAR,
    modulo: "Departamentos",
    nombre: "Eliminar departamentos",
    descripcion: "Permite eliminar departamentos del sistema.",
  },

  // Perfiles Funcionales
  {
    id: PERMISOS_SISTEMA.PERFILES_FUNCIONALES_VER,
    modulo: "Perfiles Funcionales",
    nombre: "Ver perfiles funcionales",
    descripcion: "Permite listar los perfiles funcionales de cada área.",
  },
  {
    id: PERMISOS_SISTEMA.PERFILES_FUNCIONALES_CREAR,
    modulo: "Perfiles Funcionales",
    nombre: "Crear perfiles funcionales",
    descripcion: "Permite registrar nuevos perfiles dentro de un área.",
  },
  {
    id: PERMISOS_SISTEMA.PERFILES_FUNCIONALES_EDITAR,
    modulo: "Perfiles Funcionales",
    nombre: "Editar perfiles funcionales",
    descripcion: "Permite modificar nombre, estado o si un perfil es jefe de área.",
  },
  {
    id: PERMISOS_SISTEMA.PERFILES_FUNCIONALES_ELIMINAR,
    modulo: "Perfiles Funcionales",
    nombre: "Eliminar perfiles funcionales",
    descripcion: "Permite eliminar un perfil funcional sin usuarios asignados.",
  },
  {
    id: PERMISOS_SISTEMA.PERFILES_FUNCIONALES_ASIGNAR,
    modulo: "Perfiles Funcionales",
    nombre: "Asignar usuarios a perfiles",
    descripcion: "Permite agregar o quitar usuarios de un perfil funcional.",
  },

  // Reglas de Destinatarios
  {
    id: PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_VER,
    modulo: "Reglas de Destinatarios",
    nombre: "Ver reglas de destinatarios",
    descripcion: "Permite listar quién recibe cada tipo de alerta/evento.",
  },
  {
    id: PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_CREAR,
    modulo: "Reglas de Destinatarios",
    nombre: "Crear reglas de destinatarios",
    descripcion: "Permite definir nuevos destinatarios para un evento.",
  },
  {
    id: PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_EDITAR,
    modulo: "Reglas de Destinatarios",
    nombre: "Editar reglas de destinatarios",
    descripcion: "Permite modificar una regla existente y agregar o quitar sus destinatarios.",
  },
  {
    id: PERMISOS_SISTEMA.REGLAS_DESTINATARIOS_ELIMINAR,
    modulo: "Reglas de Destinatarios",
    nombre: "Eliminar reglas de destinatarios",
    descripcion: "Permite eliminar una regla de destinatarios.",
  },

  // Proveedores
  {
    id: PERMISOS_SISTEMA.PROVEEDORES_VER,
    modulo: "Proveedores",
    nombre: "Ver proveedores",
    descripcion: "Permite consultar el catálogo de proveedores.",
  },
  {
    id: PERMISOS_SISTEMA.PROVEEDORES_CREAR,
    modulo: "Proveedores",
    nombre: "Crear proveedores",
    descripcion: "Permite registrar nuevos proveedores en el catálogo.",
  },
  {
    id: PERMISOS_SISTEMA.PROVEEDORES_EDITAR,
    modulo: "Proveedores",
    nombre: "Editar proveedores",
    descripcion: "Permite modificar datos o activar/desactivar un proveedor.",
  },
  {
    id: PERMISOS_SISTEMA.PROVEEDORES_ELIMINAR,
    modulo: "Proveedores",
    nombre: "Eliminar proveedores",
    descripcion: "Permite eliminar un proveedor sin facturas ni solicitudes de compra asociadas.",
  },

  // Configuración
  {
    id: PERMISOS_SISTEMA.CONFIGURACION_VER,
    modulo: "Configuración",
    nombre: "Ver configuración global",
    descripcion: "Permite acceder al panel de administración.",
  },
  {
    id: PERMISOS_SISTEMA.CONFIGURACION_EDITAR,
    modulo: "Configuración",
    nombre: "Modificar configuración",
    descripcion: "Permite alterar parámetros del sistema.",
  },
  {
    id: PERMISOS_SISTEMA.CONFIGURACION_CATALOGOS,
    modulo: "Configuración",
    nombre: "Gestionar catálogos",
    descripcion:
      "Permite crear, editar y eliminar valores de catálogos de referencia (incoterms, monedas, países, métodos de pago, motivos de novedad, etc.).",
  },
  {
    id: PERMISOS_SISTEMA.CONFIGURACION_PLANTILLAS_NOTIFICACION,
    modulo: "Configuración",
    nombre: "Gestionar plantillas de notificación",
    descripcion:
      "Permite crear, editar y eliminar plantillas de texto de notificaciones (título/mensaje con variables) usadas por facturas, solicitudes de compra y despachos.",
  },

  // Publicaciones
  {
    id: PERMISOS_SISTEMA.PUBLICACIONES_GESTIONAR,
    modulo: "Publicaciones",
    nombre: "Gestionar publicaciones del Home",
    descripcion:
      "Permite crear, editar y eliminar novedades, avisos y eventos mostrados en el Inicio.",
  },

  // Módulos
  {
    id: PERMISOS_SISTEMA.MODULOS_VER,
    modulo: "Módulos",
    nombre: "Ver módulos",
    descripcion: "Permite consultar el catálogo de módulos principales y su departamento.",
  },
  {
    id: PERMISOS_SISTEMA.MODULOS_GESTIONAR,
    modulo: "Módulos",
    nombre: "Gestionar módulos",
    descripcion: "Permite reasignar el departamento, activar/desactivar y reordenar módulos.",
  },

  // Auditoría
  {
    id: PERMISOS_SISTEMA.AUDITORIA_VER,
    modulo: "Auditoría",
    nombre: "Ver registros de auditoría",
    descripcion: "Permite consultar la bitácora de acciones del sistema.",
  },
  {
    id: PERMISOS_SISTEMA.AUDITORIA_EXPORTAR,
    modulo: "Auditoría",
    nombre: "Exportar auditoría",
    descripcion: "Permite descargar reportes de auditoría.",
  },

  // Facturas
  {
    id: PERMISOS_SISTEMA.FACTURAS_VER,
    modulo: "Facturas",
    nombre: "Ver facturas",
    descripcion: "Permite consultar el listado y detalle de facturas.",
  },
  {
    id: PERMISOS_SISTEMA.FACTURAS_CREAR,
    modulo: "Facturas",
    nombre: "Recepcionar facturas",
    descripcion: "Permite registrar nuevas facturas en el sistema.",
  },
  {
    id: PERMISOS_SISTEMA.FACTURAS_APROBAR,
    modulo: "Facturas",
    nombre: "Aprobar facturas",
    descripcion: "Permite aprobar facturas pendientes de revisión.",
  },
  {
    id: PERMISOS_SISTEMA.FACTURAS_RECHAZAR,
    modulo: "Facturas",
    nombre: "Rechazar facturas",
    descripcion: "Permite rechazar facturas pendientes de revisión.",
  },
  {
    id: PERMISOS_SISTEMA.FACTURAS_PAGAR,
    modulo: "Facturas",
    nombre: "Registrar pago",
    descripcion: "Permite marcar una factura aprobada como pagada.",
  },
  {
    id: PERMISOS_SISTEMA.FACTURAS_ELIMINAR,
    modulo: "Facturas",
    nombre: "Eliminar facturas",
    descripcion: "Permite eliminar una factura registrada.",
  },

  // Solicitudes de Compra
  {
    id: PERMISOS_SISTEMA.SOLICITUDES_VER,
    modulo: "Solicitudes de Compra",
    nombre: "Ver solicitudes de compra",
    descripcion: "Permite consultar las solicitudes de compra internas.",
  },
  {
    id: PERMISOS_SISTEMA.SOLICITUDES_CREAR,
    modulo: "Solicitudes de Compra",
    nombre: "Crear solicitudes de compra",
    descripcion: "Permite registrar nuevas solicitudes de compra.",
  },
  {
    id: PERMISOS_SISTEMA.SOLICITUDES_APROBAR,
    modulo: "Solicitudes de Compra",
    nombre: "Aprobar solicitudes",
    descripcion: "Permite aprobar solicitudes de compra pendientes.",
  },
  {
    id: PERMISOS_SISTEMA.SOLICITUDES_RECHAZAR,
    modulo: "Solicitudes de Compra",
    nombre: "Rechazar solicitudes",
    descripcion: "Permite rechazar solicitudes de compra pendientes.",
  },
  {
    id: PERMISOS_SISTEMA.SOLICITUDES_COMPRAR,
    modulo: "Solicitudes de Compra",
    nombre: "Marcar como comprado",
    descripcion: "Permite cerrar una solicitud aprobada como comprada.",
  },
  {
    id: PERMISOS_SISTEMA.SOLICITUDES_ELIMINAR,
    modulo: "Solicitudes de Compra",
    nombre: "Eliminar solicitudes",
    descripcion: "Permite eliminar una solicitud de compra.",
  },

  // Servicios
  {
    id: PERMISOS_SISTEMA.SERVICIOS_VER,
    modulo: "Servicios",
    nombre: "Ver servicios y suscripciones",
    descripcion: "Permite consultar el inventario de servicios activos.",
  },
  {
    id: PERMISOS_SISTEMA.SERVICIOS_CREAR,
    modulo: "Servicios",
    nombre: "Registrar servicios",
    descripcion: "Permite registrar nuevos servicios o suscripciones.",
  },
  {
    id: PERMISOS_SISTEMA.SERVICIOS_EDITAR,
    modulo: "Servicios",
    nombre: "Activar/desactivar servicios",
    descripcion: "Permite cambiar el estado de un servicio o suscripción.",
  },
  {
    id: PERMISOS_SISTEMA.SERVICIOS_ELIMINAR,
    modulo: "Servicios",
    nombre: "Eliminar servicios",
    descripcion: "Permite eliminar un servicio o suscripción registrada.",
  },

  // Motor de Reglas
  {
    id: PERMISOS_SISTEMA.REGLAS_VER,
    modulo: "Motor de Reglas",
    nombre: "Ver reglas",
    descripcion: "Permite consultar las reglas de enrutamiento de facturas.",
  },
  {
    id: PERMISOS_SISTEMA.REGLAS_CREAR,
    modulo: "Motor de Reglas",
    nombre: "Crear reglas",
    descripcion: "Permite crear nuevas reglas de enrutamiento.",
  },
  {
    id: PERMISOS_SISTEMA.REGLAS_EDITAR,
    modulo: "Motor de Reglas",
    nombre: "Editar reglas",
    descripcion: "Permite activar, desactivar o modificar una regla.",
  },
  {
    id: PERMISOS_SISTEMA.REGLAS_ELIMINAR,
    modulo: "Motor de Reglas",
    nombre: "Eliminar reglas",
    descripcion: "Permite eliminar reglas de enrutamiento.",
  },

  // Créditos
  {
    id: PERMISOS_SISTEMA.CREDITOS_VER,
    modulo: "Créditos",
    nombre: "Ver créditos de clientes",
    descripcion: "Permite consultar cupos y saldos de crédito.",
  },
  {
    id: PERMISOS_SISTEMA.CREDITOS_GESTIONAR,
    modulo: "Créditos",
    nombre: "Gestionar créditos",
    descripcion: "Permite crear créditos, registrar pagos y marcar paz y salvo.",
  },
  {
    id: PERMISOS_SISTEMA.CREDITOS_ELIMINAR,
    modulo: "Créditos",
    nombre: "Eliminar créditos",
    descripcion: "Permite eliminar un crédito de cliente registrado.",
  },

  // Gestión Humana
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_VER,
    modulo: "Gestión Humana",
    nombre: "Ver empleados",
    descripcion: "Permite consultar el expediente de colaboradores.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_CREAR,
    modulo: "Gestión Humana",
    nombre: "Registrar empleados",
    descripcion: "Permite registrar nuevos colaboradores.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_EDITAR_SALARIO,
    modulo: "Gestión Humana",
    nombre: "Modificar salario",
    descripcion: "Permite registrar cambios de salario de un colaborador.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_LIQUIDAR,
    modulo: "Gestión Humana",
    nombre: "Liquidar empleados",
    descripcion: "Permite liquidar la relación laboral de un colaborador.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_ELIMINAR,
    modulo: "Gestión Humana",
    nombre: "Eliminar empleados",
    descripcion: "Permite eliminar el expediente de un colaborador.",
  },
  {
    id: PERMISOS_SISTEMA.PERMISOS_LABORALES_VER,
    modulo: "Gestión Humana",
    nombre: "Ver permisos laborales",
    descripcion: "Permite consultar solicitudes de permiso del personal.",
  },
  {
    id: PERMISOS_SISTEMA.PERMISOS_LABORALES_CREAR,
    modulo: "Gestión Humana",
    nombre: "Solicitar permisos laborales",
    descripcion: "Permite registrar solicitudes de permiso.",
  },
  {
    id: PERMISOS_SISTEMA.PERMISOS_LABORALES_APROBAR,
    modulo: "Gestión Humana",
    nombre: "Aprobar permisos laborales",
    descripcion: "Permite aprobar o rechazar solicitudes de permiso.",
  },
  {
    id: PERMISOS_SISTEMA.FALTAS_VER,
    modulo: "Gestión Humana",
    nombre: "Ver faltas disciplinarias",
    descripcion: "Permite consultar el historial de faltas.",
  },
  {
    id: PERMISOS_SISTEMA.FALTAS_CREAR,
    modulo: "Gestión Humana",
    nombre: "Registrar faltas disciplinarias",
    descripcion: "Permite registrar una falta o strike a un colaborador.",
  },

  // Analítica
  {
    id: PERMISOS_SISTEMA.ANALITICA_VER,
    modulo: "Analítica",
    nombre: "Ver analítica y proyecciones",
    descripcion: "Permite consultar dashboards analíticos y proyecciones financieras.",
  },
  {
    id: PERMISOS_SISTEMA.PROYECCION_GESTIONAR,
    modulo: "Analítica",
    nombre: "Gestionar proyecciones",
    descripcion: "Permite registrar valores de proyección financiera futura.",
  },

  // Importaciones
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_VER,
    modulo: "Importaciones",
    nombre: "Ver importaciones",
    descripcion:
      "Permite consultar órdenes de compra internacionales, lotes y expedientes aduaneros.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_CREAR,
    modulo: "Importaciones",
    nombre: "Crear órdenes de compra internacionales",
    descripcion:
      "Permite registrar nuevas órdenes de compra internacional y sus lotes de embarque.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
    modulo: "Importaciones",
    nombre: "Gestionar tránsito y expediente aduanero",
    descripcion:
      "Permite actualizar el estado de tránsito de un lote y su documentación DIAN (DIM, vistos buenos).",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR,
    modulo: "Importaciones",
    nombre: "Recibir mercancía en planta",
    descripcion:
      "Permite registrar el ingreso físico a planta de un lote antes de la liquidación definitiva.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR,
    modulo: "Importaciones",
    nombre: "Liquidar costeo de importación",
    descripcion: "Permite registrar la liquidación definitiva del landed cost (NIC 2) de un lote.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_ELIMINAR,
    modulo: "Importaciones",
    nombre: "Anular órdenes de compra internacionales",
    descripcion: "Permite anular una orden de compra internacional.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_VER,
    modulo: "Importaciones",
    nombre: "Ver proveedores y requisitos",
    descripcion: "Permite consultar los requisitos de importación registrados por proveedor.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_CREAR,
    modulo: "Importaciones",
    nombre: "Crear requisitos de proveedor",
    descripcion: "Permite registrar nuevos requisitos de importación para un proveedor.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_EDITAR,
    modulo: "Importaciones",
    nombre: "Editar requisitos de proveedor",
    descripcion: "Permite editar, activar/desactivar y reordenar los requisitos de un proveedor.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_REQUISITOS_ELIMINAR,
    modulo: "Importaciones",
    nombre: "Eliminar requisitos de proveedor",
    descripcion: "Permite eliminar un requisito de importación de un proveedor.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_VER,
    modulo: "Importaciones",
    nombre: "Ver Bandeja de Correos",
    descripcion:
      "Permite consultar los correos ingeridos por la Bandeja Inteligente de Importaciones.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_PROCESAR,
    modulo: "Importaciones",
    nombre: "Reprocesar correos de la Bandeja",
    descripcion:
      "Permite reencolar manualmente un correo para que la Bandeja lo vuelva a procesar.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_RESOLVER,
    modulo: "Importaciones",
    nombre: "Resolver excepciones de la Bandeja",
    descripcion:
      "Permite resolver ambigüedades/inconsistencias detectadas por la Bandeja Inteligente.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_CORREOS_CONFIGURAR,
    modulo: "Importaciones",
    nombre: "Ver configuración de la Bandeja",
    descripcion:
      "Permite consultar el estado de la sincronización de correo (sin exponer secretos).",
  },
  {
    id: PERMISOS_SISTEMA.INTEGRACION_SIESA_VER,
    modulo: "Integraciones",
    nombre: "Ver integración con Siesa",
    descripcion: "Permite consultar el historial y estado de las sincronizaciones con Siesa/UnoEE.",
  },
  {
    id: PERMISOS_SISTEMA.INTEGRACION_SIESA_SINCRONIZAR,
    modulo: "Integraciones",
    nombre: "Sincronizar datos con Siesa",
    descripcion:
      "Permite disparar y cancelar manualmente la sincronización de datos maestros desde Siesa/UnoEE.",
  },
  {
    id: PERMISOS_SISTEMA.INVENTARIO_CONFIGURAR,
    modulo: "Inventario",
    nombre: "Configurar umbrales de inventario",
    descripcion:
      "Permite ajustar los umbrales de días (vendible, exceso/obsolescencia, ruptura y sobre-cobertura) que usa la clasificación de inventario y producción recomendada.",
  },
  {
    id: PERMISOS_SISTEMA.TOMA_FISICA_VER,
    modulo: "Inventario",
    nombre: "Ver tomas físicas",
    descripcion: "Permite consultar las tomas físicas de inventario y sus diferencias.",
  },
  {
    id: PERMISOS_SISTEMA.TOMA_FISICA_GESTIONAR,
    modulo: "Inventario",
    nombre: "Gestionar tomas físicas",
    descripcion: "Permite crear tomas físicas, registrar conteos y cerrarlas.",
  },
  {
    id: PERMISOS_SISTEMA.PLAN_PRODUCCION_VER,
    modulo: "Inventario",
    nombre: "Ver plan de producción",
    descripcion: "Permite consultar los planes de producción y su estado.",
  },
  {
    id: PERMISOS_SISTEMA.PLAN_PRODUCCION_GESTIONAR,
    modulo: "Inventario",
    nombre: "Gestionar plan de producción",
    descripcion: "Permite crear planes de producción y avanzar su estado.",
  },
  {
    id: PERMISOS_SISTEMA.GESTION_LIQUIDACION_VER,
    modulo: "Inventario",
    nombre: "Ver gestión de liquidación",
    descripcion: "Permite consultar las gestiones de liquidación y su estado.",
  },
  {
    id: PERMISOS_SISTEMA.GESTION_LIQUIDACION_GESTIONAR,
    modulo: "Inventario",
    nombre: "Gestionar liquidación",
    descripcion:
      "Permite crear gestiones de liquidación y avanzar su estado (aprobar, rechazar, ejecutar).",
  },
  {
    id: PERMISOS_SISTEMA.VENTAS_VER,
    modulo: "Ventas",
    nombre: "Ver Centro Comercial",
    descripcion:
      "Permite consultar disponibilidad comercial, clientes en riesgo y el histórico de ventas — sin necesitar el permiso completo de Analítica.",
  },
  {
    id: PERMISOS_SISTEMA.COTIZACIONES_VER,
    modulo: "Comercial",
    nombre: "Cotizaciones · Ver",
    descripcion: "Permite consultar cotizaciones comerciales y su detalle. Sin este permiso la sección no aparece en el menú.",
  },
  {
    id: PERMISOS_SISTEMA.COTIZACIONES_GESTIONAR,
    modulo: "Comercial",
    nombre: "Cotizaciones · Gestionar",
    descripcion:
      "Permite crear, editar, enviar, anular y vincular el documento ERP de cotizaciones. Incluye automáticamente Ver.",
  },
  {
    id: PERMISOS_SISTEMA.COTIZACIONES_APROBAR,
    modulo: "Comercial",
    nombre: "Cotizaciones · Aprobar (especial)",
    descripcion:
      "Permiso especial: aprobar o rechazar cotizaciones. Es autoridad de decisión — no incluye editar, así se puede tener un aprobador que revisa sin modificar. Incluye automáticamente Ver.",
  },
  {
    id: PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_VER,
    modulo: "Comercial",
    nombre: "Pedidos comerciales · Ver",
    descripcion: "Permite consultar pedidos comerciales y su detalle. Sin este permiso la sección no aparece en el menú.",
  },
  {
    id: PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_GESTIONAR,
    modulo: "Comercial",
    nombre: "Pedidos comerciales · Gestionar",
    descripcion:
      "Permite crear pedidos (incluyendo desde una Proforma, que además exige Ver de Proformas) y anularlos. Incluye automáticamente Ver.",
  },
  {
    id: PERMISOS_SISTEMA.PEDIDOS_COMERCIALES_CONFIRMAR,
    modulo: "Comercial",
    nombre: "Pedidos comerciales · Confirmar (especial)",
    descripcion:
      "Permiso especial: confirmar un pedido y marcarlo listo para el ERP. Es autoridad de decisión — no incluye crear ni anular. Incluye automáticamente Ver.",
  },
  {
    id: PERMISOS_SISTEMA.PROFORMAS_VER,
    modulo: "Comercial",
    nombre: "Proformas · Ver",
    descripcion: "Permite consultar proformas y su detalle. Sin este permiso la sección no aparece en el menú.",
  },
  {
    id: PERMISOS_SISTEMA.PROFORMAS_GESTIONAR,
    modulo: "Comercial",
    nombre: "Proformas · Gestionar",
    descripcion:
      "Permite crear, editar, anular y vincular el documento ERP de proformas. Incluye automáticamente Ver.",
  },
  {
    id: PERMISOS_SISTEMA.PROFORMAS_ACEPTAR,
    modulo: "Comercial",
    nombre: "Proformas · Aceptar (especial)",
    descripcion:
      "Permiso especial: aceptar una proforma enviada (paso previo a crear el pedido). Es autoridad de decisión — no incluye crear, editar ni anular. Incluye automáticamente Ver proformas.",
  },
  {
    id: PERMISOS_SISTEMA.DESPACHOS_VER,
    modulo: "Despachos",
    nombre: "Ver despachos",
    descripcion:
      "Permite consultar el listado, detalle, línea de tiempo y novedades de los despachos.",
  },
  {
    id: PERMISOS_SISTEMA.DESPACHOS_GESTIONAR,
    modulo: "Despachos",
    nombre: "Gestionar despachos",
    descripcion:
      "Permite crear despachos desde una venta real de Siesa, avanzar su estado logístico, y registrar/resolver novedades.",
  },
  {
    id: PERMISOS_SISTEMA.OBJETIVOS_VER,
    modulo: "Objetivos",
    nombre: "Ver objetivos",
    descripcion:
      "Permite consultar metas comerciales (empresa y por vendedor), su cumplimiento y el comparativo contra el año anterior.",
  },
  {
    id: PERMISOS_SISTEMA.OBJETIVOS_CREAR,
    modulo: "Objetivos",
    nombre: "Crear objetivos",
    descripcion: "Permite crear nuevas metas comerciales de empresa o de vendedor.",
  },
  {
    id: PERMISOS_SISTEMA.OBJETIVOS_EDITAR,
    modulo: "Objetivos",
    nombre: "Editar objetivos",
    descripcion: "Permite modificar una meta existente y cambiar su estado (activar/cancelar).",
  },
  {
    id: PERMISOS_SISTEMA.OBJETIVOS_ELIMINAR,
    modulo: "Objetivos",
    nombre: "Eliminar objetivos",
    descripcion: "Permite eliminar (soft-delete) una meta comercial.",
  },
  {
    id: PERMISOS_SISTEMA.OBJETIVOS_ASIGNAR,
    modulo: "Objetivos",
    nombre: "Asignar objetivos",
    descripcion:
      "Permite asignar una meta individual a un vendedor desde el flujo de Centro Gerencial.",
  },

  // Biométrico (Gestión Humana)
  {
    id: PERMISOS_SISTEMA.BIOMETRICO_VER,
    modulo: "Biométrico",
    nombre: "Ver biométrico",
    descripcion:
      "Permite consultar fuentes, sincronizaciones, asociaciones empleado-CrossChex y marcaciones.",
  },
  {
    id: PERMISOS_SISTEMA.BIOMETRICO_CONFIGURAR,
    modulo: "Biométrico",
    nombre: "Configurar fuentes biométricas",
    descripcion: "Permite crear, editar y desactivar fuentes de captura biométrica (CrossChex).",
  },
  {
    id: PERMISOS_SISTEMA.BIOMETRICO_SINCRONIZAR,
    modulo: "Biométrico",
    nombre: "Sincronizar biométrico",
    descripcion: "Permite disparar manualmente la sincronización de una fuente biométrica.",
  },
  {
    id: PERMISOS_SISTEMA.BIOMETRICO_ASOCIAR,
    modulo: "Biométrico",
    nombre: "Asociar empleados",
    descripcion:
      "Permite crear, editar y eliminar la asociación entre un empleado y su usuario CrossChex.",
  },
  {
    id: PERMISOS_SISTEMA.CARGOS_VER,
    modulo: "Gestión Humana",
    nombre: "Ver cargos",
    descripcion: "Permite consultar el catálogo de cargos de la empresa.",
  },
  {
    id: PERMISOS_SISTEMA.CARGOS_GESTIONAR,
    modulo: "Gestión Humana",
    nombre: "Gestionar cargos",
    descripcion:
      "Permite crear, renombrar, activar/desactivar cargos y definir si exigen correo corporativo.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_EDITAR,
    modulo: "Gestión Humana",
    nombre: "Editar cargo y correo del colaborador",
    descripcion: "Permite cambiar el cargo y el correo corporativo de un colaborador.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_DETALLES_VER,
    modulo: "Gestión Humana",
    nombre: "Ver detalles del colaborador",
    descripcion:
      "Permite consultar datos personales sensibles del colaborador (EPS, ARL, dirección, teléfonos, núcleo familiar y estudios).",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_DETALLES_EDITAR,
    modulo: "Gestión Humana",
    nombre: "Editar detalles del colaborador",
    descripcion:
      "Permite registrar y modificar los datos personales sensibles del colaborador.",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_VER,
    modulo: "Gestión Humana",
    nombre: "Descargar soportes del colaborador",
    descripcion: "Permite ver y descargar los soportes privados (estudios y certificado bancario).",
  },
  {
    id: PERMISOS_SISTEMA.EMPLEADOS_DOCUMENTOS_GESTIONAR,
    modulo: "Gestión Humana",
    nombre: "Gestionar soportes del colaborador",
    descripcion: "Permite adjuntar y eliminar los soportes privados del colaborador.",
  },
  {
    id: PERMISOS_SISTEMA.GESTION_INFORMACION_VER,
    modulo: "Gestión Humana",
    nombre: "Ver gestión de información",
    descripcion: "Permite consultar los catálogos de EPS, ARL y fondos de pensiones.",
  },
  {
    id: PERMISOS_SISTEMA.GESTION_INFORMACION_GESTIONAR,
    modulo: "Gestión Humana",
    nombre: "Gestionar información (EPS, ARL, fondos)",
    descripcion: "Permite agregar, renombrar y activar/desactivar EPS, ARL y fondos de pensiones.",
  },
];
