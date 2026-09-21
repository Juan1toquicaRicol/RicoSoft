import { getSiesaPool } from "../../config/siesa";

/**
 * Ficha 360 del cliente — identidad + condición comercial, leída en vivo de
 * t200_mm_terceros (maestro global, sin id_cia) + t201_mm_clientes (rol
 * cliente POR compañía, con id_cia propio — el join con t201 es obligatorio
 * para no consultar t200 aislado, ver auditoría previa). El vendedor no vive
 * en t201; se deriva del pedido/factura más reciente del cliente (mismo
 * criterio que ya usa siesa-ventas.service.ts para vendedor por documento).
 */
export interface ClienteSiesa {
  clienteRowId: number;
  nit: string | null;
  razonSocial: string | null;
  activoTercero: boolean;
  activoCliente: boolean;
  bloqueadoEstado: boolean;
  cupoCredito: number;
  bloqueadoCupo: boolean;
  bloqueadoMora: boolean;
  condicionPagoCodigo: string | null;
  condicionPagoDescripcion: string | null;
  tipoClienteCodigo: string | null;
  calificacion: string | null;
  vendedorRowId: number | null;
  vendedorNombre: string | null;
}

export interface ClienteBusqueda {
  clienteRowId: number;
  nombre: string | null;
  nit: string | null;
}

/** Autocompletado de cliente por razón social o NIT — solo clientes activos. */
export async function buscarClientesSiesa(
  ciaId: number,
  search: string,
  limite = 10,
): Promise<ClienteBusqueda[]> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("search", `%${search}%`)
    .input("limite", limite).query<{
    clienteRowId: number;
    nombre: string | null;
    nit: string | null;
  }>(`
    SELECT TOP (@limite)
      t.f200_rowid AS clienteRowId,
      t.f200_razon_social AS nombre,
      t.f200_nit AS nit
    FROM t200_mm_terceros t
    INNER JOIN t201_mm_clientes c
      ON c.f201_rowid_tercero = t.f200_rowid AND c.f201_id_cia = @ciaId
    WHERE c.f201_ind_estado_activo = 1
      AND (t.f200_razon_social LIKE @search OR t.f200_nit LIKE @search)
    ORDER BY t.f200_razon_social
  `);
  return recordset.map((r) => ({
    clienteRowId: r.clienteRowId,
    nombre: r.nombre?.trim() || null,
    nit: r.nit?.trim() || null,
  }));
}

export async function leerClienteSiesa(
  ciaId: number,
  clienteRowId: number,
): Promise<ClienteSiesa | null> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId).query<{
    nit: string | null;
    razonSocial: string | null;
    activoTercero: number;
    activoCliente: number | null;
    bloqueadoEstado: number | null;
    cupoCredito: number | null;
    bloqueadoCupo: number | null;
    bloqueadoMora: number | null;
    condicionPagoCodigo: string | null;
    condicionPagoDescripcion: string | null;
    tipoClienteCodigo: string | null;
    calificacion: string | null;
  }>(`
    SELECT
      t.f200_nit AS nit,
      t.f200_razon_social AS razonSocial,
      t.f200_ind_estado AS activoTercero,
      c.f201_ind_estado_activo AS activoCliente,
      c.f201_ind_estado_bloqueado AS bloqueadoEstado,
      c.f201_cupo_credito AS cupoCredito,
      c.f201_ind_bloqueo_cupo AS bloqueadoCupo,
      c.f201_ind_bloqueo_mora AS bloqueadoMora,
      c.f201_id_cond_pago AS condicionPagoCodigo,
      cp.f208_descripcion AS condicionPagoDescripcion,
      c.f201_id_tipo_cli AS tipoClienteCodigo,
      c.f201_ind_calificacion AS calificacion
    FROM t200_mm_terceros t
    INNER JOIN t201_mm_clientes c
      ON c.f201_rowid_tercero = t.f200_rowid AND c.f201_id_cia = @ciaId
    LEFT JOIN t208_mm_condiciones_pago cp
      ON cp.f208_id_cia = @ciaId AND cp.f208_id = c.f201_id_cond_pago
    WHERE t.f200_rowid = @clienteRowId
  `);

  const fila = recordset[0];
  if (!fila) return null;

  // Vendedor: no vive en t201 — se deriva del pedido más reciente del
  // cliente en esta compañía (mismo tercero_vendedor que ya usa el resto del
  // sistema, nunca inventado). Puede ser null si el cliente nunca tuvo pedidos.
  const { recordset: vendedorRows } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId).query<{
    vendedorRowId: number | null;
    vendedorNombre: string | null;
  }>(`
    SELECT TOP 1
      d.f430_rowid_tercero_vendedor AS vendedorRowId,
      tv.f200_razon_social AS vendedorNombre
    FROM t430_cm_pv_docto d
    LEFT JOIN t200_mm_terceros tv ON tv.f200_rowid = d.f430_rowid_tercero_vendedor
    WHERE d.f430_id_cia = @ciaId AND d.f430_rowid_tercero_fact = @clienteRowId
    ORDER BY d.f430_id_fecha DESC, d.f430_rowid DESC
  `);
  const vendedor = vendedorRows[0];

  return {
    clienteRowId,
    nit: fila.nit?.trim() || null,
    razonSocial: fila.razonSocial?.trim() || null,
    activoTercero: fila.activoTercero === 1,
    activoCliente: fila.activoCliente === 1,
    bloqueadoEstado: fila.bloqueadoEstado === 1,
    cupoCredito: Number(fila.cupoCredito ?? 0),
    bloqueadoCupo: fila.bloqueadoCupo === 1,
    bloqueadoMora: fila.bloqueadoMora === 1,
    condicionPagoCodigo: fila.condicionPagoCodigo?.trim() || null,
    condicionPagoDescripcion: fila.condicionPagoDescripcion?.trim() || null,
    tipoClienteCodigo: fila.tipoClienteCodigo?.trim() || null,
    calificacion: fila.calificacion?.trim() || null,
    vendedorRowId: vendedor?.vendedorRowId ?? null,
    vendedorNombre: vendedor?.vendedorNombre?.trim() || null,
  };
}

/**
 * Datos de facturación (contacto/dirección/ciudad) para documentos como la
 * proforma. NO viven en t200/t201 — se derivan de t200_mm_terceros.
 * f200_rowid_contacto -> t015_mm_contactos, con ciudad/departamento
 * resueltos por separado en t013_mm_ciudades/t012_mm_deptos (verificado
 * contra la BD real: ni t200 ni t201 traen estas columnas).
 */
export interface DatosFacturacionCliente {
  clienteRowId: number;
  contactoNombre: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  ciudad: string | null;
  departamento: string | null;
}

export async function leerDatosFacturacionCliente(
  ciaId: number,
  clienteRowId: number,
): Promise<DatosFacturacionCliente | null> {
  const pool = await getSiesaPool();
  const { recordset } = await pool
    .request()
    .input("ciaId", ciaId)
    .input("clienteRowId", clienteRowId).query<{
    contactoNombre: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    ciudad: string | null;
    departamento: string | null;
  }>(`
    SELECT
      c.f015_contacto AS contactoNombre,
      c.f015_direccion1 AS direccion,
      c.f015_telefono AS telefono,
      c.f015_email AS email,
      ciu.f013_descripcion AS ciudad,
      dep.f012_descripcion AS departamento
    FROM t200_mm_terceros t
    LEFT JOIN t015_mm_contactos c
      ON c.f015_rowid = t.f200_rowid_contacto AND c.f015_id_cia = @ciaId
    LEFT JOIN t013_mm_ciudades ciu
      ON ciu.f013_id = c.f015_id_ciudad AND ciu.f013_id_depto = c.f015_id_depto
    LEFT JOIN t012_mm_deptos dep ON dep.f012_id = c.f015_id_depto
    WHERE t.f200_rowid = @clienteRowId
  `);

  const fila = recordset[0];
  if (!fila) return null;

  return {
    clienteRowId,
    contactoNombre: fila.contactoNombre?.trim() || null,
    direccion: fila.direccion?.trim() || null,
    telefono: fila.telefono?.trim() || null,
    email: fila.email?.trim() || null,
    ciudad: fila.ciudad?.trim() || null,
    departamento: fila.departamento?.trim() || null,
  };
}
