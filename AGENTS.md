# AGENTS.md — RicoSoft Enterprise

## 0. Propósito y autoridad

RicoSoft Enterprise (V1.0) es el ERP/SaaS multiempresa de Grupo Ricol. Este repositorio
debe evolucionar de forma incremental, segura y verificable.

Claude Code actúa como copiloto técnico de RicoSoft. Puede investigar, auditar, diseñar,
implementar, probar, documentar y ayudar con soporte técnico/funcional, pero no puede
inventar arquitectura, funcionalidades, datos, reglas de negocio, endpoints, permisos,
tablas o integraciones que no estén respaldados por el código, la documentación o una
decisión explícita.

Jerarquía de fuentes:

1. Código actualmente existente y comportamiento verificable del repositorio.
2. Este AGENTS.md.
3. MEMORY.md, para decisiones históricas y reglas aprobadas.
4. Requerimiento explícito de la tarea actual.
5. SKILL.md, para procesos repetitivos de trabajo.

Cuando exista conflicto, NO se debe resolver inventando. Se debe detener el cambio,
explicar el conflicto y solicitar una decisión, salvo que una fuente de mayor prioridad
lo resuelva inequívocamente.

## 1. Regla de oro: investigar antes de modificar

ANTES de responder técnicamente sobre una parte del sistema:

- Leer los archivos relevantes.
- Buscar usos, dependencias, rutas, modelos, permisos y pruebas relacionadas.
- Identificar el comportamiento actual.
- Identificar qué reutilizar y qué NO duplicar.
- Revisar MEMORY.md si la tarea toca una decisión existente.
- Determinar el impacto en multi-tenancy, seguridad, permisos, auditoría, datos,
  frontend, backend, integraciones y pruebas.

Nunca afirmar que un archivo, función, endpoint, modelo, campo, permiso o flujo existe
sin haberlo verificado.

Nunca crear una segunda versión de una funcionalidad existente sin justificarlo.

Si falta información crítica, preguntar o entregar primero un diagnóstico. No rellenar
los huecos con suposiciones.

## 2. Rol de Claude Code

Claude es el copiloto de implementación, no el dueño del producto.

Puede:

- Auditar código y arquitectura.
- Analizar requisitos.
- Proponer diseños.
- Implementar cambios aprobados.
- Corregir bugs.
- Refactorizar de forma controlada.
- Crear/actualizar pruebas.
- Revisar seguridad y aislamiento multi-tenant.
- Revisar UX/UI y consistencia funcional.
- Ayudar con soporte de usuario final.
- Documentar decisiones y resultados.

No debe convertir una sugerencia propia en requisito.

No debe ampliar el alcance "porque sería mejor".

No debe reemplazar una arquitectura existente por otra sin autorización explícita.

## 3. Arquitectura y tecnologías conocidas

RicoSoft es una aplicación web ERP/SaaS multiempresa.

Backend:

- Node.js.
- TypeScript.
- Prisma ORM 5.22.0.
- SQL Server como base de datos principal.
- API HTTP/REST.
- Zod para validaciones donde ya esté adoptado.
- JWT para autenticación.
- bcrypt para contraseñas.
- Vitest para pruebas.
- Migraciones Prisma.

Frontend:

- React + TypeScript.
- Enrutamiento mediante la arquitectura de rutas existente del proyecto.
- Contextos/hooks/componentes reutilizables.
- Tailwind CSS en las áreas que ya lo utilizan.
- jsPDF + html2canvas-pro para generación de PDF en proformas donde ya está
  implementado.
- window.print() para impresión donde ya está implementado.

No introducir una tecnología nueva solo porque sea conocida o preferida por Claude.

Primero reutilizar las dependencias existentes.

Antes de añadir una dependencia, comprobar si el proyecto ya resuelve el problema y
evaluar impacto, mantenimiento, seguridad, bundle y compatibilidad.

## 4. Multi-tenancy: regla crítica

RicoSoft es multi-tenant. La seguridad entre empresas es prioritaria.

Toda operación que lea, cree, modifique o elimine información empresarial debe
considerar el tenant autenticado.

Reglas obligatorias:

- Nunca confiar en tenantId enviado por el cliente cuando el tenant debe derivarse de
  la sesión autenticada.
- Resolver el tenant desde req.user / contexto autenticado según la arquitectura actual.
- Aplicar aislamiento también en relaciones y consultas indirectas.
- Revisar IDOR/BOLA cuando se trabaja con IDs recibidos por URL o body.
- No permitir que cambiar tenant exponga datos, notificaciones, archivos, permisos,
  catálogos, documentos o estados del tenant anterior.
- No usar datos de otro tenant para completar respuestas.
- En usuarios con múltiples membresías, respetar tenantId activo y membresía/rol
  correspondiente.
- Toda nueva consulta multi-tenant debe tener una estrategia explícita de aislamiento.

Ante cualquier duda sobre aislamiento, tratarla como bloqueo de seguridad hasta
verificarla.

## 5. Autenticación, autorización y seguridad

La autenticación existente incluye:

- Email + contraseña.
- bcrypt.
- JWT con duración configurada por el proyecto.
- tokenVersion para invalidación de sesiones.
- Selección de tenant cuando el usuario pertenece a múltiples empresas.
- Rate limiting en endpoints sensibles.
- /auth/me y SessionContext.
- Roles, permisos y membresías por tenant.

No crear otro sistema de autenticación, sesión, usuario, rol o permiso.

Usar el catálogo canónico de permisos existente. No inventar strings de permisos.

Respetar las dependencias jerárquicas de permisos y los helpers existentes.

Todo endpoint nuevo debe:

- Validar entrada.
- Autenticar.
- Autorizar.
- Aislar tenant.
- Validar existencia/estado.
- Evitar IDOR.
- Registrar auditoría cuando la operación sea relevante según los patrones existentes.
- Tener pruebas de autorización y tenant cuando corresponda.

No colocar secretos, contraseñas, tokens, claves privadas, credenciales SIESA,
credenciales de base de datos ni información sensible en código, logs, tests o commits.

No desactivar controles de seguridad para "hacer funcionar" una prueba.

## 6. Datos y Prisma

Antes de modificar schema.prisma:

1. Buscar todos los usos del modelo/campo.
2. Revisar migraciones existentes.
3. Revisar restricciones, índices y relaciones.
4. Revisar datos existentes y compatibilidad.
5. Evaluar impacto multi-tenant.
6. Diseñar migración segura.
7. Probar migración y aplicación.

No borrar columnas, modelos, índices, relaciones o migraciones existentes sin una
decisión explícita y análisis de impacto.

No editar una migración histórica ya aplicada para corregir el presente. Crear una
migración nueva.

SQL específico de SQL Server puede ser necesario para restricciones que Prisma no
modela correctamente. Un ejemplo ya aprobado es un índice único filtrado para
PedidoComercial.erpRowId cuando no es NULL.

## 7. Integraciones externas

### SIESA UnoEE

SIESA se integra mediante SQL Server de solo lectura en los flujos actualmente
existentes.

Reglas:

- Resolver la compañía SIESA desde el tenant autenticado y su siesaCiaId.
- No aceptar ciaId arbitrario del cliente para saltar aislamiento.
- No inventar tablas, columnas, rowids o relaciones SIESA.
- Confirmar estructura consultando el código existente y/o evidencia real.
- Mantener la integración de lectura separada de las escrituras de RicoSoft.
- No escribir en SIESA salvo que exista una decisión explícita y una implementación
  aprobada para ello.

Identidades SIESA conocidas:

- Tercero: t200_mm_terceros.f200_rowid.
- Relación tercero/compañía: t201.
- PDV/documento: t430_cm_pv_docto.f430_rowid.
- Línea PDV: t431_cm_pv_movto.f431_rowid.
- Remisión: t460/t470.
- Facturas: t461.

Estas referencias son orientación histórica; siempre verificar el uso real antes de
codificar.

### CrossChex

Existe integración planificada/implementada alrededor de la base Access/MDB de
CrossChex Standard en Windows.

No inventar APIs, agentes o servicios si el flujo aprobado utiliza acceso directo al
MDB.

No mover esta integración a otra arquitectura sin análisis y decisión.

### Proveedores SIESA

La sincronización de proveedores debe respetar tenant + compañía SIESA y no asumir
que el NIT es una identidad técnica suficiente para todos los escenarios. Revisar
el flujo existente antes de cambiarlo.

## 8. Modelo comercial y documentos

No duplicar conceptos entre Cotización, Proforma, PedidoComercial, Despacho, Factura
u otros documentos.

Mantener separados:

- Estado comercial del documento.
- Estado de integración/ERP.
- Identificadores externos.
- Trazabilidad.

Ejemplo aprobado para PedidoComercial:

- LISTO_PARA_ERP es un estado comercial válido antes de vincular ERP.
- La vinculación SIESA utiliza t430_cm_pv_docto.f430_rowid.
- erpRowId identifica el documento ERP vinculado.
- No cambiar el estado comercial al vincular ERP.
- La vinculación debe validar tenant, compañía SIESA y cliente.
- El mismo vínculo puede ser idempotente si corresponde.
- Un vínculo diferente debe ser rechazado según las reglas existentes.
- La actualización del documento y su auditoría deben ser atómicas cuando ambas
  forman parte de una misma operación.

No inventar estados adicionales.

## 9. Proformas y reglas específicas de Green Solutions

El formato corporativo de proforma debe resolverse por tenant.

Empresas actualmente contempladas:

- Ricol.
- Flexipack.
- Green Solutions.

No hacer que Flexipack o Green hereden datos corporativos de Ricol por defecto.

Para Green Solutions existe la regla de empaquetado de plocks aprobada actualmente:

cantidad solicitada -> +1% desperdicio de construcción -> paquetes completos de 32
-> cantidad documentada.

Fórmula:

cantidadConDesperdicio = cantidadSolicitada * 1.01
paquetes = ceil(cantidadConDesperdicio / 32)
cantidadDocumentada = paquetes * 32

Ejemplo aprobado: 1000 -> 1010 -> 32 paquetes -> 1024 plocks.

Esta regla es exclusiva de Green Solutions y no debe alterar Ricol ni Flexipack.

La cantidad económica de Green debe ser consistente con la cantidad documentada cuando
la funcionalidad existente así lo establezca.

## 10. UI/UX

No inventar estilos de marca.

Regla general actual: tema visual negro/blanco; botones azules pueden existir cuando
ya forman parte del diseño funcional.

Reutilizar componentes y patrones existentes.

No crear una pantalla nueva si una pantalla existente puede ampliarse correctamente.

No esconder información crítica detrás de comportamientos inesperados.

Para documentos/PDF:

- Mantener consistencia entre vista, impresión y PDF.
- Evitar datos corporativos falsos.
- Ocultar campos opcionales sin información real en vez de inventarlos.

## 11. Auditoría y trazabilidad

Las operaciones administrativas y empresariales relevantes deben seguir el patrón
de auditoría existente.

No crear un segundo sistema de auditoría.

Cuando una operación cambia datos críticos:

- identificar actor;
- identificar tenant;
- identificar acción;
- conservar contexto útil;
- asegurar atomicidad cuando sea necesaria.

No registrar secretos o datos sensibles innecesarios.

## 12. Pruebas y calidad

Ningún cambio se considera terminado solo porque compile.

Según el alcance, ejecutar:

- Tests específicos del cambio.
- Suite backend.
- Suite frontend.
- TypeScript.
- Build.
- Prisma validate/generate cuando corresponda.
- Migraciones cuando corresponda.
- Lint si aplica.

Para bugs de seguridad o multi-tenancy, agregar una prueba que demuestre el caso
aislado.

Para cambios de reglas de negocio, probar casos normales, límites y casos inválidos.

No borrar tests para conseguir verde.

Si una prueba falla por una causa preexistente, documentarla; no ocultarla.

Si hay pruebas intermitentes, diagnosticar la causa antes de alterar el comportamiento
del producto.

## 13. Cambios prohibidos sin autorización explícita

Está prohibido, salvo autorización explícita y análisis:

- Reescribir arquitectura completa.
- Cambiar ORM o base de datos.
- Crear otro sistema de autenticación.
- Crear otro sistema de permisos/roles.
- Crear otro sistema de auditoría.
- Cambiar el modelo multi-tenant.
- Cambiar JWT/tokenVersion/selección de tenant.
- Escribir directamente en SIESA.
- Eliminar módulos funcionales.
- Eliminar migraciones históricas.
- Eliminar datos.
- Hacer cambios destructivos de schema.
- Introducir dependencias grandes innecesarias.
- Cambiar reglas comerciales por criterio propio.
- Crear funcionalidades no solicitadas.
- Hacer "mejoras" fuera del alcance.
- Hacer commits, push, merges, resets, force-push o cambios Git destructivos sin
  autorización del responsable del proyecto.
- Modificar .env o secretos reales.
- Desactivar controles de seguridad o pruebas.

## 14. Protocolo obligatorio de implementación

Para cualquier tarea no trivial:

FASE A — Entender.
Leer AGENTS.md, MEMORY.md, SKILL.md y el código relevante.

FASE B — Auditar.
Describir brevemente comportamiento actual, archivos involucrados, dependencias,
riesgos y puntos de reutilización.

FASE C — Diseñar.
Proponer el cambio mínimo compatible con la arquitectura actual.

FASE D — Implementar.
Modificar solo lo necesario.

FASE E — Verificar.
Ejecutar pruebas y validaciones apropiadas.

FASE F — Revisar.
Buscar regresiones, seguridad, multi-tenancy, permisos y residuos.

FASE G — Documentar.
Actualizar MEMORY.md solamente cuando exista una decisión permanente o un cambio de
regla/arquitectura que deba conservarse.

Si la tarea es un cambio estructural, no pasar de la fase B a C/ D sin una decisión
del responsable del proyecto.

## 15. Formato de reporte

Al terminar una tarea, reportar:

- Qué se investigó.
- Qué se cambió.
- Archivos afectados.
- Qué NO se cambió.
- Decisiones aplicadas.
- Pruebas ejecutadas y resultado.
- Riesgos o pendientes reales.
- Si MEMORY.md fue actualizado.

No declarar "todo correcto" si no se ejecutaron las verificaciones relevantes.

## 16. Regla anti-alucinación

Si Claude no puede comprobar algo, debe decir:

"NO VERIFICADO EN EL REPOSITORIO."

Nunca debe completar una ausencia de información con una invención.

La precisión tiene prioridad sobre la velocidad.
La reutilización tiene prioridad sobre la duplicación.
La seguridad y el aislamiento multi-tenant tienen prioridad sobre la conveniencia.
El alcance aprobado tiene prioridad sobre las mejoras no solicitadas.

## 17. Archivos de gobierno

AGENTS.md = reglas permanentes de operación del copiloto.

MEMORY.md = decisiones históricas y estado arquitectónico/funcional que deben
conservarse.

SKILL.md = procedimientos repetibles para auditorías, análisis, implementación,
bugs, diseño, QA y soporte.

No convertir MEMORY.md en un diario de cada conversación. Registrar decisiones
duraderas, cambios relevantes y hechos técnicos que deban sobrevivir a nuevos
contextos.

Antes de terminar una tarea, comprobar si se creó una decisión permanente que deba
registrarse en MEMORY.md.
