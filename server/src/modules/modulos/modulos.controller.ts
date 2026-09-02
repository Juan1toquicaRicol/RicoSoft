import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { whereAlcance } from "../../lib/alcance";

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
    clave: "contratos",
    nombre: "Contratos",
    ruta: "/contratos",
    icono: "FileSignature",
    permisoClave: "contratos.ver",
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
];

/**
 * Crea los módulos por defecto que aún no existan para el tenant. Se ejecuta
 * en cada consulta y es idempotente: si el tenant ya tiene todos los módulos
 * del catálogo no hace nada; si se agrega uno nuevo al catálogo (p. ej.
 * "Historia de Compras"), lo crea sin tocar ni reordenar los módulos ya
 * existentes ni la configuración que un admin ya haya hecho sobre ellos.
 */
async function asegurarCatalogoDefecto(tenantId: string) {
  const existentes = await prisma.modulo.findMany({
    where: { tenantId },
    select: { clave: true, orden: true },
  });
  const clavesExistentes = new Set(existentes.map((m) => m.clave));
  const faltantes = CATALOGO_DEFECTO.filter((m) => !clavesExistentes.has(m.clave));
  if (faltantes.length === 0) return;

  const ordenBase = existentes.reduce((max, m) => Math.max(max, m.orden), -1) + 1;
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
function tieneAcceso(req: AuthenticatedRequest, permisoClave: string | null): boolean {
  if (req.user!.isSuperadmin) return true;
  if (!permisoClave) return true;
  return req.user!.permisos.includes(permisoClave);
}

/**
 * Listado completo (incluye inactivos) para la pantalla de administración.
 */
export const listarModulos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    await asegurarCatalogoDefecto(tenantId);

    const modulos = await prisma.modulo.findMany({
      where: whereAlcance(tenantId),
      include: { departamento: { select: { id: true, nombre: true } } },
      orderBy: { orden: "asc" },
    });

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
    await asegurarCatalogoDefecto(tenantId);

    const modulos = await prisma.modulo.findMany({
      where: { ...whereAlcance(tenantId), activo: true },
      include: { departamento: { select: { id: true, nombre: true } } },
      orderBy: { orden: "asc" },
    });

    const visibles = modulos.filter((m) => tieneAcceso(req, m.permisoClave));

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
      if (alcance !== "GENERAL" && alcance !== "TENANT") {
        return res.status(400).json({ message: 'El alcance debe ser "GENERAL" o "TENANT".' });
      }
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
