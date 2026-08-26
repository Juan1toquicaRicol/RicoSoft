import { createFileRoute, redirect } from "@tanstack/react-router";

// "Mi perfil" vive en un solo lugar (/perfil, enlazado desde el sidebar).
// Esta ruta existía como una segunda pantalla de perfil, desactualizada y de
// solo lectura, que llegó a mostrar mensajes incorrectos (decía que cambiar
// la contraseña "no estaba disponible" cuando /perfil ya lo permite). Se deja
// como redirección para no romper enlaces o marcadores antiguos a /configuracion.
export const Route = createFileRoute("/configuracion/")({
  beforeLoad: () => {
    throw redirect({ to: "/perfil" });
  },
});
