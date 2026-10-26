# Auditoría documental y estado de fuentes — RicoSoft Enterprise

**Fecha:** 2026-10-23
**Base examinada:** rama `main`, HEAD `17a48ae` (`FIX: GESTION HUMANA 2 ADMINISTRAR BIOMETRICO`); árbol limpio al inicio de la revisión.
**Alcance:** documentación del producto, reportes de arquitectura/seguridad, Prisma, despliegue, CI y memoria técnica. La carpeta `.agents/skills/` contiene principalmente referencias de herramientas de terceros; no se trata como especificación funcional de RicoSoft.

## Dictamen

La documentación es abundante, pero no está gobernada como un conjunto coherente. Conviven auditorías históricas de agosto/septiembre con cambios de código de octubre. Algunas conclusiones antiguas contradicen directamente el repositorio actual. Por tanto, no se deben usar esos reportes antiguos como evidencia del estado actual sin volver a verificar el código.

No se encontró un documento único y aprobado de requisitos de producto (PRD/SRS) que reúna actores, reglas, permisos, flujos, criterios de aceptación y requisitos no funcionales. Los requisitos están distribuidos entre `AGENTS.md`, `MEMORY.md`, reportes de implementación/auditoría, código, pruebas y solicitudes conversacionales. La fuente operativa para este corte fue el código del commit indicado; los documentos nuevos de esta entrega son mapas de análisis, no aprobación de nuevos requisitos de negocio.

## Inventario y vigencia

| Documento | Estado en este corte | Acción recomendada |
|---|---|---|
| `AGENTS.md` | Gobierno vigente y detallado; especifica investigación previa, seguridad, tenant y límites de autoridad. | Conservar como norma; revisar solo cuando cambie una política permanente. |
| `SKILL.md` | Procedimiento de trabajo vigente; describe auditoría, cambios de schema y pruebas. | Conservar; alinear ejemplos de pruebas con el estado actual cuando se mantenga. |
| `MEMORY.md` | Contiene decisiones hasta Gestión Humana (2026-10-06), pero su encabezado aún dice “Última actualización de referencia: 2026-09-23”. No cubre por sí solo el estado del commit del 21 de octubre. | Corregir encabezado en una tarea documental aparte y registrar únicamente decisiones permanentes aprobadas. |
| `README.md` | Solo contiene “Hola, RicoSoft”; no explica instalación, arquitectura ni operación. | Sustituir en una tarea aprobada por un README de entrada que enlace a los documentos canónicos. |
| `server/DEPLOY.md` | Guía concreta de backend Windows + PM2. No es una guía de despliegue completo de la aplicación. | Completar con frontend, proxy/TLS, almacenamiento persistente, copias, rollback y pruebas de aceptación. |
| `Reportes/ARCHITECTURE_AUDIT.md` | Snapshot antiguo con referencia a `164a2d5`; afirma 19 módulos, 7 tests, ausencia de `.env.example` y ausencia de CI/integración. El repositorio actual ya tiene 38 módulos backend, plantillas `.env`, y CI con integración SQL Server. | Marcar explícitamente como histórico/superado; no editar sus hallazgos como si fueran actuales. |
| `Reportes/DATABASE_ARCHITECTURE.md` | Declara “28 modelos”; el schema actual tiene 85 modelos. | Marcar como snapshot histórico y enlazar el MER nuevo. |
| `Reportes/SECURITY_AUDIT.md` | Usa el inventario antiguo de 19 módulos y siete archivos de tests. Ya no describe la cobertura presente. | Mantener como histórico; reabrir hallazgos uno por uno contra el código actual antes de declarar cierre. |
| `Reportes/MODULE_DEPENDENCIES.md` | Dice que Inventario no existe actualmente como módulo/tabla; el código actual tiene `/api/inventario`, `toma-fisica`, `plan-produccion` y modelos asociados. | Marcar como supersedido y reemplazar la vista de dependencias con el MER actual. |
| `Reportes/PENDIENTES_CONSOLIDADO.md` | Fecha 2026-09-01 y reemplaza reportes previos solo “para efectos de planeación”; no refleja los cambios posteriores de octubre. | No usar como backlog vigente; trasladar pendientes abiertos a un registro vivo aprobado. |
| `Reportes/IMPORTACIONES_*` | Auditorías, conciliación de schema, plan e informe de implementación de agosto. Son útiles como historia, pero contienen estados “pendiente” propios de su fecha. | Conservar con fecha y alcance; verificar cada pendiente antes de reabrirlo. |
| `Reportes/IMPORTACIONES_AUDITORIA_EVOLUCION_2026-10-26.md` | Auditoría y evolución vigente del módulo: hitos reales de lote, KPI sin proxies, documentos de lote (B/L-AWB, COA), prorrateo de gastos por FOB/peso/volumen, matriz de similitud y decisiones pendientes. Reemplaza como referencia vigente a los `IMPORTACIONES_*` de agosto. | Mantener actualizada contra HEAD; trasladar las decisiones D-1…D-9 a un registro aprobado. |
| `Reportes/INSPECCION-ESQUEMA-SIESA-2026-09-24.md` | Snapshot de metadatos Siesa con fecha y alcance; no equivale a garantía de disponibilidad o compatibilidad del ERP hoy. | Mantener la fecha de captura visible y volver a validar columnas/compañía antes de cambios de integración. |
| `Reportes/AUDITORIAS_REGISTRO.md` | Registro relativamente reciente (2026-10-20), pero consolida auditorías anteriores. | Mantener como índice de auditorías; enlazar cada fila a evidencia y actualizar estado contra HEAD. |
| `Reportes/AUDITORIA_GESTION_HUMANA_CREACION_2026-10-21.md` | Informe cercano al HEAD, explicita que migración, SQL Server y navegador no quedaron verificados. | Conservar esas limitaciones; no marcar despliegue de Gestión Humana como probado en producción. |
| `Reportes/CORRECCION_GESTION_HUMANA_BIOMETRICO_ADMINISTRAR_2026-10-21.md` | Informe puntual cercano al HEAD; alcance acotado a la selección de fuente biométrica. | Conservar como registro de cambio, no como auditoría total del módulo. |
| `.claude/Skills claude/beauty-catalog-architect.md` | Material de “Diosas Cosméticos”, ajeno al ERP RicoSoft y potencialmente confundible para asistentes. | Aislar o retirar del contexto RicoSoft con aprobación; no tratarlo como estándar del proyecto. |
| `server/docs/*` | Incluye propuestas y anexos de migración; los nombres “propuesta/anexo” no prueban que se hayan aplicado. | Etiquetar cada documento como propuesto, aplicado o supersedido con evidencia de migración. |

## Contradicciones documentales confirmadas por el repositorio

1. Los reportes antiguos describen 19 módulos backend; `server/src/modules/` tiene 38 carpetas de módulo y `server/src/app.ts` monta 38 prefijos API.
2. La arquitectura de datos antigua describe 28 modelos; `server/prisma/schema.prisma` define 85.
3. Los reportes de agosto dicen que no existían `server/.env.example` ni workflow CI; ambos están presentes hoy. `.github/workflows/ci.yml` añade además el job bloqueante de integración y el job `CI gate`.
4. Los reportes antiguos presentan Importaciones como sin tests o no migrada; el estado posterior debe leerse junto con `IMPORTACIONES_IMPLEMENTATION_REPORT.md`, el estado real de `ci.yml` y el historial de migraciones del entorno objetivo.
5. `MEMORY.md` cubre decisiones hasta 2026-10-06, mientras el HEAD actual es de 2026-10-21; no asumir que toda decisión reciente quedó registrada allí.

## Fuentes canónicas recomendadas

1. Comportamiento actual: código de `main` en el commit que se esté liberando.
2. Contratos de datos: `server/prisma/schema.prisma` más las migraciones versionadas; la base real se confirma por separado.
3. Acceso/permiso: `server/src/lib/permissions.ts`, `server/src/lib/catalogo-permisos.ts`, middleware y rutas; el guard de frontend es UX, no enforcement.
4. Operación: `server/DEPLOY.md`, ampliado con el plan nuevo de despliegue de esta auditoría.
5. Historial: `MEMORY.md` y `Reportes/AUDITORIAS_REGISTRO.md`, sin reemplazar evidencia del código.

## Brechas de requisitos a levantar con el dueño del producto

Antes de declarar el sistema “100% especificado”, falta acordar y registrar: jerarquía formal de aprobación por área; catálogo de estados y transiciones de todos los documentos; alcance legal/retención de datos de empleados y soportes; volúmenes y concurrencia esperados; RPO/RTO y ventana de mantenimiento; responsables del backup/restore; disponibilidad requerida de Siesa/VPN/Workspace; y comportamiento de recuperación ante fallos de jobs y cargas de archivos.

## Documentos elaborados en este corte

- `Reportes/ARQUITECTURA_Y_FLUJOS_USUARIO_2026-10-23.md`
- `Reportes/MER_RICOSOFT_2026-10-23.md`
- `Reportes/DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md`

Estos documentos describen el estado observado y distinguen explícitamente entre funcionalidad existente, inferencia y decisión pendiente.
