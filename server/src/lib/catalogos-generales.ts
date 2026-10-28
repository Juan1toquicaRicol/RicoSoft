import type { PrismaClient } from "@prisma/client";
import { leerMetadata, serializarMetadata, type MetadataCatalogo } from "./catalogos";

/**
 * Valores GENERALES (tenantId = null) de CatalogoValor: única fuente de datos
 * para prisma/seed.ts y para scripts/sincronizar-catalogos-generales.ts.
 *
 * Reglas de compatibilidad (no destructivo):
 *  - Las claves heredadas NUNCA se renombran ni se borran: hay datos guardados
 *    como texto (OrdenCompraIntl.incoterm/paisOrigen, Pago.metodoPago, etc.).
 *  - Cuando el catálogo canónico usa otra clave para lo mismo (TN vs "TON"),
 *    la fila canónica declara la heredada en `metadata.aliases` y los
 *    validadores aceptan ambas.
 *  - Los duplicados exactos heredados (DUPLICADOS_HEREDADOS) se DESACTIVAN,
 *    no se eliminan, y solo en la corrida que introduce su equivalente
 *    canónico — si un admin los reactiva después, el seed no los vuelve a
 *    apagar.
 */

export interface SemillaCatalogo {
  tipo: string;
  clave: string;
  etiqueta: string;
  descripcion?: string;
  metadata?: MetadataCatalogo;
}

const soloEtiqueta = (tipo: string, valores: string[]): SemillaCatalogo[] =>
  valores.map((v) => ({ tipo, clave: v, etiqueta: v }));

const PAISES: { codigo: string; nombre: string }[] = [
  { codigo: "DE", nombre: "Alemania" },
  { codigo: "SA", nombre: "Arabia Saudita" },
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "BE", nombre: "Bélgica" },
  { codigo: "BO", nombre: "Bolivia" },
  { codigo: "BR", nombre: "Brasil" },
  { codigo: "CA", nombre: "Canadá" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "CN", nombre: "China" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "KR", nombre: "Corea del Sur" },
  { codigo: "CR", nombre: "Costa Rica" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "AE", nombre: "Emiratos Árabes Unidos" },
  { codigo: "ES", nombre: "España" },
  { codigo: "US", nombre: "Estados Unidos" },
  { codigo: "FR", nombre: "Francia" },
  { codigo: "GT", nombre: "Guatemala" },
  { codigo: "HK", nombre: "Hong Kong" },
  { codigo: "IN", nombre: "India" },
  { codigo: "ID", nombre: "Indonesia" },
  { codigo: "IL", nombre: "Israel" },
  { codigo: "IT", nombre: "Italia" },
  { codigo: "JP", nombre: "Japón" },
  { codigo: "MY", nombre: "Malasia" },
  { codigo: "MX", nombre: "México" },
  { codigo: "NL", nombre: "Países Bajos" },
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "PL", nombre: "Polonia" },
  { codigo: "PT", nombre: "Portugal" },
  { codigo: "GB", nombre: "Reino Unido" },
  { codigo: "DO", nombre: "República Dominicana" },
  { codigo: "SG", nombre: "Singapur" },
  { codigo: "ZA", nombre: "Sudáfrica" },
  { codigo: "CH", nombre: "Suiza" },
  { codigo: "TH", nombre: "Tailandia" },
  { codigo: "TW", nombre: "Taiwán" },
  { codigo: "TR", nombre: "Turquía" },
  { codigo: "VN", nombre: "Vietnam" },
];

export const CATALOGOS_GENERALES: SemillaCatalogo[] = [
  // ── INCOTERM ── (los 11 heredados; los 5 de negocio con descripción)
  {
    tipo: "INCOTERM",
    clave: "EXW",
    etiqueta: "EXW - Ex Works",
    descripcion: "El comprador asume prácticamente toda la logística desde el origen.",
    metadata: { responsabilidad: "Comprador desde el origen" },
  },
  { tipo: "INCOTERM", clave: "FCA", etiqueta: "FCA - Free Carrier" },
  { tipo: "INCOTERM", clave: "FAS", etiqueta: "FAS - Free Alongside Ship" },
  {
    tipo: "INCOTERM",
    clave: "FOB",
    etiqueta: "FOB - Free On Board",
    descripcion: "Responsabilidad del vendedor hasta la carga a bordo.",
    metadata: { responsabilidad: "Vendedor hasta la carga a bordo" },
  },
  {
    tipo: "INCOTERM",
    clave: "CFR",
    etiqueta: "CFR - Cost and Freight",
    descripcion: "El vendedor asume costo y flete hasta el puerto de destino.",
    metadata: { responsabilidad: "Vendedor: costo y flete hasta puerto de destino" },
  },
  {
    tipo: "INCOTERM",
    clave: "CIF",
    etiqueta: "CIF - Cost, Insurance and Freight",
    descripcion: "El vendedor asume costo, seguro y flete hasta el puerto de destino.",
    metadata: { responsabilidad: "Vendedor: costo, seguro y flete hasta puerto de destino" },
  },
  { tipo: "INCOTERM", clave: "CPT", etiqueta: "CPT - Carriage Paid To" },
  { tipo: "INCOTERM", clave: "CIP", etiqueta: "CIP - Carriage and Insurance Paid To" },
  { tipo: "INCOTERM", clave: "DAP", etiqueta: "DAP - Delivered At Place" },
  { tipo: "INCOTERM", clave: "DPU", etiqueta: "DPU - Delivered At Place Unloaded" },
  {
    tipo: "INCOTERM",
    clave: "DDP",
    etiqueta: "DDP - Delivered Duty Paid",
    descripcion: "El vendedor asume la entrega y las obligaciones de importación.",
    metadata: { responsabilidad: "Vendedor: entrega y obligaciones de importación" },
  },

  // ── MONEDA ── (COP es nueva: Factura/ServicioSuscripcion ya la usan)
  {
    tipo: "MONEDA",
    clave: "COP",
    etiqueta: "Peso colombiano",
    metadata: { simbolo: "$", aliases: ["PESOS"] },
  },
  {
    tipo: "MONEDA",
    clave: "USD",
    etiqueta: "Dólar estadounidense",
    metadata: { simbolo: "US$" },
  },
  { tipo: "MONEDA", clave: "EUR", etiqueta: "Euro", metadata: { simbolo: "€" } },
  { tipo: "MONEDA", clave: "CNY", etiqueta: "Yuan chino", metadata: { simbolo: "CN¥" } },
  { tipo: "MONEDA", clave: "GBP", etiqueta: "Libra esterlina", metadata: { simbolo: "£" } },
  { tipo: "MONEDA", clave: "JPY", etiqueta: "Yen japonés", metadata: { simbolo: "JP¥" } },

  // ── PAIS ── (ISO 3166-1 alfa-2; alias = nombre que guardan las órdenes de importación)
  ...PAISES.map((p): SemillaCatalogo => ({
    tipo: "PAIS",
    clave: p.codigo,
    etiqueta: p.nombre,
    metadata: { aliases: [p.nombre] },
  })),
  // PAIS_ORIGEN: tipo heredado que consumen las importaciones (guardan el nombre).
  ...soloEtiqueta(
    "PAIS_ORIGEN",
    PAISES.map((p) => p.nombre),
  ),

  // ── CONDICION_PAGO ── (alias = textos que ya guardan las importaciones)
  {
    tipo: "CONDICION_PAGO",
    clave: "CONTADO",
    etiqueta: "Contado",
    metadata: { dias: 0, aliases: ["Contado"] },
  },
  {
    tipo: "CONDICION_PAGO",
    clave: "CREDITO_15D",
    etiqueta: "Crédito a 15 días",
    metadata: { dias: 15 },
  },
  {
    tipo: "CONDICION_PAGO",
    clave: "CREDITO_30D",
    etiqueta: "Crédito a 30 días",
    metadata: { dias: 30, aliases: ["Crédito 30 días"] },
  },
  {
    tipo: "CONDICION_PAGO",
    clave: "CREDITO_60D",
    etiqueta: "Crédito a 60 días",
    metadata: { dias: 60, aliases: ["Crédito 60 días"] },
  },
  {
    tipo: "CONDICION_PAGO",
    clave: "CREDITO_90D",
    etiqueta: "Crédito a 90 días",
    metadata: { dias: 90, aliases: ["Crédito 90 días"] },
  },
  // FORMA_PAGO (importaciones) y FORMA_PAGO_VENTAS (proformas): heredados, sin tocar.
  ...soloEtiqueta("FORMA_PAGO", [
    "Anticipado",
    "Carta de crédito",
    "Crédito 30 días",
    "Crédito 60 días",
    "Crédito 90 días",
    "Contra entrega",
  ]),
  ...soloEtiqueta("FORMA_PAGO_VENTAS", ["Contado", "Crédito 1 día"]),

  // ── METODO_PAGO ── (separado de CONDICION_PAGO)
  {
    tipo: "METODO_PAGO",
    clave: "TRANSFERENCIA",
    etiqueta: "Transferencia",
    metadata: { aliases: ["Transferencia"] },
  },
  { tipo: "METODO_PAGO", clave: "CHEQUE", etiqueta: "Cheque", metadata: { aliases: ["Cheque"] } },
  { tipo: "METODO_PAGO", clave: "CARTA_CREDITO", etiqueta: "Carta de crédito" },
  ...soloEtiqueta("METODO_PAGO", ["Efectivo", "Tarjeta", "Otro"]),

  // ── UNIDAD_MEDIDA ──
  { tipo: "UNIDAD_MEDIDA", clave: "KG", etiqueta: "Kilogramo" },
  { tipo: "UNIDAD_MEDIDA", clave: "TN", etiqueta: "Tonelada", metadata: { aliases: ["TON"] } },
  {
    tipo: "UNIDAD_MEDIDA",
    clave: "SACO_25KG",
    etiqueta: "Saco de 25 KG",
    metadata: { aliases: ["SACO25KG"] },
  },
  { tipo: "UNIDAD_MEDIDA", clave: "BIG_BAG", etiqueta: "Big Bag" },
  ...soloEtiqueta("UNIDAD_MEDIDA", ["SACO50KG", "LT", "UND"]),

  // ── MOTIVO_NOVEDAD_DESPACHO ── (los 9 tipos que estaban fijos en el código
  // de despachos, con las dos equivalencias de nombre como alias)
  {
    tipo: "MOTIVO_NOVEDAD_DESPACHO",
    clave: "FALTANTE",
    etiqueta: "Faltante",
    metadata: { aliases: ["PRODUCTO_FALTANTE"] },
  },
  {
    tipo: "MOTIVO_NOVEDAD_DESPACHO",
    clave: "EMPAQUE_AVERIADO",
    etiqueta: "Empaque averiado",
    metadata: { aliases: ["MERCANCIA_AVERIADA"] },
  },
  {
    tipo: "MOTIVO_NOVEDAD_DESPACHO",
    clave: "RETRASO_TRANSPORTE",
    etiqueta: "Retraso de transporte",
  },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", clave: "DIFERENCIA_PESAJE", etiqueta: "Diferencia de pesaje" },
  {
    tipo: "MOTIVO_NOVEDAD_DESPACHO",
    clave: "DIRECCION_INCORRECTA",
    etiqueta: "Dirección incorrecta",
  },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", clave: "CLIENTE_AUSENTE", etiqueta: "Cliente ausente" },
  {
    tipo: "MOTIVO_NOVEDAD_DESPACHO",
    clave: "VEHICULO_NO_DISPONIBLE",
    etiqueta: "Vehículo no disponible",
  },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", clave: "ENTREGA_PARCIAL", etiqueta: "Entrega parcial" },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", clave: "RECHAZO_CLIENTE", etiqueta: "Rechazo del cliente" },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", clave: "DEVOLUCION", etiqueta: "Devolución" },
  { tipo: "MOTIVO_NOVEDAD_DESPACHO", clave: "OTRA", etiqueta: "Otra" },

  // ── ESTADO_COMERCIAL ── (unión de los estados que ya usan Proforma,
  // Cotización y PedidoComercial; los alias cubren las variantes de mayúsculas
  // y de género que existen hoy entre documentos)
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "BORRADOR",
    etiqueta: "Borrador",
    metadata: { documento: "COTIZACION, PEDIDO" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "ACTIVA",
    etiqueta: "Activa",
    metadata: { documento: "PROFORMA", aliases: ["activa"] },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "ENVIADA",
    etiqueta: "Enviada",
    metadata: { documento: "PROFORMA, COTIZACION" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "ACEPTADA",
    etiqueta: "Aceptada",
    metadata: { documento: "PROFORMA" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "PEDIDO_CREADO",
    etiqueta: "Pedido creado",
    metadata: { documento: "PROFORMA" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "APROBADA",
    etiqueta: "Aprobada",
    metadata: { documento: "COTIZACION" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "RECHAZADA",
    etiqueta: "Rechazada",
    metadata: { documento: "COTIZACION" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "CONVERTIDA",
    etiqueta: "Convertida",
    metadata: { documento: "COTIZACION" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "CONFIRMADO",
    etiqueta: "Confirmado",
    metadata: { documento: "PEDIDO" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "LISTO_PARA_ERP",
    etiqueta: "Listo para ERP",
    metadata: { documento: "PEDIDO" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "SINCRONIZADO",
    etiqueta: "Sincronizado",
    metadata: { documento: "PEDIDO" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "ERROR_SINCRONIZACION",
    etiqueta: "Error de sincronización",
    metadata: { documento: "PEDIDO" },
  },
  {
    tipo: "ESTADO_COMERCIAL",
    clave: "ANULADA",
    etiqueta: "Anulada",
    metadata: { documento: "PROFORMA, COTIZACION, PEDIDO", aliases: ["anulada", "ANULADO"] },
  },

  // ── TIPO_OPORTUNIDAD ── El CRM actual no clasifica oportunidades por tipo
  // (solo registra acción/resultado de cada contacto). El único concepto real
  // en el código es el cruce "cliente que ya compró + hay existencia"
  // (lib/oportunidad-comercial-siesa.ts); no se inventan más tipos.
  {
    tipo: "TIPO_OPORTUNIDAD",
    clave: "RECOMPRA_PRODUCTO",
    etiqueta: "Recompra de producto habitual",
    descripcion: "Cliente que ya compró el producto y hoy hay existencia disponible.",
  },

  // ── Otros catálogos vigentes, sin cambios ──
  ...[
    { clave: "Retraso", etiqueta: "Retraso" },
    { clave: "DocumentoFaltante", etiqueta: "Documento faltante" },
    { clave: "Inconsistencia", etiqueta: "Inconsistencia" },
    { clave: "Dano", etiqueta: "Daño" },
    { clave: "Faltante", etiqueta: "Faltante" },
    { clave: "ProblemaAduanero", etiqueta: "Problema aduanero" },
    { clave: "ProblemaProveedor", etiqueta: "Problema con el proveedor" },
    { clave: "ProblemaTransporte", etiqueta: "Problema de transporte" },
    { clave: "ProblemaFinanciero", etiqueta: "Problema financiero" },
    { clave: "Bloqueo", etiqueta: "Bloqueo" },
    { clave: "Otro", etiqueta: "Otro" },
  ].map((c): SemillaCatalogo => ({ tipo: "MOTIVO_NOVEDAD_IMPORTACION", ...c })),
  ...soloEtiqueta("ACCION_CONTACTO_OPORTUNIDAD", [
    "Llamada",
    "WhatsApp",
    "Correo",
    "Reunion",
    "Visita",
    "Cotizacion",
    "Seguimiento",
    "Otro",
  ]),
  ...[
    { clave: "Contactado", etiqueta: "Contactado" },
    { clave: "SinRespuesta", etiqueta: "Sin respuesta" },
    { clave: "Interesado", etiqueta: "Interesado" },
    { clave: "CotizacionSolicitada", etiqueta: "Cotización solicitada" },
    { clave: "CotizacionEnviada", etiqueta: "Cotización enviada" },
    { clave: "EnNegociacion", etiqueta: "En negociación" },
    { clave: "NoInteresado", etiqueta: "No interesado" },
    { clave: "VentaRealizada", etiqueta: "Venta realizada" },
  ].map((c): SemillaCatalogo => ({ tipo: "RESULTADO_CONTACTO_OPORTUNIDAD", ...c })),
];

/**
 * Duplicados exactos que el catálogo canónico reemplaza. Se desactivan (nunca
 * se borran) al introducir el equivalente; el alias del canónico sigue
 * validando el texto viejo guardado en datos históricos.
 */
export const DUPLICADOS_HEREDADOS: { tipo: string; heredada: string; canonica: string }[] = [
  { tipo: "UNIDAD_MEDIDA", heredada: "TON", canonica: "TN" },
  { tipo: "UNIDAD_MEDIDA", heredada: "SACO25KG", canonica: "SACO_25KG" },
  { tipo: "METODO_PAGO", heredada: "Transferencia", canonica: "TRANSFERENCIA" },
  { tipo: "METODO_PAGO", heredada: "Cheque", canonica: "CHEQUE" },
];

export interface ResultadoSincronizacionCatalogos {
  creados: number;
  enriquecidos: number;
  desactivados: number;
}

/**
 * Deja los catálogos GENERALES al día de forma idempotente:
 *  - crea lo que falta (orden = posición dentro de su tipo);
 *  - a lo ya existente solo le AGREGA lo que no tiene (descripción, metadata) y
 *    solo cambia la etiqueta si sigue siendo igual a la clave (o sea, nadie la
 *    personalizó). Nunca pisa ediciones de un administrador ni el estado activo.
 */
export async function sincronizarCatalogosGenerales(
  cliente: PrismaClient,
): Promise<ResultadoSincronizacionCatalogos> {
  const resultado: ResultadoSincronizacionCatalogos = {
    creados: 0,
    enriquecidos: 0,
    desactivados: 0,
  };
  const creadasEstaCorrida = new Map<string, string>();
  const ordenPorTipo = new Map<string, number>();

  for (const semilla of CATALOGOS_GENERALES) {
    const orden = ordenPorTipo.get(semilla.tipo) ?? 0;
    ordenPorTipo.set(semilla.tipo, orden + 1);

    const existente = await cliente.catalogoValor.findFirst({
      where: { tipo: semilla.tipo, clave: semilla.clave, tenantId: null },
    });

    if (!existente) {
      const creada = await cliente.catalogoValor.create({
        data: {
          tipo: semilla.tipo,
          clave: semilla.clave,
          etiqueta: semilla.etiqueta,
          descripcion: semilla.descripcion ?? null,
          metadata: serializarMetadata(semilla.metadata),
          orden,
          tenantId: null,
        },
      });
      creadasEstaCorrida.set(`${semilla.tipo}/${semilla.clave}`, creada.id);
      resultado.creados++;
      continue;
    }

    const cambios: { etiqueta?: string; descripcion?: string; metadata?: string } = {};
    if (existente.etiqueta === existente.clave && semilla.etiqueta !== existente.etiqueta) {
      cambios.etiqueta = semilla.etiqueta;
    }
    if (!existente.descripcion && semilla.descripcion) cambios.descripcion = semilla.descripcion;
    const metadataActual = leerMetadata(existente.metadata);
    const metadataSemilla = semilla.metadata;
    if (metadataSemilla) {
      // Los alias son parte del contrato de compatibilidad: aunque un
      // administrador ya haya agregado otros metadatos a la fila canónica,
      // la sincronización debe incorporar los alias aprobados sin borrarlos.
      const aliasesActuales = metadataActual.aliases ?? [];
      const aliasesSemilla = metadataSemilla.aliases ?? [];
      const aliasesCombinados = [...new Set([...aliasesActuales, ...aliasesSemilla])];
      const agregarMetadataInicial = Object.keys(metadataActual).length === 0;
      const metadataCombinada: MetadataCatalogo = {
        ...(agregarMetadataInicial ? metadataSemilla : metadataActual),
        ...(aliasesCombinados.length ? { aliases: aliasesCombinados } : {}),
      };
      const metadataSerializada = serializarMetadata(metadataCombinada);
      if (metadataSerializada !== existente.metadata)
        cambios.metadata = metadataSerializada ?? undefined;
    }
    if (Object.keys(cambios).length > 0) {
      await cliente.catalogoValor.update({ where: { id: existente.id }, data: cambios });
      resultado.enriquecidos++;
    }
  }

  for (const par of DUPLICADOS_HEREDADOS) {
    const canonicaId = creadasEstaCorrida.get(`${par.tipo}/${par.canonica}`);
    if (!canonicaId) continue;
    // La canónica se excluye por id: con la collation por defecto de SQL Server
    // (sin distinguir mayúsculas) `Transferencia` y `TRANSFERENCIA` son la misma
    // clave y, sin esta exclusión, la sincronización apagaba la fila que acaba de crear.
    const { count } = await cliente.catalogoValor.updateMany({
      where: {
        tipo: par.tipo,
        clave: par.heredada,
        tenantId: null,
        activo: true,
        id: { not: canonicaId },
      },
      data: { activo: false },
    });
    resultado.desactivados += count;
  }

  return resultado;
}
