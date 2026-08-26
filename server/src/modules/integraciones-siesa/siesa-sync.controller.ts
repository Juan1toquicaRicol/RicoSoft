import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";
import { sincronizarProveedoresDesdeSiesa } from "./siesa-sync.service";

export async function sincronizarProveedores(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { siesaCiaId: true } });
  if (!tenant?.siesaCiaId) {
    res.status(409).json({
      error: "Este tenant no tiene una compañía de Siesa (siesaCiaId) configurada, no se puede sincronizar.",
    });
    return;
  }

  try {
    const resultado = await sincronizarProveedoresDesdeSiesa(tenantId, tenant.siesaCiaId);
    res.json(resultado);
  } catch (err) {
    console.error("Error sincronizando proveedores desde Siesa:", err);
    res.status(502).json({
      error: "No se pudo conectar o leer desde la base de Siesa. Verifica el túnel VPN y las credenciales.",
    });
  }
}
