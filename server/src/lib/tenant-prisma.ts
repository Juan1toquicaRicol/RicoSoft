import { prisma } from "../config/prisma";

/**
 * Modelos donde se aplica enforcement automático de tenantId — lista
 * CURADA, no "todo modelo que tenga una columna tenantId". Quedan fuera a
 * propósito:
 *
 *  - Departamento / Rol / Modulo: su tenantId es NULLABLE con semántica
 *    GENERAL (visible para todos los tenants). Forzar {tenantId: x} en el
 *    where rompería silenciosamente la visibilidad de los registros
 *    GENERAL, que necesitan OR:[{tenantId:null},{tenantId:x}] — ya tienen
 *    su propio patrón (whereAlcance en lib/alcance.ts), no tocar.
 *  - User / Membresia: tienen lecturas cross-tenant legítimas por diseño
 *    (p. ej. otorgar membresía a un usuario de OTRO tenant, comparando
 *    tenantId explícitamente en el controller). Forzar el filtro rompería
 *    ese flujo real.
 *  - Tenant: es la entidad tenant en sí, no un recurso tenant-scoped.
 *  - VistoBuenoAduanero / PermisoUsuario: no tienen columna tenantId
 *    propia — se aíslan vía relación anidada (expediente/user), ya
 *    verificado en auditorías previas. Un desarrollador que agregue un
 *    modelo nuevo con aislamiento vía relación (en vez de tenantId
 *    directo) debe seguir haciéndolo manualmente; esta extensión no lo
 *    cubre por diseño.
 *  - ImportacionCorreo / ImportacionExcepcion (Bandeja Inteligente de
 *    Importaciones): tenantId es NULLABLE — con un único buzón central
 *    compartido por varios tenants, el tenant de un correo se desconoce
 *    hasta identificar su proveedor. Forzar tenantId en el where/create
 *    rompería la fase de ingesta (tenant aún null) y el triage de
 *    superadmin de correos sin proveedor identificado. Aislamiento manual
 *    en importaciones-bandeja.controller.ts, mismo patrón ya usado por
 *    OrdenCompraIntl (tampoco está en esta lista).
 *
 * LIMITACIÓN CONOCIDA — escrituras anidadas: esta extensión solo
 * intercepta la operación de nivel superior (p. ej. el create de
 * SolicitudCompra). Un `create` anidado dentro de esa misma llamada
 * (p. ej. `cotizaciones: { create: [...] }`) NO pasa por este interceptor
 * — Prisma no lo expone como una operación separada. Cualquier controller
 * que se migre a tenantPrisma y haga escrituras anidadas en un modelo
 * tenant-scoped debe seguir asignando tenantId a mano en esos hijos.
 */
const MODELOS_TENANT_SCOPED = new Set([
  "AnalisisGuardado",
  "Auditoria",
  "Colaborador",
  "CosteoImportacionDetalle",
  "CotizacionProveedor",
  "CreditoCliente",
  "Empleado",
  "CargoColaborador",
  "CatalogoSeguridadSocial",
  "EmpleadoDetalle",
  "EmpleadoFamiliar",
  "EmpleadoEstudio",
  "EmpleadoDocumento",
  "ExpedienteAduanero",
  "Factura",
  "FaltaStrike",
  "LoteImportacion",
  "Notificacion",
  "OrdenCompraIntl",
  "Pago",
  "Permiso",
  "PermisoLaboral",
  "Proveedor",
  "ProyeccionMensual",
  "ReglaEnrutamiento",
  "ServicioSuscripcion",
  "SincronizacionSiesaLog",
  "SolicitudCompra",
  "TomaFisica",
  "PlanProduccion",
  "GestionLiquidacion",
  "Despacho",
  "OportunidadSeguimiento",
  "IndicadorCreditoCliente",
  "ImportacionActividad",
  "ImportacionNovedad",
  "ImportacionPago",
  "ClasificacionFuncionalItem",
  "ItemClasificacionAsignada",
  "InboxItem",
  "Objetivo",
  "PerfilFuncional",
  "UsuarioPerfilFuncional",
  "ReglaDestinatarios",
  "RequisitoProveedorImportacion",
  // Los siguientes tienen tenantId NOT NULL sin ninguna semántica especial
  // (a diferencia de Departamento/Rol/Modulo/ImportacionCorreo/
  // ImportacionExcepcion, documentados arriba) y se agregaron tras
  // auditoría: se habían quedado fuera del enforcement automático por
  // simple omisión al crear el modelo, no por decisión de diseño.
  // - OrdenCompraIntlDocumento: ya se filtraba manualmente por tenantId en
  //   importaciones.controller.ts (sin bug activo), pero quedaba sin la
  //   defensa en profundidad de esta extensión si algún código nuevo
  //   empezara a usar tenantPrisma para este modelo.
  // - ConfiguracionInventario: inventario.controller.ts YA usa
  //   req.tenantPrisma.configuracionInventario con `where:{tenantId}`
  //   manual (correcto, sin bug activo), pero el comentario de ese archivo
  //   ("defensa en profundidad con el filtro explícito de tenantId")
  //   asumía —incorrectamente— que tenantPrisma también reforzaba este
  //   modelo. Ahora sí lo hace.
  // - FuenteBiometrica / EmpleadoBiometrico / MarcacionBiometrica /
  //   SincronizacionBiometricoLog: hoy se filtran manualmente vía prisma
  //   crudo en el módulo gestion-humana (sin bug activo detectado), pero
  //   quedaban fuera de esta lista curada sin ninguna razón documentada.
  "OrdenCompraIntlDocumento",
  "ConfiguracionInventario",
  // ConfiguracionComercial (Ventas/Proformas): mismo patrón que
  // ConfiguracionInventario arriba — una fila por tenant, sin ninguna
  // semántica GENERAL, usada vía req.tenantPrisma.configuracionComercial.
  "ConfiguracionComercial",
  "FuenteBiometrica",
  "EmpleadoBiometrico",
  "MarcacionBiometrica",
  "SincronizacionBiometricoLog",
]);

/** Convención de Prisma: el accessor del cliente es el nombre del modelo
 * con la primera letra en minúscula (SolicitudCompra -> solicitudCompra). */
function nombreAccessor(model: string): string {
  return model[0].toLowerCase() + model.slice(1);
}

const OPERACIONES_LECTURA_MASIVA = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const OPERACIONES_ESCRITURA_MASIVA = new Set(["updateMany", "deleteMany"]);
const OPERACIONES_UNICAS_MUTANTES = new Set(["update", "delete"]);

/**
 * Devuelve un cliente Prisma "envuelto" que aplica automáticamente el
 * filtro/inyección de tenantId para los modelos de MODELOS_TENANT_SCOPED.
 * El cliente Prisma global (`config/prisma.ts`) sigue existiendo y
 * funcionando exactamente igual que hoy — este wrapper es opt-in, no
 * reemplaza nada todavía. Ver server/src/middleware/tenant-prisma.middleware.ts
 * para cómo se cuelga en req.tenantPrisma.
 */
export function getTenantPrisma(tenantId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !MODELOS_TENANT_SCOPED.has(model)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;

          if (
            OPERACIONES_LECTURA_MASIVA.has(operation) ||
            OPERACIONES_ESCRITURA_MASIVA.has(operation)
          ) {
            a.where = { ...(a.where as object | undefined), tenantId };
            return query(args);
          }

          if (operation === "create") {
            a.data = { ...(a.data as object), tenantId };
            return query(args);
          }

          if (operation === "createMany") {
            const data = a.data;
            const lista = Array.isArray(data) ? data : [data];
            a.data = lista.map((item) => ({ ...(item as object), tenantId }));
            return query(args);
          }

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            const resultado = await query(args);
            if (resultado && (resultado as { tenantId?: string }).tenantId !== tenantId) {
              return null;
            }
            return resultado;
          }

          if (OPERACIONES_UNICAS_MUTANTES.has(operation) || operation === "upsert") {
            // Pre-chequeo ANTES de la escritura real: si el registro no
            // pertenece a este tenant, se redirige el where a una clave
            // imposible para que Prisma lance su propio error nativo
            // (P2025 "Record to update/delete not found") en vez de
            // ejecutar la mutación contra la fila de otro tenant.
            const accessor = (
              prisma as unknown as Record<
                string,
                { findFirst: (args: unknown) => Promise<unknown> }
              >
            )[nombreAccessor(model)];
            const existente = await accessor.findFirst({
              where: { ...(a.where as object), tenantId },
              select: { id: true },
            });
            if (operation === "upsert") {
              a.create = { ...(a.create as object), tenantId };
            }
            if (!existente) {
              // GUID nulo, no un string arbitrario: `id` es UNIQUEIDENTIFIER
              // en SQL Server, y un valor no-GUID aquí hace que el propio
              // driver lance "Conversion failed" en vez del P2025 esperado
              // (bug preexistente, expuesto al probar un upsert de primera
              // vez — p. ej. ConfiguracionComercial/ConfiguracionInventario
              // para un tenant que nunca había guardado su configuración).
              a.where = { ...(a.where as object), id: "00000000-0000-0000-0000-000000000000" };
            }
            return query(args);
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof getTenantPrisma>;
