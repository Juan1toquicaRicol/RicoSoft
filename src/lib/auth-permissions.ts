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

  // Módulo Proveedores
  PROVEEDORES_VER: "proveedores.ver",
  PROVEEDORES_CREAR: "proveedores.crear",
  PROVEEDORES_EDITAR: "proveedores.editar",
  PROVEEDORES_ELIMINAR: "proveedores.eliminar",

  // Módulo Configuración Global
  CONFIGURACION_VER: "configuracion.ver",
  CONFIGURACION_EDITAR: "configuracion.editar",

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

  // Módulo Contratos
  CONTRATOS_VER: "contratos.ver",
  CONTRATOS_CREAR: "contratos.crear",
  CONTRATOS_EDITAR: "contratos.editar",
  CONTRATOS_ELIMINAR: "contratos.eliminar",

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
  INTEGRACION_SIESA_SINCRONIZAR: "integracion_siesa.sincronizar",
} as const;

export type PermisoKey = (typeof PERMISOS_SISTEMA)[keyof typeof PERMISOS_SISTEMA];

export interface PermisoDefinicion {
  id: PermisoKey;
  modulo:
    | "Usuarios"
    | "Roles"
    | "Permisos"
    | "Departamentos"
    | "Proveedores"
    | "Configuración"
    | "Módulos"
    | "Auditoría"
    | "Facturas"
    | "Solicitudes de Compra"
    | "Servicios"
    | "Contratos"
    | "Motor de Reglas"
    | "Créditos"
    | "Gestión Humana"
    | "Analítica"
    | "Importaciones"
    | "Integraciones";
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
    descripcion: "Permite eliminar un proveedor sin facturas ni contratos asociados.",
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

  // Contratos
  {
    id: PERMISOS_SISTEMA.CONTRATOS_VER,
    modulo: "Contratos",
    nombre: "Ver contratos",
    descripcion: "Permite consultar los contratos de proveedores.",
  },
  {
    id: PERMISOS_SISTEMA.CONTRATOS_CREAR,
    modulo: "Contratos",
    nombre: "Crear contratos",
    descripcion: "Permite registrar nuevos contratos.",
  },
  {
    id: PERMISOS_SISTEMA.CONTRATOS_EDITAR,
    modulo: "Contratos",
    nombre: "Editar contratos",
    descripcion: "Permite modificar contratos existentes.",
  },
  {
    id: PERMISOS_SISTEMA.CONTRATOS_ELIMINAR,
    modulo: "Contratos",
    nombre: "Eliminar contratos",
    descripcion: "Permite eliminar un contrato registrado.",
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
    descripcion: "Permite consultar órdenes de compra internacionales, lotes y expedientes aduaneros.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_CREAR,
    modulo: "Importaciones",
    nombre: "Crear órdenes de compra internacionales",
    descripcion: "Permite registrar nuevas órdenes de compra internacional y sus lotes de embarque.",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO,
    modulo: "Importaciones",
    nombre: "Gestionar tránsito y expediente aduanero",
    descripcion: "Permite actualizar el estado de tránsito de un lote y su documentación DIAN (DIM, vistos buenos).",
  },
  {
    id: PERMISOS_SISTEMA.IMPORTACIONES_RECIBIR,
    modulo: "Importaciones",
    nombre: "Recibir mercancía en planta",
    descripcion: "Permite registrar el ingreso físico a planta de un lote antes de la liquidación definitiva.",
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
    id: PERMISOS_SISTEMA.INTEGRACION_SIESA_SINCRONIZAR,
    modulo: "Integraciones",
    nombre: "Sincronizar datos con Siesa",
    descripcion: "Permite disparar manualmente la sincronización de datos maestros desde Siesa/UnoEE.",
  },
];
