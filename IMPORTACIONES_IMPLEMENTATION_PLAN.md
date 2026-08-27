# IMPORTACIONES_IMPLEMENTATION_PLAN.md — Completar Importaciones V1

Basado en la reinspección directa del código (no solo en la auditoría previa) de: `facturas.controller.ts`/`facturas.routes.ts` (patrón de referencia para adjuntos + historial), `upload.middleware.ts`, `route-guards.ts`, `session.ts` (`fetchAuth`/`fetchAuthUpload`/`fetchAuthBlob`/`hasPermission`), `use-importaciones.ts` (hook actual completo), `permisos-sync.test.ts` y `importaciones.controller.ts`/`.routes.ts`/`schema.prisma` ya leídos en la auditoría. Ningún cambio se ha aplicado todavía.

---

## 1. Estado actual (confirmado, no repetido de la auditoría salvo lo nuevo)

Hallazgo nuevo relevante para el plan, no reportado antes con este nivel de detalle: **el permiso `IMPORTACIONES_GESTIONAR_TRANSITO` ya tiene, en su propia descripción registrada en `src/lib/auth-permissions.ts`, el alcance que necesitamos**:

> `"Permite actualizar el estado de tránsito de un lote y su documentación DIAN (DIM, vistos buenos)."`

Es decir: **no hace falta crear ningún permiso nuevo**. El catálogo ya anticipó este trabajo y le asignó el permiso correcto; solo falta que el backend lo aplique a endpoints reales. Esto elimina el riesgo de tocar `permisos-sync.test.ts` o duplicar el catálogo en dos archivos — ambos ya están sincronizados y no cambian.

Confirmado también:
- `ExpedienteAduanero` y `VistoBuenoAduanero` tienen **todas** las columnas necesarias en `schema.prisma` (ver `DATABASE_ARCHITECTURE.md`) — **no se requiere ninguna migración**.
- `ExpedienteAduanero` SÍ tiene columna `tenantId` propia (verificación directa de importancia para el chequeo de tenant).
- `VistoBuenoAduanero` **NO** tiene columna `tenantId` propia — solo `expedienteId`. El chequeo de tenant para operaciones sobre un visto bueno debe hacerse vía relación anidada de Prisma (`where: { id, expediente: { tenantId } }`), un patrón que **no existe hoy en ningún otro módulo del sistema** (todos los demás modelos tenant-scoped tienen `tenantId` directo). Esto se marca explícitamente como punto de mayor riesgo de la implementación — ver §8.
- El patrón de referencia de adjuntos (`subirArchivoFactura`/`obtenerArchivoFactura`/`eliminarArchivoFactura` en `facturas.controller.ts`) sigue siempre la misma secuencia: `findFirst({id, tenantId})` → si falla, `fs.unlink` del archivo recién subido por multer y 404 → si existe archivo anterior, `fs.unlink` → `update` con metadatos + entrada de historial en el mismo `data.historial.create` → `auditoria.create` aparte. Este es el patrón exacto a replicar.
- `use-importaciones.ts` ya tiene los tipos TypeScript `ExpedienteAduanero`/`VistoBuenoAduanero` completos — solo falta agregar las funciones mutadoras al hook.
- `route-guards.ts` (`requirePermisoGuard`) es un no-op en SSR por diseño; se usa en `beforeLoad` de rutas administrativas. Ninguna ruta de Importaciones lo usa hoy.

---

## 2. Decisiones técnicas puramente arquitectónicas tomadas en este plan (sección 17 del prompt: no afectan negocio/contabilidad, se deciden aquí)

| Decisión | Elección | Por qué |
|---|---|---|
| ¿Un endpoint por tipo de documento del expediente, o uno genérico con `:tipo`? | **Uno genérico**: `POST/GET/DELETE /importaciones/lotes/:id/expediente/documentos/:tipo` con `tipo ∈ {dim, factura-comercial, certificado-origen}` | Evita triplicar código idéntico; el mapeo `tipo → columnas Prisma` es una tabla de 3 entradas en el controlador. Consistente con que la fábrica `crearUploadArchivo` ya es genérica por carpeta, no por campo. |
| ¿Cómo se crea el `ExpedienteAduanero` la primera vez? | **Upsert implícito** sobre `loteId` (que es `@unique`) tanto al editar campos como al subir el primer documento | Evita forzar al usuario a "crear expediente" como paso separado antes de poder subir un archivo; es coherente con que el modelo lo declara 1:1 con el lote, no con la orden. |
| ¿`VistoBuenoAduanero` se puede eliminar? | **No se expone DELETE en esta fase** — solo crear/actualizar/adjuntar documento | La política de "puede borrarse un visto bueno ya registrado, o solo marcarse inválido" es una decisión de negocio no definida (no hay `eliminado` en el modelo). Exponerlo ahora obligaría a inventar esa regla. Queda documentado como decisión pendiente #10 (ya en `ARCHITECTURAL_DECISIONS_PENDING.md`), no se resuelve aquí. |
| ¿Estados válidos de `VistoBuenoAduanero.estado` / `ExpedienteAduanero.estado`? | Listas de validación en controlador (mismo patrón que `ESTADOS_ORDEN_VALIDOS` en `importaciones.controller.ts`), **no un enum de Prisma ni una máquina de estados con transiciones**: `ESTADOS_VISTO_BUENO_VALIDOS = ["Pendiente","Aprobado","Rechazado"]`, `ESTADOS_EXPEDIENTE_VALIDOS = ["En trámite","Levantado"]` | Sigue el patrón ya establecido en el propio módulo (arrays de strings validados en controlador, no en schema). Es una validación de forma, no una regla contable — no requiere decisión de producto. `estado` de expediente NO se fuerza a cambiar solo; queda como campo editable, sin acoplarlo a `liquidarCosteoImportacion` (eso sería la decisión pendiente #13, no se toca). |
| Estrategia de pruebas de aislamiento multi-tenant (Fase 9 del prompt exige probarlo con datos reales) | Ver §9 — decisión con impacto en CI, marcada aparte para confirmación explícita del usuario antes de tocar `ci.yml`. | Es la única decisión de este plan con "blast radius" sobre infraestructura compartida (el pipeline de CI que usa todo el equipo). |

---

## 3. Endpoints nuevos (backend)

Todos bajo `authenticateJWT` (ya aplicado a nivel de router) + `requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO)`.

| Método | Ruta | Propósito | Archivo(s) afectados |
|---|---|---|---|
| PUT | `/importaciones/lotes/:id/expediente` | Crear/actualizar datos del expediente (numeroDIM, fechaDIM, certificadoOrigenTlc, fechaLevante, estado) — upsert por `loteId` | `importaciones.controller.ts`, `.routes.ts`, `.schemas.ts` |
| POST | `/importaciones/lotes/:id/expediente/documentos/:tipo` | Subir/reemplazar un documento del expediente (`tipo` = dim / factura-comercial / certificado-origen) | ídem + `upload.middleware.ts` (nueva fábrica) |
| GET | `/importaciones/lotes/:id/expediente/documentos/:tipo` | Servir el archivo (inline), tenant-checked | ídem |
| DELETE | `/importaciones/lotes/:id/expediente/documentos/:tipo` | Quitar un documento adjunto (mismo patrón que `eliminarArchivoFactura`) | ídem |
| POST | `/importaciones/lotes/:id/expediente/vistos-buenos` | Registrar un nuevo visto bueno (entidad, número, fecha) — crea el expediente si aún no existe | ídem |
| PATCH | `/importaciones/vistos-buenos/:id` | Actualizar entidad/número/estado/fecha de un visto bueno existente | ídem |
| POST | `/importaciones/vistos-buenos/:id/documento` | Subir/reemplazar el documento de un visto bueno | ídem + fábrica de upload |
| GET | `/importaciones/vistos-buenos/:id/documento` | Servir el archivo del visto bueno, tenant-checked | ídem |

**Middleware de subida nuevo** (reutilizando la fábrica existente, sin crear una paralela):
```ts
// upload.middleware.ts — agregar, siguiendo el patrón de facturaArchivo/cotizacionSolicitud/comprobantePago:
const documentoExpediente = crearUploadArchivo("expedientes-aduaneros");
export const UPLOADS_DIR_EXPEDIENTES = documentoExpediente.UPLOADS_DIR;
export const validarExpedienteIdParaArchivo = documentoExpediente.validarIdParaArchivo;
export const uploadDocumentoExpediente = documentoExpediente.uploadArchivo;

const documentoVistoBueno = crearUploadArchivo("vistos-buenos-aduaneros");
export const UPLOADS_DIR_VISTOS_BUENOS = documentoVistoBueno.UPLOADS_DIR;
export const validarVistoBuenoIdParaArchivo = documentoVistoBueno.validarIdParaArchivo;
export const uploadDocumentoVistoBueno = documentoVistoBueno.uploadArchivo;
```
Nota: para el expediente, `:id` en la URL de multer es el `loteId` (carpeta `uploads/expedientes-aduaneros/<loteId>/`), no el id del expediente — evita depender de que el expediente ya exista antes de poder subir el primer archivo. Los 3 documentos de un mismo expediente conviven en la misma carpeta sin colisión (multer ya genera nombre de archivo único por subida).

---

## 4. Transacciones e historial (obligatorio en cada mutación, sección 11 del prompt)

Cada endpoint mutador anterior debe:
1. Resolver `lote` (o `vistoBueno.expediente.lote` para los endpoints de visto bueno) con `tenantId` verificado.
2. Ejecutar el cambio de datos (`upsert`/`update`/`create`) **y** `prisma.importacionHistorial.create({ ordenCompraId: lote.ordenCompraId, ... })` dentro de un único `prisma.$transaction([...])`, exactamente como ya hace `recibirPreCompraPlanta`/`liquidarCosteoImportacion`.
3. Acciones de historial propuestas: `"Expediente aduanero actualizado"`, `"Documento DIM adjuntado"` / `"...reemplazado"` / `"...eliminado"` (mismo texto patrón para factura comercial y certificado de origen), `"Visto bueno registrado (<entidad>)"`, `"Visto bueno actualizado (<entidad>): <estado anterior> → <estado nuevo>"`, `"Documento de visto bueno adjuntado (<entidad>)"`.

No se toca `Auditoria` (tabla separada, de nivel sistema) salvo que el equipo decida que estos eventos también deban auditarse ahí — hoy `ImportacionHistorial` ya cumple la función equivalente a `FacturaHistorial`, que es lo único que los eventos de factura usan para esto (la tabla `Auditoria` en facturas se reserva para creación/cambio de estado/eliminación, no para cada adjunto). Se replica el mismo criterio: **sin entrada en `Auditoria` para documentos individuales**, solo en `ImportacionHistorial`.

---

## 5. Frontend

| Archivo | Cambio |
|---|---|
| `src/hooks/use-importaciones.ts` | Agregar a `useOrdenCompraIntl`: `actualizarExpediente(loteId, data)`, `subirDocumentoExpediente(loteId, tipo, file)`, `eliminarDocumentoExpediente(loteId, tipo)`, `crearVistoBueno(loteId, data)`, `actualizarVistoBueno(vistoId, data)`, `subirDocumentoVistoBueno(vistoId, file)` — mismo patrón `fetchAuth`/`fetchAuthUpload` + `refresh()` que ya usan `addLote`/`liquidarCosteoImportacion`. |
| `src/routes/importaciones.$id.tsx` | Nueva sección por lote: **"Expediente aduanero"** (formulario DIM/certificado/fecha levante + 3 slots de documento, patrón `DocumentoFactura`) y **"Vistos buenos"** (lista + formulario de alta + documento por fila), ambas gateadas por `hasPermission(user, PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO)` para mostrar controles de edición (la vista de solo lectura se muestra a cualquiera con `IMPORTACIONES_VER`, igual que el resto de la pantalla). Nueva sección **"Trazabilidad y Auditoría"** que renderiza `orden.historial` (ya se trae del backend, hoy sin usar), replicando el layout de `facturas.$id.tsx`. |
| `src/routes/importaciones.tsx`, `src/routes/importaciones.$id.tsx` | Agregar `beforeLoad: requirePermisoGuard(PERMISOS_SISTEMA.IMPORTACIONES_VER)`, mismo patrón que rutas de administración. |
| Nuevo componente (o inline, a decidir por tamaño real al implementar) | `DocumentoExpediente`/`DocumentoVistoBueno` — copiar la lógica de `DocumentoFactura` (input oculto, `fetchAuthUpload`, `fetchAuthBlob` → `URL.createObjectURL` en `<iframe>`/`<img>`), parametrizada por el endpoint. |

**Polling** (Fase 7 del prompt): se evalúa agregar un `usePollingOrdenCompraIntl` mirando `usePollingFacturas` — se implementará **solo si el tiempo/alcance de esta pasada lo permite sin degradar lo demás**; no es bloqueante para considerar V1 "completa" en el sentido del prompt (los documentos/vistos buenos sí lo son). Se marcará explícitamente en el reporte final si quedó pendiente.

---

## 6. Permisos

**Ninguno nuevo.** Se reutiliza `PERMISOS_SISTEMA.IMPORTACIONES_GESTIONAR_TRANSITO`, ya definido y sincronizado en ambos catálogos. `permisos-sync.test.ts` no requiere cambios.

---

## 7. Migraciones de base de datos

**NINGUNA.** Todas las columnas necesarias (`ExpedienteAduanero.*`, `VistoBuenoAduanero.*`) ya existen en `schema.prisma` y en la migración `0_init`/subsecuentes ya aplicadas. Este plan solo activa endpoints y UI sobre un modelo ya migrado.

---

## 8. Riesgo principal identificado en este plan: chequeo de tenant en `VistoBuenoAduanero`

A diferencia de todos los demás modelos tenant-scoped del sistema (que tienen `tenantId` directo y se verifican con `findFirst({ id, tenantId })`), `VistoBuenoAduanero` requiere:
```ts
const vistoBueno = await prisma.vistoBuenoAduanero.findFirst({
  where: { id, expediente: { tenantId } },
  include: { expediente: true },
});
```
Este patrón de relación anidada en `where` **no tiene precedente en el código actual** — es nuevo para el sistema, aunque es una construcción estándar y documentada de Prisma. Se marca como el punto de mayor atención en la Fase 8 (auditoría de multi-tenancy) y en la Fase 9 (tests): cada endpoint sobre `/vistos-buenos/:id` debe tener un test explícito de que un usuario del Tenant B recibe 404 (nunca los datos) al intentar leer/modificar un visto bueno del Tenant A.

---

## 9. Pruebas — decisión que requiere confirmación antes de tocar CI

El prompt exige (Fase 9) pruebas reales de aislamiento multi-tenant: *"Tenant A NO puede leer/modificar/eliminar/descargar/adjuntar recursos de Tenant B."* La auditoría (`SECURITY_AUDIT.md`, hallazgo A1) ya estableció que **hoy ningún test del repositorio se conecta a una base de datos real** — ni siquiera `app.test.ts` — y que el `DATABASE_URL` de CI es un placeholder que nunca se usa para una conexión real. Verificar aislamiento multi-tenant de verdad (dos tenants, datos reales, JWT real) no puede hacerse con mocks superficiales sin perder el valor de la prueba.

Dos alternativas reales:

- **Alternativa A — base de datos real efímera en CI**: agregar un `service: mssql` (contenedor `mcr.microsoft.com/mssql/server`) a un job **nuevo** (`backend-integration`, sin tocar los jobs `frontend`/`backend` que ya pasan hoy), correr `prisma migrate deploy` contra él, sembrar 2 tenants + usuarios reales, y usar `supertest` con JWTs reales emitidos por el propio flujo de login. **Ventaja**: prueba lo que realmente importa (aislamiento real a través de Prisma). **Desventaja**: modifica `ci.yml` (pipeline compartido) y añade tiempo de ejecución a CI — es la única acción de este plan con impacto en infraestructura visible para todo el equipo.
- **Alternativa B — mockear Prisma Client por test**: sin tocar CI, pero requiere mockear cadenas de `$transaction` y relaciones anidadas (`expediente: { tenantId }`) de forma manual, lo que es frágil y puede dar falsa confianza (un mock mal hecho "pasa" aunque el filtro real esté roto — exactamente el escenario que se quiere prevenir).

**Recomendación de este plan**: Alternativa A, aislada en un job nuevo que no arriesga el pipeline existente. Es una decisión puramente técnica (no de negocio), pero se señala explícitamente antes de ejecutarla porque modifica un recurso compartido (CI) — consistente con "actions visible to others" del protocolo operativo. Se implementará solo tras confirmación explícita en esta conversación.

### Cobertura de test planeada (una vez resuelto lo anterior)
- Autorización: usuario sin `IMPORTACIONES_GESTIONAR_TRANSITO` → 403 en cada endpoint nuevo; superadmin → 200 siempre.
- Multi-tenancy: Tenant A crea una orden/lote/expediente; usuario de Tenant B intenta leer/modificar/adjuntar/descargar → 404 en todos los casos (ver §8, foco especial en `/vistos-buenos/:id`).
- Documentos: subida válida (PDF), extensión rechazada, reemplazo (verifica que el archivo anterior se borre del disco), acceso sin token → 401, acceso con token de otro tenant → 404.
- Historial: cada mutación exitosa efectivamente crea una fila en `ImportacionHistorial` con el `ordenCompraId` correcto.
- Transacción atómica: si la escritura de historial fallara (simulado), el cambio de datos tampoco debe persistir — se verifica con un caso que fuerce el rollback.

---

## 10. Orden de implementación propuesto

1. Backend: `upload.middleware.ts` (2 fábricas nuevas) → `importaciones.schemas.ts` (nuevos schemas zod) → `importaciones.controller.ts` (8 handlers nuevos) → `importaciones.routes.ts` (8 rutas nuevas).
2. `npx tsc --noEmit` en `server/` para verificar sin regresiones antes de continuar.
3. Frontend: extender `use-importaciones.ts` → nuevos componentes de documento → secciones de Expediente/Vistos Buenos/Trazabilidad en `importaciones.$id.tsx` → guards en ambas rutas.
4. `npx tsc --noEmit` + `npm run lint` en raíz.
5. Tests (backend, tras confirmación de §9) + regresión completa (`lint`, `typecheck`, `test`, `build` en ambos paquetes).
6. `IMPORTACIONES_IMPLEMENTATION_REPORT.md`.

---

## 11. Riesgos generales de esta implementación

| Riesgo | Mitigación |
|---|---|
| Romper el flujo existente de Importaciones (crear orden/lote/recibir/liquidar) al tocar `importaciones.controller.ts` | Los 8 handlers nuevos son aditivos — no se modifica ninguna función existente del archivo. Se verifica con `tsc --noEmit` + regresión completa antes de dar por terminado. |
| Confusión entre `:id` = loteId vs. expedienteId en las rutas de documentos | Documentado explícitamente en §3; el controlador resuelve siempre por `loteId` y hace upsert del expediente, nunca espera un id de expediente en la URL. |
| Tenant leak en `VistoBuenoAduanero` (único modelo sin `tenantId` directo tocado en este trabajo) | Ver §8 — mitigación vía test explícito antes de considerar la fase terminada. |
| CI: agregar un job de integración puede fallar por configuración del contenedor SQL Server en GitHub Actions (arranque lento, autenticación) | Se aísla en un job nuevo que no bloquea `frontend`/`backend`; si falla de forma no resoluble en el tiempo disponible, se documenta como pendiente en el reporte final en vez de dejarlo a medias silenciosamente. |
