# Auditoría y corrección de creación en Gestión Humana

Fecha: 2026-10-21  
Alcance: creación de colaboradores y cargos, carga de secciones del módulo, y aclaración sobre departamentos/grupos.

## Resumen ejecutivo

La interfaz permitía abrir el registro de colaboradores aunque el usuario no tuviera `empleados.crear`; el backend rechazaba correctamente el POST sin ese permiso. Además, la recarga inicial agrupaba empleados, permisos laborales y faltas en un único `Promise.all`: el rechazo de cualquiera de esas consultas impedía actualizar las otras secciones. Esto podía dejar los colaboradores sin cargar o sin refrescar después de una creación exitosa.

Para cargos, el backend exige `cargos.gestionar` para crear/editar. La interfaz ya ocultaba el formulario cuando faltaba ese permiso, pero no explicaba por qué. La creación de departamentos se administra en Configuración > Departamentos; no es una operación de la pantalla de Gestión Humana.

## Hallazgos confirmados

1. El botón de registro de colaborador se mostraba sin comprobar `empleados.crear`, mientras `POST /gestion-humana/empleados` sí exige ese permiso.
2. La carga de empleados, permisos laborales y faltas era atómica en frontend por `Promise.all`, aunque cada endpoint exige permisos diferentes.
3. La creación de cargos exige `cargos.gestionar`; cuando faltaba, la interfaz escondía el formulario sin indicarlo.
4. El formulario de colaborador consulta departamentos para selección; la creación de departamentos está implementada en Configuración > Departamentos y requiere sus permisos propios.

No se verificaron las asignaciones de permisos del usuario ni las respuestas HTTP del servidor de producción; deben comprobarse en la sesión desplegada.

## Cambios realizados

- La interfaz muestra “Registrar Colaborador” solo cuando el usuario tiene `empleados.crear` y explica qué permiso solicitar cuando no lo tiene.
- La carga de empleados, permisos laborales y faltas ahora maneja cada respuesta por separado. Un 403 de `/permisos` o `/faltas` ya no descarta la lista de empleados; cada sección muestra su error propio.
- El catálogo de cargos informa que la edición/creación requiere `cargos.gestionar`.
- Se añadió prueba unitaria para demostrar que un rechazo de permisos/faltas no descarta colaboradores y que los errores quedan asociados a su sección.

## Seguridad y datos

- No se cambiaron permisos del servidor, validaciones, endpoints, esquema, migraciones ni consultas multi-tenant.
- El backend continúa siendo la autoridad: no se quitó ningún control para permitir escrituras.
- No se añadieron grupos ni entidades nuevas. “Departamentos” conserva su pantalla y permisos existentes.
- No se modificó `MEMORY.md`; esta corrección no introduce una decisión permanente de arquitectura o negocio.

## Verificación

- `npm run test -- --config vitest.config.ts src/lib/gestion-humana-carga.test.ts`: 2 pruebas aprobadas.
- `npm run test`: 16 archivos y 116 pruebas aprobadas.
- `npm run typecheck` (frontend): aprobado.
- `npm run typecheck` (server): aprobado; el backend no tuvo cambios funcionales.
- ESLint sobre los archivos modificados: aprobado.
- `npm run build`: aprobado.
- El primer intento de Vitest tuvo un error del entorno Windows (`EPERM` al renombrar un archivo temporal), antes de ejecutar pruebas. Al dirigir `TEMP` y `TMP` a una carpeta dentro del workspace, las pruebas enfocada y completa pasaron.

No se ejecutó QA en navegador ni contra producción; las asignaciones de permisos desplegadas siguen pendientes de verificación en esa instalación.

## Pasos de despliegue/operación

1. Publicar frontend y backend con los cambios de código; no se requiere migración de base de datos.
2. En producción, comprobar que el rol del usuario tenga `empleados.crear` para registrar colaboradores y `cargos.gestionar` para crear/editar cargos.
3. Si el usuario debe crear departamentos, asignar los permisos de Departamentos y usar Configuración > Departamentos.
4. Revisar Network en el navegador si hay errores: `POST /api/gestion-humana/empleados`, `POST /api/gestion-humana/cargos`, y los GET de empleados, permisos y faltas.
