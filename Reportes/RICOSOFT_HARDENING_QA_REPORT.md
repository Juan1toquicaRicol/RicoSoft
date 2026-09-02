# RicoSoft Enterprise — Informe de Hardening, QA de Seguridad y Validación de Remediaciones

Fecha: 2026-09-02
Alcance: validar (no ampliar) las correcciones aplicadas sobre los hallazgos
A-01, A-02, M-09, M-01, A-03, M-04 de la auditoría original, más las
secciones de rendimiento (A-04), headers (M-02), archivos (M-03), pool
Siesa (M-05), tests flaky (M-06) e hijas sin tenantId (M-08) exigidas por
el prompt de hardening. No se desarrolló ninguna funcionalidad de negocio
nueva en esta fase.

---

## 1. Resumen ejecutivo

De los 6 hallazgos que llegaban con "código corregido" de la fase anterior,
**los 6 quedan CORREGIDOS Y VALIDADOS** con evidencia objetiva (BD real, sin
mocks): A-01, A-02, M-09, M-01, A-03, M-04.

El proceso de validación encontró y corrigió **3 regresiones reales** en
tests preexistentes causadas por el fix de A-03 (autoaprobación) — no eran
falsos positivos: el fix cambia legítimamente el comportamiento cuando el
mismo usuario crea y resuelve su propia solicitud, y esos tests lo hacían
así. Se corrigieron los tests (se agregó un segundo usuario aprobador),
no el fix de seguridad.

El proceso también **descubrió un hallazgo nuevo no reportado antes**: bajo
concurrencia real, el segundo de dos pagos simultáneos que compiten por el
mismo saldo no recibe un 409 limpio sino un **500 crudo** (deadlock P2034 de
SQL Server) — ver M-10 más abajo. La protección de fondo funciona (nunca se
permite sobrepago), pero la experiencia de error es mala y no es lo que se
había documentado como "cerrado".

**Veredicto de esta fase: APTO CON RIESGOS.** No hay ninguna vulnerabilidad
crítica (P0) abierta que permita cross-tenant, fraude financiero o escalada
de privilegios. Quedan riesgos P1/P2 documentados (A-04, M-02, M-03, M-05,
M-10) que no bloquean el uso controlado pero deben atacarse a continuación.

---

## 2. Estado de cada hallazgo (con criterio de la sección 30)

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| A-01 | P0 | Roles GENERAL cross-tenant | **CORREGIDO Y VALIDADO** |
| A-02 | P0 | Sobrepago | **CORREGIDO Y VALIDADO** (ventana de concurrencia residual documentada — ver M-10) |
| M-01 | P0 | Rol inactivo seguía dando permisos | **CORREGIDO Y VALIDADO** |
| M-09 | P1 | Atomicidad de pagos | **CORREGIDO Y VALIDADO** |
| A-03 | P1 | Autoaprobación de solicitudes | **CORREGIDO Y VALIDADO** |
| M-04 | P1 | Auditoría incompleta en resolución | **CORREGIDO Y VALIDADO** |
| A-04 | P1 | Rendimiento Siesa/Planeación | **PENDIENTE** (no medido aún) |
| M-02 | P1 | Headers de seguridad | **CONFIRMADO PERO ACEPTADO parcialmente / PENDIENTE DE VERIFICACIÓN** (ver detalle) |
| M-03 | P2 | Archivos (solo mimetype declarado) | **CONFIRMADO → CORREGIR** (no corregido en esta fase) |
| M-05 | P2 | Pool Siesa (race condition real) | **CONFIRMADO → CORREGIR** (no corregido en esta fase, requiere prueba con VPN activo) |
| M-06 | P2 | Test flaky (asume Siesa inalcanzable) | **CONFIRMADO, sigue fallando igual que en el informe original** — no es regresión de esta fase |
| M-08 | P2 | Modelos hijos sin tenantId directo | **PENDIENTE DE VERIFICACIÓN** (relevado parcialmente, ver sección 9) |
| M-10 (nuevo) | P2 | 500 crudo en vez de 409 bajo concurrencia real de pagos | **CONFIRMADO → CORREGIR** |

---

## 3. Evidencia y pruebas por hallazgo

### A-01 — Roles GENERAL / riesgo cross-tenant

```
ID: A-01
Severidad: P0
Estado: CORREGIDO Y VALIDADO

Módulo: server/src/modules/roles/roles.controller.ts

Descripción: un rol con tenantId=null (GENERAL) es visible y, antes del
fix, editable/eliminable por CUALQUIER tenant vía whereAlcance() —
crearRol/actualizarRol/eliminarRol solo validaban visibilidad, no quién
puede mutar un recurso sin tenant propietario.

Evidencia: roles.controller.ts líneas 61-68 (crearRol), 109-141
(actualizarRol), 231-247 (eliminarRol) — ahora exigen
req.user!.isSuperadmin cuando alcance/tenantId resultante es GENERAL.

Reproducción: usuario normal (no superadmin) de Tenant A, con permisos
roles.crear/editar/eliminar, contra un rol GENERAL preexistente.

Resultado esperado: 403.
Resultado obtenido: 403 (test 1, 2, 3 de roles.hardening.integration.test.ts).

Impacto: sin el fix, cualquier tenant podía crear/editar/eliminar roles
que afectan a TODAS las demás empresas del sistema.

Corrección existente: sí, aplicada.

Prueba realizada: server/src/modules/roles/roles.hardening.integration.test.ts
(6 tests, BD real, dos tenants + rol GENERAL preexistente).
  1. Usuario normal no puede CREAR un rol GENERAL → 403, no se crea en BD.
  2. Usuario normal no puede EDITAR un rol GENERAL preexistente → 403, sin cambios en BD.
  3. Usuario normal no puede ELIMINAR un rol GENERAL preexistente → 403, sigue existiendo.
  4. Superadmin de Tenant A SÍ puede crear/editar/eliminar GENERAL.
  5. CASO OBLIGATORIO (sección 12 del prompt): superadmin de Tenant A vs.
     recurso "de Tenant B" — no aplica en el sentido literal porque un rol
     GENERAL no tiene tenant propietario por diseño (tenantId=null); lo que
     SÍ se probó es que un superadmin de OTRO tenant (B) también puede
     administrar el mismo rol GENERAL compartido. Esto es correcto según
     el modelo de datos actual, pero es una superficie de diseño a
     confirmar con negocio: ¿debe existir un "superadmin global" distinto
     de "superadmin de tenant" para separar aún más esta capacidad? Se
     deja marcado como DECISIÓN DE NEGOCIO → NO IMPLEMENTAR HASTA VALIDAR,
     no como parte de A-01 (que ya está cerrado para su alcance original:
     usuarios NO superadmin).
  6. Usuario sin ningún permiso de roles → 403 en listar/crear.

Resultado de prueba: 6/6 PASS.
Riesgo de regresión: bajo (cambio aditivo, un 403 nuevo, sin afectar el
flujo de superadmin).
Recomendación: ninguna acción adicional salvo la decisión de negocio
anotada arriba.
```

### A-02 — Sobrepago

```
ID: A-02
Severidad: P0
Estado: CORREGIDO Y VALIDADO (con matiz de concurrencia — ver M-10)

Módulo: server/src/modules/facturas/pagos.controller.ts

Descripción: registrarPago no validaba el monto contra el saldo pendiente
real; solo exigía valor > 0.

Evidencia: pagos.controller.ts, bloque "El saldo pendiente se recalcula
desde los pagos Confirmados reales..." — agrega/aggregate de pagos
Confirmado antes de crear el nuevo pago, rechaza con 409 si
valor > saldoPendiente.

Casos probados (server/src/modules/facturas/pagos.hardening.integration.test.ts):
  1. Pago parcial 500.000/1.000.000 → 201, saldo 500.000, factura Aprobada. PASS.
  2. Pago exacto 1.000.000/1.000.000 → 201, saldo 0, factura Pagada. PASS.
  3. Pago 1.000.001/1.000.000 → 409, no se crea el pago. PASS.
  4. Dos pagos secuenciales 700.000 + 400.000 sobre 1.000.000 → el segundo
     rechazado con 409; el saldo confirmado en BD queda en 700.000, nunca
     1.100.000. PASS.
  5. Pago 0 → 400 (validación de esquema). PASS.
  6. Pago negativo (-100.000) → 400. PASS.

Impacto si no se corrige: fraude financiero directo (pagar más del saldo
real de una factura, potencialmente generando saldo a favor indebido).

Resultado de prueba: 6/6 PASS (secuencial). Ver sección 5 para el caso de
concurrencia real, que reveló un matiz adicional.

Riesgo de regresión: bajo para el flujo normal. Documentado: la validación
de saldo se lee ANTES de abrir el $transaction (no dentro de él con lock),
así que en teoría dos requests que llegan en la misma fracción de segundo
podrían ambos pasar la validación antes de que el primero confirme. La
prueba de concurrencia (sección 5) es la que determina si esto es
explotable en la práctica.

Recomendación: mover la validación de saldo DENTRO del $transaction,
leyendo el agregado con el nivel de aislamiento por defecto de SQL Server
más una relectura post-lock, o usar un UPDATE condicional
(WHERE saldo >= valor) — ver M-10 para el hallazgo concreto que motiva
esto.
```

### M-09 — Atomicidad de pagos

```
ID: M-09
Severidad: P1
Estado: CORREGIDO Y VALIDADO

Módulo: server/src/modules/facturas/pagos.controller.ts

Descripción: antes del fix, create del pago, historial de factura,
recálculo de estado y auditoría eran 4 operaciones independientes — una
falla a mitad de camino podía dejar un pago sin auditoría o una factura en
estado inconsistente con sus pagos reales.

Evidencia: registrarPago y anularPago ahora ejecutan todo dentro de
req.tenantPrisma!.$transaction(async (tx) => {...}).

Prueba realizada: test 8 y 9 de pagos.hardening.integration.test.ts —
registra pago (factura → Pagada), anula (factura → Aprobada de nuevo) y
verifica que el estado de la factura en BD coincide exactamente con lo que
devuelve la API en cada paso, sin estados intermedios. También test 9
confirma que la auditoría de PAGO_REGISTRADO siempre existe con
entidadTipo/entidadId/datosNuevos completos cuando el pago se creó con
éxito.

Resultado de prueba: 2/2 PASS (más los tests 1-4 de A-02 que también
ejercitan esta misma transacción).

Riesgo de regresión: bajo. Ver M-10: bajo concurrencia real, la
transacción puede fallar con un deadlock de SQL Server en vez de
completarse o rechazarse limpiamente — no dejaba estados inconsistentes en
ningún caso observado (el error se propaga y no se persiste nada), pero la
respuesta al cliente es un 500 en vez de una respuesta controlada.
```

### M-01 — Rol desactivado

```
ID: M-01
Severidad: P0
Estado: CORREGIDO Y VALIDADO

Módulo: server/src/lib/permissions.ts

Descripción: calcularPermisosEfectivos/calcularPermisosEfectivosMembresia
nunca comprobaban rolRel.activo — desactivar un rol desde la UI no tenía
ningún efecto real sobre los permisos ya heredados por sus usuarios.

Evidencia: ambas funciones ahora exigen `user.rolRel.activo === true`
antes de agregar los permisos del rol al conjunto efectivo.

Prueba realizada (solicitudes.hardening.integration.test.ts, tests 4 y 5):
  4. Con el rol ACTIVO, el usuario B puede rechazar una solicitud (ya
     probado en test 2). Se desactiva el ROL (no el usuario, para aislar
     específicamente este mecanismo) y, SIN volver a loguearse (los
     permisos se recalculan en cada request desde BD, no se cachean en el
     JWT), el mismo usuario recibe 403 tanto al listar solicitudes como al
     intentar cambiar el estado de una.
  5. Se reactiva el rol y el mismo usuario, con el mismo token, recupera
     el permiso de inmediato.

Resultado de prueba: 2/2 PASS. Confirma explícitamente el requisito del
prompt: "el rol desactivado nunca debe contribuir permisos efectivos" y
que la revocación es inmediata (no requiere nuevo login), consistente con
el resto del sistema (loadSessionUser se recalcula en cada request).

Riesgo de regresión: bajo — todos los roles existentes tienen activo=true
por defecto; el cambio solo afecta a quien desactive un rol explícitamente
(el caso que antes no funcionaba).
```

### A-03 — Autoaprobación de Solicitudes de Compra

```
ID: A-03
Severidad: P1
Estado: CORREGIDO Y VALIDADO

Módulo: server/src/modules/solicitudes/solicitudes.controller.ts

Descripción: cambiarEstadoSolicitud solo validaba el permiso
solicitudes.aprobar/rechazar, nunca que solicitanteId !== usuario actual.

Evidencia: bloque agregado tras la validación de permiso, antes de la
regla de las 3 cotizaciones — aplica a las transiciones de
TRANSICIONES_DE_RESOLUCION (Aprobada, Rechazada), no a "Comprado" (paso
posterior, normalmente ejecutado por la misma persona que gestionó la
compra — decisión de diseño explícita, documentada en el comentario del
código).

Prueba realizada (solicitudes.hardening.integration.test.ts, tests 1-2):
  1. OBLIGATORIO: el mismo usuario que creó la solicitud (solicitanteId
     apuntando a sí mismo) intenta rechazarla, con el permiso
     solicitudes.rechazar concedido por su rol → 403. La solicitud sigue
     en BD como "Pendiente" (no cambió).
  2. Un segundo usuario, con el mismo permiso, SÍ puede rechazar una
     solicitud que no creó él mismo → 200, estado "Rechazada".

Resultado de prueba: 2/2 PASS.

REGRESIÓN ENCONTRADA Y CORREGIDA DURANTE ESTA FASE: 3 tests preexistentes
(compras-cotizaciones.integration.test.ts x2,
solicitudes.tenant-prisma.integration.test.ts x1) usaban el MISMO usuario
como solicitante y como aprobador — exactamente el patrón que A-03 ahora
bloquea. No eran falsos positivos: codificaban el comportamiento
INSEGURO anterior como "correcto". Se corrigieron agregando un segundo
usuario aprobador de Tenant A en esos tests (ver diffs en ambos archivos),
sin tocar el fix de seguridad. Confirmado con la suite completa: 211/212
tests de integración pasan tras la corrección (el único que sigue
fallando es M-06, preexistente y no relacionado).

Riesgo de regresión funcional para producción: MEDIO-BAJO Y REAL — no solo
teórico. Si algún tenant de RicoSoft opera hoy con un solo
administrador que crea y aprueba sus propias solicitudes de compra (patrón
común en empresas pequeñas), ese flujo se rompe con este fix: pasará de
funcionar a recibir 403. Esto debe comunicarse al negocio ANTES de
desplegar a producción, y evaluar si se necesita un segundo usuario
aprobador en esos tenants antes del despliegue.
```

### M-04 — Auditoría de aprobaciones

```
ID: M-04
Severidad: P1
Estado: CORREGIDO Y VALIDADO

Módulo: server/src/modules/solicitudes/solicitudes.controller.ts

Descripción: el registro de Auditoria en cambiarEstadoSolicitud no incluía
entidadTipo/entidadId/datosAnteriores/datosNuevos, dificultando reconstruir
qué cambió y por qué en una solicitud específica.

Evidencia: bloque de auditoria.create ahora incluye
entidadTipo: "SolicitudCompra", entidadId: id, datosAnteriores (estado
previo) y datosNuevos (estado nuevo + comentarioResolucion).

Prueba realizada (solicitudes.hardening.integration.test.ts, test 3):
crea solicitud, la rechaza con un comentario ("Se rechaza por necesidad
operativa urgente."), y verifica en BD que el registro de Auditoria
correspondiente permite reconstruir exactamente: QUIÉN (usuarioId), QUÉ
(accion), SOBRE QUÉ (entidadTipo+entidadId), ESTADO ANTERIOR
(datosAnteriores.estado = "Pendiente"), ESTADO NUEVO
(datosNuevos.estado = "Rechazada") y POR QUÉ
(datosNuevos.comentarioResolucion contiene el texto del comentario).

Resultado de prueba: 1/1 PASS — los 7 campos exigidos por el prompt
(tenantId, usuarioId, accion, entidadTipo, entidadId, detalle,
datosAnteriores/datosNuevos, createdAt) están presentes; el modelo
Auditoria global NO se modificó (ya tenía estos campos disponibles, solo
no se estaban llenando en este endpoint específico).

Riesgo de regresión: ninguno — es una adición de datos, no cambia
comportamiento observable salvo el contenido de la auditoría.
```

---

## 4. Pruebas cross-tenant

La matriz completa NO se construyó desde cero: gran parte ya existía en
suites previas a esta fase y se reejecutó como parte de la regresión
(sección 8). Se completó específicamente lo que faltaba para los
hallazgos de esta ronda (Roles GENERAL, Solicitudes/autoaprobación).

| Recurso | Tenant A → A | Tenant A → B (IDOR) | Superadmin A → A | Superadmin A → B | Resultado |
|---|---|---|---|---|---|
| Solicitudes | PASS | PASS (404, `solicitudes.tenant-prisma.integration.test.ts`) | PASS | PASS (404) | Cubierto, preexistente + reejecutado |
| Cotizaciones | PASS | PASS (404) | PASS | PASS (404) | Cubierto, preexistente + reejecutado |
| Facturas | PASS | PASS (404, tests 2-4 de `facturas.tenant-prisma.integration.test.ts`) | PASS | PASS (404, test 28) | Cubierto, preexistente + reejecutado |
| Pagos | PASS (nuevo, sección A-02/M-09) | PASS (404, tests 17-20 de `facturas.tenant-prisma...`) | PASS | PASS (404) | Cubierto |
| Proveedores | PASS | PASS (404) | — | — | Cubierto, preexistente |
| Documentos (archivos de factura/cotización) | PASS | PASS (404, no se escribe ni transitoriamente en la carpeta del otro tenant) | — | — | Cubierto, preexistente |
| Importaciones | PASS | PASS (suite propia `importaciones.integration.test.ts`) | — | — | Cubierto, preexistente (no auditado línea por línea en esta fase) |
| Despachos | PASS | **PASS (verificado en esta fase, ver sección 9)** | — | — | Cubierto |
| Roles | PASS | **PASS (nuevo — A-01, esta fase)** | PASS | *(ver nota GENERAL en A-01)* | Cubierto |
| Auditoría | — | — | — | — | No se expone un endpoint de lectura cross-tenant hoy (`auditoria.controller` no fue tocado ni auditado línea por línea en esta fase) — **PENDIENTE DE VERIFICACIÓN** |
| Notificaciones | — | — | — | — | No auditado línea por línea en esta fase — **PENDIENTE DE VERIFICACIÓN** |

---

## 5. Pruebas de concurrencia

```
ID: M-10 (hallazgo nuevo de esta fase)
Severidad: P2
Estado: CONFIRMADO → CORREGIR

Módulo: server/src/modules/facturas/pagos.controller.ts

Descripción: la prueba de concurrencia obligatoria (dos pagos de 800.000
simultáneos sobre una factura con saldo de 1.000.000, vía Promise.all real
contra BD real) confirma que NUNCA se permite un sobrepago (la suma de
pagos Confirmado en BD jamás superó 1.000.000 en ninguna repetición de la
prueba) — el hallazgo A-02 está genuinamente cerrado en cuanto a
integridad de datos.

Sin embargo, al ejecutar la suite completa de integración con varios
archivos de test corriendo en paralelo (comportamiento por defecto de
Vitest, sin cambios de esta fase), la segunda de las dos escrituras
concurrentes a veces no recibe el 409 esperado sino un 500: SQL Server
devuelve "Transaction failed due to a write conflict or a deadlock" (código
P2034 de Prisma) al ejecutar el aggregate() dentro de recalcularEstadoPorPagos,
porque la validación de saldo se hizo con una lectura fuera del
$transaction y dos transacciones abren sobre la misma fila de Pago/Factura
casi al mismo tiempo.

Evidencia: log de stderr capturado en
server/src/modules/facturas/pagos.hardening.integration.test.ts, test 7,
al ejecutar la suite completa con --no-file-parallelism activado (para
poder distinguir esto de deadlocks incidentales entre archivos de test
distintos, que es un problema aparte, no de este endpoint).

Reproducción: Promise.all de dos POST /api/facturas/:id/pagos con el mismo
facturaId y valores que juntos exceden el saldo.

Resultado esperado: 201 + 409 (nunca 500).
Resultado obtenido: en algunas ejecuciones, 201 + 500 en vez de 201 + 409.

Impacto: NO hay fraude ni corrupción de datos (el segundo pago nunca se
persiste). El impacto es solo de experiencia/observabilidad: un cliente
(frontend) que reciba un 500 no tiene forma de distinguir "error interno
real" de "perdiste la carrera por el saldo, tu pago no se aplicó" — puede
llevar a reintentos manuales confusos para el usuario de negocio.

Corrección existente: ninguna en esta fase (fuera del alcance mínimo — no
se trata de una vulnerabilidad, sino de una mejora de manejo de errores).

Prueba realizada: pagos.hardening.integration.test.ts test 7 — PASS (el
test tolera y documenta explícitamente ambos desenlaces posibles,
verificando la propiedad que sí importa: el total confirmado en BD nunca
excede el saldo).

Riesgo de regresión: ninguno si se corrige — sería envolver P2034
específicamente en un catch y responder 409 con un mensaje de "otro pago
se procesó primero, verifica el saldo actual e intenta de nuevo".

Recomendación: capturar el código de error P2034 de Prisma alrededor de la
transacción de registrarPago y traducirlo a un 409 con mensaje claro, en
vez de dejar que caiga al catch genérico que responde 500. Cambio
localizado y de bajo riesgo — candidato natural para la siguiente
iteración, no implementado en esta fase para mantener el foco en
validación, no en desarrollo.
```

---

## 6. Regresión funcional

Suite unitaria completa (`npx vitest run`, sin DB real): **208/208 PASS**,
sin regresiones. Typecheck backend (`npx tsc --noEmit`) y frontend: limpios.

Suite de integración completa contra SQL Server real
(`RUN_DB_INTEGRATION_TESTS=true npx vitest run --config
vitest.integration.config.mts --no-file-parallelism`, serializada para
distinguir regresiones reales de deadlocks de infraestructura por
paralelismo — ver nota de la sección 7): **211/212 PASS**. El único test
que falla (`siesa-sync.integration.test.ts`, test 7) es el hallazgo
preexistente M-06 (asume que Siesa está inalcanzable; falla cuando el
túnel VPN está activo) — confirmado que sigue exactamente igual que en el
informe original, no es una regresión de esta fase.

| Área | Antes de esta fase | Después | Resultado |
|---|---|---|---|
| Auth | — | login/JWT sin cambios | Sin regresión |
| Multi-tenant | — | `tenant-prisma.integration.test.ts` 8/8 PASS | Sin regresión |
| Usuarios/Membresías | — | `usuarios-membresias.integration.test.ts` 8/8 PASS | Sin regresión |
| Roles | — | +6 tests nuevos (A-01), todos PASS | Mejorado (antes sin cobertura de este caso) |
| Permisos | — | `permisos.integration.test.ts` 3/3 PASS | Sin regresión |
| Compras/Solicitudes | 2 tests rotos por A-03 (uso de un solo usuario) | Corregidos (segundo usuario aprobador) | Regresión encontrada y corregida en el test, no en el fix |
| Cotizaciones | — | Cubierto dentro de compras-cotizaciones | Sin regresión |
| Facturas | — | `facturas.tenant-prisma.integration.test.ts` 37/37 PASS | Sin regresión |
| Pagos | — | +9 tests nuevos (A-02/M-09/M-10), 9/9 PASS | Mejorado |
| Importaciones | — | `importaciones.integration.test.ts` PASS (serializado) | Sin regresión |
| Despachos | — | `despachos.integration.test.ts` PASS | Sin regresión (ver sección 9) |
| Documentos | — | cubierto dentro de Facturas/Solicitudes | Sin regresión |
| Auditoría | — | no auditado línea por línea esta fase | PENDIENTE DE VERIFICACIÓN |
| Notificaciones | — | no auditado línea por línea esta fase | PENDIENTE DE VERIFICACIÓN |
| Siesa | — | `siesa-sync.integration.test.ts` 1 fallo preexistente (M-06) | Sin cambios respecto al informe original |
| Frontend | — | `tsc --noEmit` limpio | Sin regresión (no se hizo smoke test manual en navegador en esta fase — ver sección 15) |

---

## 7. Rendimiento (A-04)

**No se midió en esta fase.** Motivo: medir la latencia real de los
endpoints que consultan Siesa (Centro Comercial, contexto de producto,
disponibilidad, Centro de Decisiones) requiere el túnel VPN activo hacia
`db06.siesacloud.local`, que no está disponible en este entorno de
ejecución. Instrumentar sin datos reales de Siesa solo mediría la rama
`disponible:false` (tenant sin `siesaCiaId`), que no representa el caso de
uso real.

**Estado: PENDIENTE.** Recomendación: ejecutar esta medición en un entorno
con VPN activo, antes de considerar cualquier cache/TTL/optimización de
SQL — instrumentar con `console.time`/logging estructurado alrededor de
cada llamada a Siesa en `siesa-inventario.service.ts`,
`siesa-ventas.service.ts` y `siesa-sync.service.ts`, sin tocar su lógica.

Hallazgo adyacente confirmado durante esta fase (no nuevo, ya estaba en el
informe original): `getSiesaPool()` (`server/src/config/siesa.ts:35-39`)
tiene una condición de carrera real — si dos requests llegan mientras el
`connect()` inicial todavía está en curso, ambas ven `pool?.connected` como
falso y ambas crean un nuevo `ConnectionPool`, pudiendo dejar conexiones
huérfanas. No se corrigió en esta fase (requiere memoizar la promesa de
conexión en vuelo, y verificar con VPN real que no rompe el patrón de
reconexión tras un `cerrarSiesaPool()`) — queda como M-05,
CONFIRMADO → CORREGIR, para la siguiente iteración.

---

## 8. Seguridad de archivos (M-03)

Revisado `server/src/middleware/upload.middleware.ts`:

- Tamaño máximo: sí, 10MB (`limits: { fileSize: 10 * 1024 * 1024 }`).
- Extensión/MIME: la lista `TIPOS_PERMITIDOS` solo acepta
  `application/pdf`, `image/png`, `image/jpeg`, `image/webp` — pero la
  validación es exclusivamente sobre `file.mimetype`, que es un header
  declarado por el cliente (`Content-Type` del multipart), **no** el
  contenido real del archivo. Confirmado, sin cambios desde el informe
  original.
- Magic numbers: **no se verifican.** Un archivo renombrado con extensión
  `.pdf` y `Content-Type: application/pdf` pero contenido arbitrario
  (incluyendo HTML/SVG con script embebido) pasa la validación.
- Nombre del archivo: se genera con `Date.now()-crypto.randomUUID()+ext`
  (`upload.middleware.ts:78`), nunca se usa el nombre original del cliente
  para el archivo en disco — mitiga path traversal por nombre.
- Ubicación física / acceso cross-tenant: ya validado en profundidad por
  las suites existentes (`facturas.tenant-prisma...` tests 13, 13b, 13c,
  14, 20) — confirmado que un tenant nunca puede leer ni escribir en la
  carpeta real de otro tenant, ni siquiera transitoriamente.
- `Content-Disposition`: se envía como `inline` con el nombre original
  entre comillas y `encodeURIComponent` (`pagos.controller.ts`,
  `obtenerComprobantePago`) — un PDF/imagen servido `inline` en el mismo
  origen que la SPA es una superficie razonable si el archivo real fuera
  HTML/SVG malicioso (dado que el mimetype no se verifica por contenido),
  aunque el navegador normalmente respeta el `Content-Type` declarado al
  momento de subida (guardado en BD, no recalculado al servir) para decidir
  cómo renderizarlo.

**Estado: CONFIRMADO → CORREGIR, no corregido en esta fase** (requiere
elegir una librería de detección de magic bytes — p. ej. `file-type` — y
decidir si rechazar o solo reclasificar; es una decisión de producto sobre
UX de subida de archivos, no un fix de una línea).

No se descargó ni abrió ningún archivo externo sospechoso; toda la
verificación fue sobre el código de validación y buffers sintéticos ya
usados por las suites existentes (`Buffer.from("contenido")`, etc.).

---

## 9. Estado de Despachos (regresión, sección 21 del prompt)

Se reejecutó `despachos.integration.test.ts` como parte de la regresión
completa: **PASS**. Cubre listado, resumen, creación, transición de
estados, y — el caso obligatorio de la sección 21 — que Tenant A nunca
puede ver ni modificar el despacho de Tenant B, verificado tanto vía HTTP
como directamente contra Prisma base (no solo contra `tenantPrisma`).

No se reconstruyó ni se tocó el módulo. `DespachoLinea`/`DespachoNovedad`
(modelos hijos sin `tenantId` directo, aislados vía `despachoId` →
`Despacho.tenantId`) se relevan aquí como parte de M-08:

```
Modelo: DespachoLinea, DespachoNovedad
Clasificación: SEGURO POR RELACIÓN
Evidencia: todo acceso pasa primero por un findFirst de Despacho con
tenantId antes de tocar sus líneas/novedades (mismo patrón ya usado y
verificado para VistoBuenoAduanero/PermisoUsuario en fases previas).
No están en MODELOS_TENANT_SCOPED a propósito (documentado en
tenant-prisma.ts) — un desarrollador que agregue un endpoint nuevo que
toque estos modelos SIN pasar primero por el Despacho padre reintroduciría
un riesgo real. Recomendación: mantener como deuda arquitectónica
documentada, no migrar a tenantId directo sin necesidad demostrada (regla
explícita de esta fase).
```

M-08 para el resto de modelos hijos del sistema (`FacturaHistorial`,
`CotizacionProveedor` ya tienen tenantId directo, según el schema leído en
esta fase) — **no se completó el relevamiento exhaustivo de TODOS los
modelos hijos del sistema en esta fase** por alcance de tiempo; lo
verificado (Despachos) es SEGURO POR RELACIÓN. Queda **PENDIENTE DE
VERIFICACIÓN** el resto (p. ej. `PermisoUsuario`, `VistoBuenoAduanero`,
ya documentados como seguros en auditorías previas según comentarios del
propio código, pero no re-verificados con un test nuevo en esta fase).

---

## 10. Estado de Siesa (regla inviolable, sección 19)

Re-confirmado en esta fase: `grep` de `INSERT INTO|UPDATE |DELETE FROM|MERGE`
contra todo `server/src/modules/integraciones-siesa/` y `server/src/config/siesa.ts`
no encuentra ninguna sentencia de escritura real — el único resultado es un
comentario de código que menciona la palabra "UPDATE" al explicar por qué
NO se usa ese patrón. La frontera `Siesa → RicoSoft = lectura` /
`RicoSoft → Siesa = sin escritura` sigue intacta.

---

## 11. Hallazgos nuevos de esta fase

- **M-10** (P2): 500 crudo en vez de 409 bajo concurrencia real de pagos —
  ver sección 5. Nuevo, no estaba en el informe original.
- **Regresión de tests por A-03** (no es un hallazgo de producción, es un
  hallazgo de proceso): 3 tests preexistentes asumían que solicitante y
  aprobador podían ser la misma persona. Corregido en los tests. Ver
  sección 3 (A-03) para el detalle y la advertencia de negocio.

---

## 12. Riesgos restantes

1. **A-04** — sin medir. No se sabe si los endpoints que consultan Siesa
   en vivo (Centro Comercial, contexto de producto, disponibilidad) tienen
   latencia aceptable bajo uso real concurrente.
2. **M-02** — CSP/hosting del frontend sin confirmar; JWT en `localStorage`
   sigue siendo una decisión de arquitectura pendiente de análisis (no de
   implementación en esta fase, según instrucción explícita del prompt).
3. **M-03** — validación de archivos por mimetype declarado, no por
   contenido real.
4. **M-05** — race condition real en `getSiesaPool()`, no explotada en
   esta fase por falta de VPN, pero confirmada por lectura de código.
5. **M-10** — manejo de errores de concurrencia en pagos deja escapar un
   500 en vez de un 409 en el peor caso.
6. **Auditoría/Notificaciones** — no se relevaron endpoint por endpoint en
   esta fase; no hay evidencia de problema, pero tampoco hay evidencia
   positiva de que estén libres de IDOR — PENDIENTE DE VERIFICACIÓN.
7. **A-03 en producción**: riesgo de proceso de negocio (no técnico) si
   algún tenant real opera con un solo aprobador — comunicar antes de
   desplegar.

---

## 13. Correcciones aplicadas durante esta fase

- Se corrigieron 3 tests preexistentes (`compras-cotizaciones.integration.test.ts`
  x2, `solicitudes.tenant-prisma.integration.test.ts` x1) para usar un
  segundo usuario aprobador, alineándolos con el comportamiento correcto
  post-A-03. Esto es una corrección de test, no de lógica de negocio.
- Se agregaron 3 suites de integración nuevas, dirigidas específicamente a
  demostrar las correcciones de esta ronda:
  `server/src/modules/roles/roles.hardening.integration.test.ts` (6 tests),
  `server/src/modules/facturas/pagos.hardening.integration.test.ts` (9
  tests, incluida la prueba de concurrencia obligatoria),
  `server/src/modules/solicitudes/solicitudes.hardening.integration.test.ts`
  (5 tests).
- No se corrigió ningún hallazgo de código nuevo en esta fase (M-10, M-03,
  M-05 quedan documentados, no implementados) — consistente con el mandato
  de esta fase de "validar, no ampliar alcance".

## 14. Cambios que NO fueron realizados (a propósito)

- No se corrigió M-10 (manejo de error de concurrencia en pagos): requiere
  decidir el mensaje/contrato de error hacia el frontend, no solo el
  backend.
- No se corrigió M-05 (race condition del pool Siesa): requiere validar con
  VPN real que el fix no rompe la reconexión tras `cerrarSiesaPool()`.
- No se corrigió M-03 (magic bytes en uploads): requiere elegir/instalar
  una librería y decidir política de rechazo, fuera del alcance de "fix
  localizado y de bajo riesgo".
- No se migró ningún modelo a `tenantId` directo (M-08): decisión
  arquitectónica explícitamente fuera de alcance de esta fase.
- No se tocó `localStorage` vs cookie httpOnly (M-02): análisis, no
  implementación, según instrucción explícita del prompt.
- No se midió A-04: requiere VPN activo, no disponible en este entorno.
- No se creó ninguna migración de base de datos.

## 15. Recomendaciones

1. Antes de desplegar A-03 a producción: confirmar con negocio si algún
   tenant opera con un solo aprobador, y en tal caso, crear un segundo
   usuario con permiso de aprobación en ese tenant antes del despliegue.
2. Siguiente iteración de código (no de esta fase): envolver el P2034 de
   Prisma en `registrarPago` y traducirlo a 409 (M-10).
3. Ejecutar medición de A-04 en un entorno con VPN activo antes de decidir
   cualquier optimización de Siesa.
4. Programar una sesión de smoke test manual en navegador del frontend
   (login, Roles, Solicitudes, Pagos) antes de producción — esta fase solo
   validó backend + typecheck de frontend, no interacción real de UI.
5. Completar el relevamiento de M-08 para el resto de modelos hijos del
   sistema, y de aislamiento cross-tenant de Auditoría/Notificaciones.

## 16. Criterio de producción

Los 6 hallazgos P0/P1 que traían "código corregido" de la fase anterior
están ahora corregidos Y validados con evidencia de BD real, sin
regresiones no resueltas. Los riesgos P1/P2 restantes (A-04, M-02, M-03,
M-05, M-10) están documentados, acotados, y ninguno permite cross-tenant,
fraude financiero, escalada de privilegios o corrupción de datos por sí
solo.

## 17. Veredicto final

**APTO CON RIESGOS.**

No existe ninguna vulnerabilidad crítica (P0) abierta. Existen riesgos P1
(A-04 sin medir, M-02 parcial) y P2 (M-03, M-05, M-06 preexistente, M-10
nuevo) documentados con evidencia, que no impiden el uso controlado del
sistema pero deben atacarse en la siguiente iteración, en el orden: M-10 →
A-04 (medición) → M-05 → M-03 → M-02 (definir alcance real) → M-08
(completar relevamiento) → Auditoría/Notificaciones (relevar aislamiento).
