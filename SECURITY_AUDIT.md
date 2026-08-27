# SECURITY_AUDIT.md — RicoSoft Enterprise

Revisión de solo lectura. Ningún hallazgo fue corregido. Clasificación: **CRÍTICO / ALTO / MEDIO / BAJO**, basada en (1) probabilidad de explotación real dado el código actual, y (2) impacto si ocurriera.

---

## CRÍTICO

### C1 — Aislamiento multi-tenant sin garantía estructural (riesgo latente, no una vulnerabilidad activa hoy)
- **Dónde**: arquitectónico, aplica a los 19 módulos backend.
- **Qué**: el filtro `tenantId` en cada query Prisma es una convención de código, no un mecanismo forzado por el framework o la base de datos (sin middleware Prisma `$use`/`$extends`, sin Row-Level Security en SQL Server).
- **Estado actual**: se auditó módulo por módulo (ver `ARCHITECTURE_AUDIT.md` y `DATABASE_ARCHITECTURE.md`) y **hoy el código es 100% consistente** — cero queries encontradas sin el filtro correspondiente.
- **Por qué es CRÍTICO igual**: es una vulnerabilidad de un solo `git commit` de distancia. La próxima persona (o IA) que agregue un endpoint — por ejemplo, los que faltan para `ExpedienteAduanero`/`VistoBuenoAduanero` de Importaciones — puede omitir el filtro por error, y **no hay ningún test automatizado que lo detecte** (ver A1). Un IDOR cross-tenant en un ERP financiero (facturas, pagos, nómina) es de los incidentes más costosos posibles.
- **Recomendación** (sin implementar): evaluar un middleware Prisma (`prisma.$extends` con una query extension) que inyecte automáticamente `tenantId` en operaciones sobre modelos marcados como tenant-scoped, o al mínimo un test de integración por módulo que falle si una query cross-tenant no devuelve 404/vacío.

---

## ALTO

### A1 — Cero cobertura de test para lo que más importa
- **Dónde**: todo `server/src/modules/*` (facturas, solicitudes/compras, importaciones, auth) y multi-tenancy en general.
- **Qué**: los 7 archivos de test existentes cubren únicamente funciones puras de validación (formato de contraseña, formato de dominio de correo, drift entre catálogos de permisos). **Ningún test** ejercita un endpoint real con un JWT válido, ni verifica que un usuario del Tenant A reciba 404/vacío al intentar acceder a un recurso del Tenant B, ni verifica que `requirePermission`/`requireSuperadmin` efectivamente bloqueen a quien no tiene el permiso.
- **Impacto**: cualquier regresión en autorización o en aislamiento de datos puede llegar a producción sin que CI la detecte — el pipeline (`ci.yml`) pasa igual porque no hay nada que falle.
- **Recomendación**: al menos un test de integración por módulo crítico (facturas, solicitudes, importaciones) con dos tenants y dos usuarios de permisos distintos, usando `supertest` contra la app real (ya está montada para eso en `app.test.ts`, solo falta usarla con JWTs reales).

---

## MEDIO

### M1 — Migración de base de datos sin commitear
- **Dónde**: `server/prisma/migrations/20260826215604_tenant_dominio_activo/` (git status: `??`, no trackeada).
- **Qué**: `schema.prisma` (que sí está commiteado y aparece como `M` modificado) ya declara `Tenant.dominioCorporativo` y `Tenant.activo`, campos que esta migración es la que los crea. Si otra persona clona `master` y corre `prisma migrate deploy`, su base de datos no tendrá estas columnas aunque su `schema.prisma` las espere — fallo inmediato o comportamiento indefinido según el punto de entrada.
- **Recomendación**: commitear la carpeta de migración (o revertir junto con los cambios de schema si fue un experimento) antes de cualquier merge a `master`.

### M2 — Sin plantilla de variables de entorno
- **Dónde**: falta `server/.env.example`.
- **Qué**: no hay forma de saber, sin leer el código fuente completo, qué variables necesita el backend (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `SIESA_DB_*`). Riesgo operativo/onboarding, no una vulnerabilidad explotable directamente.

### M3 — `server/.env.local` con variables muertas
- **Dónde**: `server/.env.local` define `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_ENCRYPT` — ninguna referenciada en `server/src`. No es explotable (el proceso ni siquiera carga ese archivo por defecto, solo `.env`), pero es confuso y candidato a que alguien asuma que es la fuente de verdad activa.

---

## BAJO

### B1 — `scripts/explore-siesa.ts` construye SQL por interpolación de string
- **Dónde**: `server/scripts/explore-siesa.ts` (`SELECT TOP 5 * FROM ${tableFilter}`).
- **Qué**: no parametrizado, a diferencia de `siesa-sync.service.ts` que sí usa `.input()`. **No es explotable hoy**: es un script CLI que solo corre un operador humano con acceso a shell + `.env`, nunca reachable desde HTTP. Riesgo si algún día se expone como endpoint sin revisar este patrón primero.

### B2 — Sin `migration_lock.toml`
- **Dónde**: `server/prisma/migrations/` — ninguna de las 10 carpetas de migración (trackeadas o no) tiene el lock file que Prisma normalmente mantiene junto a ellas.
- **Qué**: pierde la protección de "drift de proveedor" (alguien cambiando el datasource provider sin darse cuenta). Bajo impacto dado que el proyecto usa un único proveedor (`sqlserver`) de forma consistente.

### B3 — Package manager ambiguo en la raíz del frontend
- **Dónde**: `bun.lock` + `package-lock.json` coexisten; CI usa `npm ci`.
- **Qué**: riesgo de árbol de dependencias divergente entre un desarrollador que use `bun install` localmente y lo que realmente se construye en CI/producción. No es una vulnerabilidad de seguridad per se, pero puede enmascarar una dependencia vulnerable que un lockfile fija y el otro no.

---

## Verificado y CORRECTO (para que no se re-audite innecesariamente)

- **Sin IDOR cross-tenant encontrado** en ningún endpoint de los 19 módulos revisados (auditoría exhaustiva, ver `ARCHITECTURE_AUDIT.md`).
- **Sin inyección SQL**: cero uso de `$queryRawUnsafe`/`$executeRawUnsafe` en `server/src`; la única query cruda (Siesa sync) está parametrizada correctamente vía `.input()`.
- **Path traversal en subida de archivos**: bloqueado — el `:id` de la URL se valida contra un regex UUID estricto antes de tocar el filesystem, tanto en middleware como dentro del callback `destination` de multer.
- **Archivos nunca servidos de forma estática**: todo acceso a un archivo adjunto pasa por un controlador autenticado que verifica `tenantId` sobre el registro dueño antes de leer del disco; la ruta en disco se construye desde lo guardado en BD, nunca desde input del cliente.
- **Contraseñas**: hasheadas con bcrypt (costo 10), política mínima (8+ caracteres, mayúscula, minúscula, dígito) centralizada en un único validador reusado en registro/cambio propio/reset admin/creación.
- **JWT**: expira a las 8h, `tokenVersion` permite invalidación inmediata al cambiar contraseña (sin esperar expiración), sin fallback hardcodeado de secreto — el proceso rehúsa arrancar si `JWT_SECRET` no está definido.
- **Rate limiting anti fuerza bruta**: confirmado en código (`server/src/modules/auth/auth.routes.ts`) — 10 intentos/15min por IP en `/register`, `/login`, `/select-tenant`, no cuenta intentos exitosos. En producción, `app.set("trust proxy", 1)` está condicionado correctamente para que esto funcione detrás de un balanceador sin permitir spoofing de IP vía `X-Forwarded-For` en desarrollo.
- **CORS**: en producción, lanza error de arranque si `CORS_ORIGIN` no está configurado explícitamente — nunca permite "cualquier origen" en producción por accidente.
- **Escalación de privilegios cross-tenant vía Membresías (hueco históricamente identificado)**: **RESUELTO**, verificado en código actual — `crearMembresia`/`actualizarMembresia`/`eliminarMembresia` exigen `usuario.tenantId === req.user.tenantId` (el objetivo de la membresía debe ser nativo del tenant del superadmin que llama), con un comentario explícito en el código documentando que esto cierra el hueco de auto-escalación cross-tenant. No hay evidencia de que este chequeo pueda evadirse.
- **Autoregistro**: el tenant del nuevo usuario se resuelve estrictamente contra `Tenant.dominioCorporativo` en base de datos (nunca "el primer tenant que exista" ni un default); `rol`/`isSuperadmin`/`rolId` nunca se toman del body de la petición de registro.
- **Semilla de datos (`seed.ts`)**: contraseña de superadmin generada aleatoriamente por ejecución (`crypto.randomBytes`), nunca hardcodeada; solo crea un superadmin si el tenant no tiene ninguno activo.

---

## Nota sobre enumeración de usuarios en login

`loginUserService` responde exactamente el mismo mensaje ("Credenciales inválidas...") tanto si el correo no existe como si la contraseña es incorrecta — no hay enumeración por mensaje de error. Auditoría (`Auditoria`) solo registra el intento fallido cuando el usuario existe (la tabla exige `usuarioId`/`tenantId` no nulos), así que un intento contra un correo inexistente no queda registrado en absoluto — limitación de trazabilidad documentada en el propio código, no una vulnerabilidad explotable (el rate limiter por IP sigue aplicando independientemente de si el correo existe).
