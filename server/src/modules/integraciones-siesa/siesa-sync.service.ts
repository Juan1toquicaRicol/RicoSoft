import { getSiesaPool } from "../../config/siesa";
import { prisma } from "../../config/prisma";

export interface ProveedorSiesa {
  nit: string;
  nombre: string;
  /** t200_mm_terceros.f200_rowid — identidad técnica estable del tercero,
   * independiente del NIT. Ver Proveedor.siesaTerceroRowId en schema.prisma. */
  siesaTerceroRowId: number;
}

/**
 * Lee proveedores activos desde Siesa/UnoEE (t202_mm_proveedores +
 * t200_mm_terceros) para UNA sola compañía (f202_id_cia). Siesa es la fuente
 * de verdad: solo lectura allá.
 */
async function leerProveedoresDesdeSiesa(ciaId: number): Promise<ProveedorSiesa[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool.request().input("ciaId", ciaId).query<ProveedorSiesa>(`
    SELECT
      t200.f200_nit AS nit,
      t200.f200_razon_social AS nombre,
      t200.f200_rowid AS siesaTerceroRowId
    FROM t202_mm_proveedores t202
    INNER JOIN t200_mm_terceros t200
      ON t202.f202_rowid_tercero = t200.f200_rowid
    WHERE t202.f202_id_cia = @ciaId
      AND t200.f200_ind_estado = 1
      AND t202.f202_ind_estado = 1
      AND t200.f200_nit IS NOT NULL
      AND LTRIM(RTRIM(t200.f200_nit)) != ''
  `);
  return recordset;
}

/**
 * Actualiza el progreso del log cada ciertos registros, sin saturar la BD
 * con un UPDATE por cada fila (con ~3.000 proveedores por tenant, eso serían
 * miles de writes innecesarios).
 */
async function actualizarProgreso(
  logId: string,
  contadores: {
    leidos: number;
    creados: number;
    actualizados: number;
    sinCambios: number;
    erroresCount: number;
  },
) {
  await prisma.sincronizacionSiesaLog.update({ where: { id: logId }, data: contadores });
}

/**
 * Ejecuta la sincronización completa para un tenant, actualizando el log
 * dado paso a paso. NO se llama directamente desde el controller síncrono —
 * ver siesa-sync.controller.ts, que la dispara sin esperarla (fire-and-forget
 * controlado) tras crear el log en estado EN_COLA.
 */
export async function ejecutarSincronizacion(
  logId: string,
  tenantId: string,
  ciaId: number,
): Promise<void> {
  let recordset: ProveedorSiesa[];
  try {
    recordset = await leerProveedoresDesdeSiesa(ciaId);
  } catch (err) {
    // Si la conexión a Siesa falla (p. ej. túnel VPN caído), el log NUNCA
    // debe quedar atascado en EN_COLA/EN_CURSO para siempre — eso bloquearía
    // permanentemente cualquier sincronización futura de este tenant vía el
    // control de concurrencia. Se marca FALLIDO explícitamente acá, antes de
    // delegar a procesarSincronizacion (que maneja los errores DESPUÉS de
    // tener ya un recordset).
    await prisma.sincronizacionSiesaLog.update({
      where: { id: logId },
      data: {
        estado: "FALLIDO",
        finalizadoEn: new Date(),
        mensajeError: err instanceof Error ? err.message : String(err),
      },
    });
    return;
  }
  await procesarSincronizacion(logId, tenantId, recordset);
}

/**
 * Cuántos proveedores se procesan en paralelo por lote. Cada uno hace 1-2
 * roundtrips a SQL Server (findFirst/findUnique + update|create); con miles
 * de proveedores, procesarlos uno por uno es la parte más lenta de toda la
 * sincronización. 15 en paralelo satura poco el pool de conexiones de Prisma
 * (default 5-13 según CPUs) mientras sigue dando una mejora real de
 * throughput frente a 1-en-1, sin arriesgar agotar el pool con un
 * Promise.all masivo de miles de operaciones a la vez.
 */
const CONCURRENCIA_LOTE = 15;

function dividirEnLotes<T>(items: T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
}

/**
 * El procesamiento en sí, separado de la lectura a Siesa para poder probarlo
 * con datos fabricados (tests de integración) sin necesitar el túnel VPN —
 * ver siesa-sync.integration.test.ts. Actualiza el log paso a paso.
 */
export async function procesarSincronizacion(
  logId: string,
  tenantId: string,
  recordset: ProveedorSiesa[],
): Promise<void> {
  const errores: { nit: string; mensaje: string }[] = [];
  let leidos = 0;
  let creados = 0;
  let actualizados = 0;
  let sinCambios = 0;

  try {
    await prisma.sincronizacionSiesaLog.update({
      where: { id: logId },
      data: { estado: "EN_CURSO" },
    });

    leidos = recordset.length;

    // Snapshot de proveedores YA vinculados a Siesa en este tenant, para la
    // reconciliación de desactivación al final — se calcula ANTES del loop
    // para no confundir "recién creado en esta corrida" con "ya no aparece".
    const vinculadosSiesaAntes = await prisma.proveedor.findMany({
      where: { tenantId, siesaTerceroRowId: { not: null }, activo: true },
      select: { id: true, siesaTerceroRowId: true },
    });

    const rowIdsEnEstaCorrida = new Set<number>();

    // Procesa un proveedor de Siesa (misma lógica que antes, ahora extraída
    // para poder ejecutarse en paralelo dentro de un lote). Nunca lanza:
    // cualquier error individual va a `errores`, sin abortar el resto del
    // lote ni de la corrida.
    const procesarUno = async (prov: ProveedorSiesa) => {
      try {
        rowIdsEnEstaCorrida.add(prov.siesaTerceroRowId);

        // FASE 5 del plan — orden de matching:
        // 1) por siesaTerceroRowId (identidad estable) si ya existe vinculado.
        // 2) si no, fallback por (tenantId, nit) — vincula un proveedor
        //    existente (manual o de una sincronización previa a esta
        //    columna) al tercero de Siesa.
        // 3) si ninguno coincide, se crea.
        const porRowId = await prisma.proveedor.findFirst({
          where: { tenantId, siesaTerceroRowId: prov.siesaTerceroRowId },
        });

        if (porRowId) {
          const cambioNit = porRowId.nit !== prov.nit;
          const cambioNombre =
            !porRowId.nombreEditadoManualmente && porRowId.nombre !== prov.nombre;
          if (cambioNit || cambioNombre || !porRowId.activo) {
            await prisma.proveedor.update({
              where: { id: porRowId.id },
              data: {
                nit: prov.nit,
                ...(porRowId.nombreEditadoManualmente ? {} : { nombre: prov.nombre }),
                activo: true,
                ultimaSincronizacion: new Date(),
              },
            });
            actualizados++;
          } else {
            await prisma.proveedor.update({
              where: { id: porRowId.id },
              data: { ultimaSincronizacion: new Date() },
            });
            sinCambios++;
          }
          return;
        }

        const porNit = await prisma.proveedor.findUnique({
          where: { tenantId_nit: { tenantId, nit: prov.nit } },
        });

        if (porNit) {
          // Vincula un proveedor ya existente (manual o pre-backfill) al
          // tercero de Siesa. Solo pisa `nombre` si no fue editado a mano.
          await prisma.proveedor.update({
            where: { id: porNit.id },
            data: {
              siesaTerceroRowId: prov.siesaTerceroRowId,
              origen: "SIESA",
              ...(porNit.nombreEditadoManualmente ? {} : { nombre: prov.nombre }),
              activo: true,
              ultimaSincronizacion: new Date(),
            },
          });
          actualizados++;
          return;
        }

        await prisma.proveedor.create({
          data: {
            tenantId,
            nit: prov.nit,
            nombre: prov.nombre,
            siesaTerceroRowId: prov.siesaTerceroRowId,
            origen: "SIESA",
            ultimaSincronizacion: new Date(),
          },
        });
        creados++;
      } catch (err) {
        errores.push({ nit: prov.nit, mensaje: err instanceof Error ? err.message : String(err) });
      }
    };

    let ultimoProgreso = Date.now();
    for (const lote of dividirEnLotes(recordset, CONCURRENCIA_LOTE)) {
      // Cancelación cooperativa: se revisa entre lotes (no en cada fila, para
      // no golpear la BD), y también el intervalo de progreso.
      if (Date.now() - ultimoProgreso > 3000) {
        const actual = await prisma.sincronizacionSiesaLog.findUnique({
          where: { id: logId },
          select: { cancelacionSolicitada: true },
        });
        if (actual?.cancelacionSolicitada) {
          await prisma.sincronizacionSiesaLog.update({
            where: { id: logId },
            data: {
              estado: "CANCELADO",
              finalizadoEn: new Date(),
              leidos,
              creados,
              actualizados,
              sinCambios,
              erroresCount: errores.length,
              errores: errores.length ? JSON.stringify(errores) : null,
            },
          });
          return;
        }
        await actualizarProgreso(logId, {
          leidos,
          creados,
          actualizados,
          sinCambios,
          erroresCount: errores.length,
        });
        ultimoProgreso = Date.now();
      }

      // Lote en paralelo (CONCURRENCIA_LOTE a la vez): cada `procesarUno` ya
      // captura sus propios errores, así que Promise.all nunca rechaza acá.
      await Promise.all(lote.map(procesarUno));
    }

    // FASE 6 — reconciliación: SOLO se ejecuta si la corrida llegó hasta acá
    // completa (no se interrumpió por cancelación ni excepción). Un
    // proveedor vinculado a Siesa que ya no aparece en el snapshot de esta
    // corrida se desactiva; uno que sí aparece y estaba inactivo se reactiva
    // (ya se maneja arriba con `activo: true` en el update/create).
    let desactivados = 0;
    if (leidos > 0) {
      const desaparecidos = vinculadosSiesaAntes.filter(
        (p) => p.siesaTerceroRowId !== null && !rowIdsEnEstaCorrida.has(p.siesaTerceroRowId),
      );
      for (const p of desaparecidos) {
        await prisma.proveedor.update({ where: { id: p.id }, data: { activo: false } });
        desactivados++;
      }
    }
    // Si `leidos === 0`, deliberadamente NO se reconcilia nada: podría ser un
    // problema de la consulta (filtro mal puesto, tabla vacía por error) y no
    // queremos desactivar en masa un catálogo completo por eso.

    await prisma.sincronizacionSiesaLog.update({
      where: { id: logId },
      data: {
        estado: "COMPLETADO",
        finalizadoEn: new Date(),
        leidos,
        creados,
        actualizados,
        desactivados,
        sinCambios,
        erroresCount: errores.length,
        errores: errores.length ? JSON.stringify(errores) : null,
      },
    });
  } catch (err) {
    await prisma.sincronizacionSiesaLog.update({
      where: { id: logId },
      data: {
        estado: "FALLIDO",
        finalizadoEn: new Date(),
        leidos,
        creados,
        actualizados,
        sinCambios,
        erroresCount: errores.length,
        errores: errores.length ? JSON.stringify(errores) : null,
        mensajeError: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
