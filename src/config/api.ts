// src/config/api.ts

// Detecta la URL del backend desde variables de entorno. Si no está definida,
// se construye a partir del host actual (window.location.hostname) para que
// funcione tanto en localhost como al acceder desde otro equipo por IP de red
// (ej. http://192.168.0.10:8080 -> backend en http://192.168.0.10:4000/api).
const API_URL =
  import.meta.env.VITE_API_URL ||
  `http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:4000/api`;

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Clasificación de errores de red/HTTP que usa la capa global de páginas de
 * error (src/components/system) para decidir qué pantalla mostrar, sin
 * perder el mensaje original que algunos módulos siguen mostrando de forma
 * contextual (ej. un 409 "Ya existe la proforma N.º 3899" dentro de un
 * formulario). `ApiError.message` conserva siempre el texto que ya
 * consumían los módulos existentes: sólo se agrega metadata (`status`,
 * `kind`), nunca se cambia el mensaje.
 */
export type ApiErrorKind = "network" | "timeout" | "http";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Convierte cualquier error capturado en un fetch (TypeError de red, un
 * AbortError de timeout, o un Error genérico) en un ApiError clasificado.
 * Función pura y exportada para poder probarla sin hacer peticiones reales.
 */
export function classifyFetchError(error: unknown, timedOut: boolean): ApiError {
  if (timedOut) {
    return new ApiError("La solicitud tardó demasiado en responder.", "timeout");
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.message === "Failed to fetch")
  ) {
    return new ApiError(
      "No se pudo conectar con el servidor backend. Asegúrate de que Node.js esté corriendo en http://localhost:4000",
      "network",
    );
  }
  if (error instanceof ApiError) return error;
  return new ApiError(
    error instanceof Error ? error.message : "Error en la petición al servidor.",
    "network",
  );
}

/**
 * Señal de "¿se pudo hablar con el backend de RicoSoft?", alimentada por el
 * resultado REAL de cada petición — no por `navigator.onLine` (que refleja
 * salida a internet del sistema operativo, irrelevante para una app servida
 * en red local: puede dar falso positivo de "sin conexión" aunque RicoSoft
 * siga perfectamente alcanzable). Solo un fallo de tipo "network" (no
 * pudimos ni conectar) marca no-alcanzable; cualquier respuesta HTTP
 * (incluido un 4xx/5xx) prueba que sí hay comunicación y limpia la señal.
 */
let backendAlcanzable = true;
const listenersReachability = new Set<(alcanzable: boolean) => void>();

function marcarAlcanzabilidad(alcanzable: boolean) {
  if (backendAlcanzable === alcanzable) return;
  backendAlcanzable = alcanzable;
  listenersReachability.forEach((cb) => cb(alcanzable));
}

export function getBackendAlcanzable(): boolean {
  return backendAlcanzable;
}

export function suscribirBackendAlcanzable(cb: (alcanzable: boolean) => void): () => void {
  listenersReachability.add(cb);
  return () => listenersReachability.delete(cb);
}

/** Subir/bajar videos y documentos grandes tarda mucho más que un JSON. */
export const TRANSFER_TIMEOUT_MS = 5 * 60_000;

async function fetchWithTimeout(
  input: string,
  options: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let timedOut = false;
  controller.signal.addEventListener("abort", () => {
    timedOut = true;
  });
  try {
    const response = await fetch(input, {
      ...options,
      signal: options.signal ?? controller.signal,
    });
    marcarAlcanzabilidad(true);
    return response;
  } catch (error) {
    const clasificado = classifyFetchError(error, timedOut);
    if (clasificado.kind === "network") marcarAlcanzabilidad(false);
    throw clasificado;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cliente HTTP centralizado para conectar el Frontend con el Backend en Node.js
 */
export const fetchApi = async (endpoint: string, options: RequestInit = {}, timeoutMs?: number) => {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_URL}${endpoint}`,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
      timeoutMs,
    );
  } catch (error) {
    throw error instanceof ApiError ? error : classifyFetchError(error, false);
  }

  const data = await response.json().catch(() => ({}));

  // Si el servidor responde con un código de error (400, 401, 500, etc.)
  if (!response.ok) {
    throw new ApiError(
      data.message || "Error en la petición al servidor.",
      "http",
      response.status,
    );
  }

  return data;
};

/**
 * Variante de fetchApi para subir archivos (multipart/form-data). No fija
 * Content-Type: el navegador debe generar el boundary del multipart.
 */
export const fetchApiUpload = async (
  endpoint: string,
  formData: FormData,
  options: RequestInit = {},
  timeoutMs?: number,
) => {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_URL}${endpoint}`,
      {
        method: "POST",
        ...options,
        body: formData,
      },
      timeoutMs,
    );
  } catch (error) {
    throw error instanceof ApiError ? error : classifyFetchError(error, false);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.message || "Error al subir el archivo.", "http", response.status);
  }
  return data;
};

/**
 * Variante de fetchApi para descargar contenido binario (PDF/imágenes) en
 * vez de JSON. Devuelve el Blob para poder previsualizarlo en el navegador.
 */
export const fetchApiBlob = async (
  endpoint: string,
  options: RequestInit = {},
  timeoutMs?: number,
) => {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}${endpoint}`, options, timeoutMs);
  } catch (error) {
    throw error instanceof ApiError ? error : classifyFetchError(error, false);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.message || "Error al obtener el archivo.", "http", response.status);
  }
  return response.blob();
};
