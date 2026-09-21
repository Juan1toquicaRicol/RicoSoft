import { prisma } from "../config/prisma";

/**
 * H-07: resuelve la compañía Siesa (siesaCiaId) de un tenant — SIEMPRE
 * desde el tenant autenticado (req.user!.tenantId), nunca de un parámetro
 * de la URL/body/query. Antes de este helper, cada módulo Siesa
 * (Despachos, Toma Física, Importaciones, y variantes inline en
 * Analítica/Créditos/Gerencial/Inventario/Objetivos/Proformas/Ventas/
 * Comercial/Cotizaciones/Siesa-sync) repetía exactamente esta misma
 * consulta — 3 líneas idénticas duplicadas en ~10 archivos. Centralizarla
 * no cambia el comportamiento: sigue devolviendo `null` (nunca lanza)
 * cuando el tenant no tiene siesaCiaId configurado, exactamente igual que
 * las implementaciones que reemplaza — cada caller sigue decidiendo cómo
 * responder a ese `null` (algunos con `disponible:false` en un 200, otros
 * con 400/502 según el endpoint), porque esa decisión es específica de cada
 * ruta y no debe centralizarse aquí.
 *
 * Mapeo real de compañías (NO tocar / NO romper): Ricol=1, Flexipack=2,
 * Green=3. Este helper no conoce esos números — solo lee lo que el tenant
 * tiene configurado en su propia fila de Tenant.siesaCiaId — así que un
 * tenant sin configuración nunca "cae" a una compañía por defecto ni a un
 * query global sin filtrar: siempre null, nunca un `1` adivinado.
 */
export async function resolverCiaSiesa(tenantId: string): Promise<number | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { siesaCiaId: true },
  });
  return tenant?.siesaCiaId ?? null;
}
