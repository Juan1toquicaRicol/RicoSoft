import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthenticatedRequest } from "../../middleware/auth.middleware";
import { usuariosDelBiometrico } from "./biometrico-usuarios.service";

/**
 * GET /biometrico/usuarios — usuarios registrados en el biométrico (CrossChex),
 * para elegir el ID al crear una asociación. Solo lectura. `asociado` indica si
 * ese ID ya tiene una asociación (activa o inactiva) en alguna fuente del tenant:
 * las restricciones únicas cuentan también las inactivas.
 */
export async function listarUsuariosBiometrico(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId;
    const usuarios = await usuariosDelBiometrico(tenantId);

    const asociaciones = await prisma.empleadoBiometrico.findMany({
      where: { tenantId },
      select: { externalUserId: true },
    });
    const asociados = new Set(asociaciones.map((a) => a.externalUserId));

    const items = [...usuarios.mapa.values()]
      .map((u) => ({
        userid: u.userid,
        codigo: u.codigo,
        nombre: u.nombre,
        asociado: asociados.has(u.userid),
      }))
      // Con nombre primero (alfabético); los que no tienen nombre al final, por ID.
      .sort((a, b) => {
        if ((a.nombre === null) !== (b.nombre === null)) return a.nombre === null ? 1 : -1;
        return (a.nombre ?? a.userid).localeCompare(b.nombre ?? b.userid, "es", { numeric: true });
      });

    return res.json({
      items,
      disponible: usuarios.disponible,
      incompleto: usuarios.incompleto,
    });
  } catch (error) {
    console.error("Error al listar usuarios del biométrico:", error);
    return res.status(500).json({ message: "Error al obtener los usuarios del biométrico." });
  }
}
