# SKILL.md — RicoSoft Engineering Copilot

Este archivo define procedimientos repetibles. AGENTS.md define las reglas y
MEMORY.md conserva las decisiones. SKILL.md define cómo trabajar.

## 0. Principio general

Para cualquier tarea:

ENTENDER -> INVESTIGAR -> DIAGNOSTICAR -> DISEÑAR -> IMPLEMENTAR -> PROBAR ->
AUDITAR -> DOCUMENTAR.

No saltar directamente a editar código cuando el alcance o la arquitectura no están
claros.

## 1. Skill: Inicio de sesión / inicio del día

Antes de trabajar:

1. Leer AGENTS.md.
2. Leer MEMORY.md.
3. Leer SKILL.md.
4. Revisar git status.
5. Identificar rama actual.
6. Revisar cambios locales existentes.
7. No asumir que el estado del repositorio coincide con una sesión anterior.
8. Si existen cambios locales no relacionados, no sobrescribirlos.
9. Confirmar el alcance de la tarea.

Resultado esperado:

- Estado del repositorio.
- Alcance entendido.
- Archivos/áreas relevantes identificados.
- Riesgos conocidos.

## 2. Skill: Auditoría de módulo

Usar cuando se solicite auditar una funcionalidad.

Proceso:

1. Localizar rutas frontend/backend.
2. Localizar controller/route/service/schema/model.
3. Localizar permisos.
4. Localizar auditoría.
5. Localizar pruebas.
6. Localizar dependencias externas.
7. Revisar tenant isolation.
8. Revisar validación de entrada.
9. Revisar IDOR/BOLA.
10. Revisar estados y transiciones.
11. Revisar transacciones.
12. Revisar concurrencia cuando aplique.
13. Revisar errores HTTP.
14. Revisar rendimiento.
15. Revisar UX.
16. Revisar duplicación.
17. Revisar migraciones.
18. Ejecutar pruebas existentes relevantes.

Reporte:

- Estado actual.
- Hallazgos críticos.
- Hallazgos altos.
- Hallazgos medios/bajos.
- Riesgos.
- Recomendación.
- Archivos candidatos.
- Qué NO tocar.
- Pruebas faltantes.

No implementar automáticamente después de una auditoría salvo que la tarea lo haya
autorizado.

## 3. Skill: Análisis de requerimiento

Antes de diseñar:

1. Traducir el requerimiento a comportamiento observable.
2. Identificar actores.
3. Identificar tenant.
4. Identificar permisos.
5. Identificar entidades existentes.
6. Identificar estados.
7. Identificar entradas/salidas.
8. Identificar errores.
9. Identificar auditoría.
10. Identificar integración externa.
11. Identificar impacto en datos.
12. Identificar impacto frontend.
13. Identificar pruebas.

Si el requerimiento contradice una decisión de MEMORY.md, señalarlo antes de
implementar.

Si una regla de negocio no está definida, no inventarla.

## 4. Skill: Diseño antes de implementación

Para cambios no triviales, producir internamente o entregar un diseño que incluya:

- objetivo;
- arquitectura actual relevante;
- propuesta mínima;
- archivos afectados;
- modelo de datos;
- API;
- permisos;
- tenant isolation;
- estados;
- errores;
- auditoría;
- pruebas;
- migración si aplica;
- riesgos.

Preferir una extensión de la arquitectura existente frente a una arquitectura paralela.

## 5. Skill: Implementación

Reglas:

- Editar el mínimo de archivos necesario.
- Reutilizar servicios/helpers/schemas existentes.
- No duplicar lógica.
- No crear abstracciones prematuras.
- Mantener nombres del proyecto.
- Mantener convenciones existentes.
- Mantener errores y contratos compatibles salvo cambio aprobado.
- No modificar código no relacionado.

Antes de crear un archivo nuevo, buscar si ya existe un lugar adecuado.

Antes de crear una función nueva, buscar funciones equivalentes.

Antes de crear un permiso, buscar el catálogo.

Antes de crear un modelo, buscar un modelo equivalente.

Antes de crear una ruta, buscar una ruta existente para el mismo recurso.

## 6. Skill: Bug fix

Proceso:

1. Reproducir o localizar evidencia.
2. Identificar causa raíz.
3. Crear/ajustar prueba de regresión.
4. Implementar corrección mínima.
5. Ejecutar prueba específica.
6. Ejecutar pruebas relacionadas.
7. Ejecutar suite apropiada.
8. Revisar regresiones.
9. Documentar si la corrección crea una decisión permanente.

Nunca solucionar un bug eliminando la validación que lo detecta.

## 7. Skill: Seguridad / multi-tenancy

Aplicar especialmente cuando una tarea toca:

- usuarios;
- membresías;
- roles;
- permisos;
- documentos;
- archivos;
- notificaciones;
- proveedores;
- clientes;
- facturas;
- SIESA;
- endpoints por ID;
- cambios de tenant.

Checklist:

- ¿tenantId viene del contexto autenticado?
- ¿Hay algún tenantId controlable por cliente?
- ¿La consulta filtra tenant?
- ¿Las relaciones indirectas filtran tenant?
- ¿Existe IDOR?
- ¿El usuario tiene el permiso correcto?
- ¿Se comprueba estado?
- ¿Se evita fuga por mensajes de error?
- ¿Se audita?
- ¿Hay prueba cross-tenant?
- ¿Hay riesgo de concurrencia?

Si una prueba con usuario multi-tenant puede cruzar datos, tratarla como prioridad alta.

## 8. Skill: API nueva o modificación

Antes:

- localizar route;
- localizar controller;
- localizar service;
- localizar schema;
- localizar middleware;
- localizar permiso;
- localizar pruebas.

Definir:

- método;
- path;
- autenticación;
- permiso;
- body;
- params;
- query;
- respuesta;
- errores;
- tenant;
- auditoría.

Después:

- probar 200/201 según contrato;
- probar body inválido;
- probar no autenticado;
- probar sin permiso;
- probar recurso inexistente;
- probar recurso de otro tenant;
- probar conflictos relevantes.

No cambiar contratos existentes sin justificar compatibilidad.

## 9. Skill: Cambio Prisma / base de datos

Proceso:

1. Inspeccionar schema.
2. Buscar referencias.
3. Revisar migraciones.
4. Evaluar SQL Server.
5. Diseñar migración.
6. Crear migración nueva.
7. Aplicar en entorno de QA/desarrollo.
8. Ejecutar Prisma validate.
9. Generar cliente si corresponde.
10. Ejecutar pruebas.
11. Verificar índices/constraints.
12. Revisar rollback conceptual.

No modificar migraciones históricas aplicadas.

No eliminar datos por comodidad.

## 10. Skill: Frontend

Antes de cambiar una vista:

- localizar ruta;
- localizar lógica;
- localizar componentes reutilizables;
- localizar hooks/contextos;
- localizar permisos;
- localizar API client;
- localizar tests.

Mantener:

- tenant activo;
- permisos;
- estados;
- loading;
- errores;
- feedback;
- consistencia visual.

No duplicar cálculo de negocio entre vista, PDF e impresión. Cuando exista lógica
compartida, usar una única función de dominio/presentación adecuada.

## 11. Skill: Documentos, PDF e impresión

Para proformas y documentos:

1. Identificar fuente de datos.
2. Identificar tenant.
3. Resolver identidad corporativa.
4. Reutilizar cálculos.
5. Reutilizar lógica entre pantalla/PDF/print.
6. Verificar saltos de página.
7. Verificar totales.
8. Verificar campos opcionales.
9. No inventar datos empresariales.

Para reglas de Green Solutions:

- calcular primero la cantidad documentada mediante la regla vigente;
- utilizar esa cantidad de forma consistente donde la regla económica lo determine;
- no aplicar la regla a Ricol/Flexipack.

## 12. Skill: Integraciones SIESA

Antes de tocar SIESA:

1. Identificar tenant.
2. Resolver siesaCiaId.
3. Identificar base/compañía.
4. Confirmar tablas/campos mediante código/evidencia.
5. Revisar consulta existente.
6. Confirmar si la operación es lectura o escritura.
7. Verificar timeout/errores.
8. Verificar aislamiento.
9. Verificar mapeo de IDs.
10. Crear pruebas.

Nunca inventar un rowid.

Nunca usar el ID de un tenant para consultar otra compañía.

Nunca escribir en SIESA sin autorización explícita.

## 13. Skill: Auditoría de calidad final

Antes de declarar terminado:

### Código
- cambios mínimos;
- sin duplicación;
- sin debug accidental;
- sin imports muertos;
- sin archivos temporales.

### Seguridad
- auth;
- permisos;
- tenant;
- IDOR;
- secretos;
- logs.

### Datos
- Prisma;
- migración;
- índices;
- constraints;
- compatibilidad.

### Backend
- validación;
- errores;
- transacciones;
- auditoría.

### Frontend
- permisos;
- tenant;
- estados;
- UX;
- errores.

### Pruebas
- específicas;
- regresión;
- backend;
- frontend;
- TypeScript;
- build;
- Prisma cuando aplique.

## 14. Skill: Pruebas

Prioridad:

1. Test que reproduce el problema.
2. Tests del módulo.
3. Tests de integración relacionados.
4. Suite completa del área.
5. Suite completa si el cambio es transversal.

No ejecutar únicamente el test feliz.

Para multi-tenant agregar al menos:

- tenant correcto;
- otro tenant;
- usuario con múltiples membresías cuando corresponda.

Para permisos:

- permitido;
- sin permiso;
- permiso insuficiente.

## 15. Skill: Manejo de fallos

Si una prueba falla:

1. Capturar error exacto.
2. Determinar si es código, test, entorno o dato.
3. No modificar comportamiento solo para satisfacer la prueba.
4. Buscar causa raíz.
5. Corregir.
6. Repetir prueba.
7. Ejecutar regresión.

Si falla por infraestructura, declararlo explícitamente.

## 16. Skill: Cambios fuera de alcance

Si durante una tarea aparece otro problema:

- no solucionarlo automáticamente;
- documentarlo como hallazgo;
- indicar impacto;
- continuar solo si no bloquea la tarea.

Excepción: vulnerabilidad crítica o fuga de tenant que haga inseguro continuar. En
ese caso detener el cambio y reportar.

## 17. Skill: Soporte al usuario final

Cuando Claude ayude con soporte:

1. Identificar módulo.
2. Identificar empresa/tenant sin pedir datos innecesarios.
3. Reproducir mentalmente el flujo real.
4. No prometer funcionalidades inexistentes.
5. Explicar la solución en lenguaje funcional.
6. Si requiere desarrollo, convertirlo en requerimiento técnico.
7. No exponer secretos, SQL sensible, tokens ni información de otros usuarios.

El soporte debe distinguir:

- error de usuario;
- configuración;
- datos;
- bug;
- requerimiento nuevo;
- problema de infraestructura.

## 18. Skill: Documentación de decisiones

Actualizar MEMORY.md cuando una tarea produzca una decisión permanente.

Entrada mínima:

### YYYY-MM-DD — Título
Decisión:
Motivo:
Impacto:
Restricciones:

No registrar hipótesis como decisiones.

## 19. Skill: Prompt para implementación controlada

Cuando el responsable solicite un prompt para Claude Code, el prompt debe incluir:

- contexto;
- objetivo;
- archivos a investigar;
- reglas de AGENTS.md;
- decisiones relevantes de MEMORY.md;
- alcance exacto;
- prohibiciones;
- criterios de aceptación;
- pruebas requeridas;
- formato del reporte final.

El prompt debe pedir primero investigación y luego implementación, salvo que se haya
autorizado expresamente implementación directa.

## 20. Criterio de "terminado"

Una tarea está terminada solo cuando:

- el comportamiento solicitado está implementado;
- no se inventaron funcionalidades;
- seguridad y tenant están revisados;
- pruebas relevantes pasan;
- TypeScript/build pasan cuando corresponda;
- no quedan archivos temporales;
- no quedan cambios accidentales;
- el reporte identifica exactamente qué cambió;
- MEMORY.md se actualizó si hubo una decisión permanente.

## 21. Regla final

Cuando exista incertidumbre:

NO ADIVINAR.

Investigar.
Comparar con el código.
Consultar AGENTS.md.
Consultar MEMORY.md.
Seguir el procedimiento correspondiente.
Y, si todavía falta una decisión, pedirla.
