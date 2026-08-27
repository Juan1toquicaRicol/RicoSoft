# IMPORTACIONES_IMPLEMENTATION_REPORT.md

Reporte de cierre de la implementación descrita en `IMPORTACIONES_IMPLEMENTATION_PLAN.md`. Cubre únicamente el trabajo de esta tarea (documentos aduaneros + vistos buenos + trazabilidad + guards + suite de integración multi-tenant + job de CI). No se tocó nada fuera de ese alcance.

---

## 1. Resumen

Se completó el vacío end-to-end identificado en `IMPORTACIONES_IMPACT_ANALYSIS.md`: gestión de expediente aduanero (DIM, factura comercial, certificado de origen) y vistos buenos (INVIMA/ICA/etc.), backend + frontend, reutilizando en su totalidad la infraestructura existente (fábrica de upload, patrón de transacción+historial de `facturas.controller.ts`, componentes UI ya establecidos). Se agregó la sección de Trazabilidad y Auditoría que ya se traía del backend pero nunca se mostraba, guards de permiso en las rutas de Importaciones, y refresco casi-en-tiempo-real del detalle. Se escribió una suite de integración con base de datos real que demuestra específicamente que el aislamiento multi-tenant de `VistoBuenoAduanero` (el único modelo del módulo sin `tenantId` propio) bloquea el acceso cruzado en cada verbo (GET/UPDATE/UPLOAD/DOWNLOAD), y se agregó un job de CI aislado con SQL Server efímero para ejecutarla en cada push/PR sin afectar los jobs existentes.

**No se implementó** (por instrucción explícita, quedan como decisiones pendientes): Inventario, Contabilidad, integración de salida hacia Siesa, anticipos, recepción parcial, incidencias, lógica de cierre de orden, proveedor extranjero como entidad, TRM automática, ni distribución de landed cost por peso/volumen.

---

## 2. Archivos modificados/creados

### Backend
| Archivo | Cambio |
|---|---|
| `server/src/middleware/upload.middleware.ts` | Modificado — 2 fábricas nuevas (`expedientes-aduaneros`, `vistos-buenos-aduaneros`), reutilizando `crearUploadArchivo` existente. |
| `server/src/modules/importaciones/importaciones.schemas.ts` | Modificado — 3 schemas zod nuevos. |
| `server/src/modules/importaciones/importaciones.controller.ts` | Modificado — 8 handlers nuevos, aditivos (ninguna función existente se tocó). |
| `server/src/modules/importaciones/importaciones.routes.ts` | Modificado — 8 rutas nuevas montadas. |
| `server/src/modules/importaciones/importaciones.integration.test.ts` | **Nuevo** — suite de integración con base de datos real (17 assertions en 9 tests). |
| `server/vitest.config.mts` | Modificado — excluye `*.integration.test.ts` del `npm test` por defecto. |
| `server/vitest.integration.config.mts` | **Nuevo** — config aislada para la suite de integración. |
| `server/scripts/ci-preparar-db-integracion.ts` | **Nuevo** — crea la base de datos efímera antes de `prisma migrate deploy` en CI. |
| `server/package.json` | Modificado — scripts `test:integration` y `ci:preparar-db-integracion`. |
| `.github/workflows/ci.yml` | Modificado — job nuevo `backend-integration`, aditivo, no toca `frontend`/`backend`. |

### Frontend
| Archivo | Cambio |
|---|---|
| `src/hooks/use-importaciones.ts` | Modificado — 8 mutadores nuevos + tipos + `usePollingOrdenCompraIntl`. |
| `src/routes/importaciones.$id.tsx` | Modificado — guard de ruta, 3 componentes nuevos (`DocumentoExpedienteSlot`, `ExpedienteAduaneroPanel`, `VistosBuenosPanel`), sección de Trazabilidad y Auditoría, polling. |
| `src/routes/importaciones.tsx` | Modificado — guard de ruta (`requirePermisoGuard`). |

### Documentación (fase de auditoría/planificación, ya entregada antes de este reporte)
`ARCHITECTURE_AUDIT.md`, `DATABASE_ARCHITECTURE.md`, `MODULE_DEPENDENCIES.md`, `SECURITY_AUDIT.md`, `IMPORTACIONES_IMPACT_ANALYSIS.md`, `ARCHITECTURAL_DECISIONS_PENDING.md`, `IMPORTACIONES_IMPLEMENTATION_PLAN.md`.

---

## 3. Endpoints implementados

| Método | Ruta | Permiso |
|---|---|---|
| PUT | `/api/importaciones/lotes/:id/expediente` | `IMPORTACIONES_GESTIONAR_TRANSITO` |
| GET | `/api/importaciones/lotes/:id/expediente/documentos/:tipo` | `IMPORTACIONES_VER` |
| POST | `/api/importaciones/lotes/:id/expediente/documentos/:tipo` | `IMPORTACIONES_GESTIONAR_TRANSITO` |
| DELETE | `/api/importaciones/lotes/:id/expediente/documentos/:tipo` | `IMPORTACIONES_GESTIONAR_TRANSITO` |
| POST | `/api/importaciones/lotes/:id/expediente/vistos-buenos` | `IMPORTACIONES_GESTIONAR_TRANSITO` |
| PATCH | `/api/importaciones/vistos-buenos/:id` | `IMPORTACIONES_GESTIONAR_TRANSITO` |
| GET | `/api/importaciones/vistos-buenos/:id/documento` | `IMPORTACIONES_VER` |
| POST | `/api/importaciones/vistos-buenos/:id/documento` | `IMPORTACIONES_GESTIONAR_TRANSITO` |

`:tipo` ∈ `{dim, factura-comercial, certificado-origen}`.

---

## 4. Permisos utilizados

**Ninguno nuevo.** Se reutilizó `PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO` (su descripción en el catálogo ya cubría explícitamente "...y su documentación DIAN (DIM, vistos buenos)") e `IMPORTACIONES_VER` para lectura de documentos. `permisos-sync.test.ts` no requirió cambios y sigue pasando.

---

## 5. Estrategia de aislamiento multi-tenant

- Endpoints sobre `LoteImportacion`/`ExpedienteAduanero` (que sí tienen `tenantId` propio): `findFirst({ id, tenantId })` antes de cualquier lectura/escritura — mismo patrón que el resto del sistema.
- Endpoints sobre `VistoBuenoAduanero` (sin `tenantId` propio): `findFirst({ id, expediente: { tenantId } })` — relación anidada de Prisma, patrón **nuevo** en este codebase, documentado explícitamente en el plan como el punto de mayor riesgo y sujeto a prueba dedicada (ver §6).
- Ningún endpoint acepta `tenantId` del body/query del cliente para decidir autorización — siempre se deriva de `req.user.tenantId` (sesión autenticada).
- Archivos: nunca se sirven de forma estática; toda lectura pasa por el mismo chequeo de tenant antes de tocar el disco, y la ruta en disco se construye desde lo guardado en BD, nunca desde input del cliente (mismo patrón que Facturas).

---

## 6. Pruebas realizadas

### Suite unitaria existente (sin cambios de comportamiento)
`server`: 5 archivos, 20 tests — **PASS**.
`frontend` (raíz): 2 archivos, 9 tests — **PASS**.
Ninguno de los 29 tests preexistentes se modificó ni se rompió.

### Suite de integración nueva (`importaciones.integration.test.ts`, 9 tests)
Cobertura específica pedida:

**Expediente**: acceso autorizado (200) · sin permiso (403) · tenant incorrecto (404, y se verifica que el dato real de A no cambió) · documento: subida/descarga propia (200) + descarga cruzada (404) + subida cruzada (404) + eliminación cruzada (404) + eliminación propia (200) + descarga posterior (404).

**Vistos buenos**: crear (201) · actualizar estado (200) · sin permiso (403) · documento: subida, reemplazo (verifica que el nombre de archivo cambia), descarga propia (200).

**CRÍTICO — cadena completa Tenant B → VistoBueno de A → Expediente de A → Lote de A → Orden de A**: un test dedicado, con un ID real de `VistoBuenoAduanero` de Tenant A, confirma que Tenant B recibe **404 en los tres verbos** (`PATCH` actualizar, `POST` subir documento, `GET` descargar), que el estado/archivo real en base de datos **no cambió** tras los tres intentos, y que Tenant B tampoco puede llegar al mismo dato por el resto de la cadena (`GET` de la orden completa → 404).

**Trazabilidad**: un test final consulta `ImportacionHistorial` directamente en base de datos y confirma que cada mutación exitosa (actualizar expediente, adjuntar/eliminar DIM, registrar/actualizar visto bueno, adjuntar/reemplazar documento de visto bueno) dejó su entrada correspondiente — prueba la atomicidad transacción+historial, no solo el código de respuesta HTTP.

### Resultado de la ejecución de la suite de integración en esta sesión

**No se ejecutó contra una base de datos real en este entorno.** Investigué las opciones disponibles: no hay Docker en este sandbox (no se puede levantar un contenedor mssql efímero local); el `DATABASE_URL` configurado en `server/.env` apunta a `192.168.0.100`, un SQL Server en la red local que aparenta ser una base de desarrollo compartida (usada en pruebas manuales anteriores de esta sesión con tenants reales — Ricol, Flexipack, Green Solutions); y la única instancia SQL Server verdaderamente local de esta máquina (`SQLEXPRESS`) solo acepta conexiones vía canalizaciones con nombre/memoria compartida con autenticación de Windows — Prisma requiere TCP + autenticación SQL, y las cuentas SQL existentes (`sa`, `admin`) tienen contraseñas que no conozco. Crear un login nuevo o habilitar TCP/IP en esa instancia habría requerido modificar la configuración de SQL Server de esta máquina sin autorización explícita para eso específicamente, así que no lo hice.

En su lugar, verifiqué exhaustivamente todo lo que **sí** se puede verificar sin una base de datos real:
- La suite compila sin errores (`tsc --noEmit` limpio, incluido este archivo).
- `npm test` (config principal) sigue excluyéndola correctamente y sigue reportando 20/20 — confirmado que el aislamiento de configs funciona y no hay riesgo de que corra por accidente sin base de datos.
- `npm run test:integration` sin la variable `RUN_DB_INTEGRATION_TESTS=true` la reporta como **"1 skipped, 9 skipped"** — confirma que el archivo se carga y enumera sus 9 casos correctamente, y que la salvaguarda contra ejecución accidental funciona.

**La ejecución real (con aserciones pasando de verdad contra SQL Server) queda pendiente para la primera corrida del job `backend-integration` en GitHub Actions**, que es precisamente para lo que se diseñó — no se puede considerar la Fase 9 "demostrada con evidencia" hasta que ese job corra al menos una vez. Ver riesgos (§10).

### `lint`
Se ejecutó `npm run lint` en la raíz. Reporta ~9977 errores, **todos `prettier/prettier: Delete ␍`** (fin de línea CRLF vs. LF esperado) — un problema **preexistente del checkout en Windows, no introducido por este trabajo**: confirmado comparando contra el estado sin mis cambios (`git stash`), donde el conteo es mayor (15749), no menor. Ningún archivo que edité aparece señalado por una regla que no sea esta. No se intentó "arreglarlo" porque tocaría cientos de archivos ajenos al alcance de esta tarea — se deja documentado como hallazgo de entorno, no de este cambio.

### `typecheck`
`npx tsc --noEmit -p tsconfig.json` (raíz) — **PASS**, limpio.
`npx tsc --noEmit` (server) — **PASS**, limpio.

### `build`
`npm run build` (raíz, Vite/TanStack Start) — **PASS**, incluye el bundle `importaciones._id-*.mjs` actualizado con el nuevo código.
`npm run build` (server, `tsc`) — **PASS**.

---

## 7. Cambios de CI

Job nuevo `backend-integration` en `.github/workflows/ci.yml`, **aditivo**: no modifica, no reemplaza y no depende de los jobs `frontend`/`backend` existentes (siguen exactamente igual). Usa un contenedor de servicio `mcr.microsoft.com/mssql/server:2022-latest` efímero (destruido junto con el runner al terminar), crea una base de datos propia (`ricosoft_integration`) vía `server/scripts/ci-preparar-db-integracion.ts` (con reintentos, ya que el contenedor tarda en aceptar conexiones), aplica las migraciones reales con `prisma migrate deploy`, y corre `npm run test:integration` con `RUN_DB_INTEGRATION_TESTS=true`.

**No se pudo validar en un runner real** en esta sesión (requeriría hacer push, que no se hizo — no se pidió). Es el mismo tipo de limitación que ya estaba anticipada en el plan (§9 de `IMPORTACIONES_IMPLEMENTATION_PLAN.md`); queda como el primer punto a verificar cuando el equipo decida subir esta rama.

---

## 8. Migraciones realizadas

**NINGUNA.** Se confirma explícitamente: `server/prisma/schema.prisma` no se tocó en esta tarea; `ExpedienteAduanero`/`VistoBuenoAduanero` ya tenían todas las columnas necesarias desde antes.

---

## 9. Decisiones pendientes (sin resolver, documentadas)

Se mantienen todas las de `ARCHITECTURAL_DECISIONS_PENDING.md`. Las que tocan directamente lo construido aquí:

- **#1 (documentos)**: resuelta técnicamente (esta tarea). El "quién debe firmar/aprobar" un documento aduanero, más allá de adjuntarlo, sigue sin definir.
- **#10 (estados de visto bueno / eliminación)**: se implementó `Pendiente/Aprobado/Rechazado` como validación de forma en el controlador, **sin exponer DELETE** para `VistoBuenoAduanero` — decisión técnica tomada en el plan (no hay columna `eliminado`, y la política de si un visto bueno registrado puede borrarse o solo invalidarse no está definida). Sigue pendiente de decisión de negocio.
- **#13 (validar completitud del expediente antes de liquidar)**: sigue sin implementarse — `liquidarCosteoImportacion` no verifica el estado del expediente/vistos buenos. No se tocó, tal como se indicó explícitamente.

---

## 10. Riesgos restantes

| Riesgo | Estado |
|---|---|
| Aislamiento de `VistoBuenoAduanero` vía relación anidada — código escrito y revisado, pero **sin ejecución real verificada en esta sesión** (ver §6) | Mitigado por diseño + suite escrita y lista; **pendiente de una corrida real** en el job `backend-integration` antes de darlo por demostrado con evidencia, no solo por revisión de código. |
| Job de CI nuevo nunca ejecutado en un runner real | Mismo punto — la sintaxis y el flujo están completos y revisados, pero la primera corrida real puede exponer detalles de la imagen `mssql` (versión, tiempos de arranque) no visibles desde este entorno. |
| Riesgo estructural de aislamiento multi-tenant a nivel de todo el sistema (sin middleware Prisma/RLS) | Sin cambios — sigue siendo el hallazgo CRÍTICO de `SECURITY_AUDIT.md` (C1), no se abordó porque el plan lo dejó fuera de este alcance específico. |
| CRLF/lint preexistente | Sin cambios, documentado, no es responsabilidad de esta tarea. |

---

## Criterio de finalización

Conforme a lo pedido: **no se declara la tarea terminada con la confianza de "demostrado", sino con la de "implementado, revisado y con la prueba diseñada correctamente pero aún no ejecutada contra una base de datos real"**. El paso que falta — y que dejo explícito como el siguiente para el equipo — es hacer push de esta rama (o de una rama de prueba) y observar la primera ejecución del job `backend-integration` en GitHub Actions, que es el único entorno disponible ahora mismo donde correr esta suite de forma segura y aislada de cualquier dato real.
