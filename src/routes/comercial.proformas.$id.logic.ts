import { EMPRESAS, empresaIdDeTenant } from "@/lib/tenant-context";

/**
 * Funciones puras de la vista de impresión de Proforma
 * (comercial.proformas.$id.tsx) — separadas del componente para poder
 * probarlas con vitest en entorno "node" (el proyecto no tiene jsdom /
 * @testing-library/react configurado, ver vitest.config.ts, así que estas
 * funciones NO tocan el DOM; el componente las usa y además hace su propia
 * medición de layout, que no es una unidad testeable aquí).
 *
 * Ninguna de estas funciones recalcula totales de negocio: eso sigue siendo
 * exclusivo de server/src/domain/ventas/proforma-calculo.ts. Esto es
 * puramente formato/legibilidad de lo que el backend ya devolvió.
 */

/** Una sede/sucursal con su texto de dirección/teléfono ya armado, tal como
 * se muestra en el encabezado corporativo del documento. */
export interface SedeCorporativaProforma {
  etiqueta: string;
  texto: string;
}

/** Datos corporativos que el encabezado de la Proforma necesita para
 * reproducir el mismo formato de Ricol con la empresa correcta. Todos los
 * campos salvo razonSocial/nit son opcionales a propósito: si RicoSoft no
 * tiene ese dato para una empresa todavía, el bloque correspondiente del
 * documento se omite por completo en vez de inventarse (mismo criterio que
 * esValorMostrable/valorONulo más abajo en este archivo, aplicado aquí al
 * encabezado en vez de a los datos del cliente). */
export interface EncabezadoCorporativoProforma {
  razonSocial: string;
  nit: string;
  regimenFiscal?: string;
  sedes?: SedeCorporativaProforma[];
  web?: string;
  correo?: string;
  actividadesIca?: string;
}

function datosBasicosEmpresa(empresaId: string): { razonSocial: string; nit: string } {
  const empresa = EMPRESAS.find((e) => e.id === empresaId);
  return { razonSocial: empresa?.nombre ?? empresaId, nit: empresa?.nit ?? "" };
}

/**
 * Encabezado corporativo de la Proforma, por empresa (RC/FL/GR — ver
 * EMPRESAS en lib/tenant-context.tsx). RC conserva EXACTAMENTE el mismo
 * texto que ya mostraba el documento (misma razón social, NIT formateado,
 * régimen fiscal, las 3 sedes con su dirección/teléfono, web, correo y
 * actividades ICA) — el formato de Ricol no cambia.
 *
 * FL y GR solo tienen razón social y NIT reales: son los únicos datos
 * corporativos de estas dos empresas que existen hoy en RicoSoft (EMPRESAS,
 * ya usado por AppShell para el mismo propósito). Dirección, teléfono,
 * correo, régimen fiscal y actividades ICA de Flexipack y Green Solutions
 * NO están en ningún catálogo/configuración del sistema todavía — no se
 * inventan: esos bloques del documento quedan ocultos para estas dos
 * empresas hasta que ese dato exista en una fuente real (ver informe final
 * de la tarea para dónde debería configurarse).
 */
export const ENCABEZADOS_CORPORATIVOS_PROFORMA: Record<string, EncabezadoCorporativoProforma> = {
  RC: {
    razonSocial: "Representaciones Industriales de Colombia RICOL S.A.S.",
    nit: "805.006.906-5",
    regimenFiscal: "IVA Régimen Común · No Gran Contribuyente",
    sedes: [
      {
        etiqueta: "Principal (Yumbo)",
        texto: "CL 15 N° 27A-176 BL 9 BG 4 Acopi · PBX (57-2) 695 4565",
      },
      { etiqueta: "Bogotá", texto: "CL 24A Sur N° 70B-43 B/Carvajal · Tel. (57-1) 563 4795" },
      { etiqueta: "Medellín", texto: "Tel. (57-4) 366 6160" },
    ],
    web: "www.ricol.com.co",
    correo: "servicioalcliente@ricol.com.co",
    actividadesIca:
      "Actividad comercial 203-26 ICA 7.7x1000 Cali · Actividad comercial 2-08 ICA 10x1000 Yumbo · Actividad industrial 1-03 ICA 7x1000 Yumbo",
  },
  FL: datosBasicosEmpresa("FL"),
  GR: datosBasicosEmpresa("GR"),
};

/** true si el tenant autenticado es Green Solutions — único mecanismo que
 * activa la columna "Paquetes" del detalle de productos (ver
 * calcularEmpaquePlocks más abajo). Envoltorio directo sobre
 * empresaIdDeTenant (mismo mecanismo ya usado para el encabezado
 * corporativo y el logo por tenant): nunca un id/nombre de usuario, permiso
 * o condición aparte — solo el tenant. */
export function esTenantGreenSolutions(tenantNombre: string | null | undefined): boolean {
  return empresaIdDeTenant(tenantNombre) === "GR";
}

/** Cada paquete de Green Solutions contiene exactamente 32 plocks. */
export const PLOCKS_POR_PAQUETE = 32;

/** Desperdicio de construcción: 1% de plocks que pueden dañarse antes de
 * completar el paquete — se suma a la cantidad solicitada ANTES de calcular
 * paquetes completos (nunca después, ver calcularEmpaquePlocks). */
export const DESPERDICIO_CONSTRUCCION_PCT = 0.01;

export interface EmpaquePlocks {
  /** Cantidad de plocks tal como se solicitó/registró originalmente (sin
   * desperdicio ni redondeo) — nunca se usa directo para cálculos
   * económicos de Green, solo como referencia/trazabilidad. */
  cantidadSolicitada: number;
  /** cantidadSolicitada + 1% de desperdicio de construcción. Paso
   * INTERMEDIO únicamente: nunca se documenta ni se usa directo para
   * cálculos económicos — solo existe para calcular `paquetes`
   * correctamente (ver la secuencia obligatoria más abajo). */
  cantidadConDesperdicio: number;
  /** Número entero de paquetes completos necesarios — nunca decimal. */
  paquetes: number;
  /** Cantidad de plocks que el documento debe reflejar Y la cantidad
   * efectiva que Green Solutions usa para todo cálculo económico de la
   * línea (subtotal, IVA, totales): paquetes × 32, siempre múltiplo de 32. */
  cantidadDocumentada: number;
}

/**
 * Empaque de Green Solutions para una cantidad de plocks solicitada.
 *
 * Secuencia OBLIGATORIA (en este orden, sin excepción — microaudit
 * 2026-09-22 "desperdicio de construcción"):
 *   1. cantidadConDesperdicio = cantidadSolicitada × (1 + 1%)
 *   2. paquetes = CEIL(cantidadConDesperdicio / 32)
 *   3. cantidadDocumentada = paquetes × 32
 *
 * NUNCA al revés (paquetes primero y desperdicio después): agregar el 1% a
 * una cantidad YA redondeada a múltiplo de 32 puede cambiar cuántos
 * paquetes hacen falta (ej. 32 plocks: con la secuencia correcta,
 * 32×1.01=32.32 → CEIL(32.32/32)=2 paquetes/64 documentados; calculando
 * paquetes antes del desperdicio se quedaría, incorrectamente, en 1
 * paquete/32). El desperdicio tampoco se redondea de forma independiente
 * antes de dividir entre 32 — se usa el valor exacto (con decimales) de
 * cantidadConDesperdicio en la división, no una versión ya redondeada.
 *
 * Cálculo único y centralizado, reutilizado tal cual en la vista de la
 * Proforma, el PDF descargado, la impresión directa Y en los cálculos
 * económicos de la línea/totales para Green (ver comercial.proformas.$id.tsx)
 * — los 3 primeros salen del mismo componente/DOM y los totales se
 * recalculan ahí mismo con este mismo resultado (cantidadDocumentada), así
 * que los 4 quedan consistentes entre sí por construcción, nunca por 4
 * implementaciones separadas de la fórmula.
 *
 * No persiste nada nuevo en Prisma: los 4 campos del resultado son SIEMPRE
 * una función pura de la cantidad ya almacenada en ProformaItem.cantidad —
 * solo esa cantidad original (cantidadSolicitada) sigue persistida.
 *
 * Nunca produce decimales, negativos, NaN ni Infinity: cualquier cantidad
 * que no sea un número finito positivo (0, negativo, NaN, Infinity) hace
 * que TODO el resultado colapse a 0 en vez de propagar un valor
 * inconsistente al documento.
 */
export function calcularEmpaquePlocks(cantidadPlocks: number): EmpaquePlocks {
  if (!Number.isFinite(cantidadPlocks) || cantidadPlocks <= 0) {
    return {
      cantidadSolicitada: 0,
      cantidadConDesperdicio: 0,
      paquetes: 0,
      cantidadDocumentada: 0,
    };
  }
  const cantidadConDesperdicio = cantidadPlocks * (1 + DESPERDICIO_CONSTRUCCION_PCT);
  const paquetes = Math.ceil(cantidadConDesperdicio / PLOCKS_POR_PAQUETE);
  return {
    cantidadSolicitada: cantidadPlocks,
    cantidadConDesperdicio,
    paquetes,
    cantidadDocumentada: paquetes * PLOCKS_POR_PAQUETE,
  };
}

/** Resuelve el encabezado corporativo a partir del NOMBRE REAL del tenant
 * autenticado (mismo mecanismo que empresaIdDeTenant, ya usado por AppShell
 * para el logo/nombre de la barra superior) — nunca un valor fijo de
 * Ricol. Si el tenant no coincide con RC/FL/GR (tenant demo, de pruebas, o
 * una futura empresa aún sin configurar), devuelve un encabezado neutro con
 * el nombre REAL de ese tenant y sin NIT/dirección/etc. — jamás cae a los
 * datos de Ricol por defecto. */
export function resolverEncabezadoCorporativoProforma(
  tenantNombre: string | null | undefined,
): EncabezadoCorporativoProforma {
  const empresaId = empresaIdDeTenant(tenantNombre);
  if (empresaId && ENCABEZADOS_CORPORATIVOS_PROFORMA[empresaId]) {
    return ENCABEZADOS_CORPORATIVOS_PROFORMA[empresaId];
  }
  return { razonSocial: tenantNombre?.trim() || "Empresa no identificada", nit: "" };
}

/** Fecha corta determinística "dd/mm/aaaa", siempre en huso horario de
 * Bogotá — independiente de dónde se abra el navegador o se genere el PDF.
 * (Antes se usaba `toLocaleString(..., { dateStyle: "short" })`, que en
 * es-CO da día/mes con 1-2 dígitos y año de 2 dígitos, ambiguo — ej.
 * "18/9/26" en vez de "18/09/2026".) */
export function formatearFechaProforma(fechaIso: string): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  }).formatToParts(new Date(fechaIso));
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${obtener("day")}/${obtener("month")}/${obtener("year")}`;
}

/** Hora corta "h:mm a.m./p.m." en huso horario de Bogotá, separada de la
 * fecha (la identificación de la Proforma pide Fecha y Hora en renglones
 * distintos). Se arma a mano a partir de formatToParts (en vez de confiar
 * en el texto localizado de Intl para "AM"/"PM", que varía de formato
 * entre motores ICU: "a. m.", "AM", "a.m.") para que el resultado sea
 * siempre el mismo: "3:58 p.m.". */
export function formatearHoraProforma(fechaIso: string): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).formatToParts(new Date(fechaIso));
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const meridiano = obtener("dayPeriod").toLowerCase().startsWith("a") ? "a.m." : "p.m.";
  return `${obtener("hour")}:${obtener("minute")} ${meridiano}`;
}

/** true si el valor aporta información real y debe mostrarse. Filtra:
 * null/undefined, strings vacíos tras trim, y placeholders residuales de
 * captura de datos que no dicen nada (".", "-", "--", "N/A" sin querer
 * decir nada real ya se maneja aparte si aplica). Caso real observado: la
 * Proforma 3903 (GRUPO COMESA SAS) tiene contacto="." en el ERP — un
 * campo así debe ocultarse por completo, no imprimirse literal. */
export function esValorMostrable(valor: string | null | undefined): valor is string {
  if (valor == null) return false;
  const limpio = valor.trim();
  if (limpio.length === 0) return false;
  if (/^[.\-–—_]+$/.test(limpio)) return false;
  return true;
}

/** Devuelve el valor limpio si es mostrable, o null — para usar directo en
 * JSX con `{valor && <Campo .../>}` sin repetir la lógica de filtrado. */
export function valorONulo(valor: string | null | undefined): string | null {
  return esValorMostrable(valor) ? valor.trim() : null;
}

/** Un tramo vertical de contenido del documento (una sección de nivel
 * superior: encabezado, caja cliente, tabla de ítems, totales, etc., o una
 * fila individual dentro de la tabla de ítems), en las mismas unidades que
 * `altoPagina` (mm o px, consistente entre ambos). */
export interface SeccionMedida {
  top: number;
  bottom: number;
}

/** Devuelve los offsets verticales (mismas unidades que `secciones` — mm en
 * el uso real) en los que debe EMPEZAR cada página nueva a partir de la
 * segunda (la primera página siempre empieza en `secciones[0].top`, no se
 * incluye en el resultado). Nunca corta una sección a la mitad... EXCEPTO
 * en el único caso en que eso es imposible de evitar: una sección que por
 * sí sola ya es más alta que una página completa (ej. una tabla de ítems
 * larga). Ahí se corta en tramos exactos del alto de una página,
 * aprovechando primero el espacio que quede en la página que ya iba a
 * medias — es la corrección de un bug real encontrado al probar esta
 * función contra un PDF generado de verdad con 45 ítems sintéticos: la
 * versión anterior dejaba esa sección entera "flotando" sin recortar su
 * alto real al armar cada página, y el contenido que sobraba del alto de
 * una página física se perdía en silencio (ni se veía en esa página ni
 * aparecía en la siguiente) — ver comercial.proformas.$id.logic.test.ts. */
export function calcularCortesDePagina(secciones: SeccionMedida[], altoPagina: number): number[] {
  if (secciones.length === 0 || altoPagina <= 0) return [];
  const cortes: number[] = [];
  let inicioPagina = secciones[0].top;
  for (const seccion of secciones) {
    if (seccion.bottom - inicioPagina <= altoPagina) continue;

    if (seccion.bottom - seccion.top > altoPagina) {
      // La sección por sí sola no cabe en una página aunque esté sola: no
      // basta con moverla a una página nueva (seguiría sin caber), hay que
      // partirla en tramos del alto de una página. El primer tramo
      // aprovecha lo que quede de la página en curso.
      let cursor = seccion.top;
      const restante = Math.max(0, altoPagina - (seccion.top - inicioPagina));
      if (restante > 0) {
        cursor += restante;
        cortes.push(cursor);
      }
      while (seccion.bottom - cursor > altoPagina) {
        cursor += altoPagina;
        cortes.push(cursor);
      }
      inicioPagina = cursor;
    } else {
      // La sección completa cabe en una página propia — solo no cabía
      // junto con lo que ya había en la página en curso.
      cortes.push(seccion.top);
      inicioPagina = seccion.top;
    }
  }
  return cortes;
}

/** Total de páginas necesarias para mostrar `secciones` sin perder ni
 * cortar contenido de forma incorrecta, dado el alto útil de una página. */
export function calcularTotalPaginas(secciones: SeccionMedida[], altoPagina: number): number {
  return calcularCortesDePagina(secciones, altoPagina).length + 1;
}
