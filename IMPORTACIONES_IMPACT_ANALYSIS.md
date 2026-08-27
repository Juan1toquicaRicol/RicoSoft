# IMPORTACIONES_IMPACT_ANALYSIS.md — RicoSoft Enterprise

## Hallazgo central: Importaciones V1 no es un módulo nuevo — ya existe, parcialmente completo

A diferencia del encargo original ("diseñar el módulo de Importaciones V1"), la auditoría encontró que **el módulo ya está construido en un ~70-75%**, con backend, base de datos y frontend reales conectados entre sí (no un stub, no datos mock). Esto cambia el objetivo del siguiente paso: no es "diseñar desde cero", es **"cerrar los vacíos concretos de lo que ya existe, sin romper lo construido."**

---

## Estado actual, por capa

### Base de datos — EXISTE, completo para el flujo principal
`ClasificacionArancelariaMatriz` (catálogo global), `OrdenCompraIntl`, `ItemOrdenCompraIntl`, `LoteImportacion`, `ExpedienteAduanero`, `VistoBuenoAduanero`, `CosteoImportacionDetalle`, `ImportacionHistorial`. Ver `DATABASE_ARCHITECTURE.md` para el detalle campo por campo. El modelo de datos ya contempla:
- Landed cost bajo NIC 2, prorrateado por ítem (no por lote completo).
- Diferencia en cambio NIC 21 (TRM pactada vs. TRM de liquidación).
- Costeo provisional vs. definitivo sin sobrescribir (mismo patrón de trazabilidad que `Pago`).
- Documentos aduaneros (DIM, factura comercial, certificado de origen, vistos buenos) — **modelados pero no alimentados** (ver vacío #1 abajo).

### Backend — EXISTE el flujo principal, FALTA el sub-flujo documental
`server/src/modules/importaciones/` tiene routes + controller + schemas reales, montado en `/api/importaciones`, con permisos granulares (`importaciones.ver/crear/gestionar_transito/recibir/liquidar/eliminar`) ya definidos y sincronizados entre backend y frontend (`permisos-sync.test.ts` lo verifica). 8 endpoints reales:

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/importaciones` | Listar órdenes (filtro estado/búsqueda) |
| GET | `/importaciones/:id` | Detalle completo (items, lotes, expediente, costeos, historial) |
| POST | `/importaciones` | Crear orden + ítems, calcula landed cost estimado inicial |
| DELETE | `/importaciones/:id` | Anular orden (soft-delete) |
| POST | `/importaciones/:id/lotes` | Registrar lote de embarque; auto-transiciona orden Borrador→Confirmada |
| PATCH | `/importaciones/lotes/:id/estado` | Mover estado de tránsito manual (En tránsito/En puerto/En inspección) |
| PATCH | `/importaciones/lotes/:id/recibir-pre-compra` | Ingreso físico a planta, genera costeo provisional |
| POST | `/importaciones/lotes/:id/liquidar-costeo` | Liquidación definitiva del landed cost, prorrateado por ítem |

### Frontend — EXISTE el flujo principal, conectado a la API real
`src/routes/importaciones.tsx` (lista con filtros/agrupación/creación) y `src/routes/importaciones.$id.tsx` (detalle con lotes, cambio de estado, recepción en planta, liquidación de costeo) — ambos usan `src/hooks/use-importaciones.ts` contra los endpoints reales, siguiendo el mismo patrón visual que el módulo de Facturas (Table, EstadoBadge, EmptyState, AlertDialog).

---

## Vacíos concretos identificados (esto es lo que realmente falta para V1)

### Vacío #1 — Documentos aduaneros: sin backend NI frontend (el hallazgo más importante)
- `ExpedienteAduanero` y `VistoBuenoAduanero` existen en el schema y se **serializan** en las respuestas del backend (`serializarExpediente`, `serializarVistoBueno` en `importaciones.controller.ts`), pero:
  - **No hay ningún endpoint** para crear/editar un `ExpedienteAduanero` (número DIM, fecha DIM, certificado de origen TLC, fecha de levante).
  - **No hay ningún endpoint** para crear/editar un `VistoBuenoAduanero` (entidad, número, estado, fecha).
  - **No hay endpoint de subida de archivo** para DIM, factura comercial ni certificado de origen — `upload.middleware.ts` solo tiene fábricas para `facturas`, `solicitudes-compra` y `pagos`; falta una cuarta (`importaciones` o `expedientes-aduaneros`).
  - **El frontend nunca lee ni renderiza** `lote.expediente` en ningún punto — la sección entera es invisible en la UI aunque el tipo TypeScript ya la modela.
- Esto es una brecha end-to-end genuina (no solo de UI): hoy es físicamente imposible registrar un DIM o subir un certificado de origen en el sistema.

### Vacío #2 — Sin historial/auditoría visible en la UI
`OrdenCompraIntl.historial` (`ImportacionHistorial`) se trae del backend en cada `GET /:id`, pero `importaciones.$id.tsx` nunca lo renderiza. Facturas sí tiene su equivalente ("Trazabilidad y Auditoría", timeline en la columna derecha del detalle) — Importaciones debería seguir el mismo patrón visual ya establecido, no inventar uno nuevo.

### Vacío #3 — Sin guard de ruta por permiso en frontend
`/importaciones` e `/importaciones/$id` no usan `requirePermisoGuard(IMPORTACIONES_VER)` en `beforeLoad` — a diferencia de las rutas de administración. Hoy la protección real está en el backend (403 si falta el permiso), así que no es una vulnerabilidad, pero es inconsistente con el patrón usado en otras partes de la app.

### Vacío #4 — Sin actualización de refresco casi-en-tiempo-real
Facturas usa `usePollingFacturas` para refrescar el detalle mientras varias personas lo editan (aprobación, pago, comentarios). Importaciones no tiene equivalente — relevante porque el flujo de una importación involucra a varias áreas (compras, logística, contabilidad) tocando el mismo lote a lo largo de semanas.

### Vacío #5 — Sin relación con Compras nacional, Facturación, Inventario ni Contabilidad
Ver `MODULE_DEPENDENCIES.md` — `OrdenCompraIntl` no tiene FK hacia `SolicitudCompra`/`Factura`/`Pago`, y no hay tabla de Inventario ni Contabilidad local a la que el costo landed calculado pueda "aterrizar". Esto **no es un bug** — puede ser la decisión de diseño correcta si Contabilidad/Inventario reales viven en Siesa — pero **hoy no hay ningún mecanismo, ni siquiera manual, para llevar el costo landed liquidado hacia Siesa.** La sincronización actual (`siesa-sync.service.ts`) es unidireccional Siesa→RicoSoft y solo trae Proveedores.

### Vacío #6 — Detalles menores de consistencia visual
- El detalle usa `<div className="panel">` crudo para sus 4 tarjetas de KPI en vez del componente `StatCard` ya creado y usado en el dashboard.
- El selector de moneda de "Nueva Orden" (USD/EUR/CNY/GBP/JPY) no incluye COP — coherente con que una importación internacional rara vez se pacta en COP, pero vale confirmarlo como decisión deliberada, no omisión.
- No hay explicación visual del concepto NIC 21 (diferencia en cambio) más allá de la columna "Dif. cambio COP" en la tabla de resultados de liquidación.

---

## Qué debe REUTILIZARSE (no duplicar) al cerrar estos vacíos

| Necesidad | Patrón existente a reutilizar | Dónde está |
|---|---|---|
| Subida/descarga de archivo por registro | Fábrica `crearUploadArchivo(carpeta)` — agregar una carpeta nueva (`expedientes-aduaneros` o similar), NO reinventar el middleware. | `server/src/middleware/upload.middleware.ts` |
| Componente de UI para adjuntar/ver/reemplazar archivo | `DocumentoFactura` (input oculto + `fetchAuthUpload` + preview vía `fetchAuthBlob` en `<iframe>`/`<img>`) | patrón usado en `facturas.$id.tsx` |
| Timeline de auditoría en el detalle | "Trazabilidad y Auditoría" (columna derecha, eventos de `historial`) | `facturas.$id.tsx`, reutilizando `ImportacionHistorial` que YA se trae del backend |
| Catálogo de permisos | Agregar claves nuevas (p. ej. `importaciones.gestionar_expediente`) al **mismo** `PERMISOS_SISTEMA`, en ambos archivos (backend Y frontend) — el test `permisos-sync.test.ts` ya obliga a mantenerlos sincronizados | `server/src/lib/permissions.ts` + `src/lib/auth-permissions.ts` |
| Formato de moneda | `money(value, moneda)` — ya agnóstico de moneda, no crear un helper nuevo | `src/lib/data.ts` |
| Componentes de tabla/estado/vacío | `Table`, `EstadoBadge`, `EmptyState`, `AlertDialog` — ya usados en el propio módulo de Importaciones | `src/components/ui/*` |
| Patrón de transacción + historial atómico | `prisma.$transaction([...])` con la entrada de historial incluida en la misma transacción, como ya hacen `recibirPreCompraPlanta`/`liquidarCosteoImportacion` | `importaciones.controller.ts` (seguir el mismo patrón para los nuevos endpoints de expediente/vistos buenos) |

## Qué NO debe duplicarse

- **No crear un catálogo de "proveedores extranjeros" separado**: hoy `OrdenCompraIntl.proveedorExtranjero` es texto libre, deliberadamente distinto del catálogo `Proveedor` (que sincroniza con Siesa). Si se decide que los proveedores extranjeros deban ser entidades reales con NIT/contacto, es una **decisión de producto pendiente** (ver `ARCHITECTURAL_DECISIONS_PENDING.md`), no algo para resolver por inercia técnica reutilizando `Proveedor` sin definir el impacto en la sincronización Siesa.
- **No crear una segunda tabla de historial**: `ImportacionHistorial` ya cumple la función; los nuevos endpoints de expediente/vistos buenos deben escribir ahí (vía `ordenCompraId`, subiendo por la relación `LoteImportacion → OrdenCompraIntl`), igual que hoy lo hacen `crearLoteImportacion`/`actualizarEstadoLote`.
- **No crear un módulo de Inventario "mínimo" solo para Importaciones**: dado que Inventario no existe en ningún otro punto del sistema (ni Compras nacional lo alimenta), construir uno solo para este módulo introduciría una fuente de verdad paralela a Siesa sin que el resto del ERP la use — requiere decisión explícita de producto/arquitectura, no debe emerger como efecto secundario de completar Importaciones.

## Entidades nuevas que probablemente SÍ se necesiten (conceptual, sin crear tablas)

Estas no existen hoy y no hay ninguna existente que las cubra:

1. Un mecanismo de **subida de archivo para `ExpedienteAduanero`** (reutilizando la fábrica de `upload.middleware.ts`, no una tabla nueva — los campos ya existen en el schema).
2. Un mecanismo equivalente para cada `VistoBuenoAduanero` (mismo caso: campos ya existen, falta el endpoint).
3. **Posiblemente** (pendiente de decisión de producto): una entidad de "proveedor extranjero" real si se decide dejar de usar texto libre — ver decisión pendiente correspondiente.

Ningún otro modelo de datos nuevo parece necesario para completar V1 según lo ya construido — el vacío es de **endpoints y UI que activen datos que el schema ya contempla**, no de modelado adicional.
