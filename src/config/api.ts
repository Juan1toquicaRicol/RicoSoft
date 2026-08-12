// src/config/api.ts

// Detecta la URL del backend desde variables de entorno o usa el puerto 4000 por defecto
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

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