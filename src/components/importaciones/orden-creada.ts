/**
 * Marca en el estado del historial con la que el formulario de creación avisa
 * al detalle de que ESA orden acaba de crearse. Lleva el id de la orden para
 * que el aviso no se muestre en otra orden. Se lee como `unknown` (type guard)
 * sin ampliar los tipos de TanStack.
 */
export function esMarcaOrdenCreada(state: unknown, ordenId: string): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { ordenCreadaId?: unknown }).ordenCreadaId === ordenId
  );
}

/** Estado equivalente sin la marca (se escribe con replace para consumirla una vez). */
export function sinMarcaOrdenCreada<T extends object>(prev: T): T {
  return { ...prev, ordenCreadaId: undefined };
}

/**
 * Copia texto al portapapeles: navigator.clipboard cuando está disponible y es
 * contexto seguro; si no (o si falla), cae a un <textarea> temporal con
 * document.execCommand("copy"). Devuelve true si logró copiar.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Se intenta el respaldo.
  }
  try {
    if (typeof document === "undefined") return false;
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
