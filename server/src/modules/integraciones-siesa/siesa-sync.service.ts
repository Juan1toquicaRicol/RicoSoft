import { getSiesaPool } from "../../config/siesa";
import { prisma } from "../../config/prisma";

export interface ResultadoSincronizacion {
  leidos: number;
  creados: number;
  actualizados: number;
  errores: { nit: string; mensaje: string }[];
}

interface ProveedorSiesa {
  nit: string;
  nombre: string;
}

/**
 * Lee proveedores desde Siesa/UnoEE (tablas t202_mm_proveedores + t200_mm_terceros)
 * y los refleja como Proveedor en la base interna, para UNA sola compañía de
 * Siesa (f202_id_cia). Siesa es la fuente de verdad: solo lectura allá, solo
 * escritura acá.
 *
 * IMPORTANTE: UnoEE_Ricol_Real contiene varias compañías (Ricol, Flexipack,
 * Green Solutions...) en las mismas tablas, distinguidas por f202_id_cia. Un
 * mismo NIT puede existir como proveedor en más de una compañía con datos
 * distintos, así que siempre hay que filtrar por ciaId — nunca traer todas
 * las compañías mezcladas hacia un solo tenant.
 *
 * Nota: Se usan solo NIT y nombre por ahora. Para teléfono/email habría que
 * explorar la tabla de contactos de Siesa.
 */
export async function sincronizarProveedoresDesdeSiesa(
  tenantId: string,
  ciaId: number,
): Promise<ResultadoSincronizacion> {
  const pool = await getSiesaPool();

  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .query<ProveedorSiesa>(`
    SELECT
      t200.f200_nit AS nit,
      t200.f200_razon_social AS nombre
    FROM t202_mm_proveedores t202
    INNER JOIN t200_mm_terceros t200
      ON t202.f202_rowid_tercero = t200.f200_rowid
    WHERE t202.f202_id_cia = @ciaId
      AND t200.f200_ind_estado = 1
      AND t202.f202_ind_estado = 1
      AND t200.f200_nit IS NOT NULL
      AND LTRIM(RTRIM(t200.f200_nit)) != ''
  `);

  const resultado: ResultadoSincronizacion = { leidos: recordset.length, creados: 0, actualizados: 0, errores: [] };

  // Se consulta en lotes qué NITs ya existen, en vez de un findUnique por
  // proveedor: reduce las idas y vueltas a la BD en sincronizaciones grandes,
  // respetando el límite de 2100 parámetros por consulta de SQL Server.
  const TAMANO_LOTE = 1000;
  const nitsExistentes = new Set<string>();
  const todosLosNits = recordset.map((p) => p.nit);
  for (let i = 0; i < todosLosNits.length; i += TAMANO_LOTE) {
    const lote = todosLosNits.slice(i, i + TAMANO_LOTE);
    const existentes = await prisma.proveedor.findMany({
      where: { tenantId, nit: { in: lote } },
      select: { nit: true },
    });
    existentes.forEach((p) => nitsExistentes.add(p.nit));
  }

  for (const prov of recordset) {
    try {
      await prisma.proveedor.upsert({
        where: { tenantId_nit: { tenantId, nit: prov.nit } },
        create: {
          tenantId,
          nit: prov.nit,
          nombre: prov.nombre,
        },
        update: {
          nombre: prov.nombre,
        },
      });

      if (nitsExistentes.has(prov.nit)) resultado.actualizados++;
      else resultado.creados++;
    } catch (err) {
      resultado.errores.push({ nit: prov.nit, mensaje: err instanceof Error ? err.message : String(err) });
    }
  }

  return resultado;
}
