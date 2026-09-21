// Fallback de altísimo nivel: se ejecuta ANTES de que React monte (ver
// server.ts/start.ts), así que deliberadamente no importa React, hooks, ni
// nada de src/components/system/error-page.tsx — solo HTML/CSS plano. No
// carga el logo como <img> porque en este punto no hay garantía de que el
// bundle/estático esté disponible (el fallo puede ser justo ese); en su
// lugar usa una representación textual sobria de la marca, consistente con
// el resto del sistema de errores (ver src/components/system/error-page.tsx).
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>RicoSoft</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      .brand { font-size: 1.05rem; font-weight: 700; letter-spacing: 0.01em; margin: 0 0 0.125rem; }
      .brand-sub { font-size: 0.75rem; color: #6b7280; margin: 0 0 1.5rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #4b5563; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; border-color: #d1d5db; }
    </style>
  </head>
  <body>
    <div class="card">
      <p class="brand">RicoSoft</p>
      <p class="brand-sub">Enterprise V1.0</p>
      <h1>Se produjo un error inesperado</h1>
      <p>No fue posible cargar RicoSoft correctamente. Intenta recargar la página.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Recargar página</button>
        <a class="secondary" href="/">Ir al inicio</a>
      </div>
    </div>
  </body>
</html>`;
}
