# IMPORTACIONES_MIGRATION_PLAN.md

Diseño validado empíricamente, **no ejecutado todavía contra `saas_dev` ni contra ningún entorno compartido**. `schema.prisma` no se tocó. No se hizo commit ni push. Toda validación se corrió contra bases de datos desechables, creadas y destruidas en la instancia local `SQLEXPRESS` de esta máquina (nunca contra `192.168.0.100`/`saas_dev`, salvo las consultas de solo lectura ya documentadas en `IMPORTACIONES_SCHEMA_RECONCILIATION.md`).

---

## 1. Problema

`schema.prisma` declara 8 modelos de Importaciones que físicamente existen en la base de datos de desarrollo (`saas_dev`) con datos reales, pero ninguna migración de todo el historial del proyecto los crea. `prisma migrate deploy` sobre una base nueva (CI, un clon del repo) no crea estas tablas — confirmado en dos corridas reales de `backend-integration`.

## 2. Causa raíz

Documentada exhaustivamente en `IMPORTACIONES_SCHEMA_RECONCILIATION.md`: los modelos se materializaron en `saas_dev` vía `prisma db push` (evidencia: estructura idéntica a `schema.prisma`, cero rastro en `_prisma_migrations`), en o alrededor del commit `164a2d5` (2026-08-26), y nunca se generó la migración correspondiente.

## 3. DDL actual (fuente: `saas_dev`, verificado por lectura directa, no por schema.prisma solamente)

El DDL de la migración propuesta (§5) se construyó cruzando tres fuentes, no solo una:
1. `schema.prisma` (qué debería existir conceptualmente).
2. `INFORMATION_SCHEMA.COLUMNS` + `sys.indexes`/`sys.index_columns` + `sys.foreign_keys` de `saas_dev` (qué existe físicamente — columnas, tipos, nullable, defaults, precisión decimal, nombres exactos de constraints/índices, y **ambas** acciones de FK: `delete_referential_action_desc` y `update_referential_action_desc`, esta última no se había extraído en la reconciliación anterior y se completó ahora).
3. El estilo sintáctico exacto de las 10 migraciones ya commiteadas (`0_init`, `20260813153419_proveedores`, etc.) — nombres de constraint `TableName_column_df`/`_pkey`/`_key`/`_fkey`/`_idx`, uso de `CURRENT_TIMESTAMP` (equivalente confirmado a `(getdate())` almacenado), estructura `BEGIN TRY/BEGIN TRAN...COMMIT TRAN/END TRY/BEGIN CATCH/ROLLBACK/THROW/END CATCH`.

Las 14 FKs con ambas acciones (delete/update), extraídas de `saas_dev`:

```
OrdenCompraIntl.tenantId         → Tenant.id                    NO_ACTION / CASCADE
OrdenCompraIntl.responsableId    → User.id                      NO_ACTION / NO_ACTION
ItemOrdenCompraIntl.ordenCompraId→ OrdenCompraIntl.id            CASCADE   / CASCADE
ItemOrdenCompraIntl.subpartidaArancelariaId → ClasificacionArancelariaMatriz.id  NO_ACTION / NO_ACTION
LoteImportacion.tenantId         → Tenant.id                    NO_ACTION / NO_ACTION
LoteImportacion.ordenCompraId    → OrdenCompraIntl.id            NO_ACTION / CASCADE
ExpedienteAduanero.tenantId      → Tenant.id                    NO_ACTION / NO_ACTION
ExpedienteAduanero.loteId        → LoteImportacion.id            NO_ACTION / CASCADE
VistoBuenoAduanero.expedienteId  → ExpedienteAduanero.id         CASCADE   / CASCADE
CosteoImportacionDetalle.tenantId→ Tenant.id                    NO_ACTION / NO_ACTION
CosteoImportacionDetalle.loteId  → LoteImportacion.id            NO_ACTION / NO_ACTION
CosteoImportacionDetalle.itemId  → ItemOrdenCompraIntl.id        NO_ACTION / NO_ACTION
CosteoImportacionDetalle.liquidadoPorId → User.id                NO_ACTION / NO_ACTION
ImportacionHistorial.ordenCompraId → OrdenCompraIntl.id           CASCADE   / CASCADE
```

## 4. Estrategia Prisma (investigada, no inventada)

Consulté la referencia oficial de Prisma CLI (`prisma-cli` skill, `references/migrate-resolve.md` y `references/migrate-diff.md`) antes de diseñar nada. Confirma exactamente el escenario:

> **Baselining**: "If you have existing tables and want to initialize migrations without running the SQL: `prisma migrate resolve --applied <migration_name>`. This tells Prisma 'Assume this migration has already run'." — listado explícitamente como caso de uso #1: *"Adopting Prisma Migrate on an existing production database."*

Esto es exactamente lo que necesitamos, con nombre oficial: nuestra situación es un caso de libro de **baselining**. La estrategia tiene dos caminos que **no se excluyen, se complementan** (no hubo que elegir uno inventado):

| Escenario | Comando/mecanismo | Qué hace |
|---|---|---|
| Base **nueva** (CI, clon nuevo) | `prisma migrate deploy` (sin cambios, el flujo normal) | Aplica las 11 migraciones en orden, incluida la nueva — **ejecuta el SQL real**, crea las 8 tablas desde cero. |
| Base **existente** con las tablas ya creadas (`saas_dev`) | `prisma migrate resolve --applied 20260828140000_importaciones_baseline` | Inserta una fila en `_prisma_migrations` marcando la migración como aplicada — **nunca ejecuta el SQL**, no toca ningún objeto ni dato existente. |

No se descartó ninguna alternativa por descarte arbitrario: `migrate diff --from-migrations --to-schema` (para generar el SQL automáticamente) requiere una shadow database con conexión TCP real, que no está disponible en este entorno (mismo bloqueo de siempre — SQLEXPRESS sin TCP, sin Docker). Por eso el DDL se construyó a partir de la fuente de verdad real (`saas_dev`, §3) en vez de generarse con esa herramienta — pero es el mismo resultado que esa herramienta habría producido, verificado por comparación directa contra la base real, no por aproximación.

**No se falsifica el historial de Prisma**: `migrate resolve --applied` es el mecanismo oficial y documentado para exactamente este caso — no es un truco ni un workaround.

## 5. Migración propuesta

Archivo creado (no commiteado): `server/prisma/migrations/20260828140000_importaciones_baseline/migration.sql`.

Contenido: 8 `CREATE TABLE`, 11 `CREATE INDEX` (no-únicos; los 2 únicos van inline en el `CREATE TABLE` correspondiente — `ClasificacionArancelariaMatriz_subpartida_key`, `ExpedienteAduanero_loteId_key`), 14 `ALTER TABLE ADD CONSTRAINT ... FOREIGN KEY`, envuelto en la misma estructura transaccional `BEGIN TRY/TRAN...CATCH/ROLLBACK/THROW` que las 10 migraciones anteriores. El archivo incluye un comentario explícito en la cabecera documentando que es un baseline retroactivo y que NO debe ejecutarse tal cual sobre una base donde las tablas ya existen.

## 6. Comportamiento sobre base nueva — **validado empíricamente, no solo diseñado**

**Método**: sin Docker ni TCP disponibles (bloqueos ya documentados en turnos anteriores), usé la instancia `SQLEXPRESS` local vía `sqlcmd -E` (autenticación integrada de Windows, sin necesidad de TCP) para crear una base desechable y ejecutar las 11 migraciones en orden real, una por una, con el mismo SQL que usaría `prisma migrate deploy`.

```
CREATE DATABASE ricosoft_migtest_fresh
→ aplicar 0_init ... 20260826210921_membresias ... 20260827200000_fix_tenant_siesacia_id_filtered_unique
→ aplicar 20260828140000_importaciones_baseline
```

Resultado real:
- **8/8 tablas de Importaciones creadas** (`INFORMATION_SCHEMA.TABLES`).
- **14/14 FKs presentes** (`sys.foreign_keys`, conteo exacto contra lo esperado).
- **11/11 índices no-únicos presentes** (`sys.indexes`).
- **Insert real de prueba**: creé un `Tenant` + `OrdenCompraIntl` + `ImportacionHistorial` reales → `estado` tomó el default `'Borrador'` correctamente, `eliminado` tomó `0` correctamente, la relación `ordenCompraId` funcionó.
- **La FK realmente rechaza datos inválidos**: intenté insertar una `OrdenCompraIntl` con un `tenantId` inexistente → SQL Server la rechazó con `"The INSERT statement conflicted with the FOREIGN KEY constraint OrdenCompraIntl_tenantId_fkey"` — la integridad referencial es real, no solo declarada.
- Base desechable destruida al final (`DROP DATABASE`), sin rastro.

**Nota aparte, no bloqueante**: al aplicar `20260827200000_fix_tenant_siesacia_id_filtered_unique` (mi migración anterior de `siesaCiaId`) por este mismo método manual, `sqlcmd` reportó `Msg 1934: CREATE INDEX failed... QUOTED_IDENTIFIER`. Es una particularidad de la sesión por defecto de `sqlcmd` (los índices filtrados de SQL Server requieren `SET QUOTED_IDENTIFIER ON`), **no un defecto de esa migración** — la prueba de que funciona correctamente ya existe: esa misma migración se aplicó dos veces con éxito en CI real vía `prisma migrate deploy` (que sí configura esa sesión correctamente), y los 2 tests de `siesaCiaId` pasaron contra esa base. No afectó esta validación: la migración de Importaciones se aplicó sin ningún error inmediatamente después.

## 7. Comportamiento sobre base existente — **validado empíricamente**

Reproduje el estado de `saas_dev` en una segunda base desechable:

1. Apliqué las migraciones 1-9 (hasta antes de Importaciones).
2. Simulé el `db push` original ejecutando directamente el `CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ADD CONSTRAINT` de la nueva migración (sin registrarla en ningún lado — igual que ocurrió realmente).
3. Inserté los mismos 4 registros que existen en `saas_dev` (1 `OrdenCompraIntl`, 1 `ItemOrdenCompraIntl`, 2 `ImportacionHistorial`), con IDs fijos y rastreables.
4. Creé `_prisma_migrations` con el esquema exacto de Prisma (verificado contra la columna real de `saas_dev`: `id VARCHAR(36)`, `checksum VARCHAR(64)`, `finished_at DATETIMEOFFSET`, `migration_name NVARCHAR(250)`, `logs NVARCHAR(MAX)`, `rolled_back_at DATETIMEOFFSET`, `started_at DATETIMEOFFSET DEFAULT getdate()`, `applied_steps_count INT DEFAULT 0`).
5. Inserté la fila que `prisma migrate resolve --applied 20260828140000_importaciones_baseline` insertaría (con el checksum SHA-256 real del archivo de migración: `02c58715be30326a6d11a65951ef484659b9c53fbf13a5427fa88d5ec6b276b1`), **sin volver a ejecutar el SQL de creación**.

**Resultado real**:
- Los 4 registros siguen exactamente igual (mismo `numeroOrden='ORD-REAL-1'`, `estado='Borrador'`, `valorEstimadoTotal=500000.00`, `cantidad=10`, ambas entradas de historial con su `actor`/`accion` originales) — **verificado consultándolos de nuevo por su ID después del "resolve" simulado**.
- `_prisma_migrations` quedó con la fila correcta (`migration_name='20260828140000_importaciones_baseline'`, `applied_steps_count=1`, `finished_at` con timestamp, `rolled_back_at=NULL`).
- **Demostré por qué el "resolve" es necesario y no opcional**: intenté re-ejecutar el SQL completo de la migración sobre esta misma base (simulando qué pasaría si alguien corriera `migrate deploy` normal en vez de `resolve`) → falló limpiamente con `"There is already an object named 'ClasificacionArancelariaMatriz' in the database"`. La propia transacción `BEGIN TRAN/ROLLBACK` de la migración protegió los datos: **los 4 registros seguían intactos después del intento fallido** (verificado con conteos: 1/1/2, sin cambios).
- Base desechable destruida al final.

## 8. Estrategia de preservación de datos

Ya demostrada en §7: el mecanismo (`migrate resolve --applied`) **nunca ejecuta DDL ni DML** — solo inserta una fila de metadatos en `_prisma_migrations`. No hay ventana en la que los datos de `saas_dev` estén en riesgo, porque el comando no toca ninguna de las 8 tablas ni ninguna otra.

## 9. Estrategia de registro en `_prisma_migrations`

- **Bases nuevas**: `prisma migrate deploy` inserta la fila automáticamente al ejecutar el SQL real, exactamente igual que las 10 migraciones anteriores.
- **`saas_dev`**: requiere ejecutar explícitamente, en un paso separado y deliberado (no automático, no parte de este plan hasta que se apruebe):
  ```
  npx prisma migrate resolve --applied 20260828140000_importaciones_baseline
  ```
  contra `DATABASE_URL` apuntando a `saas_dev`. Este comando por sí solo no requiere que `schema.prisma` cambie ni que se ejecute ningún otro comando.

## 10. Plan de pruebas

| Prueba | Estado |
|---|---|
| Estructura completa (8 tablas/14 FKs/11 índices) sobre base nueva | ✅ **Ejecutada y verificada** (§6) |
| Defaults e integridad referencial real (insert válido + insert rechazado) sobre base nueva | ✅ **Ejecutada y verificada** (§6) |
| Preservación de datos existentes al "resolver" sobre una base con las tablas ya creadas | ✅ **Ejecutada y verificada** (§7) |
| Que re-ejecutar el DDL sobre una base existente falla de forma segura (sin corromper datos) | ✅ **Ejecutada y verificada** (§7) |
| Multi-tenancy: FKs/índices hacia `Tenant`, cadena `VistoBuenoAduanero → ExpedienteAduanero → tenantId` | ✅ Verificada estructuralmente en §6/§7 (las FKs correctas están presentes) y ya demostrada como código funcional contra SQL Server real en la corrida de CI del commit `685c175` (ver §11) |
| Los 11 tests de integración de Vitest (incluidos los 9 de Importaciones) corriendo contra la base recién migrada | ⏳ **Pendiente** — requiere `prisma` + Node conectándose vía TCP, que este entorno local no puede dar (mismo bloqueo de siempre: SQLEXPRESS sin TCP, sin admin para habilitarlo; sin Docker). Es exactamente lo que el job `backend-integration` de CI puede validar, y es el único paso de este plan que sigue pendiente de una corrida real. |
| `prisma migrate resolve --applied` ejecutado literalmente (no simulado) contra `saas_dev` | ⏳ **Pendiente**, deliberadamente no ejecutado — requiere tu aprobación explícita antes de tocar esa base (instrucción §6 de tu mensaje anterior, respetada) |

## 11. Multi-tenancy — verificación repetida en este plan

Sin cambios respecto a `IMPORTACIONES_SCHEMA_RECONCILIATION.md` §7 (no se modificó el modelo). Confirmado de nuevo aquí, ahora también contra la base de prueba recién creada en §6: las FKs `OrdenCompraIntl.tenantId`, `LoteImportacion.tenantId`, `ExpedienteAduanero.tenantId`, `CosteoImportacionDetalle.tenantId` → `Tenant.id` están presentes y activas (probado rechazando un `tenantId` falso). La cadena `VistoBuenoAduanero.expedienteId → ExpedienteAduanero.id (CASCADE) → ExpedienteAduanero.tenantId` está íntegra — la FK `VistoBuenoAduanero_expedienteId_fkey` se creó y verificó en el conteo de 14 FKs de §6.

## 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Ejecutar `migrate deploy` normal (no `resolve`) por error contra `saas_dev` | Alto si ocurriera | Ya demostrado en §7 que Prisma/SQL Server lo rechazaría con error claro (objeto ya existe) y haría rollback automático — no corrompe datos, pero sí requiere que el procedimiento de despliegue documente explícitamente usar `resolve`, no `deploy`, la primera vez contra esa base. |
| Migración pendiente sin commitear (`20260826215604_tenant_dominio_activo`) interfiere con el orden | Bajo | Mi migración nueva (`20260828140000`) ordena después de todo lo commiteado; no depende de esa migración pendiente ni la modifica. |
| Checksum de `migrate resolve --applied` no coincide si el archivo se edita después de aplicarlo en CI/otros entornos | Medio | Una vez este archivo se commitee y se aplique en cualquier entorno (CI incluido), no debe editarse — mismo principio que las otras 10 migraciones. |
| No pude ejecutar la suite completa de Vitest localmente (bloqueo de TCP) | Medio | Sigue pendiente de la corrida real en `backend-integration`; toda la validación estructural y de integridad de datos SÍ se hizo con evidencia real, solo falta la capa de aplicación (Prisma Client + código de negocio) que ya se demostró funcionando en CI para el resto del módulo. |

## 13. Procedimiento de rollback

- **Si algo sale mal en una base NUEVA (CI)**: la transacción `BEGIN TRAN/COMMIT TRAN` con `BEGIN CATCH/ROLLBACK/THROW` de la propia migración revierte automáticamente cualquier cambio parcial — demostrado en §7 (el intento fallido de re-ejecución no dejó nada a medias).
- **Si `migrate resolve --applied` se ejecuta por error contra la base equivocada**: es reversible — `prisma migrate resolve --rolled-back <nombre>` revierte el marcado (documentado en la referencia oficial de Prisma leída en §4), sin haber tocado ningún dato porque `resolve` nunca ejecuta DDL/DML.
- **Si se necesita deshacer la migración en sí sobre una base nueva** (antes de que tenga datos importantes): `DROP TABLE` en orden inverso de dependencias (VistoBuenoAduanero → ExpedienteAduanero → CosteoImportacionDetalle → LoteImportacion → ItemOrdenCompraIntl → OrdenCompraIntl → ClasificacionArancelariaMatriz) + `DELETE FROM _prisma_migrations WHERE migration_name = '20260828140000_importaciones_baseline'`. No se necesita en este momento — es un procedimiento de referencia, no una acción planeada.

---

## Resumen ejecutivo

La migración `20260828140000_importaciones_baseline` está **escrita y validada empíricamente dos veces** contra bases de datos SQL Server reales y desechables (local, `SQLEXPRESS`, nunca `saas_dev`): una vez simulando una instalación nueva (8 tablas, 14 FKs, 11 índices, defaults e integridad referencial todos correctos, con inserts reales) y otra vez simulando la reconciliación con `saas_dev` (los 4 registros existentes sobreviven intactos, el mecanismo de baseline queda correctamente registrado, y se demostró por qué re-ejecutar el SQL directamente sobre esa base fallaría — justificando por qué `migrate resolve --applied` es el paso correcto, no una elección arbitraria).

**Lo único que falta de evidencia real** es correr la suite completa de Vitest (los 11 tests de integración, incluido el crítico de `VistoBuenoAduanero`) contra una base recién migrada con este archivo — bloqueado localmente por la misma limitación de siempre (sin TCP/Docker disponibles aquí), pendiente de la próxima corrida de `backend-integration` en CI una vez apruebes commitear esto.

**No se ha tocado `saas_dev`, no se ha hecho commit, no se ha hecho push, no se modificó `schema.prisma`, no se tocaron endpoints, frontend, lint ni nada de Importaciones fuera de esta migración.**

Quedo esperando tu revisión antes de continuar.
