# Auditoría integral — Gestión Humana (2026-11-20)

> Archivo sugerido: `Reportes/AUDITORIA_INTEGRAL_GESTION_HUMANA_2026-11-20.md`
> Tipo: auditoría de solo lectura. No se modificó código, schema, migraciones, `.env` ni MEMORY.md, y no se hizo ninguna operación Git.
> Base: commit `ca64bd6` ("asociar cargos a departamentos"), rama `main`, árbol limpio.
> Fuera de alcance: `server/src/modules/gestion-liquidacion` (pertenece a Plan de Producción).

---

## 1. Resumen ejecutivo

Se auditaron 3 grupos: Colaboradores, Novedades y catálogos, y Biométrico. Cada hallazgo pasó por verificación adversarial. Aquí solo aparecen los hallazgos CONFIRMADOS o PLAUSIBLES, con la severidad que fijó el verificador. Se incluyen también los hallazgos que el auditor omitió y el verificador encontró (ids `-V-`).

| Severidad | Colaboradores | Novedades/catálogos | Biométrico | Total |
|---|---|---|---|---|
| ALTA | 1 | 1 | 2 | **4** |
| MEDIA | 13 | 7 | 3 | **23** |
| BAJA | 8 | 13 | 16 | **37** |
| **Total** | 22 | 21 | 21 | **64** |

- Verificación: 63 CONFIRMADOS y 1 PLAUSIBLE (BIO-06). No se refutó ninguno.
- 33 hallazgos requieren decisión del responsable (sección 4.5).

**Riesgos principales**

1. **BIO-01 (ALTA, multi-tenant).** El MDB de CrossChex es uno solo por instalación y el código no define qué tenant es su dueño. Si no hay ninguna fuente activa, cualquier tenant con `biometrico.configurar` puede crear o activar una. En el minuto siguiente importa todo el histórico, desde Logid 0, con los nombres de Userinfo. Eso es fuga de datos personales entre empresas (Ley 1581).
2. **BIO-02 (ALTA, operación).** Una corrida que queda `EN_CURSO` con menos de 15 min al arrancar el servidor no se libera nunca. La sincronización se omite cada minuto, Monitoreo muestra "OK" y el botón "Sincronizar ahora" queda deshabilitado.
3. **NOV-01 (ALTA, calidad).** `ca64bd6` rompió 2 pruebas de `cargos.controller.test.ts`. La suite backend está en rojo y el gate de CI (`.github/workflows/ci.yml:50, 115-121`) bloquea.
4. **COL-01 (ALTA, datos).** En cualquier tenant, el alta de colaborador pone la empresa `"RC"` (Ricol) por defecto. El backend acepta cualquier `empresaId` y ese valor se propaga a permisos, faltas y marcaciones. Contradice AGENTS §9.
5. **Atomicidad con auditoría** (COL-04, NOV-06, BIO-13). Liquidar, eliminar, salario, permisos, faltas, fuentes y asociaciones escriben el cambio y la auditoría por separado. Va contra AGENTS §8/§11 y MEMORY 2026-10-06 (6).
6. **Coherencia del ciclo de vida del colaborador** (COL-06 / NOV-08 / BIO-14 / BIO-V-01). Un colaborador eliminado o liquidado sigue recibiendo marcaciones, permisos y faltas.
7. **Regresiones de `ca64bd6`** (NOV-02, NOV-03, NOV-05, COL-10, COL-17). El autollenado del departamento no funciona por un contrato roto. El backend reemplaza el área sin avisar. Eliminar un departamento con cargos responde 500. MEMORY.md quedó desactualizado.

---

## 2. Alcance y método

### 2.1 Secciones cubiertas

- **Colaboradores:** listado, edición, liquidación, eliminación (soft-delete) y ajuste salarial (`empleados.controller.ts`). Alta en página con dos fases (`src/lib/gestion-humana-alta.ts`). Detalles: información personal, EPS/ARL/fondo, familiares, estudios y documentos (`empleado-detalles.controller.ts`, `empleado-detalles-dialog.tsx`). Uploads (`crearUploadArchivo`, `moverArchivoDefinitivo`). Regla de correo por cargo (`server/src/lib/cargos.ts`, `src/lib/cargos.ts`).
- **Novedades y catálogos:** permisos laborales (`permisos-laborales.controller.ts`), faltas (`faltas.controller.ts`), Comunicados (placeholder), Cargos (`cargos.controller.ts`, `cargos-panel.tsx`, `use-cargos.ts`), catálogo de seguridad social (`catalogo-seguridad-social.controller.ts`, `use-seguridad-social.ts`), departamentos en lo que toca a cargos (`departamentos.controller.ts`, `configuracion.departamentos.tsx`), y las migraciones `20261006100000_cargos_detalles_colaborador` y `20261120160000_cargo_departamento`.
- **Cableado transversal de permisos:** `gestion-humana.routes.ts`, `server/src/lib/permissions.ts`, `catalogo-permisos.ts` (exigeVer), `auth.middleware.ts`, `src/lib/auth-permissions.ts`, `permisos-sync.test.ts`, el route guard y el gating de pestañas.
- **Biométrico (CrossChex):** marcaciones, fuentes, sincronizaciones (job node-cron y recuperación), usuarios del reloj, asociaciones, importación (servicio, dry-run, script CLI), cliente ODBC (`src/integrations/crosschex/*`), Monitoreo (`/api/monitoreo/jobs`, `job-registry`), y las migraciones `20260907120000` y `20260907130000`.

Antes de clasificar algo como nuevo se consultaron MEMORY.md (§11 CrossChex y la decisión 2026-10-06), `Reportes/AUDITORIA_GESTION_HUMANA_CREACION_2026-10-21.md`, `Reportes/CORRECCION_GESTION_HUMANA_BIOMETRICO_ADMINISTRAR_2026-10-21.md`, `Reportes/SINCRONIZACIONES_Y_MONITOREO_2026-10-26.md` y `Reportes/AUDITORIAS_REGISTRO.md`.

### 2.2 Pruebas ejecutadas (resultado real)

| Comando | Resultado |
|---|---|
| `cd server && npx vitest run src/modules/gestion-humana/empleados.controller.test.ts src/modules/gestion-humana/empleado-detalles.controller.test.ts src/modules/gestion-humana/gestion-humana.cargos-detalles.routes.test.ts` | 3 archivos, 104/104 aprobadas |
| `cd server && npx vitest run src/modules/gestion-humana src/modules/departamentos` | 12 archivos, 212 pruebas: **210 aprobadas, 2 FALLADAS** (`cargos.controller.test.ts:92` y `:137`, regresión de `ca64bd6`). La integración de departamentos se omite por `skipIf` porque no hay BD |
| `cd server && npx vitest run src/lib/permisos-sync.test.ts src/lib/catalogo-permisos.test.ts` | 16/16 aprobadas: los catálogos de backend y frontend coinciden |
| `cd server && npx vitest run` sobre los 13 archivos biométricos (`biometrico-*.test.ts`, `src/integrations/crosschex`, `src/jobs/crosschex-*.test.ts`) | 13 archivos, 126/126 aprobadas |
| Frontend desde PowerShell con `C:\` en mayúscula: `npx vitest run src/lib/gestion-humana-alta.test.ts src/lib/gestion-humana-carga.test.ts src/lib/cargos.test.ts src/lib/solicitud-vigente.test.ts src/lib/config-negocio-permisos.test.ts src/components/gestion-humana/biometrico-panel.test.tsx src/lib/hora-reloj.test.ts` | 36/36 aprobadas, sumando todas las corridas |
| Frontend desde Git Bash con `c:/` en minúscula | FALLA DE ENTORNO: `TypeError: Cannot read properties of undefined (reading config)` y 0 pruebas ejecutadas. Las mayúsculas de la letra de unidad duplican la instancia de vitest. No es un defecto del repositorio |
| `npm run typecheck` (raíz) | Limpio. No detecta NOV-02 porque `fetchAuth` devuelve `any` |
| `cd server && npx tsc --noEmit` | Limpio |

### 2.3 NO VERIFICADO EN EL REPOSITORIO

- Estado de producción: qué fuentes biométricas están activas, si existen marcaciones con `checkType=1` y el volumen de `SincronizacionBiometricoLog`.
- Si la migración `20261120160000_cargo_departamento` ya se aplicó en QA o producción.
- Si node-odbc cierra por GC una conexión que resuelve tarde (BIO-06), y si el connect al MDB bloqueado tarda hasta el timeout o falla de inmediato (BIO-06, BIO-V-04).
- El código exacto de error de SQL Server/Prisma por truncado (NOV-10).
- Tiempos reales de las consultas sin índice (BIO-07, BIO-08), y si Prisma aplica en memoria el `take:1` de la relación anidada (BIO-07).
- Efecto de un modo de solo lectura en la cadena ODBC sobre los bloqueos de CrossChex (BIO-17).

### 2.4 Correcciones del verificador al auditor (informativas)

- Las líneas reales son `biometrico-marcaciones.controller.ts:78` (BIO-03) y `:108-125` (BIO-08), `biometrico-sincronizaciones.controller.ts:97-106` (BIO-07) y `:152-167` (BIO-16), y `crosschex.config.ts:46-50` (BIO-09).
- `eliminarEstudio` sí tiene una prueba IDOR a nivel de colaborador (`empleado-detalles.controller.test.ts:171-174`). Lo que falta es probar la cascada de soportes (COL-20).

---

## 3. Estado por sección

Estados de verificación: **CONF** = confirmado; **PLAUS** = plausible; **V-NUEVO** = hallazgo omitido por el auditor y añadido en verificación.

### 3.1 Expediente (listado, editar, liquidar, eliminar, salario)

**Estado actual.** Las rutas `gestion-humana.routes.ts:76-89` autentican y autorizan. El tenant sale de `req.user.tenantId`, y los `:id` se resuelven con `{id, tenantId, eliminado:false}`. `crearEmpleado` y `editarEmpleado` auditan dentro de `$transaction`. Liquidar, eliminar y salario lo hacen fuera de ella. Desde `c66740d` la UI no tiene botones para liquidar ni para ajustar el salario. Ya conocidos y no reportados como nuevos: SEC-09 (salario visible con `empleados.ver`) y `take:1000` sin paginación.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| COL-03 | MEDIA | No se puede liquidar ni ajustar salario desde la UI: se quitaron los botones y los diálogos quedaron como código muerto | `gestion-humana.tsx:179, 203-215, 482-496, 1686-1735, 1993-2014`; `git show c66740d`; endpoints activos en `routes:83-88` | CONF |
| COL-04 | MEDIA | Liquidar, eliminar y salario escriben el cambio y la auditoría fuera de una transacción | `empleados.controller.ts:341-363, 381-397, 419-428` frente a `:170-204, 300-318` | CONF |
| COL-05 | MEDIA | `liquidarEmpleado` no valida el estado ni la fecha | `empleados.controller.ts:378, 385, 400-402` | CONF |
| COL-06 | MEDIA | Liquidar o eliminar no toca `EmpleadoBiometrico`, y permisos y faltas se siguen aceptando | `biometrico-import.service.ts:228-254`; `permisos-laborales.controller.ts:43, 12, 104-110`; `faltas.controller.ts:45`; `gestion-humana.tsx:1763, 1891` | CONF |
| COL-14 | BAJA | Las auditorías de crear, salario, liquidar y eliminar no llevan `entidadTipo`/`entidadId` | `empleados.controller.ts:195-202, 356-363, 390-397, 421-428` | CONF |
| COL-16 | BAJA | El listado envía `historicoSalario` completo aunque la UI no lo usa, y cada mutación recarga las 3 secciones | `empleados.controller.ts:35-41`; `src/lib/data.ts:98`; `use-gestion-humana.ts:15-35, 59-103` | CONF |
| COL-18 | BAJA | Las acciones sobre colaboradores no exigen `empleados.ver` en el backend | `catalogo-permisos.ts:116`; `routes:77-89` frente a `136-154` | CONF |

**Pruebas faltantes:** `listarEmpleados` (filtra por tenant y `eliminado:false`, ignora el tenantId del cliente). En `actualizarSalario`, `liquidarEmpleado` y `eliminarEmpleado`: IDOR → 404, validación → 400, estado, auditoría atómica y efecto sobre `EmpleadoBiometrico`. Rutas 401/403 de GET/POST `/empleados`, PATCH `/salario`, PATCH `/liquidar` y DELETE `/empleados/:id`.

### 3.2 Alta de colaborador

**Estado actual.** Es una página con pestañas Datos/Detalles y un guardado en dos fases que se puede reintentar. La empresa por defecto es `"RC"`. Desde `ca64bd6`, el backend deriva el área del departamento del cargo, y el formulario no lo refleja.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| COL-01 | ALTA | Empresa `"RC"` por defecto en cualquier tenant, se ofrecen las 3 empresas y el backend acepta cualquier `empresaId` | `src/lib/gestion-humana-alta.ts:49`; `tenant-context.tsx:43, 120-127`; `gestion-humana.tsx:116, 1197-1201`; `empleados.controller.ts:126, 174`; `server/src/lib/cargos.ts:39-55`; patrón correcto en `facturas.index.tsx:162`, `servicios.index.tsx:111` y `solicitudes-compra.index.tsx:137` | CONF |
| COL-10 | MEDIA | El departamento elegido se reemplaza sin aviso por el del cargo, y editar el cargo no actualiza el área | `empleados.controller.ts:182, 268-272`; `gestion-humana.tsx:1278-1311` | CONF |
| COL-12 | MEDIA | `crearEmpleado` no valida tipo, longitud, recorte ni fecha: responde 500 o guarda datos sucios | `empleados.controller.ts:112-128, 167, 182-183, 207-209`; `schema.prisma:1477-1492`; helpers en `empleado-detalles.controller.ts:69-135` | CONF |
| COL-13 | MEDIA | Se pueden registrar dos colaboradores activos con la misma cédula | `schema.prisma:1511-1512`; `empleados.controller.ts:109-211`; reintento en `gestion-humana.tsx:389-393` | CONF |
| COL-17 | BAJA | MEMORY.md dice que el área no está vinculada al cargo, pero `ca64bd6` los vinculó | MEMORY.md (2026-10-06, punto 1); `schema.prisma:1528, 1533` | CONF |

Relacionados en Cargos: NOV-02 y NOV-05.

**Pruebas faltantes:** `empresaId` inválido → 400; longitudes de documento y nombres; `fechaContratacion` inválida; duplicado de documento (según la decisión); derivación del área; valor por defecto de `empresaId` según el tenant (frontend).

### 3.3 Detalles del colaborador (personales, familiares, estudios, documentos)

**Estado actual.** Los ids del body se resuelven con `tenantId + empleadoId`, y todas las mutaciones auditan en `$transaction`. Los uploads siguen el patrón aprobado: carpeta `_tmp`, magic bytes, mover el archivo después de validar el tenant, y descarga autenticada y auditada. La consulta de detalles no se audita, y la auditoría de edición lista campos que no cambiaron.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| COL-02 | MEDIA | Eliminar un estudio borra sus soportes con solo `detalles_editar`, sin `documentos_gestionar` | `routes:140-144, 160` frente a `150-154, 174-178`; `empleado-detalles.controller.ts:483-506`; `dialog:481-498` | CONF |
| COL-07 | MEDIA | La UI dice que "el acceso queda registrado", pero la consulta no se audita | `empleado-detalles-dialog.tsx:291-294`; `empleado-detalles.controller.ts:183-234, 641-651` | CONF |
| COL-08 | MEDIA | La auditoría de detalles lista todos los campos enviados, y un guardado sin cambios igual se audita | `empleado-detalles.controller.ts:248-289, 337-345`; `dialog:180-183` | CONF |
| COL-09 | MEDIA | Quien gestiona documentos sin poder verlos ve "Sin certificado bancario" y al subir reemplaza el existente sin aviso | `empleado-detalles.controller.ts:191, 202-207, 561-578`; `dialog:281, 471, 586, 615-620` | CONF |
| COL-11 | MEDIA | El diálogo valida el correo más estricto que el backend y bloquea ediciones válidas | `dialog:146, 152-156`; `src/lib/cargos.ts:20-27`; `empleados.controller.ts:242, 250-261`; prueba en `empleados.controller.test.ts:410-441` | CONF |
| COL-15 | BAJA | Dos subidas simultáneas pueden dejar dos `CERTIFICADO_BANCARIO` | `empleado-detalles.controller.ts:561-567, 573-605`; MEMORY 2026-10-06 (3) | CONF |
| COL-19 | BAJA | Las listas de residencia no son coherentes (BOGOTA no tiene departamento válido) y no se valida la pareja ciudad/departamento | `empleado-detalles.controller.ts:94-98, 263-275`; `src/lib/detalle-personal.ts:33-34` | CONF |
| COL-V-01 | BAJA | Un error inesperado antes de mover el archivo deja el temporal (p. ej. un certificado bancario) en `uploads/_tmp` | `empleado-detalles.controller.ts:530-533, 543-570, 613-616` | V-NUEVO |
| COL-V-02 | BAJA | `eliminarEstudio` lee los soportes fuera de la transacción y borra por `estudioId`: un soporte subido entretanto pierde su fila y deja el archivo huérfano | `empleado-detalles.controller.ts:483-491, 504-506, 551-605` | V-NUEVO |

**Pruebas faltantes:** `eliminarEstudio` con soportes: el `deleteMany` queda acotado a `estudioId + empleadoId + tenantId`, se borran los archivos después de la transacción, se audita y respeta la regla de COL-02. `guardarDetallesEmpleado` audita solo los campos que cambiaron. El temporal se limpia ante un 500 inesperado. Validación de correo en `guardarLaboral` cuando el correo no cambió (frontend).

### 3.4 Permisos laborales

**Estado actual.** Las rutas `routes:181-191` exigen permisos canónicos (escritos como literales). El tenant sale de la sesión y `empleadoId` se resuelve con `{id, tenantId}`, sin `eliminado:false`. La validación se hace a mano y es pobre. La auditoría queda fuera de la transacción y no hay control de transición de estado. No hay pruebas. La UI no hace gating por `permisos_laborales.*`.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| NOV-06 | MEDIA | Crear y cambiar de estado se auditan fuera de una transacción y sin `entidadTipo`/`entidadId` (aplica también a Faltas) | `permisos-laborales.controller.ts:62-82, 110-119`; `faltas.controller.ts:48-67` | CONF |
| NOV-07 | MEDIA | No hay control de transición ni de concurrencia al aprobar o rechazar | `permisos-laborales.controller.ts:6, 100-110`; la UI solo filtra en `gestion-humana.tsx:909` | CONF |
| NOV-18 | MEDIA | Permisos laborales y faltas no tienen ninguna prueba | No existen `permisos-laborales.controller.test.ts` ni `faltas.controller.test.ts` | CONF |
| NOV-V-01 | MEDIA | Los modales de permiso y falta no bloquean el doble envío | `gestion-humana.tsx:498-532, 1862-1864, 1957-1959`; patrón existente `guardandoEmpleado :238` | V-NUEVO |
| NOV-08 | BAJA | Se pueden registrar permisos y faltas a colaboradores eliminados (aplica también a Faltas) | `permisos-laborales.controller.ts:43`; `faltas.controller.ts:45` | CONF |
| NOV-09 | BAJA | Las pestañas y acciones de Permisos y Faltas no hacen gating por `permisos_laborales.*`/`faltas.*` | `gestion-humana.tsx:136-158, 550-565, 584-604, 909-954, 976-984` | CONF |
| NOV-10 | BAJA | La validación de entrada es incompleta y algunos datos inválidos dan 500 | `permisos-laborales.controller.ts:37-49`; `schema.prisma:1661, 1664`; `faltas.controller.ts:36-39` | CONF |
| NOV-15 | BAJA | Los formularios no se reinician, hay estado muerto (`registradoPor`) y se recarga todo | `gestion-humana.tsx:276, 498-532`; `use-gestion-humana.ts:115-136` | CONF |
| NOV-16 | BAJA | La auditoría guarda el tipo de permiso (p. ej. "Licencia Médica") junto al nombre del colaborador | `permisos-laborales.controller.ts:80`; MEMORY 2026-10-06 (6) | CONF |

**Pruebas faltantes:** tenant de la sesión; `empleadoId` de otro tenant → 404; eliminado → 404; `dias` no entero o ≤0 → 400; fin < inicio → 400; auditoría atómica; transición Pendiente→Aprobado|Rechazado y rechazo de la re-transición; rutas 401/403 de ver, crear y aprobar.

### 3.5 Faltas

**Estado actual.** Igual que en Permisos laborales: `findFirst {id, tenantId}` sin `eliminado:false`, auditoría fuera de transacción, sin pruebas y sin gating en la UI. El backend usa `req.user.nombre` como registrador, correctamente.

Hallazgos que aplican (detallados en 3.4): **NOV-06, NOV-08, NOV-09, NOV-10, NOV-15, NOV-18 y NOV-V-01**. Con NOV-V-01, un doble clic en "Aplicar Sanción" crea dos `FaltaStrike`.

**Pruebas faltantes:** tenant de la sesión; `empleadoId` de otro tenant o eliminado → 404; gravedad inválida → 400; auditoría atómica; rutas 401/403.

### 3.6 Comunicados

**Estado actual.** Es solo un placeholder, sin backend ni permiso. Esto es correcto: no debe inventarse `comunicados.*`.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| NOV-17 | BAJA | La pestaña es visible para todos y menciona proveedores no adoptados (SMTP/Resend/SendGrid), aunque ya existen `correo-saliente` (Gmail API) y `Publicacion` | `gestion-humana.tsx:629-638, 1103-1117`; MEMORY 2026-11-18; `schema.prisma:1076-1084` | CONF |

### 3.7 Cargos (y su impacto en Departamentos)

**Estado actual.** El CRUD valida, normaliza, maneja P2002 → 409 y audita en `$transaction`. `ca64bd6` añadió `departamentoId` y dejó pruebas rotas, un contrato roto con la UI, el borrado de departamentos sin cubrir y la decisión sin documentar.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| NOV-01 | ALTA | `ca64bd6` rompió 2 pruebas y dejó la suite backend y el CI en rojo | `cargos.controller.test.ts:92, 137` frente a `cargos.controller.ts:44-47, 139`; `ci.yml:50, 115-121` | CONF |
| NOV-02 | MEDIA | `/cargos/opciones` devuelve `departamento.nombre` y la UI lee `departamentoNombre`, así que el autollenado no funciona | `cargos.controller.ts:65-76`; `src/lib/cargos.ts:11-12`; `gestion-humana.tsx:1279-1285` | CONF |
| NOV-03 | MEDIA | Eliminar un departamento con cargos responde 500 (FK NO ACTION) y la UI deja el botón activo | `departamentos.controller.ts:7-14, 35-41, 284-294, 307-335, 345-352`; `configuracion.departamentos.tsx:296-311` | CONF |
| NOV-05 | MEDIA | La derivación área←cargo contradice MEMORY, solo se aplica al crear, ignora `departamento.activo` y no controla la longitud (255→100) | `empleados.controller.ts:67-77, 182, 268-272`; `schema.prisma:321, 1492` | CONF |
| NOV-04 | BAJA | Convertir un departamento GENERAL en exclusivo no revisa los cargos de otros tenants | `departamentos.controller.ts:219-240`; `cargos.controller.ts:45, 72, 115, 194`; `empleados.controller.ts:75, 182` | CONF |
| NOV-13 | BAJA | El select del panel queda en blanco si el departamento del cargo está inactivo | `cargos-panel.tsx:247-273`; `departamentos.controller.ts:115` | CONF |
| NOV-14 | BAJA | La migración `20261120160000_cargo_departamento` no está envuelta en BEGIN TRY/TRAN | `migration.sql`; las otras 10 migraciones recientes sí lo están | CONF |
| NOV-V-02 | BAJA | Un PATCH `/cargos/:id` sin cambios responde `colaboradoresAsignados: 0` | `cargos.controller.ts:34, 179-182, 245, 253-256` | V-NUEVO |

**Pruebas faltantes:** `departamentoId` válido, GENERAL, de otro tenant, inactivo o no string → 400; PATCH connect/disconnect y su auditoría; contrato de `/cargos/opciones` con `departamentoNombre`; departamento con cargos → 409; GENERAL→TENANT bloqueado si hay cargos de otro tenant; aserción de `_count` en el PATCH sin cambios.

### 3.8 Catálogo de seguridad social

**Estado actual.** El backend es correcto: valida, normaliza, devuelve 409 ante duplicados y usa `$transaction` con `entidadTipo`/`entidadId`.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| NOV-12 | BAJA | Lo que se agrega al catálogo no aparece en los selectores del alta hasta recargar la página | `use-seguridad-social.ts:23-46, 70-90`; patrón de eventos en `use-cargos.ts:39-43, 79, 99` | CONF |

**Pruebas faltantes:** refresco de las opciones al crear o editar (frontend).

### 3.9 Cableado transversal de permisos

**Estado actual.** Todas las rutas pasan por `authenticateJWT` (`routes:73`) y usan códigos canónicos (`permisos-sync.test.ts` en verde). Siguen el modelo `exigeVer` de migración gradual (`catalogo-permisos.ts:22-25`). No hay bypass, pero sí incoherencias.

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| NOV-11 | BAJA | El permiso de entrada (`empleados.ver`) no es coherente con las secciones independientes; `permisos_laborales` y `faltas` no tienen exigeVer | `gestion-humana.tsx:101`; `modulos.controller.ts:104`; `catalogo-permisos.ts:116-126`; `src/lib/route-guards.ts:38` | CONF |
| NOV-19 | BAJA | Hay literales de permiso mezclados con `PERMISOS_SISTEMA` y descripciones desactualizadas | `routes:76-89, 181-191`; `auth-permissions.ts:1017-1021, 1055-1065` | CONF |
| COL-18 / BIO-15 | BAJA | Ver 3.1 y 3.10.5. Mismo patrón: sin exigeVer en `empleados` ni en `biometrico` | `catalogo-permisos.ts:116, 126` | CONF |

### 3.10 Biométrico (CrossChex)

**Estado general.** El acceso ODBC directo al MDB con una ruta global sigue la arquitectura aprobada (MEMORY §11). Las consultas solo interpolan enteros acotados y nunca leen `Pwd`. El cursor `lastProcessedLogId` avanza en la misma transacción que el insert del lote. La idempotencia la da `@@unique([fuenteId, externalLogId])`, y el candado, el índice filtrado `..._en_curso_uq`. Las horas se guardan como componentes literales (`Date.UTC`/`getUTC*`). Todos los endpoints toman el tenant de `req.user` y devuelven 404 si el recurso es de otro tenant. Ya conocidos y no reportados como nuevos: TOCTOU al crear o activar (`SINCRONIZACIONES_Y_MONITOREO_2026-10-26.md:56-59`) y `FuenteBiometrica.nombre @unique` global (SEC-13). La corrección del botón Administrar del 2026-10-21 está aplicada.

#### 3.10.1 Marcaciones

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| BIO-08 | BAJA | El listado ordena por `horaMarcacion` sin un índice `(tenantId, horaMarcacion)` y hace 3 consultas por vista | `biometrico-marcaciones.controller.ts:108-125`; `schema.prisma:1818-1820` | CONF |
| BIO-10 | BAJA | La UI llama "Salida" a CheckType 3 y deja fuera el 1 (Salida oficial); MEMORY no registra el cambio | `biometrico-marcaciones-panel.tsx:46-51, 67` (b297d6a); MEMORY.md:299-302; `crosschex.mapper.ts:10-21` | CONF |

#### 3.10.2 Fuentes

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| BIO-01 | ALTA | Cualquier tenant puede quedarse con el MDB único (histórico y nombres) cuando no hay fuente activa | `biometrico-fuentes.controller.ts:129-139, 188-197`; `schema.prisma:1701-1711`; `crosschex-sync.job.ts:57-60, 75`; `biometrico-import.service.ts:215, 224, 251`; `biometrico-usuarios.service.ts:39, 54-61`; `crosschex.config.ts:38, 76`; `auth.middleware.ts:118` | CONF |
| BIO-03 | MEDIA | Crear otra fuente en el mismo tenant reimporta todo el MDB y duplica las marcaciones | `schema.prisma:1710, 1817`; `biometrico-import.service.ts:233, 280-288`; `biometrico-marcaciones.controller.ts:78`; `fuentes.controller.ts:129` | CONF |
| BIO-13 | BAJA | La auditoría queda fuera de la transacción y sin detalle al activar o renombrar (también aplica a asociaciones) | `fuentes.controller.ts:137-150, 203-214, 248-262`; `asociaciones.controller.ts:149-169, 221-236, 258-269` | CONF |
| BIO-V-03 | BAJA | El 409 por nombre duplicado revela que otro tenant ya usa ese nombre | `schema.prisma:1705`; `fuentes.controller.ts:9-11, 154-155, 218-219` | V-NUEVO |

#### 3.10.3 Sincronizaciones (job, recuperación, Monitoreo)

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| BIO-02 | ALTA | Un candado `EN_CURSO` de menos de 15 min al arrancar no se libera nunca, y Monitoreo muestra OK. Hay un segundo camino sin reinicio: si fallan los dos updates de cierre, la fila queda `EN_CURSO` para siempre | `crosschex-recovery.ts:34-35`; `index.ts:80-117, 136`; `biometrico-import.service.ts:200-211, 311, 337`; `crosschex-sync.job.ts:90-96`; `job-registry.ts:158-160, 212`; `sincronizaciones-panel.tsx:141-143, 203` | CONF |
| BIO-07 | BAJA | `SincronizacionBiometricoLog` crece 1440 filas por día, sin retención ni índice para su orden, y la UI lo consulta cada 30 s | `biometrico-import.service.ts:200-207, 311-322`; `schema.prisma:1855`; `sincronizaciones.controller.ts:97-106`; `sincronizaciones-panel.tsx:60, 137` | CONF |
| BIO-09 | BAJA | El estado global del job expone a otros tenants el nombre de la fuente y errores técnicos, incluida la ruta del MDB | `crosschex-sync.job.ts:62-65, 80, 99-102`; `job-registry.ts:108-114, 230`; `monitoreo.routes.ts:19-23`; `crosschex.config.ts:46-50`; `crosschex.errors.ts:70-73` | CONF |
| BIO-12 | BAJA | Con `CROSSCHEX_SYNC_BATCH_SIZE` > 2000 o no entero, el ciclo corta después del primer lote | `crosschex-sync.job.ts:39-43`; `crosschex.queries.ts:36`; `biometrico-import.service.ts:133, 308` | CONF |

#### 3.10.4 Usuarios del reloj

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| BIO-V-02 | BAJA | `usuariosDelBiometrico` no falla cerrado si hay más de una fuente activa (caché global) | `biometrico-usuarios.service.ts:39, 55-58`; frente a `crosschex-sync.job.ts:66-71` y `sincronizaciones.controller.ts:162-167` | V-NUEVO |
| BIO-V-04 | BAJA | No hay caché negativa ni deduplicación: con el MDB bloqueado, cada listado reintenta la conexión ODBC | `biometrico-usuarios.service.ts:58-81`; `crosschex.config.ts:21`; llamadores en `marcaciones.controller.ts:124` y `asociaciones.controller.ts:92` | V-NUEVO |

#### 3.10.5 Asociaciones

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| BIO-04 | MEDIA | Una asociación equivocada no se puede corregir ni reasignar (los UNIQUE incluyen las inactivas) | `schema.prisma:1757, 1760`; migración `20260907130000`; `asociaciones.controller.ts:193-196, 204-206, 211-225, 258` | CONF |
| BIO-05 | MEDIA | Asociar no enlaza las marcaciones ya importadas | `biometrico-import.service.ts:228-254`; `asociaciones.controller.ts:149-169`; `schema.prisma:1773-1780` | CONF |
| BIO-14 | BAJA | Un colaborador eliminado conserva su asociación activa y recibe marcaciones (mismo tema que COL-06) | `empleados.controller.ts:419`; `biometrico-import.service.ts:228-243`; `asociaciones.controller.ts:144-146` | CONF |
| BIO-15 | BAJA | La sección `biometrico` no tiene exigeVer | `catalogo-permisos.ts:126`; `routes:204-256` | CONF |
| BIO-V-01 | BAJA | Reactivar una asociación no revisa que el colaborador siga vigente | `asociaciones.controller.ts:144-146, 195, 217-225` | V-NUEVO |

#### 3.10.6 Importación, job CrossChex y cliente ODBC

| Id | Sev. | Título | Evidencia | Verif. |
|---|---|---|---|---|
| BIO-06 | BAJA | Si `odbc.connect` resuelve después del timeout, la conexión queda abierta | `crosschex.client.ts:25-52, 59-75`. Ocurrencia real NO VERIFICADA (MEMORY.md:296-297 describe el bloqueo como un error inmediato) | PLAUS |
| BIO-11 | BAJA | El dry-run cuenta como conocidas las asociaciones inactivas | `biometrico-import.service.ts:110-118` frente a `:236` | CONF |
| BIO-16 | BAJA | `sincronizarFuenteBiometrica` no valida que la fuente esté activa ni que sea la única; el CLI la llama directamente | `biometrico-import.service.ts:62, 191-196`; `scripts/importar-historico-crosschex.ts:29-60, 94-100` | CONF |
| BIO-17 | BAJA | Comentarios desactualizados (parámetros '?', fuenteId "pendiente", zona horaria, permiso inexistente, reasignación, "solo lectura", `crosschex.sync.service` inexistente) | `crosschex.client.ts:21, 79-80`; `schema.prisma:1709, 1726, 1733-1739, 1789-1795`; `asociaciones.controller.ts:204-206` | CONF |

**Pruebas faltantes del biométrico:** aislamiento entre tenants dueño y no dueño (según BIO-01); recuperación en un ciclo posterior y fallo reportado a Monitoreo (BIO-02, por los dos caminos); una segunda fuente no duplica (BIO-03); reasignación y enlace del histórico (BIO-04/05, según la decisión); cierre de la conexión tardía (BIO-06); dry-run con asociación inactiva (BIO-11); `BATCH_SIZE` > 2000 o no entero (BIO-12); atomicidad de fuentes y asociaciones (BIO-13); `/monitoreo/jobs` sin nombre ni ruta (BIO-09); reactivación con empleado eliminado → 409 (BIO-V-01); `usuariosDelBiometrico` con 2 fuentes activas → vacío (BIO-V-02); caché negativa (BIO-V-04). En frontend: `BiometricoMarcacionesPanel` (mapeo de filtros, fechas, paginación), `BiometricoFuentesPanel` y `BiometricoSincronizacionesPanel`. Integración contra SQL Server real de los índices filtrados y únicos.

### 3.11 Descartados en verificación

| Id | Motivo |
|---|---|
| (ninguno) | El verificador no refutó ningún hallazgo. Solo ajustó severidades: COL-02 ALTA→MEDIA, NOV-04/08/09 MEDIA→BAJA, BIO-06 MEDIA→BAJA (PLAUSIBLE) y BIO-07 MEDIA→BAJA. También corrigió números de línea (sección 2.4). |

---

## 4. Plan de corrección por fases

Convenciones:
- **DEC** = requiere decisión del responsable (sección 4.5).
- **Sin DEC** = se puede implementar con la arquitectura y las reglas vigentes.
- Toda migración va en una carpeta nueva y usa el patrón `BEGIN TRY / BEGIN TRAN` del repositorio. No se edita ninguna migración histórica.

### 4.1 Fase 1 — Seguridad, multi-tenant e integridad

| # | Resuelve | Archivos | Cambio mínimo | Pruebas a agregar | Riesgo | DEC |
|---|---|---|---|---|---|---|
| F1-01 | NOV-01 | `server/src/modules/gestion-humana/cargos.controller.test.ts` | Actualizar las aserciones `:92` (include con `departamento`) y `:137` (`departamentoId: null`) a la forma vigente, sin borrar pruebas | Casos de `departamentoId`: válido, GENERAL, otro tenant, inactivo, no string, connect/disconnect y auditoría | Bajo | Sin DEC |
| F1-02 | BIO-02 | `server/src/jobs/crosschex-sync.job.ts`, `crosschex-recovery.ts` | Llamar `recuperarSincronizacionesBiometricoInterrumpidas` (mismo umbral) al inicio de cada ciclo. Si `SincronizacionEnCursoError` persiste más allá del umbral, `reportarFalloEnCorrida` con un mensaje genérico | Fila `EN_CURSO` reciente al arrancar que se libera en un ciclo posterior; fallo de los dos updates de cierre; Monitoreo no queda en OK | Bajo. No se toca el índice filtrado | Sin DEC |
| F1-03 | BIO-V-02 | `biometrico-usuarios.service.ts` | Contar las fuentes activas de toda la instalación; si hay más de una, devolver vacío (misma regla que el job) | 2 fuentes activas → sin usuarios | Bajo | Sin DEC |
| F1-04 | BIO-16 | `biometrico-import.service.ts`, `scripts/importar-historico-crosschex.ts` | Mover al servicio la validación de fuente activa y única. Si el CLI necesita importar una fuente inactiva, que use un flag explícito | Servicio con fuente inactiva o con 2 activas → error | Bajo | Sin DEC (el flag del CLI es opcional) |
| F1-05 | BIO-01 | `biometrico-fuentes.controller.ts`, `biometrico-import.service.ts`, `biometrico-usuarios.service.ts`, `crosschex.config.ts` | Identificar en el servidor la fuente o tenant autorizado para el MDB (p. ej. una variable de entorno nueva). Validarla al crear o activar (403/409), en el servicio y en usuarios. Fallar cerrado si falta | Dos tenants: el no autorizado no crea, no activa, no importa ni ve usuarios | Medio: exige configurar el entorno en el despliegue | **DEC D-01** |
| F1-06 | BIO-09 | `crosschex-sync.job.ts` | En `reportarFalloEnCorrida`, usar un mensaje genérico sin nombre de fuente ni ruta. El detalle sigue en la consola y en el log del tenant | `/monitoreo/jobs` no contiene el nombre ni la ruta | Bajo | Sin DEC |
| F1-07 | BIO-V-03 | `biometrico-fuentes.controller.ts` | Ante un P2002 por nombre, devolver un mensaje genérico que no confirme que existe | Mensaje sin filtración | Bajo | Sin DEC (cambiar la unicidad a `(tenantId, nombre)` sería DEC, ver SEC-13) |
| F1-08 | COL-01 | `src/lib/gestion-humana-alta.ts`, `src/routes/gestion-humana.tsx`, `server/src/modules/gestion-humana/empleados.controller.ts` | Frontend: valor por defecto `empresaIdDeTenant(user?.tenantNombre) \|\| (empresaActiva !== "ALL" ? empresaActiva : null)`; si da null, exigir que se elija. Backend: 400 si `empresaId` no es string o no está en las claves de `DOMINIO_POR_EMPRESA` | Por defecto según tenant (frontend); `empresaId` "ZZ"/"ALL" → 400 | Bajo | Sin DEC para lo mínimo; **DEC D-02** para fijar la empresa al tenant |
| F1-09 | COL-02 | `empleado-detalles.controller.ts`, `empleado-detalles-dialog.tsx` | Si el estudio tiene soportes y el actor no es superadmin ni tiene `empleados.documentos_gestionar`: 403/409 sin borrar. Auditar cuántos soportes se borraron, sin nombres | Con y sin el permiso; conteo en la auditoría | Bajo | **DEC D-03** |
| F1-10 | COL-V-02 | `empleado-detalles.controller.ts` (`eliminarEstudio`) | Leer los soportes con `tx` y borrar con `id: { in: ids }`. Si aparece otro soporte, la FK NoAction revierte la transacción → 409 | Simular un soporte nuevo → 409 sin archivos huérfanos | Bajo | Sin DEC |
| F1-11 | COL-V-01 | `empleado-detalles.controller.ts` (`subirDocumentoEmpleado`) | En el catch externo, si el archivo no se movió (bandera `movido`), `borrarArchivoSilencioso(archivo.path)` | Excepción en `buscarEmpleado` → el temporal se borra | Bajo | Sin DEC |
| F1-12 | COL-06, NOV-08, BIO-14, BIO-V-01 (mínimo) | `permisos-laborales.controller.ts`, `faltas.controller.ts`, `biometrico-import.service.ts`, `biometrico-asociaciones.controller.ts` | Agregar `eliminado:false` al `findFirst` de `crearPermisoLaboral` y `crearFalta` (404). Agregar `empleado: { eliminado: false }` a la consulta de vínculos de la importación. Al reactivar (`activo:true`), exigir que el empleado esté vigente (409) | Eliminado → 404 en permiso y falta; importación sin enlazar al eliminado; reactivación → 409 | Bajo | Sin DEC; **DEC D-04** para desactivar vínculos al liquidar o eliminar, para los liquidados y para los pendientes |
| F1-13 | NOV-04 | `server/src/modules/departamentos/departamentos.controller.ts` | En GENERAL→TENANT, contar `cargoColaborador` con `{departamentoId: id, tenantId: {not: tenantId}}` → 409 | Prueba de aislamiento | Bajo | Sin DEC |
| F1-14 | NOV-03 | `departamentos.controller.ts`, `src/routes/configuracion.departamentos.tsx` | Agregar `cargosColaborador` a `CONTEOS_BLOQUEO`, al `_count` de eliminar, a `totalAsignaciones`/`enUso` y a los bloqueos (409 "N cargo(s)"), más el conteo en la rama GENERAL. Actualizar el tooltip | Departamento con cargo → 409 | Bajo | Sin DEC |

### 4.2 Fase 2 — Correctitud y atomicidad

| # | Resuelve | Archivos | Cambio mínimo | Pruebas | Riesgo | DEC |
|---|---|---|---|---|---|---|
| F2-01 | COL-04, COL-14 | `empleados.controller.ts` | Envolver `update` + `auditoria.create` en `prisma.$transaction(async tx => …)` en salario, liquidar y eliminar. Agregar `entidadTipo:'Empleado'` y `entidadId` en crear (`creado.id`), salario, liquidar y eliminar | Auditoría falla → 500 sin cambios, sin HistorialSalario duplicado; `entidadId` presente | Bajo | Sin DEC |
| F2-02 | NOV-06 | `permisos-laborales.controller.ts`, `faltas.controller.ts` | Transacción con `entidadTipo: 'PermisoLaboral' \| 'FaltaStrike'` y `entidadId` | Atomicidad | Bajo | Sin DEC |
| F2-03 | BIO-13 | `biometrico-fuentes.controller.ts`, `biometrico-asociaciones.controller.ts` | Transacción e incluir en el detalle los cambios `activa` anterior→nueva y `nombre` anterior→nuevo | Atomicidad y detalle | Bajo | Sin DEC |
| F2-04 | COL-05 | `empleados.controller.ts`, `empleado-detalles.controller.ts` (exportar `fechaOpcional`) | Fecha YYYY-MM-DD guardada como medianoche UTC (sin fecha, la medianoche UTC de hoy); `>= fechaContratacion`; 409 si ya está `Liquidado` | Fecha inválida → 400; anterior a la contratación → 400; doble liquidación → 409 | Bajo | Sin DEC |
| F2-05 | COL-12 | `empleados.controller.ts`, `empleado-detalles.controller.ts` (exportar `textoRequerido`/`fechaOpcional` o moverlas a un helper del módulo) | Aplicar trim, colapso de espacios y máximos de schema a documento (50), nombres y apellidos (255), cargo libre (255) y área (100); validar `fechaContratacion` → 400 | Límites y tipos | Bajo. No introducir Zod en un módulo que no lo usa | Sin DEC |
| F2-06 | COL-08 | `empleado-detalles.controller.ts` (`guardarDetallesEmpleado`) | Después de leer `actual`, descartar los campos con el mismo valor normalizado (fechas por ISO día). Si no queda ninguno, 200 sin escribir ni auditar | Auditoría con solo los cambios reales; sin cambios → sin auditoría | Bajo | Sin DEC |
| F2-07 | COL-15 | `empleado-detalles.controller.ts` | Dentro de la transacción, `tx.findMany` + borrar todos los `CERTIFICADO_BANCARIO` del colaborador y tenant antes de crear; borrar los archivos después | Dos certificados previos → queda uno | Bajo | Sin DEC; el índice único filtrado es **DEC D-22** |
| F2-08 | NOV-02 | `cargos.controller.ts` (`listarCargosOpciones`) | Devolver `departamentoNombre: c.departamento?.nombre ?? null`, el mismo contrato que `serializar` | Contrato de opciones | Bajo | Sin DEC para el contrato. El bloqueo del Select en la UI depende de **D-05** |
| F2-09 | COL-10, NOV-05 | `empleados.controller.ts`, `gestion-humana.tsx`, `empleado-detalles-dialog.tsx` | Según D-05: si manda el cargo, deshabilitar el Select cuando el cargo tiene departamento y actualizar y auditar `area` en `editarEmpleado`; si manda el usuario, `area \|\| cargo.departamento?.nombre`. Validar o truncar a 100 caracteres | Derivación al crear y al editar, departamento inactivo, longitud | Medio: cambia datos de listados y agrupaciones | **DEC D-05** |
| F2-10 | NOV-07 | `permisos-laborales.controller.ts` | `updateMany({ where: { id, tenantId, estado: 'Pendiente' } })` dentro de la transacción con la auditoría; 409 si `count = 0`. Sin estados nuevos | Re-transición → 409; concurrencia | Bajo | **DEC D-07** (qué transiciones se permiten) |
| F2-11 | NOV-10 | `permisos-laborales.controller.ts`, `faltas.controller.ts` | 400 para: `empleadoId` no string, `dias` no entero positivo, `tipoPermiso` fuera de la lista que ya usa la UI o de más de 50 caracteres, `motivo` no string | Validaciones | Bajo | Sin DEC; la coherencia días/fechas es **DEC D-08** |
| F2-12 | NOV-V-01 | `src/routes/gestion-humana.tsx` | Estados `guardandoPermiso`/`guardandoFalta` que deshabiliten el submit (patrón `guardandoEmpleado`) | Doble clic → una sola petición (frontend) | Bajo | Sin DEC |
| F2-13 | COL-11 | `src/components/.../empleado-detalles-dialog.tsx` | Validar el correo solo si cambió, o si se pasa a un cargo de las opciones que lo exige y no hay correo. Con el cargo sin cambios y fuera de las opciones, no forzar "requerido" | Correo histórico de otro dominio, cargo inactivo opcional | Bajo. No se toca la regla del backend | Sin DEC |
| F2-14 | NOV-V-02 | `cargos.controller.ts` | Incluir `_count: { select: { empleados: CONTEO_COLABORADORES } }` al cargar `existente` | Aserción de `colaboradoresAsignados` | Bajo | Sin DEC |
| F2-15 | BIO-11 | `biometrico-import.service.ts` (dry-run) | Agregar `activo: true` | Dry-run con asociación inactiva | Bajo | Sin DEC |
| F2-16 | BIO-12 | `crosschex-sync.job.ts` (`leerConfigSchedulerCrossChex`) | Normalizar `tamanoLote` a un entero en [1, 2000] | 5000 → 2000; 1.5 → 1 | Bajo | Sin DEC |
| F2-17 | BIO-06 | `src/integrations/crosschex/crosschex.client.ts` | Ante un timeout, encadenar `.then(c => c.close()).catch(() => {})` a la promesa original de `odbc.connect` | Connect tardío → se llama `close` | Bajo | Sin DEC |
| F2-18 | BIO-V-04 | `biometrico-usuarios.service.ts` | Caché negativa corta (p. ej. 1 min, devolviendo la caché previa con `disponible:false`) y promesa en vuelo compartida | Fallo → no reintenta dentro del intervalo; peticiones simultáneas → 1 conexión | Bajo | Sin DEC |
| F2-19 | COL-13 | `empleados.controller.ts` (y una migración nueva si se aprueba) | 409 si ya existe un Empleado con `eliminado=false`, `estado='Activo'` y el mismo documento recortado en el tenant. Índice único filtrado opcional, después de revisar los duplicados existentes | Duplicado → 409; recontratación permitida según la regla | Medio: puede haber duplicados históricos | **DEC D-06** |
| F2-20 | BIO-03 | `biometrico-fuentes.controller.ts` | Según D-13: 409 si el tenant ya tiene una fuente (activa o inactiva) y sugerir reactivarla, o iniciar el cursor en el máximo `externalLogId` ya importado | Una segunda fuente no duplica | Medio | **DEC D-13** |
| F2-21 | BIO-04 | Migración nueva, `schema.prisma`, `biometrico-asociaciones.controller.ts` | Reemplazar los dos UNIQUE por índices únicos filtrados `WHERE activo = 1` (patrón de `erpRowId`), o crear un flujo de reasignación auditado. Corregir el docstring y el 409 | Reasignar después de desactivar | Medio-alto: cambio de restricciones | **DEC D-14** |
| F2-22 | BIO-05 | `biometrico-asociaciones.controller.ts` o `schema.prisma` (comentarios) | Si se aprueba: `updateMany` acotado por `tenantId`, `fuenteId`, `externalUserId` y `empleadoId=null` dentro de la transacción de la asociación, con auditoría. Si no: corregir `schema.prisma:1773-1780` | Aislamiento del backfill | Medio (volumen) | **DEC D-15** |
| F2-23 | BIO-08 | Migración aditiva nueva, `schema.prisma` | `@@index([tenantId, horaMarcacion])` | `prisma validate`, migración en BD desechable | Bajo (aditivo) | Sin DEC de negocio; necesita revisión de la migración |
| F2-24 | BIO-07 | Migración aditiva nueva, `schema.prisma` | `@@index([tenantId, iniciadoEn])` y `@@index([fuenteId, iniciadoEn])` | Igual | Bajo | Índices sin DEC; la retención es **DEC D-16** |
| F2-25 | COL-16 | `empleados.controller.ts` (`listarEmpleados`) | Quitar el `include` de `historicoSalario` (`serializarEmpleado` ya devuelve `[]`). No resuelve SEC-09 | El listado no incluye el historial | Bajo | Sin DEC |

### 4.3 Fase 3 — Pruebas faltantes

| # | Resuelve | Archivos | Contenido |
|---|---|---|---|
| F3-01 | COL-20 | `empleados.controller.test.ts`, `gestion-humana.cargos-detalles.routes.test.ts`, `empleado-detalles.controller.test.ts` | `listarEmpleados` (tenant, `eliminado:false`); salario, liquidar y eliminar (IDOR → 404, `findFirst` con tenantId y `eliminado:false`, estado, atomicidad); rutas 401/403 de GET/POST `/empleados`, PATCH `/salario`, PATCH `/liquidar` y DELETE `/empleados/:id`; `eliminarEstudio` con cascada acotada, archivos y auditoría |
| F3-02 | NOV-18 | Nuevos `permisos-laborales.controller.test.ts` y `faltas.controller.test.ts` (patrón de `cargos.controller.test.ts`); test de rutas | Tenant de la sesión, otro tenant o eliminado → 404, validaciones 400, transacción con auditoría, transición; rutas 401/403 por permiso |
| F3-03 | NOV-01 (ampliación), NOV-02, NOV-03, NOV-04 | `cargos.controller.test.ts`, `departamentos.controller.test.ts` | `departamentoId`, contrato de opciones, bloqueo 409, GENERAL→TENANT |
| F3-04 | Biométrico | Archivos `biometrico-*.test.ts`, `crosschex-*.test.ts` y `src/integrations/crosschex/*.test.ts` existentes | Los casos listados en 3.10 |
| F3-05 | Frontend | `src/lib/gestion-humana-alta.test.ts` y pruebas nuevas de componentes | Empresa por defecto según el tenant (COL-01), validación de correo (COL-11), gating de Permisos y Faltas (NOV-09), doble envío (NOV-V-01), refresco del catálogo de seguridad social (NOV-12), paneles biométricos |
| F3-06 | Integración | `server` `test:integration` (BD desechable) | Migración `20261120160000`, índices filtrados (`..._en_curso_uq`), `@@unique([fuenteId, externalLogId])` y restricciones de tenant (pendiente en MEMORY 2026-10-06) |

### 4.4 Fase 4 — UX y mantenibilidad

| # | Resuelve | Archivos | Cambio mínimo | DEC |
|---|---|---|---|---|
| F4-01 | NOV-09 | `src/routes/gestion-humana.tsx` | Flags `puedeVerPermisos`, `puedeCrearPermiso`, `puedeAprobarPermiso`, `puedeVerFaltas` y `puedeCrearFalta` con `hasPermission(PERMISOS_SISTEMA.*)`. Ocultar o deshabilitar pestañas y botones con el mensaje de permiso faltante, como en `empleados.crear`. Opcional: no pedir `/permisos` ni `/faltas` sin el `.ver` | Sin DEC |
| F4-02 | NOV-15 | `gestion-humana.tsx`, `use-gestion-humana.ts` | Reiniciar los formularios al guardar con éxito, quitar `registradoPor` y, opcionalmente, refrescar solo la sección afectada | Sin DEC |
| F4-03 | NOV-12 | `use-seguridad-social.ts` | Emitir un evento en crear y actualizar y escucharlo en `useOpcionesSeguridadSocial` (patrón `cargos:actualizados`) | Sin DEC |
| F4-04 | NOV-13 | `cargos-panel.tsx` | Item deshabilitado `"<departamentoNombre> (inactivo)"` cuando el id no está en la lista | Sin DEC |
| F4-05 | NOV-19 | `gestion-humana.routes.ts`, `src/lib/auth-permissions.ts` | Reemplazar los literales por `PERMISOS_SISTEMA.*` y actualizar las descripciones de `gestion_informacion` y `cargos.gestionar` | Sin DEC |
| F4-06 | BIO-17 | `crosschex.client.ts`, `schema.prisma` (solo comentarios), `biometrico-asociaciones.controller.ts` | Corregir solo los comentarios. El modo de solo lectura ODBC queda aparte | Sin DEC (el modo de solo lectura es **D-23**) |
| F4-07 | COL-17 / NOV-05 | `MEMORY.md` | Registrar la asociación opcional cargo→departamento y su precedencia una vez resuelta D-05 | Depende de D-05 |
| F4-08 | COL-03 | `gestion-humana.tsx` | Restituir los botones Liquidar y Salario con `hasPermission(EMPLEADOS_LIQUIDAR / EMPLEADOS_EDITAR_SALARIO)`, ocultando Liquidar si ya está `Liquidado`, o quitar el código muerto y documentarlo | **DEC D-09** |
| F4-09 | COL-07 | `empleado-detalles.controller.ts` o `empleado-detalles-dialog.tsx` | Auditar `EMPLEADO_DETALLES_CONSULTADOS` (entidadTipo/entidadId, sin valores), o corregir el texto | **DEC D-10** |
| F4-10 | COL-09 | Controlador y diálogo de detalles, rutas | Indicador `tieneCertificado` y conteo de soportes sin nombres, con "Reemplazar" y confirmación, o exigir `documentos_ver` junto con `gestionar` | **DEC D-11** |
| F4-11 | COL-18, NOV-11, BIO-15 | `catalogo-permisos.ts`, `gestion-humana.routes.ts`, `gestion-humana.tsx` | `exigeVer` en las secciones `empleados`, `permisos_laborales`, `faltas` y `biometrico`, o `requireAllPermissions([X_VER, X])` en las mutaciones; guard `requireAnyPermisoGuard` | **DEC D-12** |
| F4-12 | BIO-10 | `biometrico-marcaciones-panel.tsx`, controlador de marcaciones, `MEMORY.md` §11 | Si 1 también es salida, el filtro acepta una lista `checkType` sin alterar el dato guardado. Registrar la interpretación | **DEC D-17** |
| F4-13 | NOV-17 | `gestion-humana.tsx` | Quitar la mención a SMTP/Resend/SendGrid. Decidir si se oculta la pestaña | **DEC D-20** |
| F4-14 | NOV-16 | `permisos-laborales.controller.ts` | Si se decide así, auditar solo la acción con entidadTipo/entidadId, sin el tipo de permiso | **DEC D-19** |
| F4-15 | COL-19 | `empleado-detalles.controller.ts`, `src/lib/detalle-personal.ts` | Ajustar las listas y la validación de la pareja ciudad/departamento según lo que defina Gestión Humana | **DEC D-21** |
| F4-16 | NOV-14 | Migración `20261120160000` (solo si no se aplicó en ningún entorno persistente) | Envolverla en TRY/TRAN; si ya se aplicó, no editarla y documentar la limpieza manual | **DEC D-18** |

### 4.5 Decisiones pendientes (pregunta concreta al responsable)

| Id | Hallazgos | Pregunta |
|---|---|---|
| D-01 | BIO-01 (F1-05) | ¿Cómo se identifica en el servidor la fuente o tenant autorizado a leer `CROSSCHEX_MDB_PATH`? ¿Una variable de entorno nueva con el id de la fuente, o con el id del tenant dueño? ¿Fallar cerrado, sin exponer usuarios ni importar, cuando falte? |
| D-02 | COL-01 | ¿La empresa del colaborador debe quedar fija a la del tenant autenticado? Si es así, ¿cuál es la fuente de verdad en el servidor? Hoy el mapeo tenant→empresa solo existe en el frontend y se hace por nombre (`empresaIdDeTenant`). |
| D-03 | COL-02 | Para eliminar un estudio con soportes, ¿se bloquea (409 y "elimine primero los soportes") o se exige además `empleados.documentos_gestionar` (403)? |
| D-04 | COL-06, NOV-08, BIO-14 | Al liquidar o eliminar un colaborador, ¿se desactivan sus `EmpleadoBiometrico` en la misma transacción auditada? ¿Un colaborador `Liquidado` puede recibir permisos o faltas? ¿Qué pasa con los permisos `Pendiente` de un eliminado (se pueden aprobar o se cierran)? |
| D-05 | COL-10, NOV-05, COL-17, NOV-02 | ¿El área (`Empleado.area`) se deriva obligatoriamente del departamento del cargo, o solo se sugiere? ¿También al editar el cargo? ¿Cuenta un departamento inactivo? ¿Qué hacer con nombres de más de 100 caracteres? (Cambia la decisión de MEMORY 2026-10-06.) |
| D-06 | COL-13 | ¿Puede haber dos expedientes no eliminados con la misma cédula en un tenant? ¿La recontratación crea un expediente nuevo solo si el anterior está `Liquidado`? ¿Se aprueba un índice único filtrado, previa limpieza de duplicados? |
| D-07 | NOV-07 | ¿Las únicas transiciones válidas son `Pendiente→Aprobado` y `Pendiente→Rechazado`? ¿Se puede revertir un permiso aprobado? |
| D-08 | NOV-10 | ¿Los `dias` de un permiso se cuentan en días calendario o hábiles? ¿Se deben validar contra fechaInicio y fechaFin? |
| D-09 | COL-03 | ¿Quitar los botones Liquidar y Salario en `c66740d` fue intencional? |
| D-10 | COL-07 | ¿Se audita la consulta de detalles sensibles o se corrige el texto de la UI? |
| D-11 | COL-09 | ¿`documentos_gestionar` debe depender de `documentos_ver`? Si no, ¿se acepta exponer un indicador sin nombre de archivo (`tieneCertificado` y conteo de soportes)? |
| D-12 | COL-18, NOV-11, BIO-15 | ¿Se migran a `exigeVer` las secciones `empleados`, `permisos_laborales`, `faltas` y `biometrico` (con impacto y backfill en los roles existentes)? ¿Se exige el `.ver` en las rutas de mutación? ¿La pantalla se abre con el `.ver` de cualquier sección? |
| D-13 | BIO-03 | Mientras haya un solo MDB, ¿se impide una segunda fuente por tenant (reactivar la existente) o la fuente nueva arranca desde el último Logid importado? |
| D-14 | BIO-04 | ¿Se reemplazan los UNIQUE de `EmpleadoBiometrico` por índices filtrados `WHERE activo = 1` (migración nueva) o se crea un flujo de reasignación auditado? |
| D-15 | BIO-05 | Al asociar un ID, ¿se enlaza el histórico de marcaciones (todo o desde una fecha)? Si no, se corrigen los comentarios del schema. |
| D-16 | BIO-07 | ¿Qué política de retención o compactación se aplica a `SincronizacionBiometricoLog`, por ejemplo para las corridas `COMPLETADO` con 0 leídas? |
| D-17 | BIO-10 | ¿Qué significan en uso real CheckType 1 y 3? ¿El filtro "Salida" incluye el 1? (Registrar en MEMORY §11.) |
| D-18 | NOV-14 | ¿La migración `20261120160000_cargo_departamento` ya se aplicó en QA o producción? |
| D-19 | NOV-16 | ¿Puede quedar en `Auditoria.detalle` un tipo de permiso relacionado con salud ("Licencia Médica", "Cita Médica")? |
| D-20 | NOV-17 | ¿Se oculta la pestaña Comunicados hasta que exista la función? ¿Los comunicados futuros reutilizarán `Publicacion` y/o `correo-saliente`? |
| D-21 | COL-19 | ¿Cuáles son las listas oficiales de ciudades y departamentos de residencia? ¿Se valida la pareja? |
| D-22 | COL-15 | ¿Se aprueba un índice único filtrado `(empleadoId) WHERE tipo='CERTIFICADO_BANCARIO'`? |
| D-23 | BIO-17 | ¿Se evalúa declarar un modo de solo lectura en la cadena ODBC, después de probarlo contra un MDB real? |

---

## 5. Qué NO tocar

- `server/src/modules/gestion-liquidacion`: fuera de alcance (Plan de Producción).
- Migraciones históricas (`20260907120000`, `20260907130000`, `20261006100000`, y `20261120160000` si ya se aplicó). Toda corrección va en una migración nueva.
- No borrar ni debilitar pruebas para conseguir verde (`cargos.controller.test.ts`: actualizar las aserciones).
- Ya registrados y pendientes de decisión: SEC-09 (salario con `empleados.ver`), `take:1000` sin paginación, retención Ley 1581 (incluidos los detalles y archivos de eliminados), FK compuesta tenant-cargo, TOCTOU al crear o activar fuentes y SEC-13 (`FuenteBiometrica.nombre @unique` global).
- Patrón de upload (`crearUploadArchivo`, `moverArchivoDefinitivo`, `_tmp`, magic bytes) y descarga autenticada: aprobados.
- Regla de correo por cargo y no revalidar en el backend un correo ya guardado (MEMORY 2026-10-06). COL-11 solo toca la UI.
- No eliminar físicamente cargos ni entradas del catálogo de seguridad social (solo se desactivan). No reescribir los snapshots (`Empleado.cargo` y los nombres en `EmpleadoDetalle`).
- No inventar estados (PermisoLaboral: Pendiente/Aprobado/Rechazado), gravedades ni permisos (p. ej. `comunicados.*`). No crear otro sistema de correo o comunicados.
- No cambiar el modelo `exigeVer` sin decisión (D-12).
- CrossChex: acceso ODBC directo con una conexión corta por operación; cursor por Logid; interpolación de enteros acotados en lugar de parámetros ODBC; hora como componentes literales `Date.UTC`/`getUTC*`; CheckType=1 mapeado como `OTRO` con `checkType` crudo conservado; fallo cerrado con más de una fuente activa; candado global; índice filtrado `SincronizacionBiometricoLog_fuenteId_en_curso_uq`; nunca seleccionar `Pwd` ni usar `SELECT *`.
- Eliminación deliberada en `451c986` de la columna "Empleado en RicoSoft" y del interruptor "Solo sin asociar". Sin alerta automática por "sin marcaciones nuevas" (decisión 2026-11-20).
- `vite.config.ts` (plugin de TanStack Start gestionado por Lovable) y `.env`.

---

## 6. Verificaciones a ejecutar al implementar

```powershell
# Backend (desde C:\Users\server\RicoSoft\server)
npx vitest run src/modules/gestion-humana src/modules/departamentos src/lib/permisos-sync.test.ts src/lib/catalogo-permisos.test.ts
npx vitest run src/integrations/crosschex src/jobs/crosschex-recovery.test.ts src/jobs/crosschex-sync.job.test.ts
npm test                       # suite backend completa (gate de CI, ci.yml:50)
npm run typecheck
npm run lint
npm run build

# Prisma (solo si cambia schema o se agregan migraciones: F2-19, F2-21, F2-23, F2-24, D-22)
npx prisma validate
npx prisma generate
npm run test:integration       # contra una BD desechable; nunca contra producción
npm run test:integration:ci; npm run test:integration:gate   # sin omisiones

# Frontend (PowerShell con la letra de unidad en MAYÚSCULA para evitar el falso fallo de vitest)
Set-Location C:\Users\server\RicoSoft
npx vitest run src/lib/gestion-humana-alta.test.ts src/lib/gestion-humana-carga.test.ts src/lib/cargos.test.ts src/lib/solicitud-vigente.test.ts src/lib/config-negocio-permisos.test.ts src/lib/hora-reloj.test.ts src/components/gestion-humana
npm test
npm run typecheck
npm run lint
npm run build
```

Criterios de cierre:
- La suite backend vuelve a verde, sin pruebas borradas.
- Cada corrección de seguridad o multi-tenant (F1-03, F1-05, F1-12, F1-13) trae una prueba que demuestra el aislamiento.
- Cada cambio de transacción (F2-01 a F2-03) trae una prueba de "auditoría falla → sin cambios".
- MEMORY.md se actualiza solo al resolver D-05, D-17 y las demás decisiones permanentes.

---

*MEMORY.md no se actualizó: esta auditoría es de solo lectura. Las decisiones pendientes que, una vez tomadas, deben quedar en MEMORY son D-01, D-04, D-05, D-12, D-14 y D-17.*

---

## 7. Resultado de la Fase 1 (2026-11-20, sin despliegue ni commit)

**Implementado:** F1-01 (NOV-01), F1-02 (BIO-02), F1-03 (BIO-V-02), F1-04 (BIO-16), F1-06 (BIO-09), F1-07 (BIO-V-03), F1-08 con D-02 (COL-01), F1-10 (COL-V-02), F1-11 (COL-V-01), F1-12 con D-04 (COL-06, NOV-08, BIO-14, BIO-V-01), F1-13 (NOV-04) y F1-14 (NOV-03).

**D-01 (BIO-01), implementado como fallo cerrado:** el .mdb solo se lee para el tenant declarado en `CROSSCHEX_TENANT_PROPIETARIO_ID`. Sin esa variable no se sincroniza nada (job, manual ni CLI) y nadie ve nombres de usuarios del reloj. No se asignó propietario, y crear o activar fuentes no se bloqueó.

**No implementado:** F1-09 (COL-02), porque D-03 no tiene decisión.

**Verificación:**

| Prueba | Resultado |
|---|---|
| Backend `npx vitest run` | 122 archivos, 1278/1278 (con D-01) |
| Frontend `npx vitest run` | 27 archivos, 201/201 |
| `tsc --noEmit` (backend y frontend) | Limpio |
| ESLint sobre los archivos tocados | Limpio |
| `npm run build` (frontend) | Correcto |

Las pruebas de integración contra una BD desechable no se ejecutaron.

**Riesgos:**

- **D-02:** el alta responde 409 si el tenant no tiene `dominioCorporativo`. Hay que verificarlo en Ricol, Flexipack y Green antes de desplegar.
- **BIO-02:** una importación por CLI en otro proceso que dure más que `CROSSCHEX_SYNC_STALE_MINUTES` (15 min por defecto) es liberada por el servidor y se detiene sin perder el avance. Para importaciones largas, sube ese umbral o deshabilita el scheduler mientras corre.
- **Datos existentes:** los colaboradores ya guardados con un `empresaId` incorrecto no se corrigieron.
- **D-01:** con `CROSSCHEX_TENANT_PROPIETARIO_ID` vacío, la sincronización biométrica queda detenida al desplegar. Monitoreo lo muestra en cada ciclo.
- **Marcaciones previas a D-01:** las marcaciones ya importadas en un tenant distinto del propietario siguen visibles para ese tenant. Su limpieza requiere una decisión aparte.

## 8. Revisión adversarial del diff (Fase 1 + D-01)

Hubo 3 revisores (seguridad y multi-tenant, correctitud y concurrencia, alcance y pruebas), cada uno con un verificador que intentó refutar sus hallazgos. Resultado: 7 hallazgos, todos CONFIRMADOS y de severidad BAJA. No hubo ninguno ALTA ni MEDIA.

| Id | Hallazgo | Estado |
|---|---|---|
| COR-01 | La comprobación "sigue EN_CURSO" de cada lote era una lectura. La recuperación podía liberar la corrida a mitad de un lote, y dos corridas llegaban a escribir en paralelo (el cursor podía retroceder, sin perder ni duplicar marcaciones). | Corregido: la comprobación ahora es una escritura de progreso que bloquea la fila hasta que el lote se confirma. |
| COR-02 | Una corrida liberada después de su último lote devolvía COMPLETADO mientras su log quedaba FALLIDO. | Corregido: si el cierre no encuentra la fila EN_CURSO, la corrida informa FALLIDO. |
| ALC-01 | Las pruebas de atomicidad de D-04 y F1-10 pasaban también con el código anterior, que no era transaccional. | Corregido: las pruebas comprueban que las escrituras ocurren dentro de `$transaction` y que, si hay P2003, no se borra ningún archivo. |
| ALC-02 | MEMORY.md decía 404 para reactivar la asociación de un colaborador eliminado; el código responde 409. | Corregido en MEMORY.md (409 en ambos casos). |
| ALC-03 | La subpregunta de D-04 sobre los permisos `Pendiente` de un colaborador eliminado o liquidado no figuraba como pendiente. | Registrada como pendiente. No se tocó código. |
| ALC-04 | Se habían añadido `entidadTipo`/`entidadId` a las auditorías de liquidar y eliminar. Eso es parte de F2-01 (Fase 2, no autorizada). | Retirado. Queda para F2-01. |
| SEG-01 | `npm run explore-crosschex` lee el .mdb sin exigir propietario, aunque la documentación de D-01 decía que "nadie lee el .mdb". | Documentación corregida para describir el alcance real. **Decisión pendiente:** si el script también debe fallar cerrado. |

La revisión no encontró IDOR nuevos ni filtros de tenant faltantes en las consultas nuevas. Tampoco vio que D-02 pueda burlarse.

## 9. Decisiones D-03, D-04 (permisos pendientes) y SEG-01 (2026-11-20, sin despliegue ni commit)

| Decisión | Qué se implementó | Archivos |
|---|---|---|
| D-03 (F1-09 / COL-02) | Eliminar un estudio sin soportes: basta `empleados.detalles_editar`. Con soportes: se exige además `empleados.documentos_gestionar` (con sus prerrequisitos). La comprobación se hace dentro de la transacción, sobre la misma lectura de soportes; sin el permiso responde 403 y no borra nada. La auditoría registra solo la cantidad de soportes. En la UI, el botón queda visible pero deshabilitado, con la razón. | `empleado-detalles.controller.ts`, `empleado-detalles-dialog.tsx` |
| D-04, permisos pendientes | Al liquidar o eliminar, los permisos `Pendiente` del colaborador pasan a `Rechazado` (estado existente) en la misma transacción. No se borran, y la auditoría indica cuántos se cerraron. Con el colaborador liquidado o eliminado, cambiar un permiso a un estado distinto de `Rechazado` responde 409; esto cubre los pendientes anteriores al cambio. | `empleados.controller.ts`, `permisos-laborales.controller.ts` |
| SEG-01 | `scripts/explore-crosschex.ts` llama a `exigirPropietarioCrossChexConfigurado()` antes de abrir el .mdb. Exige que `CROSSCHEX_TENANT_PROPIETARIO_ID` esté configurada y sea el uuid de un Tenant existente; si no, falla cerrado. Se corrigió la documentación de `crosschex.config.ts` y `.env.example`. | `biometrico-import.service.ts`, `scripts/explore-crosschex.ts` |
| D-01 | El responsable configuró `CROSSCHEX_TENANT_PROPIETARIO_ID` en el `.env` del servidor con el tenant RICOL, dueño de la única fuente ("CrossChex Principal", 159.076 marcaciones). La sincronización se reanudó a las 2:26 p. m. del 20/11. | `server/.env` (no versionado) |
| D-04, botón Aprobar | La lista de permisos devuelve `colaboradorVigente`. Para colaboradores liquidados o eliminados, "Aprobar" aparece deshabilitado, con aviso visible y tooltip; "Rechazar" sigue habilitado. Además se corrigió el tooltip del botón de D-03, que no se veía porque el botón deshabilitado no recibe el puntero. | `permisos-laborales.controller.ts`, `src/lib/gestion-humana-permisos.ts`, `src/routes/gestion-humana.tsx`, `empleado-detalles-dialog.tsx` |

Pruebas nuevas:

- D-03: 403 sin borrar nada; sin soportes basta el permiso de detalles; la auditoría lleva la cantidad sin nombres.
- D-04: el cierre de pendientes, filtrado por tenant y colaborador y dentro de la transacción; la auditoría con y sin pendientes; el 409 al aprobar o reabrir con el colaborador liquidado o eliminado; se puede rechazar; un permiso de otro tenant da 404.
- SEG-01: sin variable; con un valor que no es uuid; con un uuid inexistente; con el propietario válido.

Verificación:

- backend `vitest`: 122 archivos, 1298/1298;
- frontend `vitest`: 28 archivos, 205/205;
- `npm run build`: OK;
- `tsc --noEmit` en ambos y `eslint` sobre los archivos tocados: limpios.

Pendiente: D-06 a D-23, la autorización de la Fase 2 y corregir el dominio del tenant Green (`greesolutions.com.co` frente a `greensolutions.com.co`): mientras no coincidan, D-02 bloquea el alta de colaboradores en Green. La verificación independiente (mutación y validación de hallazgos) quedó sin terminar: se detuvo porque el backend en vivo corre desde la carpeta de trabajo.
