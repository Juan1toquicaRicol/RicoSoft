// src/config/api.ts

// Detecta la URL del backend desde variables de entorno. Si no está definida,
// se construye a partir del host actual (window.location.hostname) para que
// funcione tanto en localhost como al acceder desde otro equipo por IP de red
// (ej. http://192.168.0.10:8080 -> backend en http://192.168.0.10:4000/api).
const API_URL =
  import.meta.env.VITE_API_URL ||
  `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:4000/api`;

/**
 * Cliente HTTP centralizado para conectar el Frontend con el Backend en Node.js
 */
export const fetchApi = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json().catch(() => ({}));

    // Si el servidor responde con un código de error (400, 401, 500, etc.)
    if (!response.ok) {
      throw new Error(data.message || 'Error en la petición al servidor.');
    }

    return data;
  } catch (error: any) {
    // Manejo de error cuando el servidor no responde ("Failed to fetch")
    if (error.message === 'Failed to fetch') {
      throw new Error(
        'No se pudo conectar con el servidor backend. Asegúrate de que Node.js esté corriendo en http://localhost:4000'
      );
    }
    throw error;
  }
};

/**
 * Variante de fetchApi para subir archivos (multipart/form-data). No fija
 * Content-Type: el navegador debe generar el boundary del multipart.
 */
export const fetchApiUpload = async (
  endpoint: string,
  formData: FormData,
  options: RequestInit = {},
) => {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      ...options,
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Error al subir el archivo.');
    }
    return data;
  } catch (error: any) {
    if (error.message === 'Failed to fetch') {
      throw new Error(
        'No se pudo conectar con el servidor backend. Asegúrate de que Node.js esté corriendo en http://localhost:4000',
      );
    }
    throw error;
  }
};

/**
 * Variante de fetchApi para descargar contenido binario (PDF/imágenes) en
 * vez de JSON. Devuelve el Blob para poder previsualizarlo en el navegador.
 */
export const fetchApiBlob = async (endpoint: string, options: RequestInit = {}) => {
  const response = await fetch(`${API_URL}${endpoint}`, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Error al obtener el archivo.');
  }
  return response.blob();
};