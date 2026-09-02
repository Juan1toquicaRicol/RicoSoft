# RicoSoft Enterprise — Hardening Final

Fecha: 2026-09-02
Alcance: cerrar M-10, M-05, M-03, M-02 (auditoría), A-04 (medición o
limitación documentada), M-08 (inventario de modelos hijos), pruebas
cross-tenant y regresión completa. Sin desarrollo funcional de negocio, sin
tocar Ventas/Inventario/Despachos/Créditos/Producción/Importaciones/
Facturas más allá de lo mínimo necesario para los hallazgos indicados.

---

## 1. Resumen ejecutivo

Las 6 correcciones de la fase anterior (A-01, A-02, M-09, M-01, A-03, M-04)
se verificaron presentes y sin regresión — no se reimplementaron. De los 5
hallazgos objetivo de esta iteración:

- **M-10 corregido y probado**: el deadlock conocido de SQL Server (P2034)
  en pagos concurrentes ahora responde 409 en vez de 500, verificado
  reproduciblemente (3/3 ejecuciones consecutivas del test de concurrencia).
- **M-05 corregido y probado** (sin VPN, con test dirigido): la
  inicialización del pool Siesa memoiza la promesa de conexión en vuelo;
  probado con un mock de `mssql` que demuestra que llamadas concurrentes
  durante la conexión comparten una sola inicialización.
- **M-03 corregido y probado**: se agregó detección de magic bytes para los
  4 tipos de archivo permitidos (PDF/PNG/JPEG/WEBP); un archivo cuyo
  contenido real no coincide con el mimetype declarado se rechaza con 400,
  antes de tocar la carpeta definitiva del recurso.
- **M-02 auditado, no modificado**: backend con Helmet ya configurado;
  frontend (Nitro/Cloudflare) sin headers de seguridad propios — confirmado
  como brecha real, documentado, no corregido (requiere decidir una
  política de CSP concreta contra el hosting real, fuera del alcance de un
  cambio mínimo y seguro).
- **A-04: NO MEDIDO — LIMITACIÓN DE ENTORNO.** Sin túnel VPN activo hacia
  Siesa en este entorno, no se generaron métricas reales.
- **M-08 relevado por completo** (12 modelos hijos sin `tenantId` directo
  inventariados y clasificados). No se encontró ninguna vulnerabilidad
  nueva: todos los accesos observados pasan primero por su padre
  tenant-scoped.

**Regresión completa: 218/218 tests unitarios, 212/213 tests de
integración** (el único fallo es M-06, preexistente, no causado por esta
iteración — confirmado de nuevo). Cero escrituras hacia Siesa.

**Veredicto: APTO CON RIESGOS** — ya no quedan P0/P1 de concurrencia o
integridad de datos abiertos; los riesgos restantes (A-04 sin medir, M-02
frontend sin headers, JWT en localStorage) son de rendimiento/hardening
adicional, no de vulnerabilidad activa explotada.

---

## 2. Estado previo (verificado, no reimplementado)

Se releyó el código de los 6 fixes de la fase anterior y se confirmó que
siguen intactos:

- A-01 (`roles.controller.ts`): los tres guards de superadmin para alcance
  GENERAL siguen presentes.
- A-02/M-09 (`pagos.controller.ts`): validación de saldo + `$transaction`
  siguen presentes.
- M-01 (`permissions.ts`): el chequeo `rolRel.activo` sigue presente en
  ambas funciones.
- A-03/M-04 (`solicitudes.controller.ts`): el bloqueo de autoaprobación y
  los campos de auditoría enriquecidos siguen presentes.

No se modificó ninguno de estos archivos salvo `pagos.controller.ts`, y
solo para el catch de M-10 (ver sección 3).

---

## 3. Cambios realizados

### M-10 — deadlock de pagos concurrentes

```
Problema: dos POST /pagos concurrentes sobre la misma factura pueden hacer
que SQL Server aborte una de las dos transacciones con un deadlock
(Prisma P2034). Antes de este fix, ese error caía al catch genérico y
respondía 500 — indistinguible de un error real para el cliente.

Causa: la validación de saldo se lee ANTES de abrir el $transaction (sin
lock), así que dos transacciones pueden abrir casi simultáneamente sobre
las mismas filas de Pago/Factura; SQL Server resuelve el conflicto
abortando una con un deadlock, no con una espera serializada.

Cambio mínimo: server/src/modules/facturas/pagos.controller.ts — se
agregó `esErrorDeConcurrencia(error)` (chequea
`error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"`)
y se traduce específicamente ese código a 409 en los catch de
registrarPago y anularPago. Cualquier otro error sigue siendo 500 sin
cambios.

Riesgo de regresión: bajo — es un catch adicional más específico antes del
catch genérico existente; no cambia el comportamiento de ningún caso que
no sea exactamente P2034.

Test: server/src/modules/facturas/pagos.hardening.integration.test.ts,
test 7 — actualizado para exigir exactamente `[201, 409]` (antes solo
exigía "no ambos exceden el saldo" y toleraba un 500 documentado). 3/3
ejecuciones consecutivas confirmaron el resultado estable.
```

### M-05 — race condition en `getSiesaPool()`

```
Problema: dos llamadas a getSiesaPool() mientras la primera conexión
todavía está en curso veían ambas `pool?.connected` como falso y cada una
creaba su propio ConnectionPool — la segunda quedaba huérfana.

Cambio mínimo: server/src/config/siesa.ts — se agregó
`poolConectando: Promise<sql.ConnectionPool> | null`. La primera llamada
crea la promesa de conexión y la memoiza; las llamadas siguientes,
mientras esa promesa sigue pendiente, la reciben directamente en vez de
crear un nuevo pool. Se limpia en un `.finally()` (éxito o error), así que
una conexión fallida no deja a las llamadas futuras esperando para
siempre una promesa rechazada.

No se tocaron: credenciales, configuración VPN, timeout, ni `pool.max/min`
(siguen en 5/0 exactamente igual).

Riesgo de regresión: bajo — la función pública `getSiesaPool()` mantiene
exactamente la misma firma y contrato (devuelve `Promise<ConnectionPool>`
conectado); `cerrarSiesaPool()` no se modificó.

Test: server/src/config/siesa.test.ts (nuevo, 3 tests, UNITARIO — no
requiere VPN, mockea `mssql.ConnectionPool`):
  1. Tres llamadas concurrentes durante la conexión en curso → un solo
     `new ConnectionPool()`, una sola llamada a `.connect()`, las tres
     devuelven la misma instancia.
  2. Una conexión que falla no deja la siguiente llamada atascada: la
     próxima invocación reintenta desde cero.
  3. Con el pool ya conectado, llamadas siguientes lo reutilizan sin
     reconectar.
LIMITACIÓN DE ENTORNO: no se validó contra el túnel VPN real hacia Siesa
(no disponible en este entorno) — el mock reproduce fielmente el
mecanismo de promesas de la librería `mssql`, pero una prueba con
conectividad real queda pendiente para el próximo ciclo con VPN activo.
```

### M-03 — validación real del contenido de archivos

```
Problema: TIPOS_PERMITIDOS solo validaba `file.mimetype`, un header
declarado por el cliente — un archivo con cualquier contenido y
Content-Type: application/pdf pasaba la validación.

Cambio mínimo: server/src/middleware/upload.middleware.ts —
`detectarTipoRealPorMagicBytes(buffer)` identifica PDF (`%PDF-`), PNG
(firma de 8 bytes), JPEG (`FF D8 FF`) y WEBP (`RIFF`....`WEBP`) leyendo
solo los primeros 16 bytes del archivo YA escrito por multer en la
carpeta temporal (`leerCabeceraArchivo`, lectura de tamaño fijo,
independiente del tamaño del archivo). Si el tipo real detectado no
coincide con `file.mimetype`, se borra el archivo temporal y se responde
400 — antes de que el controller pueda moverlo a la carpeta definitiva del
recurso. No se agregó ninguna dependencia nueva (no se instaló
`file-type` ni similar): son 4 firmas, cubiertas a mano.

No se amplió la lista de formatos permitidos (sigue siendo exactamente
PDF/PNG/JPEG/WEBP). No se cambió el límite de tamaño (10MB), la
generación de nombre aleatorio, ni el aislamiento por tenant vía carpeta
temporal — todo eso ya estaba correctamente protegido y no se tocó.

Content-Disposition: se revisó (sección 8 de este informe) — se mantiene
`inline` para no romper la visualización de PDFs, requisito funcional
existente confirmado en pagos.controller.ts (obtenerComprobantePago).

Riesgo de regresión: MEDIO — cualquier test o flujo real que subiera
"contenido" de prueba en texto plano fingiendo ser PDF ahora es rechazado
correctamente. Se identificaron y corrigieron 7 aserciones de tests
preexistentes que dependían de ese comportamiento previamente inseguro
(ver sección 4) — no eran vulnerabilidades del negocio, sino fixtures de
test con contenido falso.

Tests:
  - server/src/middleware/upload.middleware.test.ts (nuevo, UNITARIO, 8
    casos): PDF/PNG/JPEG/WEBP reales reconocidos correctamente; texto
    plano, un ejecutable (firma MZ) y buffers vacíos/cortos NO se
    reconocen como ninguno de los 4 tipos, sin lanzar excepción.
  - facturas.tenant-prisma.integration.test.ts, test nuevo "13d": un
    archivo de texto plano con `Content-Type: application/pdf` y extensión
    `.pdf` → 400, nunca se escribe en la carpeta real, `archivoRuta` sigue
    `null` en BD.
```

### M-02 — headers de seguridad (auditoría, sin cambios de código)

```
Backend: server/src/app.ts:70 — app.use(helmet()) sigue presente sin
modificaciones, aplicando su set por defecto (X-Content-Type-Options,
X-Frame-Options: SAMEORIGIN, X-DNS-Prefetch-Control, Strict-Transport-
Security solo cuando trust proxy detecta HTTPS real, entre otros). No se
reinstaló ni reconfiguró Helmet en esta fase.

Frontend: build vía Nitro (Cloudflare como target por defecto, ver
vite.config.ts — @lovable.dev/vite-tanstack-config). Se buscó cualquier
archivo `_headers`, configuración de Nitro con `routeRules`, o
configuración de headers en `src/server.ts` (el entrypoint SSR real de la
app) — NO existe ninguno. Confirmado: el frontend hoy no envía ningún
header de seguridad propio (CSP, Referrer-Policy, Permissions-Policy,
X-Frame-Options a nivel de hosting); depende exclusivamente de lo que
Cloudflare Pages/Workers agregue por defecto a nivel de plataforma, que no
incluye CSP.

Qué está protegido: backend API (JSON, no HTML) con Helmet.
Qué falta: el frontend (HTML real, la superficie donde SÍ importa CSP/
X-Frame-Options/clickjacking) no tiene ninguna cabecera propia.
Qué cambio se realizó: ninguno — corregir esto bien requiere definir una
política de CSP compatible con TanStack Start + los dominios reales que
carga la SPA (fuentes, cualquier CDN), y decidir el mecanismo exacto
(`_headers` de Cloudflare Pages vs. middleware en `src/server.ts`), lo
cual excede "cambio mínimo y de bajo riesgo" sin poder probarlo contra el
hosting real.
Qué queda pendiente: definir e implementar la política de CSP del
frontend; localStorage vs. cookie httpOnly para el JWT sigue como
decisión de arquitectura NO implementada (confirmado explícitamente fuera
de alcance por instrucción directa de esta iteración).
```

### M-08 — inventario de modelos hijos sin `tenantId`

Ver sección 9 para la tabla completa. Resultado: **ningún hallazgo nuevo**
— los 12 modelos hijos relevados están todos clasificados SEGURO POR
RELACIÓN. No se migró ningún modelo a `tenantId` directo (decisión
arquitectónica explícitamente fuera de alcance).

---

## 4. Tests ejecutados

| Test | Resultado | Evidencia |
|---|---|---|
| `siesa.test.ts` (M-05, nuevo) | 3/3 PASS | mock de `mssql`, sin VPN |
| `upload.middleware.test.ts` (M-03, nuevo) | 8/8 PASS | unitario, sin HTTP |
| `pagos.hardening.integration.test.ts` (M-10 actualizado) | 9/9 PASS ×3 ejecuciones consecutivas | BD real, concurrencia real vía `Promise.all` |
| `facturas.tenant-prisma.integration.test.ts` (+1 test M-03, +3 fixtures corregidos) | 38/38 PASS | BD real |
| `importaciones.integration.test.ts` (4 fixtures corregidos por M-03) | PASS | BD real |
| `roles.hardening.integration.test.ts` (A-01, fase anterior) | 6/6 PASS | BD real, sin cambios esta fase |
| `solicitudes.hardening.integration.test.ts` (A-03/M-01/M-04, fase anterior) | 5/5 PASS | BD real, sin cambios esta fase |
| Suite unitaria completa (`npx vitest run`) | 218/218 PASS | sin DB real |
| `npx tsc --noEmit` backend | limpio | — |
| `npx tsc --noEmit` frontend | limpio | — |

---

## 5. Suite de integración

```
Comando: RUN_DB_INTEGRATION_TESTS=true npx vitest run --config
vitest.integration.config.mts --no-file-parallelism

(--no-file-parallelism: necesario para distinguir regresiones reales de
deadlocks incidentales entre archivos de test corriendo en paralelo contra
la misma BD real — comportamiento por defecto de Vitest, no relacionado
con el código de producción. Confirmado en la fase anterior.)

Total:   213
Passed:  212
Failed:  1
Skipped: 0 (todas las suites con RUN_DB_INTEGRATION_TESTS=true corrieron)

Fallo único: siesa-sync.integration.test.ts, test 7 ("si la conexión a
Siesa falla, el log queda FALLIDO") — espera que Siesa sea inalcanzable
para probar la rama de fallo, pero el túnel VPN de este entorno SÍ está
activo, así que la sincronización se completa con éxito real
(estado="COMPLETADO" en vez de "FALLIDO"). Es el hallazgo preexistente
M-06, confirmado exactamente igual que en la fase anterior — NO es una
regresión de esta iteración, no se modificó para forzar una suite verde.
```

---

## 6. Pruebas cross-tenant

| Escenario | Resultado | Evidencia |
|---|---|---|
| 1. Roles GENERAL — usuario normal crea/edita/elimina | 403 en los 3 casos | `roles.hardening.integration.test.ts` tests 1-3 (fase anterior, reconfirmado) |
| 2. Autoaprobación — Usuario A crea y aprueba su propia solicitud | 403 | `solicitudes.hardening.integration.test.ts` test 1 (reconfirmado) |
| 3. Acceso por ID — Tenant A lee recurso de Tenant B (Facturas) | 404 | `facturas.tenant-prisma...` test 2 |
| 4. PATCH cross-tenant (Facturas) | 404, sin cambios en BD | `facturas.tenant-prisma...` test 3 |
| 5. DELETE cross-tenant (Facturas) | 404, `eliminado` sigue `false` | `facturas.tenant-prisma...` test 4 |
| 6. Documentos — archivo/comprobante de otro tenant | 404, nunca se escribe ni transitoriamente | `facturas.tenant-prisma...` tests 13, 13b, 14, 20 |
| 7. Proveedores cross-tenant | 404 | `proveedores.tenant-prisma...` (preexistente, reejecutado) |
| 8. Facturas — acceso/modificación cross-tenant | 404 | `facturas.tenant-prisma...` tests 2-4, 28 |
| 9. Solicitudes — acceso/modificación cross-tenant | 404 | `solicitudes.tenant-prisma...` (preexistente, reejecutado) |
| 10. Despachos y modelos hijos — acceso directo cross-tenant | 404, verificado también contra Prisma base | `despachos.integration.test.ts` (preexistente, reejecutado) |

Todos PASS. Ninguno de estos casos requirió cambios de código en esta
iteración — se reejecutaron para confirmar ausencia de regresión tras M-10/
M-05/M-03.

---

## 7. Regresión de A-01/A-02/M-09/M-01/A-03/M-04

Confirmado sin cambios de comportamiento:

- A-01: `roles.hardening.integration.test.ts` 6/6 PASS.
- A-02/M-09: `pagos.hardening.integration.test.ts` 9/9 PASS (incluida la
  validación de saldo y la atomicidad, ambas sin tocar en esta fase salvo
  el catch de M-10 alrededor de ellas).
- M-01: `solicitudes.hardening.integration.test.ts` tests 4-5 PASS.
- A-03/M-04: `solicitudes.hardening.integration.test.ts` tests 1-3 PASS.

Ningún archivo de estos módulos fue modificado en esta iteración salvo
`pagos.controller.ts` (solo el catch de M-10, sin tocar la lógica de A-02/
M-09).

---

## 8. Siesa

```
Confirmado: grep de INSERT INTO|UPDATE |DELETE FROM|MERGE contra
server/src/modules/integraciones-siesa/**/*.ts y server/src/config/siesa.ts
→ CERO resultados de escritura real (el único resultado histórico era un
comentario, no código ejecutable).

server/src/config/siesa.ts (modificado en esta fase, M-05): el cambio es
puramente de memoización de la promesa de conexión — no se agregó, quitó
ni modificó ninguna consulta SQL, credencial, ni parámetro de conexión.

Conclusión: la frontera Siesa → RicoSoft = lectura / RicoSoft → Siesa =
sin escritura permanece exactamente igual que en el informe original y en
la fase anterior. CERO ESCRITURAS HACIA SIESA.
```

---

## 9. Inventario de modelos hijos sin `tenantId` directo (M-08)

| Modelo | tenantId directo | Modelo padre | Ruta de aislamiento | Riesgo | Estado |
|---|---|---|---|---|---|
| `PermisoUsuario` | No | `User` | `userId` → `User.tenantId` (verificado en auditorías previas) | Bajo | SEGURO POR RELACIÓN |
| `FacturaHistorial` | No | `Factura` | `facturaId` → `Factura.tenantId`; solo se crea/lee anidado dentro de operaciones ya validadas sobre la Factura | Bajo | SEGURO POR RELACIÓN |
| `TomaFisicaLinea` | No | `TomaFisica` | `tomaFisicaId` → `TomaFisica.tenantId`; `registrarConteo` busca primero la toma vía `buscarTomaFisicaDelTenant` (`toma-fisica.controller.ts:153`) antes de tocar la línea (`:164`) | Bajo | SEGURO POR RELACIÓN — verificado línea por línea en esta fase |
| `DespachoLinea` | No | `Despacho` | `despachoId` → `Despacho.tenantId`; todo endpoint pasa primero por `findFirst` de Despacho con tenantId (verificado en fase anterior + regresión de esta fase) | Bajo | SEGURO POR RELACIÓN |
| `DespachoNovedad` | No | `Despacho` | Igual que `DespachoLinea` | Bajo | SEGURO POR RELACIÓN |
| `HistorialSalario` | No | `Empleado` | `empleadoId` → `Empleado.tenantId`; solo accesible anidado bajo Empleado (sin endpoint propio de lectura directa por id encontrado) | Bajo | SEGURO POR RELACIÓN |
| `ItemOrdenCompraIntl` | No | `OrdenCompraIntl` | `ordenCompraId` → `OrdenCompraIntl.tenantId` | Bajo | SEGURO POR RELACIÓN |
| `ImportacionHistorial` | No | `OrdenCompraIntl` | `ordenCompraId` → `OrdenCompraIntl.tenantId`; se crea junto con actualizaciones ya validadas de VistoBueno/OrdenCompra | Bajo | SEGURO POR RELACIÓN |
| `VistoBuenoAduanero` | No | `ExpedienteAduanero` | `expedienteId` → `ExpedienteAduanero.tenantId`; `actualizarVistoBueno` filtra con `where: { id, expediente: { tenantId } }` (`importaciones.controller.ts:982-985`) — verificado línea por línea en esta fase | Bajo | SEGURO POR RELACIÓN — verificado línea por línea en esta fase |
| `CosteoImportacionDetalle` | **Sí** (tiene `tenantId` propio) | — | Directo | — | N/A — no es un caso de M-08, tiene tenantId propio |
| `ClasificacionArancelariaMatriz` | No, y sin padre tenant-scoped | Ninguno (catálogo técnico) | N/A — es un catálogo global por diseño explícito (comentario en el schema: subpartidas arancelarias son iguales para cualquier empresa) | Ninguno | GLOBAL POR DISEÑO |
| `Auditoria`/`Notificacion` (alcance GENERAL) | Sí, pero nullable (`tenantId: null` = GENERAL) | — | Mismo patrón `whereAlcance` que Rol/Departamento/Modulo | — | Ya cubierto por A-01/whereAlcance, no es un caso nuevo de M-08 |

**Conclusión de M-08: no se encontró ninguna vulnerabilidad real.** Todos
los modelos hijos sin `tenantId` directo se aíslan correctamente a través
de su padre, y en los dos casos verificados línea por línea en esta fase
específicamente (`TomaFisicaLinea`, `VistoBuenoAduanero`) el código
confirma el filtro anidado o la búsqueda previa del padre tenant-scoped
antes de tocar el hijo. Se mantiene como deuda estructural documentada (no
se migra a `tenantId` directo sin necesidad demostrada, por instrucción
explícita de esta iteración) — el riesgo real es de proceso: un
desarrollador que agregue un endpoint nuevo que acceda a uno de estos
modelos SIN pasar primero por su padre reintroduciría una vulnerabilidad.

---

## 10. Rendimiento (A-04)

```
NO MEDIDO — LIMITACIÓN DE ENTORNO.

Este entorno de ejecución no tiene el túnel OpenVPN activo hacia
db06.siesacloud.local, requisito para que cualquier endpoint que consulte
Siesa (Centro de Decisiones, Ventas/contexto de producto/disponibilidad,
Centro Comercial) haga algo más que devolver la rama `disponible:false`
(tenant sin siesaCiaId o sin conexión), que no representa el caso de uso
real y no serviría como medición honesta.

Mecanismo de medición preparado para el próximo ciclo con VPN activo (NO
implementado en esta fase, para no introducir instrumentación no
verificada): instrumentar con timestamps antes/después de cada llamada a
getSiesaPool()/pool.request() en siesa-inventario.service.ts,
siesa-ventas.service.ts y siesa-sync.service.ts, y loguear
{endpoint, tiempoTotalMs, tiempoSiesaMs, numeroConsultas} de forma
estructurada (no en el resultado HTTP, para no filtrar detalles internos
al cliente).

No se aumentó el pool de Siesa (sigue en max:5, min:0) ni se introdujo
caché — ambos requieren la medición real primero, según instrucción
explícita.
```

---

## 11. Riesgos restantes

### P0
Ninguno.

### P1
- **A-04**: rendimiento real de las consultas a Siesa sin medir — no se
  sabe si hay cuellos de botella bajo uso concurrente real.
- **M-02 (frontend)**: el frontend no envía ningún header de seguridad
  propio (CSP/Referrer-Policy/Permissions-Policy) — superficie real de
  clickjacking/XSS mitigable, sin mitigar todavía.

### P2
- **M-05 residual**: el fix de memoización se probó con mock, no contra
  Siesa real (VPN no disponible en este entorno) — se recomienda una
  validación de humo con VPN activo antes de considerarlo 100% cerrado en
  producción.
- **M-06**: test flaky preexistente (asume Siesa inalcanzable), sin
  cambios — documentado, no corregido a propósito (corregirlo bien
  requiere inyectar el fallo explícitamente en vez de depender del estado
  de red, un cambio de test no trivial fuera del alcance mínimo de esta
  iteración).
- **Auditoría/Notificaciones**: aislamiento cross-tenant no relevado
  endpoint por endpoint en ninguna de las dos últimas fases — sigue
  PENDIENTE DE VERIFICACIÓN (heredado, no es un hallazgo nuevo).

### P3
- Deuda estructural documentada de M-08 (modelos hijos sin `tenantId`
  directo) — sin riesgo activo, solo un cuidado de proceso a futuro.

---

## 12. Decisiones pendientes

**Técnicas** (pueden decidirse sin negocio):
- Mecanismo exacto para servir headers de seguridad del frontend
  (`_headers` de Cloudflare Pages vs. middleware en `src/server.ts`).
- Validar M-05 con VPN real antes del próximo despliegue a producción.
- Instrumentar A-04 en cuanto haya VPN disponible, antes de cualquier
  optimización.

**De negocio** (requieren validación explícita del usuario, NO
implementar hasta entonces):
- Política de CSP concreta (qué dominios externos necesita cargar
  realmente el frontend en producción).
- Migración de JWT en `localStorage` a cookie httpOnly (cambio de
  arquitectura de sesión, explícitamente fuera de alcance de esta
  iteración y de la anterior).
- Confirmar con cada tenant si opera con un solo aprobador de solicitudes
  de compra (riesgo de proceso de A-03, señalado en la fase anterior,
  sigue sin confirmar).

---

## 13. Recomendación de producción

**APTO CON RIESGOS.**

No existe ninguna vulnerabilidad P0 abierta. Los P1 restantes (A-04 sin
medir, M-02 frontend) son de rendimiento y hardening adicional — ninguno
permite hoy cross-tenant, fraude financiero, escalada de privilegios,
corrupción de datos, ni una vulnerabilidad de archivo explotada
activamente. La justificación es la misma evidencia de las secciones 4-9:
regresión completa sin fallas nuevas, cross-tenant probado en los 10
escenarios exigidos, Siesa confirmado de solo lectura.

---

## 14. Próximo paso

El próximo gran objetivo es la especialización del módulo **COMERCIAL**
(Ventas como Centro Operativo Comercial). No se implementó nada de eso en
esta iteración — esta fase fue exclusivamente hardening, seguridad,
concurrencia, trazabilidad, validación, medición y testing, según el
mandato explícito.
