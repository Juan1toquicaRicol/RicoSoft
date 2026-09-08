/**
 * TRM oficial diaria del Banco de la República, vía el portal de datos
 * abiertos del Estado colombiano (datos.gov.co) — dataset público
 * "32sa-8pi3", sin necesidad de API key. Usado por Importaciones (Fase de
 * mejora del modal de Orden de Compra Internacional) para comparar la TRM
 * pactada manualmente contra la vigente del día, nunca para sobrescribirla
 * automáticamente — la TRM pactada sigue siendo una decisión comercial, no
 * un dato derivado.
 */

const URL_TRM_DATOS_GOV =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";

/** 1 hora: la TRM del Banco de la República cambia una vez al día (se
 * publica la tarde anterior), así que cachear por más tiempo que la
 * duración típica de una sesión de captura evita golpear el servicio
 * externo en cada apertura del modal sin arriesgar servir un valor viejo. */
const TTL_CACHE_MS = 60 * 60 * 1000;

export interface TrmOficial {
  valor: number;
  vigenciaDesde: string;
  vigenciaHasta: string;
}

interface FilaTrmDatosGov {
  valor?: string;
  vigenciadesde?: string;
  vigenciahasta?: string;
}

let cache: { data: TrmOficial; obtenidoEn: number } | null = null;

/**
 * Consulta la TRM oficial vigente más reciente. Lanza un Error con mensaje
 * apto para mostrar al usuario si el servicio externo falla o responde algo
 * inesperado — nunca debe tumbar el flujo de creación de la orden, que sigue
 * funcionando 100% manual si esto falla (ver el controller, que atrapa el
 * error y responde 502, no 500 genérico).
 */
export async function obtenerTrmOficial(): Promise<TrmOficial> {
  if (cache && Date.now() - cache.obtenidoEn < TTL_CACHE_MS) {
    return cache.data;
  }

  let respuesta: Response;
  try {
    respuesta = await fetch(URL_TRM_DATOS_GOV, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error("No fue posible contactar el servicio de TRM oficial (datos.gov.co).");
  }
  if (!respuesta.ok) {
    throw new Error(`El servicio de TRM oficial respondió un error (HTTP ${respuesta.status}).`);
  }

  const filas = (await respuesta.json()) as FilaTrmDatosGov[];
  const fila = filas[0];
  const valor = Number(fila?.valor);
  if (!fila || !Number.isFinite(valor) || valor <= 0) {
    throw new Error("El servicio de TRM oficial devolvió una respuesta inesperada.");
  }

  const data: TrmOficial = {
    valor,
    vigenciaDesde: fila.vigenciadesde ?? "",
    vigenciaHasta: fila.vigenciahasta ?? "",
  };
  cache = { data, obtenidoEn: Date.now() };
  return data;
}
