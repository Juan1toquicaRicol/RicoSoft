# IMPORTACIONES_SCHEMA_RECONCILIATION.md

Auditoría de solo lectura. No se modificó `schema.prisma`, no se creó ninguna migración, no se modificó la base de datos de desarrollo, no se ejecutó `db push`, `migrate reset` ni ningún comando destructivo. Toda consulta contra la base de desarrollo (`saas_dev` en `192.168.0.100`, la que apunta `server/.env` → `DATABASE_URL`) fue de solo lectura (`INFORMATION_SCHEMA`, `sys.*`, `SELECT COUNT(*)`).

---

## 1. Estado actual (resumen)

Las 8 tablas de Importaciones **existen físicamente en la base de datos de desarrollo (`saas_dev`)**, con una estructura **idéntica, campo por campo, a lo declarado en `schema.prisma`**. Sin embargo, **ninguna migración de todo el historial del proyecto (ni las 9 commiteadas, ni la 1 sin commitear, ni mi corrección de `siesaCiaId`) crea, altera o siquiera menciona estas 8 tablas**. La tabla `_prisma_migrations` de `saas_dev` tampoco tiene registro de ellas.

**Conclusión directa**: las tablas se crearon con `prisma db push` (o equivalente que sincroniza DDL directo desde `schema.prisma` sin pasar por el historial de migraciones), en algún momento no registrado, casi con certeza en o antes del commit `164a2d5` (2026-08-26), que es cuando estos modelos aparecieron por primera vez en `schema.prisma` versionado en git. Esto **no es corrupción de datos ni drift accidental** — es una base de datos consistente con el schema actual, simplemente nunca capturada como migración reproducible.

---

## 2. Modelos afectados — estado en `schema.prisma`

### `ClasificacionArancelariaMatriz` (catálogo GLOBAL, sin tenantId — deliberado)
| Campo | Tipo Prisma | Nullable | Default | Notas |
|---|---|---|---|---|
| id | String @id @default(uuid()) | No | uuid() | PK |
| subpartida | String @db.VarChar(10) | No | — | `@unique` |
| descripcion | String @db.VarChar(500) | No | — | |
| tarifaArancelariaBase | Decimal @db.Decimal(9,4) | No | — | |
| requiereInvima | Boolean | No | false | |
| requiereIca | Boolean | No | false | |
| decretoReferencia | String? @db.VarChar(50) | Sí | — | |
| activo | Boolean | No | true | |
| createdAt | DateTime | No | now() | |

Índices: `@id` (id), `@unique` (subpartida), `@@index([activo])`. Sin `tenantId` — comentario explícito en el schema: la subpartida arancelaria es la misma para cualquier tenant del grupo.

### `OrdenCompraIntl`
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| tenantId | String | No | — |
| numeroOrden | String @db.VarChar(50) | No | — |
| incoterm | String @db.VarChar(10) | No | — |
| proveedorExtranjero | String @db.VarChar(255) | No | — |
| paisOrigen | String @db.VarChar(100) | No | — |
| moneda | String @db.VarChar(3) | No | — |
| trmPactada | Decimal @db.Decimal(18,4) | No | — |
| valorEstimadoTotal | Decimal @db.Decimal(18,2) | No | — |
| estado | String @db.VarChar(20) | No | "Borrador" |
| responsableId | String? | Sí | — |
| observaciones | String? @db.Text | Sí | — |
| eliminado | Boolean | No | false |
| createdAt | DateTime | No | now() |
| updatedAt | DateTime @updatedAt | No | — |

FK: `tenantId → Tenant.id` (NoAction), `responsableId → User.id` (NoAction). Índices: `@@index([tenantId, numeroOrden])`, `@@index([tenantId, estado])`. Relaciones salientes: `items[]`, `lotes[]`, `historial[]`.

### `ItemOrdenCompraIntl` (SIN tenantId — hereda vía `ordenCompraId`)
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| ordenCompraId | String | No | — |
| descripcion | String @db.VarChar(255) | No | — |
| subpartidaArancelariaId | String? | Sí | — |
| cantidad | Decimal @db.Decimal(18,4) | No | — |
| pesoKg | Decimal? @db.Decimal(18,4) | Sí | — |
| volumenM3 | Decimal? @db.Decimal(18,4) | Sí | — |
| valorUnitarioFob | Decimal @db.Decimal(18,4) | No | — |

FK: `ordenCompraId → OrdenCompraIntl.id` **onDelete: Cascade**, `subpartidaArancelariaId → ClasificacionArancelariaMatriz.id` (NoAction). Índice: `@@index([ordenCompraId])`.

### `LoteImportacion`
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| tenantId | String | No | — |
| ordenCompraId | String | No | — |
| blAwb | String @db.VarChar(100) | No | — |
| contenedor | String? @db.VarChar(50) | Sí | — |
| precinto | String? @db.VarChar(50) | Sí | — |
| puertoOrigen | String @db.VarChar(100) | No | — |
| puertoDestino | String @db.VarChar(100) | No | — |
| naviera | String? @db.VarChar(255) | Sí | — |
| fechaEmbarque | DateTime? | Sí | — |
| fechaLlegadaEstimada | DateTime? | Sí | — |
| fechaLlegadaReal | DateTime? | Sí | — |
| estado | String @db.VarChar(30) | No | "En tránsito" |
| createdAt | DateTime | No | now() |

FK: `tenantId → Tenant.id` (NoAction), `ordenCompraId → OrdenCompraIntl.id` (**sin onDelete explícito → default de Prisma = Restrict/NoAction según el conector**; en SQL Server real se refleja como `NO_ACTION`, ver §9 tabla de FKs). Índices: `@@index([tenantId, estado])`, `@@index([ordenCompraId])`. Relaciones salientes: `expediente?` (1:1), `costeos[]`.

### `ExpedienteAduanero` (1:1 con LoteImportacion vía `loteId @unique`)
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| tenantId | String | No | — |
| loteId | String **@unique** | No | — |
| numeroDIM | String? @db.VarChar(50) | Sí | — |
| fechaDIM | DateTime? | Sí | — |
| dimNombre/dimRuta/dimMime/dimTamano | String?/String?/String?/Int? | Sí | — |
| facturaComercialNombre/Ruta/Mime/Tamano | ídem | Sí | — |
| certificadoOrigenTlc | String? @db.VarChar(100) | Sí | — |
| certificadoOrigenNombre/Ruta/Mime/Tamano | ídem | Sí | — |
| fechaLevante | DateTime? | Sí | — |
| estado | String @db.VarChar(30) | No | "En trámite" |
| createdAt | DateTime | No | now() |

FK: `tenantId → Tenant.id` (NoAction), `loteId → LoteImportacion.id` (NoAction). Índices: `@unique` (loteId), `@@index([tenantId, estado])`. Relación saliente: `vistosBuenos[]`.

### `VistoBuenoAduanero` (⚠️ SIN tenantId propio — hereda vía `expedienteId`)
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| expedienteId | String | No | — |
| entidad | String @db.VarChar(50) | No | — |
| numero | String? @db.VarChar(50) | Sí | — |
| estado | String @db.VarChar(20) | No | "Pendiente" |
| archivoNombre/archivoRuta/archivoMime/archivoTamano | String?/String?/String?/Int? | Sí | — |
| fecha | DateTime? | Sí | — |

FK: `expedienteId → ExpedienteAduanero.id` **onDelete: Cascade**. Índice: `@@index([expedienteId])`. **Confirmado en la base real: efectivamente no tiene columna `tenantId`** — el diseño del código (`server/src/modules/importaciones/importaciones.controller.ts`, chequeo vía `expediente: { tenantId }`) es consistente con la estructura física real, no una suposición del schema.

### `CosteoImportacionDetalle`
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| tenantId | String | No | — |
| loteId | String | No | — |
| itemId | String | No | — |
| valorCifUsd | Decimal @db.Decimal(18,2) | No | — |
| trmLiquidacion | Decimal @db.Decimal(18,4) | No | — |
| valorCifCop | Decimal @db.Decimal(18,2) | No | — |
| arancelCop | Decimal @db.Decimal(18,2) | No | — |
| ivaTotalCop | Decimal @db.Decimal(18,2) | No | — |
| ivaDescontableCop | Decimal @db.Decimal(18,2) | No | 0 |
| ivaCapitalizableCop | Decimal @db.Decimal(18,2) | No | 0 |
| fletesNacionalesCop | Decimal @db.Decimal(18,2) | No | 0 |
| agenciamientoCop | Decimal @db.Decimal(18,2) | No | 0 |
| otrosCostosCop | Decimal @db.Decimal(18,2) | No | 0 |
| diferenciaCambioCop | Decimal @db.Decimal(18,2) | No | 0 |
| cantidad | Decimal @db.Decimal(18,4) | No | — |
| costoTotalCop | Decimal @db.Decimal(18,2) | No | — |
| costoUnitarioCop | Decimal @db.Decimal(18,4) | No | — |
| esProvisional | Boolean | No | true |
| fechaLiquidacion | DateTime | No | now() |
| liquidadoPorId | String? | Sí | — |

FK: `tenantId → Tenant.id` (NoAction), `loteId → LoteImportacion.id` (NoAction), `itemId → ItemOrdenCompraIntl.id` (NoAction), `liquidadoPorId → User.id` (NoAction). Índices: `@@index([tenantId, loteId])`, `@@index([itemId])`.

### `ImportacionHistorial` (SIN tenantId — hereda vía `ordenCompraId`)
| Campo | Tipo | Nullable | Default |
|---|---|---|---|
| id | String @id | No | uuid() |
| ordenCompraId | String | No | — |
| actor | String @db.VarChar(255) | No | — |
| accion | String @db.VarChar(255) | No | — |
| detalle | String? @db.Text | Sí | — |
| createdAt | DateTime | No | now() |

FK: `ordenCompraId → OrdenCompraIntl.id` **onDelete: Cascade**. Índice: `@@index([ordenCompraId])`.

---

## 3. Estado en migraciones (los 9 archivos commiteados + el nuevo de `siesaCiaId`)

```
$ grep -rhoE "CREATE TABLE \[dbo\]\.\[[A-Za-z]+\]" server/prisma/migrations/*/migration.sql | sort -u
```
24 tablas creadas en total (Auditoria, Colaborador, Contrato, CreditoCliente, Departamento, Empleado, Factura, FacturaHistorial, FaltaStrike, HistorialSalario, Membresia, Modulo, Notificacion, Pago, PermisoLaboral, PermisoUsuario, Proveedor, ProyeccionMensual, ReglaEnrutamiento, Rol, ServicioSuscripcion, SolicitudCompra, Tenant, User). **Ninguna de las 8 tablas de Importaciones aparece — ni en `CREATE TABLE`, ni en `ALTER TABLE`, en ningún archivo.** Confirmado con dos búsquedas independientes (grep de nombres de tabla exactos + grep de cada uno de los 8 nombres de modelo).

**`0_init` fue aplicada el 2026-08-13** (según `_prisma_migrations.finished_at` en `saas_dev`, ver §5) — es decir, es un baseline consolidado del estado de la base ANTES de que Importaciones existiera siquiera en `schema.prisma` (los modelos de Importaciones se añadieron a `schema.prisma` recién en el commit `164a2d5`, 2026-08-26, ver §4). Es coherente: `0_init` no podía incluir tablas que ni siquiera estaban diseñadas todavía.

---

## 4. Origen histórico identificado (Git)

```
$ git log --all --oneline -- server/prisma/schema.prisma
164a2d5 FIX: varias cosas
4f0208e Primer commit
44232bb Add compras history, self-service profile, and black/white/blue redesign
7593b33 Initial state before RicoSoft feature work (compras history, profile, redesign)
```

- **Antes de `164a2d5`, la carpeta `server/prisma/migrations/` NO estaba trackeada en git en absoluto** (`git ls-tree -r 659139b --name-only | grep prisma/migrations` → vacío). El proyecto gestionó su base de datos con migraciones **locales, generadas pero nunca commiteadas**, hasta que `164a2d5` las commiteó todas de una vez (9 archivos, 1562 líneas agregadas en total).
- **En ese MISMO commit `164a2d5`**, `schema.prisma` recibió un diff de 658 líneas que agrega, entre otros, los 8 modelos de Importaciones completos (`+model ClasificacionArancelariaMatriz`, `+model OrdenCompraIntl`, etc. — confirmado vía `git show 164a2d5 -- server/prisma/schema.prisma | grep '^+model '`).
- **El mensaje del commit es genérico** ("FIX: varias cosas") y no documenta la decisión de omitir la migración de Importaciones — no hay evidencia textual de que fuera intencional; todo apunta a que se usó `prisma db push` para materializar el schema rápidamente durante el desarrollo del módulo y nunca se volvió a generar la migración correspondiente antes de finalmente commitear la carpeta de migraciones.
- **No se encontró ningún script, documentación de proyecto (`AGENTS.md`, `README.md`) ni referencia en `package.json`/CI que invoque `prisma db push`** dentro del propio proyecto — las únicas coincidencias de "db push" en el repo son archivos de referencia genéricos de un skill de Prisma instalado como herramienta (`.agents/skills/prisma-cli/...`), no evidencia de uso real en este proyecto.
- **No es posible fechar el momento exacto del `db push`** desde `_prisma_migrations` (por diseño, `db push` no escribe ahí). La inferencia más razonable, dada la coincidencia con el commit `164a2d5`, es que ocurrió en o alrededor del 2026-08-26.

---

## 5. Estado en la base de datos de desarrollo (`saas_dev`, verificado por lectura directa)

### 5.1 Las 8 tablas existen, con estructura idéntica a `schema.prisma`
Consulta ejecutada (`INFORMATION_SCHEMA.TABLES`) confirma las 8 tablas presentes. Se extrajeron y compararon **columna por columna, tipo, nullable, default, precisión decimal** (`INFORMATION_SCHEMA.COLUMNS`), **PK/unique/índices con su filtro** (`sys.indexes` + `sys.index_columns`), y **FKs con su acción de borrado** (`sys.foreign_keys`). Resultado: **coincidencia exacta, campo por campo, con lo documentado en §2** — no se encontró ninguna columna extra, faltante, ni de tipo/nullable/default distinto.

### 5.2 `_prisma_migrations` en `saas_dev`
```
0_init                                                  2026-08-13 17:29:17  (0 pasos — baseline)
20260813140727_solicitudes_solicitante_cotizacion       2026-08-13 19:07:33
20260813144251_rol_activo_user_token_version            2026-08-13 19:42:54
20260813150902_auditoria_estructurada_notificaciones    2026-08-13 20:09:04
20260813153419_proveedores                              2026-08-13 20:34:21
20260813161208_responsables_y_proveedor_servicios       2026-08-13 21:12:11
20260813164632_pagos_y_relacion_servicio_factura        2026-08-13 21:46:34
20260826203752_tenant_siesa_cia_id                      2026-08-26 20:38:06
20260826210921_membresias                               2026-08-26 21:09:42
20260826215604_tenant_dominio_activo                    2026-08-26 21:58:01  (3 intentos previos fallidos/rollback, éxito al 4º)
```
**Exactamente las 9 migraciones commiteadas + la 1 sin commitear — ninguna entrada para Importaciones.** Esta es la evidencia definitiva de que las tablas se crearon fuera del flujo `migrate dev`/`migrate deploy`: `db push` sincroniza el DDL directamente y **por diseño nunca escribe en `_prisma_migrations`**.

### 5.3 Datos reales existentes (no es un schema vacío sin usar)
```
OrdenCompraIntl            1 fila
ItemOrdenCompraIntl        1 fila
ImportacionHistorial       2 filas
LoteImportacion            0 filas
ExpedienteAduanero         0 filas
VistoBuenoAduanero         0 filas
CosteoImportacionDetalle   0 filas
ClasificacionArancelariaMatriz  0 filas
```
Alguien creó **una** orden de compra internacional real con **un** ítem (probablemente probando el formulario de creación desde el frontend), lo que generó 2 entradas de historial. **Nadie llegó a registrar un lote, expediente, visto bueno ni costeo con datos reales** — el flujo profundo del módulo nunca se ejerció fuera de código y pruebas manuales superficiales.

### 5.4 Contexto: `saas_dev` tiene 33 tablas en total (24 de migraciones + 8 de Importaciones + 1 más — probablemente una tabla de sistema o un remanente no identificado en este alcance; no se investigó más allá porque no es relevante para Importaciones).

---

## 6. Relaciones y FKs — verificadas contra la base real (`sys.foreign_keys`)

```
CosteoImportacionDetalle.itemId         → ItemOrdenCompraIntl.id       NO_ACTION
CosteoImportacionDetalle.liquidadoPorId → User.id                     NO_ACTION
CosteoImportacionDetalle.loteId         → LoteImportacion.id          NO_ACTION
CosteoImportacionDetalle.tenantId       → Tenant.id                   NO_ACTION
ExpedienteAduanero.loteId               → LoteImportacion.id          NO_ACTION
ExpedienteAduanero.tenantId             → Tenant.id                   NO_ACTION
ImportacionHistorial.ordenCompraId      → OrdenCompraIntl.id          CASCADE
ItemOrdenCompraIntl.ordenCompraId       → OrdenCompraIntl.id          CASCADE
ItemOrdenCompraIntl.subpartidaArancelariaId → ClasificacionArancelariaMatriz.id  NO_ACTION
LoteImportacion.ordenCompraId           → OrdenCompraIntl.id          NO_ACTION
LoteImportacion.tenantId                → Tenant.id                   NO_ACTION
OrdenCompraIntl.responsableId           → User.id                     NO_ACTION
OrdenCompraIntl.tenantId                → Tenant.id                   NO_ACTION
VistoBuenoAduanero.expedienteId         → ExpedienteAduanero.id       CASCADE
```
**Coincide exactamente** con lo declarado en `schema.prisma` (`onDelete: Cascade` en los 3 casos documentados en §2, `NoAction`/sin especificar en el resto). La cadena completa `OrdenCompraIntl → ItemOrdenCompraIntl / LoteImportacion → ExpedienteAduanero → VistoBuenoAduanero` y `LoteImportacion → CosteoImportacionDetalle` está íntegra, con todas las FKs presentes y ninguna huérfana.

Índices verificados (`sys.indexes`): todos los `@@index`/`@unique`/`@id` de §2 están presentes en la base real, sin excepción y sin índices adicionales no documentados.

---

## 7. Multi-tenancy — cuáles tablas tienen `tenantId` propio vs. heredado

| Tabla | `tenantId` propio | Cómo se aísla si no lo tiene |
|---|---|---|
| `OrdenCompraIntl` | ✅ Sí | — |
| `LoteImportacion` | ✅ Sí | — |
| `ExpedienteAduanero` | ✅ Sí | — |
| `CosteoImportacionDetalle` | ✅ Sí | — |
| `ItemOrdenCompraIntl` | ❌ No | Vía `ordenCompraId → OrdenCompraIntl.tenantId` |
| `ImportacionHistorial` | ❌ No | Vía `ordenCompraId → OrdenCompraIntl.tenantId` |
| `VistoBuenoAduanero` | ❌ No | Vía `expedienteId → ExpedienteAduanero.tenantId` — **el único caso de dos saltos** en vez de uno (`VistoBuenoAduanero → ExpedienteAduanero → tenantId` directo, sin pasar por Lote/Orden) |
| `ClasificacionArancelariaMatriz` | ❌ No (deliberado) | Catálogo global, no aplica aislamiento por tenant |

Confirmado que esto **coincide exactamente con la estructura física real** (§5.1) — no es una interpretación del schema, es lo que la base de datos tiene hoy. El patrón de verificación usado en el código de `9f798d4` (`prisma.vistoBuenoAduanero.findFirst({ where: { id, expediente: { tenantId } } })`) es correcto para esta estructura.

---

## 8. Comparación contra la implementación de `9f798d4`

Se verificó, campo por campo, que **cada columna referenciada por los 8 endpoints nuevos de `importaciones.controller.ts`** (`numeroDIM`, `fechaDIM`, `certificadoOrigenTlc`, `fechaLevante`, `estado`, `dimNombre/Ruta/Mime/Tamano`, `facturaComercialNombre/Ruta/Mime/Tamano`, `certificadoOrigenNombre/Ruta/Mime/Tamano` en `ExpedienteAduanero`; `entidad`, `numero`, `estado`, `archivoNombre/Ruta/Mime/Tamano`, `fecha`, `expedienteId` en `VistoBuenoAduanero`) **existe físicamente en `saas_dev` con el tipo y nullability exactos que el código espera.**

**Conclusión importante para la decisión de la migración**: el código de `9f798d4` ya es 100% compatible con la base de datos real tal como existe hoy. El problema NO es que el schema esté mal diseñado o que falte algo funcionalmente — es exclusivamente que **no existe un archivo de migración reproducible** que permita recrear ese mismo estado en una base de datos nueva (CI, un desarrollador nuevo, un entorno de staging futuro). La migración que se cree después de este documento debe reproducir **exactamente** la estructura ya documentada en §2/§5/§6 — no una versión "suficiente para pasar el test", sino la misma estructura que el módulo ya usa en desarrollo.

---

## 9. Riesgos

| Riesgo | Severidad | Detalle |
|---|---|---|
| Sin migración reproducible para 8 tablas en uso activo | **Alto** | Cualquier entorno nuevo (CI, onboarding, staging, disaster recovery) que dependa de `prisma migrate deploy` no tendrá estas tablas — exactamente lo que expuso el job `backend-integration`. |
| Datos reales ya existentes en `saas_dev` (1 orden, 1 ítem, 2 historial) | Medio | La migración que se cree debe ser **aditiva** (`CREATE TABLE IF NOT EXISTS` no es necesario en SQL Server porque Prisma no lo genera así, pero si algún día esta migración se aplica CONTRA `saas_dev` con `migrate deploy`, Prisma la marcaría como pendiente y probablemente fallaría con "tabla ya existe" — hay que decidir explícitamente cómo reconciliar `saas_dev` con la nueva migración sin perder esos datos ni duplicar tablas; no es un problema para la base efímera de CI, que siempre parte vacía). |
| Migración pendiente sin commitear (`20260826215604_tenant_dominio_activo`) ya aplicada en `saas_dev` pero no en git | Medio (ya documentado en auditorías previas, no es nuevo) | Mismo patrón de raíz: cambios aplicados directo a la base de desarrollo sin pasar siempre por migraciones commiteadas. Reforzado por este hallazgo — no es un caso aislado. |
| Nombre de constraints/índices generados a mano podría no coincidir con lo que Prisma generaría automáticamente si se usa `prisma migrate dev` en vez de escribir el SQL a mano | Bajo | Mitigable copiando exactamente los nombres reales confirmados en §5.1/§6 (ya extraídos), no adivinándolos. |
| Ninguna prueba end-to-end había verificado esto hasta ahora | Informativo | Confirma el valor del job `backend-integration`: expuso en su primera corrida real un problema de 2+ días de antigüedad que ninguna otra herramienta del proyecto podía detectar. |

---

## 10. Recomendación

1. **Generar la migración a partir del estado REAL de `saas_dev`** (documentado exhaustivamente en §2/§5/§6 de este documento), no reconstruirla únicamente leyendo `schema.prisma` — así se garantiza que coincide con lo que el módulo ya usa en producción/desarrollo, no solo con lo que el DSL de Prisma "debería" generar.
2. **Decidir explícitamente** (antes de crear la migración) **cómo tratar `saas_dev`**: ¿se marca la nueva migración como ya aplicada ahí (`prisma migrate resolve --applied`, sin tocar los datos) para no intentar recrear tablas que ya existen? Esta es una decisión de producto/infraestructura, no técnica — la dejo señalada, no resuelta.
3. La base efímera de CI (`backend-integration`) no tiene este problema — parte vacía en cada corrida, así que la nueva migración simplemente la creará limpio.
4. No se requiere ningún cambio a `schema.prisma` — ya está correcto y ya coincide con la base real.

---

## Resumen ejecutivo

**Qué pasó**: los 8 modelos de Importaciones se agregaron a `schema.prisma` en el commit `164a2d5` (2026-08-26) y se materializaron directamente en la base de datos de desarrollo (`saas_dev`) mediante `prisma db push` (evidencia: existen físicamente con estructura idéntica al schema, pero cero rastro en `_prisma_migrations`) — nunca se generó la migración correspondiente. La carpeta de migraciones en sí no se empezó a trackear en git hasta ese mismo commit, así que este no es un caso aislado sino un patrón de cómo se gestionó el schema antes de esta sesión.

**Qué NO es**: no es corrupción, no es drift accidental entre entornos, no es un bug de diseño del schema. La estructura real coincide, columna por columna, índice por índice, FK por FK, con lo que `schema.prisma` declara hoy — y con lo que el código de `9f798d4` espera. El único déficit es la ausencia de un archivo de migración reproducible.

**Qué hay en juego**: hay datos reales (aunque mínimos: 1 orden, 1 ítem) en `saas_dev` que hay que tener en cuenta al decidir cómo aplicar la futura migración ahí — no así en la base efímera de CI, que puede recibirla sin ninguna consideración especial.

**Siguiente paso** (pendiente de tu decisión, no ejecutado): generar una migración cuyo DDL reproduzca exactamente el estado documentado en este archivo, y decidir separadamente cómo reconciliar esa migración con `saas_dev` sin perder los datos existentes.
