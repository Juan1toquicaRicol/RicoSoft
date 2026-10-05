# Propuesta: alineación entre las 66 migraciones y `schema.prisma`

Fecha: 2026-10-05 · Estado: **PROPUESTA — pendiente de autorización** (cambio estructural).
No se editó ninguna migración histórica, no se creó nada en `prisma/migrations/` y no se tocó `saas_dev`.

## 1. Cómo se obtuvo el diff

- BD desechable `ricosoft_it_novedades_20261005` (SQL Server Express local), creada vacía y migrada con `prisma migrate deploy` (66 migraciones, todas aplicadas sin error).
- Comando (solo lectura): `prisma migrate diff --from-url <esa BD> --to-schema-datamodel prisma/schema.prisma --script`.
- `schema.prisma` en el árbol de trabajo (solo difiere de HEAD en 5 líneas de `@@index`).
- Salida completa: [anexo-diff-migraciones-vs-schema-2026-10-05.sql](anexo-diff-migraciones-vs-schema-2026-10-05.sql) (anexo documental, **no ejecutable**).
- **No** se comparó contra `saas_dev` (restricción). Qué tiene realmente `saas_dev` es NO VERIFICADO EN EL REPOSITORIO (ver §6).

## 2. Resumen del diff completo (506 líneas)

| Categoría | Cantidad | ¿Rompe código hoy? | Tratamiento propuesto |
|---|---|---|---|
| `CREATE TABLE` | 0 | — | Ninguna tabla falta. |
| `ADD COLUMN` | **3 columnas** (2 sentencias) | **Sí** | **Incluir** (§3). |
| FK nuevas | **2** (las de esas columnas) | Sí (relación) | **Incluir** (§3). |
| FK re-creadas con otra acción `ON DELETE/UPDATE` | 20 (19 `DROP`+`ADD` más `FK_ContenedorLote_LoteImportacion` → `ContenedorLote_loteId_fkey`) | No | **Excluir**: cambia comportamiento (decisión aparte, §5). |
| `ALTER COLUMN` (`NVARCHAR`/`NVARCHAR(MAX)` → `VARCHAR`/`TEXT`) | 130 columnas en 30 tablas | No | **Excluir**: cosmético y con riesgo de pérdida Unicode. |
| `DROP CONSTRAINT …_id_df` / default de id | 24 | No | **Excluir**: la BD tiene `DEFAULT NEWID()`; el schema genera el UUID en el cliente. Quitarlo rompería inserts SQL directos. |
| Índices/uniques: 22 `DROP` + 24 `ADD` | 46 | No | **Excluir**: ver §4 (destructivo). |
| `SP_RENAME PK_ContenedorLote` | 1 | No | **Excluir** (cosmético). |

## 3. Qué explica el fallo y es lo único que se propone corregir

Fallo observado: `importaciones-proveedor-pais.integration.test.ts` caso 5 → `GET /api/proveedores?search=` responde 500, `P2022: The column proveedorId does not exist` (modelo `Proveedor`).

Causa: `proveedores.controller.ts:54-60` hace `proveedor.findMany({ include: { _count: { select: { facturas, solicitudesCompra } } } })`. El conteo `solicitudesCompra` usa la relación `SolicitudCompra.proveedorId`, que el schema declara y **ninguna migración crea**.

| Objeto | Schema | Migraciones | Origen en el historial git |
|---|---|---|---|
| `SolicitudCompra.proveedorId UNIQUEIDENTIFIER NULL` + FK a `Proveedor` | sí | **no** | Entró al schema en `bbf0790` (2026-09-12) sin migración |
| `SolicitudCompra.proveedor VARCHAR(255) NULL` | sí | **no** | Ídem |
| `Factura.solicitudCompraId UNIQUEIDENTIFIER NULL` + FK a `SolicitudCompra` | sí | **no** | Entró en `164a2d5` (2026-08-26) sin migración |

Las tres columnas son nullable, sin `DEFAULT`; no hay `CREATE INDEX` pendiente para ellas.

## 4. Por qué NO se debe aplicar el diff generado completo

1. **Destruiría índices únicos filtrados** (decisión ya aprobada en MEMORY.md §13 y entradas 2026-09-23/24): el diff los ve como "únicos normales". Verificado en la BD: `Tenant_siesaCiaId_key` y `Tenant_dominioCorporativo_key` (`WHERE … IS NOT NULL`) e `ImportacionNovedad_ordenCompraId_reglaOrigen_key` (`WHERE reglaOrigen IS NOT NULL`) existen filtrados; el diff intenta crearlos sin filtro (fallaría por nombre duplicado o, si se renombrara, rompería los NULL en SQL Server).
2. **Cambiaría acciones de FK** (p. ej. `Rol/Departamento/Modulo/CatalogoValor/PlantillaNotificacion.tenantId` hoy `NO ACTION` en la BD frente a `SET NULL` en el schema; `Membresia.userId`, `CotizacionProveedor`… difieren en `ON UPDATE`). Es un cambio de comportamiento de borrado/actualización, no de "alineación".
3. **`NVARCHAR` → `VARCHAR`/`TEXT`** en 130 columnas: potencial pérdida de caracteres no ANSI y uso del tipo `TEXT` (obsoleto) en SQL Server.
4. **`Factura_tenantId_empresaId_numero_key`**: la BD es más estricta (único) que el schema (índice simple); el diff la aflojaría.
5. Quitaría `DEFAULT NEWID()` de 24 tablas.

## 5. Migración propuesta (mínima)

Archivo de borrador (fuera de `prisma/migrations/`): [propuesta-20261005120000_alinear_columnas_compras.sql](propuesta-20261005120000_alinear_columnas_compras.sql). Nombre sugerido: `20261005120000_alinear_columnas_compras`.

- 3 `ADD COLUMN` nullable + 2 `ADD CONSTRAINT … FOREIGN KEY … NO ACTION/NO ACTION`.
- **Idempotente** (`IF COL_LENGTH … IS NULL`, `IF NOT EXISTS … sys.foreign_keys`): si un entorno ya tiene las columnas (creadas fuera de las migraciones) no falla ni las altera.
- Sin backfill, sin `DEFAULT`, sin cambios de tipo, sin `DROP`.

**Impacto**
- Datos: ninguno (filas existentes quedan con `NULL`). Bloqueo: `ADD` de columna nullable es una operación de metadatos en SQL Server; las FK se validan sobre filas con `NULL` (trivial).
- Código: corrige `GET /proveedores`, `GET /proveedores/:id` y la baja de proveedor (también usan `_count.solicitudesCompra`). No cambia la API.
- Compatibilidad: `schema.prisma` no cambia; no hace falta `prisma generate` distinto.
- Reversión: `ALTER TABLE … DROP CONSTRAINT …; DROP COLUMN …` de los 3 objetos (solo seguro si ningún flujo ya escribió datos en ellos; por eso la propuesta no los puebla).

**Verificación ya realizada en la BD desechable** (el borrador se aplicó solo allí):
1. Se ejecutó 2 veces seguidas: sin errores (idempotente); las 3 columnas quedaron con tipo y nulabilidad esperados.
2. `prisma migrate diff` posterior: el diff pasa de 506 a 497 líneas y **desaparecen** exactamente las 3 columnas y las 2 FK; el resto sin cambios.
3. Integración, secuencial, tras aplicarlo: `src/modules/importaciones` + `proveedores` + `solicitudes` → **15 archivos, 131 tests, todos pasan** (incluido el caso 5 que fallaba). Antes: 98/99 en importaciones.

## 6. Plan de verificación antes de autorizar/aplicar

1. **Lectura** (autorización expresa requerida; hoy no se hizo): `prisma migrate diff --from-url <saas_dev> --to-schema-datamodel schema.prisma --script` solo para comprobar si `saas_dev` ya tiene las 3 columnas. Resultado esperado: ya existen (el endpoint funciona allí) → la migración es no-op idempotente.
2. Si `saas_dev` las tiene: tras añadir el archivo a `prisma/migrations/`, `prisma migrate deploy` la ejecuta sin cambios (guardas). No usar `migrate resolve` salvo decisión contraria.
3. Re-correr en una BD desechable nueva: `migrate deploy` completo → `migrate diff` (debe mostrar solo el ruido de §4) → integración de importaciones/proveedores/solicitudes.
4. Confirmar en CI (job `backend-integration`) que `GET /proveedores` pasa.

## 7. Decisiones/pendientes aparte (no incluidos)

- **Alinear el resto del ruido** (tipos `NVARCHAR`→`VARCHAR`, acciones de FK, `DEFAULT NEWID()`, índices) o, al revés, **ajustar `schema.prisma`** a lo que realmente tienen las migraciones/BD (`@db.NVarChar`, `onDelete`, índices filtrados vía SQL manual). Es una decisión de arquitectura de datos; mientras tanto `prisma migrate dev` no es seguro de usar en este repo porque generaría el diff destructivo del §4.
- **Verificar la causa raíz del proceso**: el schema recibió columnas sin migración (commits `164a2d5`, `bbf0790`). Conviene un chequeo en CI (`prisma migrate diff --exit-code` con una lista de excepciones conocidas) para que no se repita.
- **Higiene**: existen 3 directorios vacíos no versionados en `prisma/` con nombre literal `migrations${TS}_…` (`_membresias`, `_tenant_dominio_activo`, `_tenant_siesa_cia_id`), restos de un script con variable sin expandir; no afectan a Prisma (están fuera de `migrations/`). Proponer eliminarlos.
- **Rows de prueba**: la BD desechable queda con 175 filas de `CatalogoValor` sembradas para las pruebas (`npm run catalogos:sincronizar`); una BD creada solo con migraciones no trae catálogos generales, y varias suites de integración los necesitan.
