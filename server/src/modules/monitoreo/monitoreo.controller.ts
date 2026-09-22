import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { obtenerReporteSiesa } from "./siesa-health.service";
import { componerJobsMonitoreados, estadoSincronizacionProveedores } from "./jobs-monitoreo";

const SELECCION_LOG = { estado: true, iniciadoEn: true, finalizadoEn: true, mensajeError: true };

/**
 * GET /api/monitoreo/siesa[?forzar=true] — salud de la conexión a Siesa y de
 * la VPN. La infraestructura es única (una base Siesa para todos los tenants),
 * así que el reporte es el mismo para todos; lo único propio del tenant es si
 * tiene una compañía Siesa configurada. Nunca devuelve credenciales ni
 * cadenas de conexión (ver siesa-health.service.ts).
 */
export const obtenerMonitoreoSiesa = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { siesaCiaId: true },
    });
    const { reporte, desdeCache } = await obtenerReporteSiesa({
      forzar: req.query.forzar === "true",
    });
    return res.json({
      ...reporte,
      desdeCache,
      tenant: { siesaCiaConfigurada: tenant?.siesaCiaId != null },
    });
  } catch (error) {
    console.error("Error al comprobar Siesa:", error);
    return res.status(500).json({ message: "No fue posible comprobar el estado de Siesa." });
  }
};

/**
 * GET /api/monitoreo/jobs — estado de los procesos en background. Los crons
 * reportan lo que ESTE proceso del servidor ha hecho desde que arrancó; la
 * sincronización de proveedores viene de su log en BD, filtrado por el tenant
 * de la sesión.
 */
export const obtenerMonitoreoJobs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenantId = req.user!.tenantId;
    const [ultimo, ultimoCompletado, ultimoFallido] = await Promise.all([
      prisma.sincronizacionSiesaLog.findFirst({
        where: { tenantId },
        orderBy: { iniciadoEn: "desc" },
        select: SELECCION_LOG,
      }),
      prisma.sincronizacionSiesaLog.findFirst({
        where: { tenantId, estado: "COMPLETADO" },
        orderBy: { iniciadoEn: "desc" },
        select: SELECCION_LOG,
      }),
      prisma.sincronizacionSiesaLog.findFirst({
        where: { tenantId, estado: "FALLIDO" },
        orderBy: { iniciadoEn: "desc" },
        select: SELECCION_LOG,
      }),
    ]);

    return res.json({
      generadoEn: new Date().toISOString(),
      nota: "Los procesos programados reportan su actividad desde el último reinicio del servidor.",
      jobs: componerJobsMonitoreados(
        estadoSincronizacionProveedores({ ultimo, ultimoCompletado, ultimoFallido }),
      ),
    });
  } catch (error) {
    console.error("Error al obtener el estado de los jobs:", error);
    return res.status(500).json({ message: "No fue posible obtener el estado de los procesos." });
  }
};
