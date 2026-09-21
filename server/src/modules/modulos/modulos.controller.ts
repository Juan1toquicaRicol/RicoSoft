import { Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";
import { permisoClaveDeSecciones } from "../../lib/catalogo-permisos";

/**
 * Valores que `permisoClave` tuvo por defecto en versiones anteriores, por
 * módulo. Si la fila del tenant todavía tiene uno de estos (o el valor
 * vigente), nadie la personalizó y se puede actualizar al valor actual; si
 * tiene cualquier otra cosa, es una decisión del administrador y NO se toca.
 *
 * Esto sustituye a las migraciones SQL manuales: antes, cambiar el permiso
 * de un módulo en el código no llegaba a los tenants ya sembrados (la fila
 * solo se crea una vez), y hacía falta un UPDATE a mano por cada cambio.
 */
const PERMISO_CLAVE_HISTORICO: Record<string, string[]> = {
  "gestion-comercial": ["cotizaciones.ver", "cotizaciones.ver,proformas.ver,pedidos_comerciales.ver"],
};

/**
 * Catálogo por defecto de módulos principales de la aplicación. Se usa para
 * poblar la tabla Modulo la primera vez que un tenant la consulta, ya que
 * los módulos existían antes como enlaces fijos del sidebar (sin registro
 * en base de datos). Sin departamento asignado hasta que un admin lo haga
 * desde Configuración.
 */
// permisoClave: código real de PERMISOS_SISTEMA que ya exige el backend del
// módulo (verificado 1:1 contra cada *.routes.ts, no supuesto) — null en
// dashboard/bandeja porque son de uso personal, sin permiso administrativo.
const CATALOGO_DEFECTO: Array<{
  clave: string;
  nombre: string;
  ruta: string;
  icono: string;
  permisoClave: string | null;
}> = [
  {
    clave: "dashboard",
    nombre: "Dashboard",
    ruta: "/",
    icono: "LayoutDashboard",
    permisoClave: null,
  },
  {
    clave: "facturas",
    nombre: "Facturación y Pagos",
    ruta: "/facturas",
    icono: "FileText",
    permisoClave: "facturas.ver",
  },
  {
    clave: "solicitudes-compra",
    nombre: "Solicitudes de Compra",
    ruta: "/solicitudes-compra",
    icono: "ShoppingCart",
    permisoClave: "solicitudes.ver",
  },
  {
    clave: "historia-compras",
    nombre: "Historia de Compras",
    ruta: "/historia-compras",
    icono: "History",
    permisoClave: "solicitudes.ver",
  },
  {
    clave: "servicios",
    nombre: "Servicios y Suscripciones",
    ruta: "/servicios",
    icono: "Repeat",
    permisoClave: "servicios.ver",
  },
  {
    clave: "reglas",
    nombre: "Motor de Reglas",
    ruta: "/reglas",
    icono: "Workflow",
    permisoClave: "reglas.ver",
  },
  {
    clave: "creditos",
    nombre: "Créditos de Clientes",
    ruta: "/creditos",
    icono: "CreditCard",
    permisoClave: "creditos.ver",
  },
  {
    clave: "gestion-humana",
    nombre: "Gestión Humana",
    ruta: "/gestion-humana",
    icono: "Briefcase",
    permisoClave: "empleados.ver",
  },
  {
    clave: "ventas",
    nombre: "Ventas",
    ruta: "/ventas",
    icono: "ShoppingBag",
    permisoClave: "ventas.ver",
  },
  {
    clave: "gestion-comercial",
    nombre: "Gestión Comercial",
    ruta: "/comercial/gestion",
    icono: "FileText",
    // Agrega 3 secciones del módulo Comercial — Centro Comercial y Objetivos
    // tienen su propia entrada de menú. Basta con tener el VER de una para
    // que el módulo aparezca (ver tieneAcceso(), que interpreta la lista
    // separada por comas como "cualquiera de estos"). Los códigos se derivan
    // de la jerarquía, no se escriben a mano.
    permisoClave: permisoClaveDeSecciones([
      "cotizaciones",
      "proformas",
      "pedidos_comerciales",
    ]),
  },
  {
    clave: "despachos",
    nombre: "Despachos",
    ruta: "/despachos",
    icono: "Truck",
    permisoClave: "despachos.ver",
  },
  {
    clave: "gerencial",
    nombre: "Centro Gerencial",
    ruta: "/gerencial",
    icono: "Gauge",
    permisoClave: "analitica.ver",
  },
  {
    clave: "analitica",
    nombre: "Analítica",
    ruta: "/analitica",
    icono: "BarChart3",
    permisoClave: "analitica.ver",
  },
  {
    clave: "proyeccion",
    nombre: "Proyección Financiera",
    ruta: "/proyeccion",
    icono: "TrendingUp",
    permisoClave: "analitica.ver",
  },
  {
    clave: "inventario",
    nombre: "Inventario",
    ruta: "/inventario",
    icono: "Package",
    permisoClave: "analitica.ver",
  },
  {
    clave: "oportunidades",
    nombre: "Oportunidades",
    ruta: "/oportunidades",
    icono: "Target",
    permisoClave: "analitica.ver",
  },
  {
    clave: "toma_fisica",
    nombre: "Toma Física",
    ruta: "/toma-fisica",
    icono: "ClipboardList",
    permisoClave: "toma_fisica.ver",
  },
  {
    clave: "plan_produccion",
    nombre: "Plan de Producción",
    ruta: "/plan-produccion",
    icono: "Factory",
    permisoClave: "plan_produccion.ver",
  },
  {
    clave: "bandeja",
    nombre: "Bandeja de Entrada",
    ruta: "/bandeja",
    icono: "Inbox",
    permisoClave: null,
  },
  {
    clave: "importaciones",
    nombre: "Importaciones y Exportaciones",
    ruta: "/importaciones",
    icono: "Ship",
    permisoClave: "importaciones.ver",
  },
  {
    clave: "proveedores-requisitos",
    nombre: "Proveedores y Requisitos",
    ruta: "/proveedores-requisitos",
    icono: "ClipboardCheck",
    permisoClave: "importaciones.requisitos_ver",
  },
];

type ModuloConDepartamento = Prisma.ModuloGetPayload<{
  include: { departamento: { select: { id: true; nombre: true } } };
}>;

const INCLUDE_DEPARTAMENTO = {
  departamento: { select: { id: true as const, nombre: true as const } },
} satisfies Prisma.ModuloInclude;

/**
 * Trae TODOS los módulos accesibles al tenant (propios + GENERAL) y de paso
 * siembra los módulos por defecto que le falten — antes eran dos `findMany`
 * separados en cada request (uno solo para chequear qué falta sembrar, otro
 * para el listado real); ahora es uno solo en el camino común (nada por
 * sembrar), y solo se paga una segunda consulta en el camino raro donde sí
 * hubo que crear algo (primera vez del tenant, o el catálogo por defecto
 * creció). Idempotente: si el tenant ya tiene todos los módulos del catálogo
 * no crea nada.
 *
 * El chequeo de "qué falta" siempre se hace contra TODOS los módulos propios
 * del tenant, activos o no — nunca filtrado por `activo`, o un módulo
 * desactivado se leería como "no sembrado todavía" y el `createMany`
 * fallaría contra el índice único [tenantId, clave].
 */
async function listarModulosDelTenant(tenantId: string): Promise<ModuloConDepartamento[]> {
  let modulos = await prisma.modulo.findMany({
    where: whereAlcance(tenantId),
    include: INCLUDE_DEPARTAMENTO,
    orderBy: { orden: "asc" },
  });

  const propios = modulos.filter((m) => m.tenantId === tenantId);
  const clavesExistentes = new Set(propios.map((m) => m.clave));
  const faltantes = CATALOGO_DEFECTO.filter((m) => !clavesExistentes.has(m.clave));

  if (faltantes.length > 0) {
    const ordenBase = propios.reduce((max, m) => Math.max(max, m.orden), -1) + 1;
    await prisma.modulo.createMany({
      data: faltantes.map((modulo, index) => ({
        tenantId,
        clave: modulo.clave,
        nombre: modulo.nombre,
        ruta: modulo.ruta,
        icono: modulo.icono,
        permisoClave: modulo.permisoClave,
        orden: ordenBase + index,
      })),
    });
    modulos = await prisma.modulo.findMany({
      where: whereAlcance(tenantId),
      include: INCLUDE_DEPARTAMENTO,
      orderBy: { orden: "asc" },
    });
  }

  // Reconciliación de `permisoClave` para módulos ya sembrados: si la fila
  // del tenant sigue en un valor histórico conocido (ver
  // PERMISO_CLAVE_HISTORICO) — es decir, nadie la personalizó — se
  // actualiza al valor vigente del catálogo. Si tiene cualquier otro valor,
  // es una decisión del administrador y se respeta. Esto reemplaza la
  // migración SQL manual que hacía falta cada vez que el permiso de un
  // módulo cambiaba en el código.
  const porActualizar = propios.filter((m) => {
    const defecto = CATALOGO_DEFECTO.find((d) => d.clave === m.clave);
    if (!defecto || defecto.permisoClave === m.permisoClave) return false;
    const historicos = PERMISO_CLAVE_HISTORICO[m.clave] ?? [];
    return m.permisoClave === null || historicos.includes(m.permisoClave);
  });

  if (porActualizar.length > 0) {
    await Promise.all(
      porActualizar.map((m) => {
        const defecto = CATALOGO_DEFECTO.find((d) => d.clave === m.clave)!;
        return prisma.modulo.update({
          where: { id: m.id },
          data: { permisoClave: defecto.permisoClave },
        });
      }),
    );
    modulos = await prisma.modulo.findMany({
      where: whereAlcance(tenantId),
      include: INCLUDE_DEPARTAMENTO,
      orderBy: { orden: "asc" },
    });
  }

  return modulos;
}

const serializar = (modulo: {
  id: string;
  tenantId: string | null;
  clave: string;
  nombre: string;
  ruta: string;
  icono: string;
  permisoClave: string | null;
  activo: boolean;
  orden: number;
  departamentoId: string | null;
  departamento: { id: string; nombre: string } | null;
}) => ({
  id: modulo.id,
  clave: modulo.clave,
  nombre: modulo.nombre,
  ruta: modulo.ruta,
  icono: modulo.icono,
  permisoClave: modulo.permisoClave,
  activo: modulo.activo,
  orden: modulo.orden,
  alcance: modulo.tenantId === null ? "GENERAL" : "TENANT",
  departamentoId: modulo.departamentoId,
  departamento: modulo.departamento
    ? { id: modulo.departamento.id, nombre: modulo.departamento.nombre }
    : null,
});

/** Un usuario puede usar el módulo si es superadmin (bypass ya existente),
 * el módulo no exige ningún permiso (dashboard/bandeja), o tiene ese permiso
 * concreto en su sesión activa — el mismo `req.user.permisos` que ya usa
 * `requirePermission()` en cada endpoint, ninguna fuente nueva de verdad. */
/**
 * `permisoClave` admite una lista separada por comas ("a.ver,b.ver") para
 * módulos que agregan varias secciones independientes (p. ej. Gestión
 * Comercial = Cotizaciones + Proformas + Pedidos comerciales): basta con
 * tener AL MENOS UNO de esos permisos para que el módulo aparezca en el
 * menú — cada sección adentro sigue filtrando su propio contenido por su
 * propio permiso VER (ver documentos.controller.ts).
 */
function tieneAcceso(req: AuthenticatedRequest, permisoClave: string | null): boolean {
  if (req.user!.isSuperadmin) return true;
  if (!permisoClave) return true;
  const opciones = permisoClave.split(",").map((p) => p.trim()).filter(Boolean);
  return opciones.some((p) => req.user!.permisos.includes(p));
}

/** El Dashboard debe verse siempre, incluso si un registro quedó con
 * `activo=false` o `permisoClave` seteado de antes de que actualizarModulo
 * empezara a bloquear esos cambios sobre este módulo. */
function esVisibleSiempre(clave: string): boolean {
  return clave === "dashboard";
}

/**
 * Listado completo (incluye inactivos) para la pantalla de administración.
 */
export const listarModulos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const modulos = await listarModulosDelTenant(tenantId);

    return res.json(modulos.map(serializar));
  } catch (error) {
    console.error("Error al listar módulos:", error);
    return res.status(500).json({ message: "Error al obtener los módulos." });
  }
};

/**
 * Listado reducido para construir el menú lateral: solo módulos activos que
 * el usuario ACTUAL realmente puede usar (no requiere modulos.ver — es el
 * acceso operativo normal). "Alcance GENERAL" solo determina si el tenant
 * puede disponer del módulo; que aparezca acá depende además de si el
 * usuario tiene el permiso — un módulo general al que nadie de este tenant
 * tiene acceso no debe aparecer en su sidebar.
 */
export const listarModulosMenu = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const modulos = await listarModulosDelTenant(tenantId);

    // El filtro de `activo` se aplica en memoria (no en SQL): ya se trajeron
    // todos los módulos accesibles para el chequeo de siembra de arriba, así
    // que reutilizamos ese mismo resultado en vez de una segunda consulta.
    const visibles = modulos.filter(
      (m) => esVisibleSiempre(m.clave) || (m.activo && tieneAcceso(req, m.permisoClave)),
    );

    return res.json(visibles.map(serializar));
  } catch (error) {
    console.error("Error al listar módulos del menú:", error);
    return res.status(500).json({ message: "Error al obtener los módulos." });
  }
};

export const actualizarModulo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { departamentoId, activo, orden, alcance, permisoClave } = req.body;
    if (permisoClave !== undefined && permisoClave !== null && typeof permisoClave !== "string") {
      return res.status(400).json({ message: "permisoClave debe ser un texto o null." });
    }

    const existente = await prisma.modulo.findFirst({ where: { id, ...whereAlcance(tenantId) } });
    if (!existente) {
      return res.status(404).json({ message: "Módulo no encontrado." });
    }
    // El Dashboard es la pantalla de inicio para TODO usuario autenticado
    // (ver CATALOGO_DEFECTO): no puede desactivarse ni exigir un permiso,
    // sin importar quién lo edite desde Configuración > Módulos.
    if (existente.clave === "dashboard") {
      if (activo === false) {
        return res.status(400).json({ message: "El módulo Dashboard no se puede desactivar." });
      }
      if (permisoClave) {
        return res.status(400).json({
          message: "El módulo Dashboard no puede exigir un permiso: debe ser accesible para todos.",
        });
      }
    }
    if (alcance !== undefined && alcance !== "GENERAL" && alcance !== "TENANT") {
      return res.status(400).json({ message: 'El alcance debe ser "GENERAL" o "TENANT".' });
    }
    // Un módulo ya GENERAL (tenantId: null) es visible/editable por TODOS los
    // tenants vía whereAlcance — mismo riesgo que un Rol/Departamento GENERAL
    // (ver roles.controller.ts), solo un superadmin puede tocarlo o convertir
    // uno TENANT en GENERAL.
    const tocaAlcanceGeneral = existente.tenantId === null || alcance === "GENERAL";
    if (tocaAlcanceGeneral && !req.user!.isSuperadmin) {
      return res.status(403).json({
        message: "Solo un superadministrador puede modificar módulos de alcance general.",
      });
    }

    if (departamentoId) {
      const departamento = await prisma.departamento.findFirst({
        where: { id: departamentoId, ...whereAlcance(tenantId) },
      });
      if (!departamento) {
        return res.status(400).json({ message: "El departamento indicado no existe." });
      }
    }

    let nuevoTenantId: string | null | undefined;
    if (alcance !== undefined) {
      const eraGeneral = existente.tenantId === null;
      const seraGeneral = alcance === "GENERAL";
      if (eraGeneral && !seraGeneral) {
        // Un módulo general "TENANT-izado" podría colisionar con la clave
        // que ya usa cada tenant en su propio catálogo auto-sembrado —
        // el @@unique([tenantId, clave]) rechaza el update si eso pasa,
        // lo cual es exactamente el comportamiento correcto acá.
        nuevoTenantId = tenantId;
      } else if (!eraGeneral && seraGeneral) {
        nuevoTenantId = null;
      }
    }

    const modulo = await prisma.modulo.update({
      where: { id },
      data: {
        ...(departamentoId !== undefined ? { departamentoId: departamentoId || null } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(typeof orden === "number" ? { orden } : {}),
        ...(nuevoTenantId !== undefined ? { tenantId: nuevoTenantId } : {}),
        ...(permisoClave !== undefined ? { permisoClave } : {}),
      },
      include: { departamento: { select: { id: true, nombre: true } } },
    });

    await prisma.auditoria.create({
      data: {
        tenantId,
        usuarioId: req.user!.id,
        accion: "MODULO_EDITADO",
        detalle: `${req.user!.nombre} editó el módulo "${modulo.nombre}"`,
      },
    });

    return res.json(serializar(modulo));
  } catch (error) {
    console.error("Error al actualizar módulo:", error);
    return res.status(500).json({ message: "Error al actualizar el módulo." });
  }
};
