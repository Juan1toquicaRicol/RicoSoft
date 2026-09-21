import { useEffect, useState } from "react";
import { getBackendAlcanzable, suscribirBackendAlcanzable } from "@/config/api";

/**
 * "¿Se pudo hablar con RicoSoft?" — combina los eventos nativos
 * "online"/"offline" del navegador con la señal real de alcanzabilidad del
 * backend (ver src/config/api.ts, alimentada por el resultado de cada
 * petición). Solo se reporta "sin conexión" cuando hay evidencia real de un
 * fallo de red hacia RicoSoft, nunca solo porque `navigator.onLine` diga
 * "sin internet" — esa bandera del sistema operativo es irrelevante para
 * una app servida en red local y daba falsos positivos que llegaban a
 * bloquear el login. window "offline" sigue limpiando el estado "alcanzable"
 * como sospecha inicial, pero la confirmación real llega de un fetch fallido
 * o exitoso. No implementa service worker/PWA.
 */
export function useOnlineStatus(): boolean {
  const [alcanzable, setAlcanzable] = useState(getBackendAlcanzable);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = suscribirBackendAlcanzable(setAlcanzable);
    // window "online" es una señal fuerte y confiable de que ya hay red —
    // limpia el aviso de inmediato en vez de esperar la próxima petición.
    const handleOnline = () => setAlcanzable(true);
    window.addEventListener("online", handleOnline);
    return () => {
      unsub();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return alcanzable;
}
