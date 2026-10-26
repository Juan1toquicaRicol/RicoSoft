# Verificación preliberación — RicoSoft Enterprise

**Fecha:** 2026-10-23  
**Commit inspeccionado:** `17a48ae` (`main`).  
**Resultado:** **NO LIBERAR AÚN** — la integración SQL Server no pudo completarse y hay una alerta de secreto en la plantilla de QA.

## Resultados comprobados

| Comprobación | Resultado | Alcance / observación |
|---|---:|---|
| Frontend lint | ✅ 0 errores | 17 warnings: mayormente Fast Refresh y un warning de dependencia de Hook; no bloquean el comando. |
| Frontend typecheck | ✅ | `npm run typecheck`. |
| Frontend unit tests | ✅ 116/116 | Requirió fijar `TEMP`/`TMP` a un directorio dentro del workspace porque el temporal aislado de Windows denegaba el rename SSR con `EPERM`. |
| Frontend build | ✅ | Vite/Nitro build completo. Emitió advertencia de `vite-tsconfig-paths`; no falló. |
| Backend typecheck | ✅ | `npm run typecheck`. |
| Backend build | ✅ | `tsc`. |
| Backend unit tests | ✅ 1012; 45 omitidos | 104 archivos pasan y 2 aparecen omitidos. La primera corrida aislada falló por sockets loopback bloqueados; repetida fuera del sandbox con placeholders de CI pasó. |
| `prisma validate` | ✅ | Schema válido. |
| `prisma generate` | ✅ | Prisma Client v5.22.0 generado. |
| Suite de integración SQL Server | ❌ No verificada | El runner QA validó el destino configurado, pero la ejecución no completó pruebas útiles: varias suites aparecieron enteramente omitidas y la corrida se detuvo durante la preparación. La prueba TCP de solo lectura confirmó que `192.168.0.234:1433` no es alcanzable desde este equipo. |
| Gate anti-omisión de integración | ⏸️ No ejecutado | Docker no está disponible localmente; no se pudo recrear el SQL Server efímero de CI. El intento QA no generó un resultado completo que permita aprobar el gate. |
| `git diff --check` | ✅ | Sin errores de whitespace; Git muestra avisos de normalización CRLF/LF en cuatro archivos. |

Los fallos iniciales `EPERM` de Vitest no fueron fallos de aserción: estaban relacionados con el directorio temporal sandbox de Windows. Al usar un temporal bajo el workspace se resolvieron en frontend; para los tests HTTP del backend también fue necesario permitir loopback fuera del sandbox.

## Correcciones realizadas durante la verificación

- Se ajustó `.prettierrc` con `endOfLine: auto` para admitir los finales de línea del checkout Windows (`core.autocrlf=true`).
- Se amplió la exclusión de ESLint a `dist`, `.output` y `.vinxi` anidados; antes la exclusión `dist` no evitaba analizar `server/dist`.
- Se aplicó Prettier a los archivos reportados por ESLint y se corrigieron las directivas `import/first` que referenciaban una regla de plugin no instalado.
- Se documentó como intencional la regex de saneamiento que rechaza caracteres de control en nombres de archivos cargados.
- El lint pasó después con 0 errores. Los warnings restantes no se modificaron porque no bloquean CI ni se relacionan con una falla demostrada.

La pasada automática de formato afectó 95 archivos. No se pretendió cambiar reglas de negocio; antes del commit, revisar el diff completo y mantener separado el formato de cualquier cambio funcional.

## Bloqueos de release

### P1 — Integración contra SQL Server pendiente

La suite de integración real es obligatoria para validar migraciones, aislamiento multi-tenant, restricciones únicas, transacciones y concurrencia. Esta auditoría **no demuestra** que ese gate pase. Se necesita restablecer conectividad al SQL Server QA aprobado o ejecutar el workflow contra su SQL Server efímero en GitHub Actions, obtener 0 fallos y 0 omitidos, y revisar el `integration-report.json`/gate.

No apuntar las pruebas a `saas_dev`, a producción ni a Siesa. El wrapper `npm run test:integration:qa` protege el destino, pero no sustituye una conexión disponible ni convierte una suite omitida en verde.

### P1 — Credenciales expuestas históricamente en plantilla versionada

`server/.env.integration.qa.example` estaba versionado con valores literales de contraseña y JWT. En este working tree los reemplacé por placeholders no utilizables. Como el contenido anterior estuvo en el repositorio, tratar las credenciales como expuestas hasta verificar si eran valores de prueba: el responsable debe confirmar y rotar cualquier credencial que haya sido real. No guardar secretos reales en Git ni en este informe.

### P1 — Migración, backup y aceptación en PC-RC-SV

Las pruebas de este informe no inspeccionaron ni migraron la base del servidor futuro, no verificaron backup/restore, HTTPS/proxy ni el navegador desde un segundo equipo. Antes de liberar, seguir el runbook de [DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md](DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md) y aplicar migraciones primero en una copia QA representativa.

## Revalidación independiente (segunda pasada, 2026-10-23)

Ejecutada por el desarrollador líder sin modificar código: solo se editó este informe. Directorio raíz del repo: `RicoSoft/RicoSoft` (rama `main`, HEAD `17a48ae`, 96 archivos modificados sin commit + 4 reportes sin seguimiento; ninguno revertido).

| Comando (cwd) | Exit | Resultado |
|---|---:|---|
| `npm run lint` (raíz) | 0 | 0 errores, 17 warnings |
| `npm run typecheck` (raíz) | 0 | OK |
| `npm test` (raíz) | 0 | 16 archivos, **116 pasaron / 0 fallaron / 0 omitidos** (sin necesidad de fijar TEMP) |
| `npm run build` (raíz) | 0 | OK (warning `inlineDynamicImports`, no bloqueante) |
| `npm run typecheck` (server) | 0 | OK |
| `npm run build` (server) | 0 | OK |
| `npm test` (server) | 0 | 104 archivos pasaron + 2 omitidos; **1012 pasaron / 0 fallaron / 45 omitidos** |
| `npx prisma validate` / `generate` (server) | 0 / 0 | Schema válido; Client 5.22.0 |
| `git diff --check` | 0 | Sin errores; avisos CRLF→LF en 4 archivos |
| `Test-NetConnection 192.168.0.234 -Port 1433` | — | `TcpTestSucceeded=False`, ping falso. Un solo intento de lectura; no se reintentó ni se ejecutó `test:integration:qa`, `deploy` ni `status`. |

Hallazgos de esta pasada:

- **Diff de formato:** comparando HEAD contra el árbol de trabajo sin espacios, comas, paréntesis ni comillas, solo difieren en contenido: `.prettierrc` (`endOfLine: auto`), `eslint.config.js` (ignores `**/dist/**` etc.), el ejemplo QA, y comentarios/directivas ESLint en `empleado-detalles.controller.ts`, `siesa-pedidos.service.test.ts` y `proformas-cotizacion.integration.test.ts`. El resto es solo reformateo; no se detectaron cambios de lógica.
- **Ejemplo QA:** contiene únicamente `REPLACE_WITH_QA_SECRET` y `REPLACE_WITH_RANDOM_QA_SECRET`. El archivo real `server/.env.integration.qa` existe en local, está ignorado por git y no fue leído. La credencial anterior sigue en el historial de git (commit `c66740d`) y no aparece en ningún otro archivo versionado.
- **Guardrail de destino:** `integration-db-guard.ts` es una lista de permitidos: rechaza `saas_dev` y `UnoEE_Ricol_Real`, y solo acepta `saas_dev_qa` en `192.168.0.234:1433` sin instancia (logins `saas_dev_qa_migrador`/`saas_dev_qa_runner`, nunca `sa`) o la base efímera de CI en localhost. `qa-runner.ts` ignora el `DATABASE_URL` del entorno y el `globalSetup` de integración lo valida antes de correr. Sus tests unitarios pasan.
- **Gate anti-omisión:** falla con 0 tests, fallos u omitidos, y compara pasados contra total. Es correcto, pero depende de `RUN_DB_INTEGRATION_TESTS=true`; sin esa variable las suites quedan omitidas y `vitest` sale en verde. Por eso no se debe leer `npm test` como evidencia de integración.
- **P2 — 45 tests omitidos nunca se ejecutan:** provienen de bloques `describe.skipIf(!RUN)` («DB real») en tres archivos que NO se llaman `*.integration.test.ts`: `server/src/lib/servicios-renovacion.service.test.ts`, `notificaciones.test.ts` y `motor-destinatarios.test.ts`. `vitest.config.mts` excluye los `*.integration.test.ts` y `vitest.integration.config.mts` solo incluye `*.integration.test.ts`, así que ni `npm test` ni el job `backend-integration` ni el gate los ejecutan. Es una brecha de cobertura (renovaciones de servicios, deduplicación de notificaciones, destinatarios). **Resuelto en el árbol de trabajo (sin commit):** `notificaciones.test.ts` (14) y `servicios-renovacion.service.test.ts` (11) se renombraron a `*.integration.test.ts`; `motor-destinatarios.test.ts` se dividió: sus 10 pruebas puras se quedan en la suite unitaria y las 20 de DB real pasaron a `motor-destinatarios.integration.test.ts`. Total 45 = 14 + 11 + 20, sin cambios en los cuerpos de las pruebas ni en el gate. Ahora `npm test` da 1012 pasados / 0 omitidos, y la suite de integración descubre los 45 (sin base, el reporte da 45 omitidos y el gate sale con código 1). **Su ejecución real contra SQL Server sigue sin verificarse** (QA inaccesible); hasta entonces no se puede afirmar que pasen.

## Decisión

Los checks locales de código (lint, typecheck, unitarias, build y Prisma) quedan verdes. **No concedo aprobación de despliegue productivo todavía** hasta cerrar: (1) integración SQL Server con 0 omitidos, (2) confirmar/rotar credenciales previamente versionadas y (3) migración y restauración verificadas en el entorno objetivo.

No se hizo commit, push, migración ni cambio a bases de datos. La corrida QA fue interrumpida al detectar que no era una prueba válida; no se afirma que la base no haya sufrido ninguna escritura parcial, por lo que el administrador de QA debe revisar residuos de fixtures antes de una nueva corrida si la conectividad se restablece.
