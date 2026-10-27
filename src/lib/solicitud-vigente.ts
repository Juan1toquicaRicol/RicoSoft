/**
 * Descarta respuestas asíncronas obsoletas: una carga solo puede actualizar la
 * pantalla si sigue siendo la última solicitud de la clave que está activa
 * (p. ej. el empleadoId del diálogo). Una respuesta tardía de otra clave, o de
 * una solicitud posterior que la reemplazó, no es vigente.
 */
export function crearGuardaSolicitudes<K>() {
  let contador = 0;
  let claveActiva: K | null = null;

  return {
    /** Cambia la clave activa e invalida todo lo que esté en vuelo. */
    activar(clave: K | null): void {
      contador += 1;
      claveActiva = clave;
    },
    /** Inicia una solicitud; `null` si la clave ya no es la activa (no debe ejecutarse). */
    iniciar(clave: K): number | null {
      if (claveActiva !== clave) return null;
      contador += 1;
      return contador;
    },
    esVigente(token: number): boolean {
      return token === contador;
    },
  };
}

export type GuardaSolicitudes<K> = ReturnType<typeof crearGuardaSolicitudes<K>>;
