import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";

/**
 * Catálogo por defecto de módulos principales de la aplicación. Se usa para
 * poblar la tabla Modulo la primera vez que un tenant la consulta, ya que
 * los módulos existían antes como enlaces fijos del sidebar (sin registro
 * en base de datos). Sin departamento asignado hasta que un admin lo haga
 * desde Configuración.
 */
const CATALOGO_DEFECTO: Array<{ clave: string; nombre: string; ruta: string; icono: string }> = [
  { clave: "dashboard", nombre: "Dashboard", ruta: "/", icono: "LayoutDashboard" },
  { clave: "facturas", nombre: "Facturación y Pagos", ruta: "/facturas", icono: "FileText" },
  {
    clave: "solicitudes-compra",
    nombre: "Solicitudes de Compra",
    ruta: "/solicitudes-compra",
    icono: "ShoppingCart",
  },
  {
    clave: "historia-compras",
    nombre: "Historia de Compras",
    ruta: "/historia-compras",
    icono: "History",
  },
  { clave: "servicios", nombre: "Servicios y Suscripciones", ruta: "/servicios", icono: "Repeat" },
  { clave: "contratos", nombre: "Contratos", ruta: "/contratos", icono: "FileSignature" },
  { clave: "reglas", nombre: "Motor de Reglas", ruta: "/reglas", icono: "Workflow" },
  { clave: "creditos", nombre: "Créditos de Clientes", ruta: "/creditos", icono: "CreditCard" },
  { clave: "gestion-humana", nombre: "Gestión Humana", ruta: "/gestion-humana", icono: "Briefcase" },
  { clave: "analitica", nombre: "Analítica", ruta: "/analitica", icono: "BarChart3" },
  { clave: "proyeccion", nombre: "Proyección Financiera", ruta: "/proyeccion", icono: "TrendingUp" },
  { clave: "bandeja", nombre: "Bandeja de Entrada", ruta: "/bandeja", icono: "Inbox" },
  { clave: "importaciones", nombre: "Importaciones y Exportaciones", ruta: "/importaciones", icono: "Ship" },
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
      orden: ordenBase + index,
    })),
  });
}

const serializar = (modulo: {
  id: string;
  clave: string;
  nombre: string;
  ruta: string;
  icono: string;
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
  activo: modulo.activo,
  orden: modulo.orden,
  departamentoId: modulo.departamentoId,
  departamento: modulo.departamento ? { id: modulo.departamento.id, nombre: modulo.departamento.nombre } : null,
});

/**
 * Listado completo (incluye inactivos) para la pantalla de administración.
 */
export const listarModulos = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    await asegurarCatalogoDefecto(tenantId);

    const modulos = await prisma.modulo.findMany({
      where: { tenantId },
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
 * Listado reducido para construir el menú lateral: solo módulos activos,
 * accesible para cualquier usuario autenticado (no requiere modulos.ver).
 */
export const listarModulosMenu = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    await asegurarCatalogoDefecto(tenantId);

    const modulos = await prisma.modulo.findMany({
      where: { tenantId, activo: true },
      include: { departamento: { select: { id: true, nombre: true } } },
      orderBy: { orden: "asc" },
    });

    return res.json(modulos.map(serializar));
  } catch (error) {
    console.error("Error al listar módulos del menú:", error);
    return res.status(500).json({ message: "Error al obtener los módulos." });
  }
};

export const actualizarModulo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const tenantId = req.user!.tenantId;
    const { departamentoId, activo, orden } = req.body;

    const existente = await prisma.modulo.findFirst({ where: { id, tenantId } });
    if (!existente) {
      return res.status(404).json({ message: "Módulo no encontrado." });
    }

    if (departamentoId) {
      const departamento = await prisma.departamento.findFirst({ where: { id: departamentoId, tenantId } });
      if (!departamento) {
        return res.status(400).json({ message: "El departamento indicado no existe." });
      }
    }

    const modulo = await prisma.modulo.update({
      where: { id },
      data: {
        ...(departamentoId !== undefined ? { departamentoId: departamentoId || null } : {}),
        ...(typeof activo === "boolean" ? { activo } : {}),
        ...(typeof orden === "number" ? { orden } : {}),
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
