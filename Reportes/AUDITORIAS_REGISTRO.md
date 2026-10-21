# REGISTRO DE AUDITORÍAS — RicoSoft Enterprise

Creado: 2026-10-20
Motivo: no existía un archivo que consolidara las auditorías realizadas. Este documento es un **índice**: no reemplaza ni duplica los informes; apunta a ellos y resume su estado.

## Cómo se construyó (y qué límites tiene)

- **Fuentes revisadas:** los informes de `Reportes/`, `server/docs/`, las entradas de `MEMORY.md`, el historial de git (`git log`) y el código actual para verificar el estado de los hallazgos abiertos.
- **Verificado en código el 2026-10-20:** solo los hallazgos marcados con 🔎. El resto del estado proviene de lo que dicen los propios informes o `MEMORY.md`, y así se indica.
- **NO VERIFICADO EN EL REPOSITORIO:** auditorías hechas en conversaciones que no dejaron informe, entrada en `MEMORY.md` ni commit. Si existen, hay que agregarlas a mano en la sección 2.
- Los documentos `.claude/skills/Auditor by gemini.md` y `.claude/Skills claude/AuditorUX.md` son **procedimientos** para auditar, no auditorías ejecutadas. No figuran en la tabla.

Leyenda de estado: ✅ cerrado · 🟡 parcial / con pendientes · 🔴 abierto · ⚪ decisión de negocio sin resolver · ❔ no verificado.

---

## 1. Línea de tiempo

| # | Fecha | Auditoría | Alcance | Tipo | Documento / fuente | Resultado resumido |
|---|---|---|---|---|---|---|
| 1 | 2026-08-27 | Auditoría técnica original | Arquitectura, stack, CI/CD, deuda técnica (commit de referencia `164a2d5`) | Solo lectura | [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) | Violaciones arquitectónicas y deuda técnica documentadas, sin corregir. |
| 2 | 2026-08-27 | Auditoría de seguridad original | Seguridad transversal (C1, A1, M1–M3, B1–B3) | Solo lectura | [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | 1 crítico (aislamiento multi-tenant sin garantía estructural), 1 alto (cero tests de aislamiento), medios y bajos. |
| 3 | 2026-08-27 | Arquitectura de datos y dependencias | Modelo de datos, dependencias entre módulos | Solo lectura | [DATABASE_ARCHITECTURE.md](DATABASE_ARCHITECTURE.md), [MODULE_DEPENDENCIES.md](MODULE_DEPENDENCIES.md) | Mapa de modelos y de acoplamientos entre módulos. |
| 4 | 2026-08-27 | Análisis de Importaciones | Impacto, plan, reporte, migración, reconciliación de esquema (27–28 ago) | Análisis + implementación | [IMPORTACIONES_IMPACT_ANALYSIS.md](IMPORTACIONES_IMPACT_ANALYSIS.md), [IMPORTACIONES_IMPLEMENTATION_PLAN.md](IMPORTACIONES_IMPLEMENTATION_PLAN.md), [IMPORTACIONES_IMPLEMENTATION_REPORT.md](IMPORTACIONES_IMPLEMENTATION_REPORT.md), [IMPORTACIONES_MIGRATION_PLAN.md](IMPORTACIONES_MIGRATION_PLAN.md), [IMPORTACIONES_SCHEMA_RECONCILIATION.md](IMPORTACIONES_SCHEMA_RECONCILIATION.md) | Vacíos de Importaciones que dieron origen a las decisiones pendientes. |
| 5 | 2026-08-27 | Decisiones arquitectónicas pendientes | 18 decisiones, casi todas de Importaciones | Registro de decisiones | [ARCHITECTURAL_DECISIONS_PENDING.md](ARCHITECTURAL_DECISIONS_PENDING.md) | Lista de decisiones; varias resueltas luego (ver `PENDIENTES_CONSOLIDADO.md`). |
| 6 | 2026-08-31 | Consolidación de arquitectura | Seguridad, autorización, empresas, permisos dinámicos, Compras↔Facturas (Fase A = auditoría inicial) | Auditoría + implementación | [Ricosoft_Architecture_Consolidation_Report.md](Ricosoft_Architecture_Consolidation_Report.md) | Cambio de empresa en vivo, catálogo dinámico de permisos. Más informe de implementación que auditoría. |
| 7 | 2026-09-01 | Consolidado de pendientes | Reconcilia pendientes de los 11 documentos previos | Síntesis | [PENDIENTES_CONSOLIDADO.md](PENDIENTES_CONSOLIDADO.md) | Qué quedó resuelto y qué sigue abierto a esa fecha. |
| 8 | 2026-09-01 | Auditoría de arquitectura objetivo | Siesa vs. RicoSoft (control previo), Compras, Facturas, Importaciones, trazabilidad | Solo lectura | [RICOSOFT_TARGET_ARCHITECTURE_AUDIT.md](RICOSOFT_TARGET_ARCHITECTURE_AUDIT.md) | Confirma que Siesa es 100 % lectura. 2 gaps: autoaprobación y justificación fuera de la auditoría. 10 decisiones de negocio. *(Fecha tomada de la fecha del archivo; el informe no la declara.)* |
| 9 | 2026-09-02 | Master Technical QA & Security Audit | Auditoría adversarial (A-01…A-04, M-01…M-10, B-01…B-04, H-01) | Adversarial | [RICOSOFT_MASTER_TECHNICAL_QA_AUDIT.md](RICOSOFT_MASTER_TECHNICAL_QA_AUDIT.md) | Documento vivo de seguimiento. El informe original está en un artefacto externo (no verificable desde el repo). |
| 10 | 2026-09-02 | Hardening y QA de seguridad | Validación de A-01, A-02, M-09, M-01, A-03, M-04; hallazgo nuevo M-10 | Validación con BD real | [RICOSOFT_HARDENING_QA_REPORT.md](RICOSOFT_HARDENING_QA_REPORT.md) | 6 hallazgos corregidos y validados. Veredicto: **APTO CON RIESGOS**. |
| 11 | 2026-09-02 | Hardening final | M-10, M-05, M-03, M-02, A-04, M-08, pruebas cross-tenant | Corrección + validación | [RICOSOFT_HARDENING_FINAL_REPORT.md](RICOSOFT_HARDENING_FINAL_REPORT.md) | 218/218 unitarias y 212/213 de integración. Sin P0 abiertos. Veredicto: **APTO CON RIESGOS**. |
| 12 | 2026-09-02 | Auditoría de arquitectura del módulo Comercial | Ventas, Créditos, Inventario, Toma Física, Oportunidades, Producción, Despachos, Analítica | Solo lectura | [RICOSOFT_COMERCIAL_ARCHITECTURE_AUDIT.md](RICOSOFT_COMERCIAL_ARCHITECTURE_AUDIT.md) | Riesgos R-C-01…R-C-08 y decisiones D-C-01…D-C-05. |
| 13 | 2026-09-03 | Auditoría Comercial / Analítica | KPIs, fuentes de datos Siesa, endpoints existentes | Solo lectura | [AUDITORIA_COMERCIAL_ANALITICA.md](AUDITORIA_COMERCIAL_ANALITICA.md) | Mapa de datos reales y KPIs viables. Precede a la implementación P0 de Comercial. |
| 14 | 2026-09-22 | Auditoría + diseño: PedidoComercial ↔ PDV SIESA | Vínculo `erpRowId` = `f430_rowid`, idempotencia, seguridad, plan de pruebas | Auditoría + diseño | [COMERCIAL_SIESA_PDV_INTEGRACION_AUDITORIA_DISENO.md](COMERCIAL_SIESA_PDV_INTEGRACION_AUDITORIA_DISENO.md) | Riesgos R-01…R-07 y 6 decisiones previas a implementar. Sin escritura a Siesa. |
| 15 | 2026-09-24 | Inspección de esquema Siesa UnoEE | Metadatos de `t430`/`t431`/`t433`/`t200`, etc. | Solo metadatos (`INFORMATION_SCHEMA`) | [INSPECCION-ESQUEMA-SIESA-2026-09-24.md](INSPECCION-ESQUEMA-SIESA-2026-09-24.md) | Columnas reales vs. supuestas (p. ej. `t431_cm_pv_docto_linea` no existe). Base de la ingesta CDV. |
| 16 | 2026-09-24 | Auditoría visual (dictamen) | Estados y semáforo del design system | Dictamen | `MEMORY.md` → «Semáforo OFICIAL de estado operativo» | Semáforo de cinco tonos, con contraste AA verificado por test. |
| 17 | 2026-09-24 | Auditoría de seguridad y RBAC (P1/P2) | Autorregistro, errores en auth, notificaciones, analítica, permiso de aceptación de proformas, config. de negocio | Auditoría + corrección | `MEMORY.md` → «Auditoría de seguridad y RBAC (P1/P2)»; commits `ad156c1`, `3493877`, `b096854` (23 sep) | Corregido en código y registrado como decisión. Inconsistencia documental: `MEMORY.md` dice que los roles existentes no tienen `comercial.proformas.aceptar` y que un administrador debe otorgarlo. 🔎 Pero la migración `20260924200000_backfill_permiso_proformas_aceptar` se lo agrega a todo rol con `proformas.gestionar`/`proformas.manipular`. Hay que revisar la entrada de `MEMORY.md`. |
| 18 | 2026-09-25 | Auditoría inmutable (ISO 27001 A.12.4) | FK `Auditoria.usuarioId`, borrado de usuarios, purga | Auditoría + corrección | `MEMORY.md` → «Auditoría inmutable»; commits `035074f`, `450de7f` | Se eliminó la FK, el evento `USUARIO_ELIMINADO` va en la misma transacción, y queda prohibido `UPDATE`/`DELETE` sobre `Auditoria`. |
| 19 | 2026-09-28 | Auditoría de la Bandeja de Importaciones y tracking marítimo | Ingesta de correos, adjuntos, tracking `mock` | Auditoría + corrección | `MEMORY.md` → «Endurecimiento de Bandeja de Importaciones»; [bandeja-importaciones.md](../server/docs/bandeja-importaciones.md) | Corregido: tracking simulado bloqueado, paginación Gmail, reprocesado idempotente. Pendientes listados en la sección 3. |
| 20 | 2026-10-05 | Auditoría de Importaciones (novedades, triage, atomicidad) | Novedades automáticas, `/sin-asignar`, consecutivo IMP-año-n | Auditoría + corrección | `MEMORY.md` → entradas del 2026-10-05 | Corregido el 500 del detalle y el triage cross-tenant (rutas denegadas). Pendientes en la sección 3. |
| 21 | 2026-10-05 | Alineación migraciones ↔ `schema.prisma` | Diff de 66 migraciones contra el schema en BD desechable | Propuesta (solo lectura) | [PROPUESTA-migracion-alineacion-schema-2026-10-05.md](../server/docs/PROPUESTA-migracion-alineacion-schema-2026-10-05.md) y el SQL anexo | **Pendiente de autorización** (cambio estructural). Propone corregir 3 columnas que rompen código hoy y excluir el resto. |

| 22 | 2026-10-20 | Auditoría de seguridad de extremo a extremo | Autenticación/JWT, RBAC, aislamiento multi-tenant, archivos, cabeceras, dependencias, CI, datos sensibles | Auditoría + corrección acotada | Sección 3.6 de este archivo | 3 correcciones aplicadas (SEC-01, SEC-02, SEC-03) con pruebas unitarias; el resto queda documentado, varios con decisión pendiente. Confirma o refuta las pistas del registro (ver 3.6). |
| 23 | 2026-10-20 | Seguimiento de la auditoría de seguridad (segunda pasada) | SEC-04, SEC-07, SEC-08, SEC-09, SEC-14, validación de pruebas, diagnóstico de los fallos de integración en QA | Verificación + contención | Sección 3.7 de este archivo | SEC-08 contenido (archivo movido fuera de `public/`), SEC-14 sin cambio, avisos de dependencias detallados, causas de los 8 fallos de QA demostradas y un hallazgo funcional nuevo (FUN-01). |

**Sin clasificar:** el commit `70e9691` (2026-09-15, «FIX: auditoria usuarios») solo tiene ese título. Si fue una auditoría o una función de auditoría de usuarios: NO VERIFICADO EN EL REPOSITORIO.

**Trabajo de QA sin commitear (a 2026-10-20):** `server/scripts/qa-runner.ts`, `server/src/lib/integration-db-guard.ts` y `server/.env.integration.qa.example`. Fuerzan que las pruebas de integración corran solo contra `saas_dev_qa`. No son una auditoría, pero responden al pendiente de la fila 20 («no hay una BD desechable configurada»).

---

## 2. Auditorías que faltan por registrar

Agregar aquí cualquier auditoría hecha en conversación que no dejó rastro en el repositorio (fecha, alcance, resultado y enlace al informe). No se reconstruye de memoria para no inventar historial.

| Fecha | Alcance | Resultado | Dónde quedó |
|---|---|---|---|
| — | — | — | — |

---

## 3. Estado actual de los hallazgos

Estado verificado en código el 2026-10-20 (🔎) o tomado del informe indicado.

### 3.1 Seguridad y QA transversal (filas 2, 9, 10, 11)

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| C1 | Aislamiento multi-tenant sin garantía estructural | 🟡 Mitigado, no cerrado | 🔎 Existe una extensión Prisma con `MODELOS_TENANT_SCOPED` (`server/src/lib/tenant-prisma.ts`). Sigue sin Row-Level Security. Que **todos** los controladores la usen: NO VERIFICADO (ver R-C-04). |
| A1 | Cero tests de aislamiento/autorización | ✅ Atendido | 🔎 70 archivos `*.integration.test.ts` y 173 `*.test.ts` en `server/src` (el informe original contaba 7 de funciones puras). |
| M1 | Migración `tenant_dominio_activo` sin commitear | ✅ | 🔎 La migración está versionada. |
| M2 | Sin plantilla de variables de entorno | ✅ | 🔎 Existe `server/.env.example`. |
| M3 | `server/.env.local` con variables muertas | ❔ | No revisado. |
| B1 | `scripts/explore-siesa.ts` con SQL por interpolación | ❔ | No revisado. |
| B2 | Sin `migration_lock.toml` | ✅ | 🔎 Existe. |
| B3 | `bun.lock` y `package-lock.json` en la raíz | 🔴 | 🔎 `bun.lock` sigue en la raíz junto a `package-lock.json`. |
| A-01 | Roles de alcance GENERAL editables por cualquier tenant | ✅ | Corregido y validado con BD real (filas 10, 11). |
| A-02, M-09 | Sobrepago y atomicidad de pagos | ✅ | Ídem. |
| M-01 | Rol inactivo seguía otorgando permisos | ✅ | Ídem. |
| A-03 | Autoaprobación de solicitudes | ✅ | Ídem. 🔎 El control está en `solicitudes.controller.ts`. |
| M-04 | Auditoría incompleta al resolver solicitudes | ✅ | Ídem. |
| M-10 | 500 por deadlock P2034 en pagos concurrentes (devuelve 409) | ✅ | Fila 11. |
| M-05 | Carrera en la inicialización del pool Siesa | ✅ | Fila 11 (probado con mock, sin VPN). |
| M-03 | Archivos validados solo por mimetype | ✅ | Fila 11 (magic bytes). |
| M-08 | Modelos hijos sin `tenantId` directo | ✅ Sin vulnerabilidad | Fila 11: 12 modelos revisados, todos seguros por relación. |
| M-02 | Headers de seguridad del frontend | 🔴 | 🔎 El backend usa `helmet()` por defecto (`app.ts`). No se encontró CSP ni `public/_headers` en el frontend. |
| — | JWT en `localStorage` | 🔴 | 🔎 `src/lib/session.ts` lo sigue guardando ahí. Es una decisión de arquitectura. |
| A-04 | Rendimiento de las consultas a Siesa | ❔ No medido | El informe lo declara «LIMITACIÓN DE ENTORNO» (sin VPN). 🔎 `monitoreo/siesa-health.service.ts` es de salud, no equivale a esa medición. |
| M-06 | Test flaky que asume Siesa inalcanzable | ❔ | Preexistente a 2026-09-02. Estado actual: ejecutar la suite. |

### 3.2 Comercial (fila 12)

| ID | Hallazgo | Estado | Evidencia |
|---|---|---|---|
| R-C-01 | Sin control de autoaprobación en Plan de Producción, Liquidación y Despachos | ⚪ | 🔎 Sigue sin control en esos tres módulos. Depende de D-C-02: el negocio debe confirmar si aplica. |
| R-C-02 | Sin auditoría en Toma Física, Plan de Producción y Liquidación | ✅ | 🔎 Los tres controladores escriben `Auditoria` (comentarios «R-C-02» en el código). |
| R-C-03 | `CreditoCliente.cliente` es texto libre, sin vínculo a Siesa | ⚪ | Depende de D-C-01. NO VERIFICADO si cambió. |
| R-C-04 | Créditos y Toma Física no usan `req.tenantPrisma` | 🟡 | 🔎 Toma Física sigue sin usarlo. Créditos lo usa solo en una ruta. Los filtros manuales fueron revisados como correctos en la auditoría. |
| R-C-05 | Hasta ~10 consultas a Siesa por request, sin caché | ❔ | Atado a A-04. |
| R-C-06 | «Oportunidades» es un reporte, no un módulo | ⚪ | Depende de D-C-03. |
| R-C-07 | Créditos con `take: 1000` sin paginación | ❔ | Sin revisar. |
| R-C-08 | `resolverNovedad` de Despachos sin auditoría | ✅ | 🔎 Ya audita (comentario «R-C-08» en el código). |
| D-C-01…D-C-05 | Decisiones de negocio de Comercial | ⚪ | Sin registro de resolución en `MEMORY.md`. |

### 3.3 Integración PedidoComercial ↔ PDV SIESA (fila 14)

| Tema | Estado | Evidencia |
|---|---|---|
| Vínculo por `f430_rowid`, sin escritura a Siesa, sin cambiar el estado comercial | ✅ | `MEMORY.md` (decisión 2026-09-22) y `AGENTS.md` §8. |
| Unicidad de `erpRowId` en `PedidoComercial`, `Cotizacion` y `Despacho` (R-01, R-02) | ✅ | `MEMORY.md`, «Hardening Fase 1-2» (2026-09-23): índices únicos filtrados y `@@unique` en `Despacho`. Que esta entrada corresponda a esos hallazgos se infiere por el contenido. |
| Decisiones 2–6 (granularidad por línea, revalidación al confirmar, sync/async, permiso propio) | ❔ | No hay registro de resolución en `MEMORY.md`. |

### 3.4 Importaciones (filas 4, 5, 19, 20, 21)

Resuelto desde agosto (según `PENDIENTES_CONSOLIDADO.md`): endpoints de documentos aduaneros y vistos buenos, catálogo dinámico de permisos, identidad de proveedor por `siesaTerceroRowId` y sincronización Siesa en segundo plano.

Siguen abiertos (decisión de negocio o autorización):

- Cuándo una orden pasa a «Cerrada», y qué se congela al cerrar.
- Prorrateo por peso/volumen en lugar de solo FOB.
- Relación con Compra nacional, Inventario y Contabilidad.
- TRM manual o fuente oficial.
- Proveedor extranjero como texto libre o entidad.
- Anticipos, aranceles preferenciales por TLC, validación documental antes de liquidar, recepción parcial e incidencias.
- Triage de `/sin-asignar` (hoy denegado): requiere una identidad de plataforma aprobada.
- Declarar una alerta automática «no aplicable» (lo definirá Comercio Exterior).
- Campo propio para la PO del proveedor: el cruce de la Bandeja por `numeroOrden` ya no funciona con la numeración `IMP-año-n`.
- Sincronización dentro del GET, requisitos por evidencia real, correcciones post-cierre y aprobación de pagos.
- **Autorización pendiente:** la migración de alineación `schema.prisma` ↔ migraciones (fila 21).

### 3.5 Gestión Humana (2026-10-06)

No hay auditoría formal. `MEMORY.md` deja pendientes: confirmación legal y retención de datos de salud y bancarios (Ley 1581/2012), FK compuesta tenant-cargo, y migración y pruebas de integración sin ejecutar contra una BD desechable.

---

### 3.6 Auditoría de seguridad de extremo a extremo (fila 22, 2026-10-20)

Evidencia de código con archivo y línea. «Pista» = punto del registro anterior que se verificó en esta pasada.

**Corregido en esta pasada** (pruebas unitarias sin base de datos; resultados de ejecución al final de la sección):

| ID | Sev. | Hallazgo | Evidencia | Acción |
|---|---|---|---|---|
| SEC-01 | Alta | `POST /api/roles` aceptaba `permisos` con solo `roles.crear`, mientras que editarlos exige además `roles.asignar_permisos` (el comentario de `actualizarRol` y la UI en `configuracion.roles.tsx:425` lo tratan como permiso aparte). | `server/src/modules/roles/roles.controller.ts` (`crearRol`, ~l. 92-103) | `crearRol` exige `roles.asignar_permisos` o superadmin si el rol incluye permisos. Un rol vacío sigue creándose con `roles.crear`. Prueba: `roles/roles-crear.test.ts`. |
| SEC-02 | Alta | Quien solo tenía `usuarios.reset_password` podía restablecer la contraseña de un superadmin (del tenant o por membresía) y entrar como ese usuario. | `server/src/modules/usuarios/usuarios.controller.ts` (`resetPasswordUsuario`, ~l. 587-604) | Solo un superadmin puede restablecer a un superadmin. Criterio ya documentado en `cambiarSuperadminUsuario` y `primerPermisoQueExcedeAlActor`. Prueba: `usuarios/usuarios-reset-password.test.ts`. |
| SEC-03 | Baja | Un correo inexistente respondía sin ejecutar bcrypt, lo que permite enumerar cuentas por tiempo de respuesta. El código ya busca evitar la enumeración por mensaje. | `server/src/modules/auth/auth.service.ts` (`loginUserService`, ~l. 188-216) | Compara contra un hash bcrypt descartable. Prueba: `auth/auth-login-timing.test.ts`. |

**Abiertos, con decisión del responsable:**

| ID | Sev. | Hallazgo | Evidencia | Decisión o acción pendiente |
|---|---|---|---|---|
| SEC-04 | Alta | `isSuperadmin` es por tenant, pero concede autoridad entre tenants (detalle y opciones en 3.7). | `membresias.routes.ts:17`, `membresias.controller.ts:11-56,113,135,185-200,255-305`, `roles.controller.ts:85,156,288`, `permissions.ts:264,296` | Definir una identidad de plataforma o limitar esas acciones. Toca el modelo multi-tenant: no se implementa sin autorización. |
| SEC-05 | Media | JWT en `localStorage` (pista confirmada). Un XSS roba un token de 8 h. 🔎 No hay `dangerouslySetInnerHTML`, `innerHTML` ni `eval` en `src/`. | `src/lib/session.ts:31` | Cambiar a cookie httpOnly implica tocar JWT/sesión: decisión de arquitectura. |
| SEC-06 | Media | El frontend no define CSP ni cabeceras de seguridad. 🔎 El build genera `.output/public/_headers` con una sola regla (caché de `/assets/*`); un servidor Vite local respondió 0 cabeceras de seguridad (CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy) tanto en un archivo estático como en el HTML de la app. El backend usa `helmet()` (`app.ts:83`) y solo cubre la API. Dónde se sirve el frontend en producción (el build apunta al preset `cloudflare-module`) y si el hosting añade cabeceras: NO VERIFICADO EN EL REPOSITORIO. | `src/server.ts`, `.output/public/_headers`, `.output/nitro.json` | Confirmar el hosting real y definir la política CSP allí. |
| SEC-07 | Media | Avisos de `npm audit` en dependencias de producción. Tabla exacta, uso y plan en 3.7. | `server/package-lock.json`, `package-lock.json` | Actualizaciones de dependencias: requieren autorización. |
| SEC-08 | Media | `public/Factura Proforma 3889.-<cliente>.xlsx` contiene razón social, NIT, contactos y vendedor de un cliente real, y el servidor estático lo entregaba sin sesión. Estaba versionado desde `029d27d` (2026-09-21) y `origin/main` lo contiene. Solo lo citaban dos comentarios (`comercial.proformas.$id.tsx:58,115`). `public/cotizacion-tecnologia-piloto.pdf` es un documento ficticio de pruebas de extracción, sin datos reales. | `public/`, `.output/public/` | **Contenido en el árbol de trabajo (2026-10-20):** el XLSX se movió, con hash verificado, a `Reportes/referencias/` (fuera de la ruta servida) y los dos comentarios apuntan a la nueva ruta. Sin commit: el historial de git y `origin/main` siguen conteniéndolo, y el build local `.output/public/` conserva una copia. Ver 3.7. |
| SEC-09 | Media | `GET /api/gestion-humana/empleados` devuelve `salarioActual` y el histórico de salarios con solo `empleados.ver`; la pantalla los muestra (`gestion-humana.tsx:678`). `empleados.ver` es además la clave del módulo (`20260831020000_modulo_permiso_clave`). No hay permiso de lectura de salario ni patrón de autorización por campo para este dato. | `empleados.controller.ts:15-17,36`, `auth-permissions.ts:645-660` | Decisión de negocio; propuesta en 3.7. No se implementó. |
| SEC-10 | Baja | `POST /auth/register` no cuenta los intentos exitosos (`skipSuccessfulRequests`), así que se pueden crear cuentas inactivas sin límite. «Correo ya registrado» revela existencia. `GET /departamentos/publico` no tiene limitador y revela qué dominios son empresas. | `auth.routes.ts:31,36`, `departamentos.routes.ts:14` | Política de limitación: decisión. |
| SEC-11 | Baja | Varias mutaciones administrativas escriben la auditoría fuera de la transacción (membresías, estado/rol/correo/contraseña de usuario). `eliminarUsuario` y las rutas de Comercial sí son atómicas. | `membresias.controller.ts:185-228` y otras | Hacer atómico donde AGENTS §11 lo exija. Cambio de alcance medio. |
| SEC-12 | Baja | La URL de la API por defecto es `http://<host>:4000/api`; el token viaja sin TLS en LAN/Tailscale salvo que se defina `VITE_API_URL` con HTTPS. En desarrollo, sin `CORS_ORIGIN`, se acepta cualquier origen (en producción el arranque lo exige). | `src/config/api.ts:8-9`, `app.ts:57-66` | Confirmar el despliegue real. |
| SEC-13 | Baja | `FuenteBiometrica.nombre` es `@unique` global. Crear una fuente con un nombre usado por otra empresa responde 409 y lo revela. La importación resuelve por nombre. | `schema.prisma` (modelo `FuenteBiometrica`), `biometrico-import.service.ts:45` | Decisión de modelo. |
| SEC-14 | Info | El workflow usa un valor literal de respaldo como contraseña `sa` del SQL Server efímero cuando falta el secreto `CI_INTEGRATION_MSSQL_PASSWORD`. 🔎 Aparece solo en `ci.yml:81,85,87` (introducido en `9f798d4`, 2026-08-27); ningún otro archivo lo repite; `localhost` del runner, contenedor destruido al terminar el job. No hay evidencia de que sea una credencial de un sistema persistente. | `.github/workflows/ci.yml` | Sin cambio: ver 3.7. |

**Pistas del registro, resultado:**

| Pista | Resultado |
|---|---|
| R-C-04: Toma Física no usa `tenantPrisma`; Créditos lo usa en una sola ruta | **Confirmado.** Sin vulnerabilidad: todos los controladores revisados verifican `tenantId` antes de mutar (`creditos.controller.ts:340-353`, `:455-472`, `:500-508`). |
| R-C-01: autoaprobación en Producción, Liquidación y Despachos | **Confirmado abierto** (ver D-C-02 abajo). |
| JWT en `localStorage` | **Confirmado** (SEC-05). |
| Sin CSP/cabeceras en el frontend | **Confirmado en el repo**; hosting NO VERIFICADO (SEC-06). |
| Inconsistencia RBAC en `MEMORY.md` vs. migración `20260924200000_backfill_permiso_proformas_aceptar` | **Confirmada.** La migración agrega el permiso a todo rol con `proformas.gestionar`/`proformas.manipular`; `MEMORY.md` (~l. 602) dice lo contrario. Si la migración se aplicó en cada base: NO VERIFICADO. No se tocó `MEMORY.md`. |
| `bun.lock` y `package-lock.json` | **Confirmado**; CI usa `npm ci`. Sin cambio. |
| Divergencia schema/migraciones en tres columnas | **Parcialmente aclarada.** Hay dos migraciones sin versionar (`20261009130000_solicitud_compra_proveedor`: `SolicitudCompra.proveedor` y `proveedorId`; `20261009150000_factura_solicitud_compra`: `Factura.solicitudCompraId`) que crean exactamente esas tres columnas. No se aplicaron ni se versionaron; su autorización es NO VERIFICADA. |
| Controles de hardening sin verificar | Verificados ahora, con lectura de código: A-01 (`roles.controller.ts:156`), A-03 (`solicitudes.controller.ts:566`), M-01 (`permissions.ts:269`) y M-03 (`upload.middleware.ts`). M-04, M-05, M-10 y M-08 no se releyeron en esta pasada. |

**D-C-02 (autoaprobación), solo hechos:** `plan_produccion.gestionar`, `gestion_liquidacion.gestionar` y `despachos.gestionar` cubren crear y avanzar el estado (rutas en cada `*.routes.ts`); no hay permiso separado de aprobación ni comparación con el creador. Solicitudes de compra sí lo tiene (`solicitudes.controller.ts:566`, A-03). Quién puede aprobar cada flujo y qué segregación se exige es una regla de negocio que no existe en el repositorio: **no se implementó** y requiere decisión.

**Verificado sin hallazgos:** todos los routers exigen `authenticateJWT` (script sobre 39 archivos de rutas); el `selectionToken` no sirve como token de acceso (`tokenVersion` no coincide, `permissions.ts:495`); membresía o tenant inactivo invalida la sesión en cada petición (`permissions.ts:343,363`); 211 llamadas Prisma sobre modelos con `tenantId` revisadas con script, y las que no filtran `tenantId` en la misma función son sistema/jobs, datos propios del usuario o actualizaciones posteriores a una verificación de propiedad; notificaciones filtran por tenant; carga de archivos (tipos cerrados, magic bytes, UUID, carpeta temporal, descarga autenticada); sin SQL por interpolación, sin `$queryRaw`, sin SSRF con URL de usuario (única petición saliente fija en `trm.service.ts:48`).

**Pruebas ejecutadas (2026-10-20):** `tsc --noEmit` en `server/` sin errores. Suite unitaria del servidor con variables de CI de relleno: 104 archivos pasaron y 2 se omitieron; 1012 pruebas pasaron y 45 se omitieron (las omitidas son preexistentes). Suite de integración con `npm run test:integration:qa`, destino verificado `saas_dev_qa` en el host aprobado, con el login `runner`: 64 archivos pasaron y 6 fallaron (690 pruebas pasaron, 8 fallaron, 40 se omitieron). Los 6 archivos que fallan son `auth-register`, `pedidos-compromiso`, `facturas-siesa`, `inventario-comprometidos`, `facturas.tenant-prisma` y `pagos.hardening`. Ninguno toca los archivos modificados. Causas visibles: no existe el tenant de dominio Ricol en esa base (`auth-register`), choque de `Tenant_siesaCiaId_key` al crear un tenant (`pedidos-compromiso`) y ausencia de un tenant con `siesaCiaId=1` (`facturas-siesa`, `inventario-comprometidos`). Los fallos de `pagos.hardening` y `facturas.tenant-prisma` devuelven 400 donde se espera 201, 404 o 409; la causa se demostró en la segunda pasada (3.7). No se corrió una línea base sin los cambios, así que "preexistente" es una inferencia. Los archivos de integración de roles, usuarios, membresías, permisos y alcance general no aparecen entre los fallos. No se agregaron pruebas de integración propias. Frontend: sin cambios, no se ejecutó.

**Fuera de alcance:** pruebas de penetración dinámicas, rendimiento, la infraestructura real (proxy, firewall, hosting del frontend), contenido de `.env`, y el estado real de las bases (no se conectó a `saas_dev`).

### 3.7 Segunda pasada de la auditoría de seguridad (fila 23, 2026-10-20)

**Estado de Git al iniciar:** `HEAD` `b50c33e`, rama `main`, 23 archivos modificados y 36 sin seguimiento, igual que al cierre de la primera pasada. Se conservaron todos. El diff de las tres correcciones coincide con SEC-01, SEC-02 y SEC-03; el cambio de texto del dominio `greensolutions.com.co` en `auth.service.ts:58` ya existía y no es de esta auditoría.

**Validación de las pruebas nuevas.** Se quitó cada guardia en el código local, se ejecutó la prueba y se restauró el archivo (verificado byte a byte contra una copia). Sin tocar bases de datos.

| Prueba | Guardia retirada | Resultado sin la guardia |
|---|---|---|
| `roles-crear.test.ts` | condición de `crearRol` | 1 de 5 fallaron (la de 403) |
| `usuarios-reset-password.test.ts` | condición de `resetPasswordUsuario` | 2 de 5 fallaron (superadmin del tenant y por membresía) |
| `auth-login-timing.test.ts` | comparación bcrypt con hash falso | 1 de 2 falló |

Restaurados los tres archivos, las 12 pruebas pasan.

**SEC-08, contención.**
- Hechos verificados: el XLSX estaba versionado y `origin/main` lo contiene. El build local `.output/public/` (2026-10-06) conserva una copia y su `nitro.json` declara `publicDir: public`. Un servidor Vite local respondió 200 sin sesión a un archivo de `public/` (se usó el PDF ficticio como sonda, no el XLSX). Tras el movimiento, la ruta anterior del XLSX responde 404, igual que una ruta inexistente.
- Cambio: el XLSX se movió a `Reportes/referencias/` (hash idéntico antes y después) y se actualizaron los dos comentarios. No se borró nada.
- No se afirma: que esté fuera de despliegues, CDN, cachés, `.output/`, el historial de git ni `origin/main`. Consulta sin autenticación a la API de GitHub devolvió 404 para el repositorio remoto (no es público para anónimos; que sea privado: NO VERIFICADO).
- Pendiente con infraestructura/privacidad: si el sitio se publicó alguna vez (Cloudflare u otro), desde cuándo, qué se descargó y si hay que notificar al cliente; si se reescribe el historial (operación destructiva, requiere autorización); regenerar el build para que `.output/public/` ya no lo incluya.

**SEC-14.** Es un valor ficticio de pruebas de un contenedor efímero: aparece solo en el workflow, el contenedor y la base viven en el runner y se destruyen. No hay evidencia de que sea real o reutilizable en otro sistema. No se cambió el workflow: quitar el respaldo rompería el pipeline si el secreto no está configurado (no verificable) y los PR desde forks no reciben secretos, y el contenedor de servicio no puede tomar una contraseña generada en un paso. Recomendación: confirmar con quien administra los secretos de GitHub que `CI_INTEGRATION_MSSQL_PASSWORD` existe; rotar solo si ese valor se usó en otro lugar (no hay evidencia). No se rotó nada.

**SEC-04, cómo cruza el límite entre tenants.** `isSuperadmin` viene de la sesión del tenant activo (`permissions.ts:264,296,355,375`) y `requireSuperadmin` solo lo comprueba (`auth.middleware.ts:93-103`).

| Vector | Evidencia |
|---|---|
| Listar todas las empresas, y roles/departamentos de cualquier `tenantId` | `membresias.controller.ts:11-22,25-56` (`membresias.routes.ts:17` solo exige superadmin) |
| Crear una membresía con `isSuperadmin=true` en cualquier tenant activo para un usuario nativo de su empresa (no a sí mismo) | `membresias.controller.ts:113,120,135,141-153,185-200` |
| Cambiar rol/`isSuperadmin`/`activo` de esas membresías en otros tenants | `membresias.controller.ts:255-305` |
| Crear/editar/eliminar valores de alcance GENERAL que ven todos los tenants: roles, departamentos (incluido `esSistemas`), catálogos, plantillas, publicaciones, módulos | `roles.controller.ts:85,156,288`; `departamentos.controller.ts:140,149,202,219,300`; `catalogos.controller.ts:217,288,386`; `plantillas-notificacion.controller.ts:69,118,160`; `publicaciones.controller.ts:239,309,374,427,540`; `modulos.controller.ts:415` |

Consecuencia concreta: un superadmin de la empresa A puede dar control total de la empresa B a un usuario nativo de A, y puede cambiar los permisos de un rol GENERAL ya asignado a usuarios de B sin que B intervenga. No hay evidencia de que haya ocurrido.

Opciones (ninguna implementada):

| Opción | Qué cambia | Compatibilidad / migración | Pruebas |
|---|---|---|---|
| A. Identidad de plataforma propia | Campo nuevo en `User` (p. ej. administrador de plataforma) y un middleware `requirePlataforma` para los vectores de la tabla | Cambio de schema y migración aditiva; los superadmins actuales perderían estas acciones hasta designar la plataforma. No requiere cambiar el JWT: la sesión se recalcula desde la BD en cada petición | Integración cross-tenant en dos tenants; unitarias por ruta |
| B. Sin identidad nueva: exigir autoridad en el tenant destino | Para membresías y para roles/listados de otro tenant, exigir que el actor sea superadmin (hogar o membresía activa) en el tenant destino; no permitir otorgar `isSuperadmin` hacia otro tenant desde la API | Sin cambio de schema ni de JWT. No cubre las escrituras GENERAL (siguen abiertas) | Integración en dos tenants: actor de A sobre B debe dar 403 |
| C. Mantener y vigilar | Documentar la autoridad actual y alertar sobre `MEMBRESIA_OTORGADA` con superadmin y sobre ediciones GENERAL | Ninguna | Prueba de que los eventos se auditan |

**SEC-09, hechos y propuesta.** `serializarEmpleado` devuelve todas las columnas más el histórico (`empleados.controller.ts:11-25`); la ruta exige solo `empleados.ver` (`gestion-humana.routes.ts:75`). `empleados.editar_salario` solo protege el `PATCH` de salario. Qué roles de producción tienen `empleados.ver` es NO VERIFICADO (los roles son datos por tenant). El único patrón cercano de autorización por dato sensible es de ruta, no de campo: `verDetalles`/`verDocumentos` con `requireAllPermissions` (`gestion-humana.routes.ts:135-153`).

| Opción | Qué implica |
|---|---|
| 1. Permiso nuevo de lectura de salario | Nuevo código en `PERMISOS_SISTEMA` (backend y frontend) y en `catalogo-permisos.ts`, más una migración de datos que lo otorgue a los roles que hoy tienen `empleados.editar_salario`. El listado devuelve `salarioActual`/histórico solo con ese permiso y la tabla oculta la columna sin él. Requiere aprobación de un permiso nuevo. |
| 2. Reutilizar `empleados.editar_salario` como condición de lectura | Sin permiso nuevo; quien no lo tenga no ve el salario. Mezcla leer y modificar, y el rol de solo lectura de RR.HH. que hoy ve salarios los perdería. |
| 3. Mantener | Decisión explícita de que `empleados.ver` incluye salario. |

No se aplicó ninguna.

**SEC-07, avisos exactos de `npm audit` (producción, 2026-10-20).** «Solución disponible» es el campo `fixAvailable`.

| Paquete (instalado) | Aviso | Sev. | Rango afectado | Corregido en | `fixAvailable` | Cadena |
|---|---|---|---|---|---|---|
| `proxy-addr` 2.0.7 | GHSA-jqcg-44mw-7w3h | crítica | `>=1.1.0 <2.0.8` | 2.0.8 | `true` | `express@4.22.3` |
| `ip-address` 10.5.0 | GHSA-rpw4-54j3-4h4q; GHSA-2vr4-cq9g-pvrc; GHSA-j6r3-76f7-8jcv; GHSA-h3mg-xc3c-68pw | moderada | `<=10.5.0`; `>=10.2.0 <=10.5.0`; `<=10.7.0`; `<=10.7.0` | no consultado | `true` | `express-rate-limit@8.6.2` |
| `mssql` 11.0.1 | vía `tedious` | moderada | `4.2.1 - 12.6.0` | `mssql@12.7.10` | `mssql@12.7.10` (cambio mayor) | directa |
| `tedious` 18.6.2 y 20.0.0 | vía `sprintf-js` | moderada | `2.4.0 - 20.3.5` | con `mssql@12.7.10` | `mssql@12.7.10` (mayor) | `mssql`; `@types/mssql` |
| `sprintf-js` 1.1.3 | GHSA-hp3w-g68c-fv3c (DoS) | moderada | `<=1.1.3` | con `mssql@12.7.10` | `mssql@12.7.10` (mayor) | `tedious` |
| `@tanstack/react-start` 1.168.42 | GHSA-qx66-fv34-fjm8 | crítica | `>=1.143.12 <1.168.60` | 1.168.60 | `true` | directa |
| `@tanstack/start-server-core` 1.169.25 | GHSA-qx66-fv34-fjm8 | crítica | `>=1.143.12 <1.169.39` | 1.169.39 | `true` | `react-start` |
| `@tanstack/react-start-rsc` 0.1.41, `react-start-server` 1.167.30, `start-plugin-core` 1.171.33 | por dependencia de `start-server-core` | crítica | `<=0.1.58`; `1.143.12 - 1.167.45`; `1.142.10 \|\| 1.143.12 - 1.171.48` | con `react-start` | `true` | `react-start` |
| `seroval` 1.6.2 | GHSA-jp82-f5mq-hwhp | alta | `<=1.6.2` | no consultado | `true` | `router-core`, `start-*` |
| `source-map-js` 1.2.1 | GHSA-68fv-2mgg-jv7q | alta | `>=1.0.0 <1.2.2` | 1.2.2 | `true` | `@tailwindcss/node` |
| `dompurify` 3.4.15 | GHSA-p98j-92pf-mc4p; GHSA-6688-9rhm-gjv2 | baja | `>=3.4.13 <=3.4.15`; `<=3.4.15` | no consultado | `true` | `jspdf@4.2.1` |
| `vite` 8.2.1 | GHSA-698v-4r3x-3vcv (vía `launch-editor`, Windows) | moderada | `>=8.2.0 <=8.2.3` | 8.2.4 | `true` | directa |

Exposición:
- `proxy-addr`: el aviso aplica a subredes de confianza IPv4-mapeadas. 🔎 La app solo configura `trust proxy` = `1` (`app.ts:80`), un número de saltos y no una subred. No se encontró exposición con esta configuración. La corrección es un cambio de parche transitivo.
- `@tanstack/*`: el aviso se refiere al transporte de *server functions* (`/_serverFn/*`). 🔎 `src/` no define `createServerFn`, pero el bundle del servidor (`.output/server/_ssr/server-*.mjs`, build del 2026-10-06) contiene la cadena `_serverFn/`, y `src/start.ts` registra middleware global y CSRF para `serverFn`. Que no haya funciones propias no es prueba de que el transporte sea inalcanzable: la exposición **no se descarta**. No se probó dinámicamente. Mitigación temporal del propio aviso: regla en el borde sobre `/_serverFn/*` y CSP. Dónde se despliega: NO VERIFICADO.
- `vite`: solo servidor de desarrollo.
- `dompurify`: dependencia de `jspdf`; el código de la app no lo usa directamente.
- `mssql`/`tedious`/`sprintf-js`: DoS por especificadores de precisión; el uso de `sprintf-js` dentro de `tedious` no se revisó.

Plan propuesto, sin ejecutar (requiere autorización): 1) `@tanstack/react-start` a 1.168.60 o superior con `start-server-core` 1.169.39 o superior, revisando el árbol resultante y el build; 2) actualización de parche de `proxy-addr` a 2.0.8, `source-map-js` y `vite` a 8.2.4; 3) `mssql` 12.x es un cambio mayor: requiere revisar la API de conexión de Siesa (`config/siesa.ts`) y probar con VPN. Los dos lockfiles (`bun.lock` y `package-lock.json`) deben decidirse antes (CI usa `npm ci`). No se modificó ningún `package.json` ni lockfile.

**Los ocho fallos de integración en `saas_dev_qa`: diagnóstico.** `migrate status` con el login `migrador` confirmó 73 migraciones y «schema up to date». Consultas de solo lectura con el guard (destino `saas_dev_qa` en el host aprobado, login `runner`) mostraron que la base tiene 3 tenants, todos sintéticos `test-fact-siesa-*`, y 0 usuarios.

| Archivos (fallos) | Causa demostrada |
|---|---|
| `pagos.hardening` (6) y `facturas.tenant-prisma` (2) | Responden 400 «El método de pago no es válido» (`pagos.controller.ts:218-220`). En QA las filas GENERAL `TRANSFERENCIA` y `CHEQUE` están inactivas; las pruebas envían «Transferencia», que solo valida como alias de `TRANSFERENCIA` activa. Ver FUN-01 para el origen. |
| `facturas-siesa` y `pedidos-compromiso` | `Tenant_siesaCiaId_key`: los tenants `test-fact-siesa-a/b-90c6cbcc` (creados el 2026-10-09 17:37) ocupan `siesaCiaId` 900980 y 900981, los mismos valores que usan ambas suites. En `facturas-siesa` el fallo ocurre al crear el tenant A; el `afterAll` posterior falla por ids indefinidos. |
| `inventario-comprometidos` | La prueba exige un tenant con `siesaCiaId=1` y la base no tiene ninguno (`inventario-comprometidos.integration.test.ts:53`). |
| `auth-register` | La prueba exige el tenant con `dominioCorporativo = ricol.com.co` y la base no tiene tenants reales (`auth-register.integration.test.ts:40`). |

Ninguno de los ocho tocó archivos modificados en esta auditoría, y todos tienen una causa demostrada de datos de la base QA; no se hizo una línea base sin los cambios, así que no se afirma que fueran preexistentes en el sentido de ejecuciones anteriores.

**Residuo en QA.** La corrida del 2026-10-20 no dejó tenants `test-compromiso-*` (el fallo ocurrió al crear el primero). Sí existen 3 tenants `test-fact-siesa-*` de la corrida del 2026-10-09, con 3 filas de `Auditoria` (2 y 1) y sin usuarios, roles, departamentos ni facturas. Impacto: bloquean `facturas-siesa` y `pedidos-compromiso` por los `siesaCiaId`. No se limpió: borrarlos exige tocar `Auditoria` y es una operación destructiva sobre la base compartida de pruebas.

**FUN-01 (funcional, no de seguridad). El sincronizador de catálogos puede desactivar el valor canónico.** `sincronizarCatalogosGenerales` desactiva `clave: "Transferencia"` y `"Cheque"` tras crear `TRANSFERENCIA` y `CHEQUE` (`catalogos-generales.ts:384-389,456-460`). Las dos claves difieren solo por mayúsculas y la base tiene la colación `Modern_Spanish_CI_AS` (insensible a mayúsculas), así que el `updateMany` también alcanza la fila canónica. Evidencia convergente: las dos filas canónicas fueron creadas el 2026-10-09 20:22:24 y modificadas a inactivas 3 s después, en la misma corrida; no existe ninguna fila `Transferencia` o `Cheque`; y la consulta `clave IN ('Transferencia','Cheque')` devuelve esas 2 filas. La prueba unitaria usa filas en memoria sensibles a mayúsculas y por eso no lo detecta. No se reprodujo ejecutando la sincronización. Impacto potencial: con esa colación, validar un pago con `Transferencia` o `Cheque` da 400 hasta reactivar los valores. Si ocurrió en producción: NO VERIFICADO (no se consultó). Requiere diagnóstico y corrección propios, fuera de esta auditoría.

**R-C-01, R-C-04 y D-C-02, reverificados.** R-C-04: `toma-fisica.controller.ts` no usa `tenantPrisma` (0 usos; el router sí lo monta) y `creditos.controller.ts` lo usa solo en la línea 617. R-C-01: los tres módulos asignan `responsableId = req.user.id` al crear (`plan-produccion.controller.ts:39`, `gestion-liquidacion.controller.ts:44`, `despachos.controller.ts:173`) y ninguna transición compara el actor con ese campo; las rutas de crear y avanzar exigen el mismo `.gestionar`. D-C-02 sigue siendo una decisión de negocio sin regla en el repositorio. Para decidirla hace falta, por módulo: quién puede crear, quién puede aprobar o avanzar cada transición, si puede ser la misma persona y si existen excepciones (por ejemplo, personal único en una planta). No se implementó nada.

**Inconsistencia RBAC (`MEMORY.md` ~l. 602 vs. migración `20260924200000`).** Sigue confirmada; `MEMORY.md` no se modificó.

---

## 4. Resumen

- **23 entradas** entre auditorías, validaciones y documentos de apoyo (27 de agosto a 20 de octubre de 2026).
- Los P0/P1 técnicos de las rondas del 2 de septiembre y del 23–25 de septiembre están cerrados y validados, salvo los puntos 🔴 de la sección 3.1.
- Lo que sigue abierto es sobre todo **decisión de negocio** (Importaciones, D-C-01…D-C-05, R-C-01) y tres temas técnicos: headers/CSP del frontend, JWT en `localStorage`, y la medición de rendimiento de Siesa.
- Antes de afirmar un estado actual hay que ejecutar la suite real: los conteos de tests de los informes son históricos.

## 5. Mantenimiento

Al terminar una auditoría, añadir una fila a la tabla de la sección 1 y actualizar el estado en la sección 3. Si la auditoría fija una decisión permanente, registrarla además en `MEMORY.md`. Este archivo es un índice y no debe copiar el contenido de los informes.
