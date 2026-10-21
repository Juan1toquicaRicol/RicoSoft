# Corrección de “Administrar” en asociaciones biométricas

Fecha: 2026-10-21

## Diagnóstico

El panel elegía automáticamente la primera fuente biométrica disponible y mostraba sus asociaciones debajo de la tabla. El botón “Administrar” solo cambiaba el identificador seleccionado; si se pulsaba sobre esa fuente ya seleccionada, no ocurría un cambio visible ni se desplazaba la página al panel inferior. Además, si fallaba la consulta de asociaciones, se mostraba también el estado vacío, lo que podía parecer que simplemente no había registros.

## Corrección

- Al pulsar “Administrar”, se selecciona la fuente y la vista se desplaza al panel de asociaciones, incluso cuando esa fuente ya estaba seleccionada.
- El botón expone su estado seleccionado y el vínculo al panel para accesibilidad.
- Si falla la carga de asociaciones, la interfaz muestra el estado de error y la instrucción de reintento, sin presentar el catálogo como vacío.
- No se cambiaron endpoints, permisos, consultas, modelo de datos ni migraciones.

## Verificación

- `npm run typecheck`: aprobado.
- ESLint del componente biométrico: aprobado.
- `npm run test`: 16 archivos y 116 pruebas aprobadas.
- `npm run build`: aprobado.
- No se verificó la interfaz contra el servidor desplegado; para recibir el cambio hay que publicar el frontend.
