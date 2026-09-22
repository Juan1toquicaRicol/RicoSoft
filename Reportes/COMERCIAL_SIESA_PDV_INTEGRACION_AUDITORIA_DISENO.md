# RicoSoft Enterprise — Auditoría + Diseño: Integración PedidoComercial ↔ PDV SIESA UnoEE

Fecha: 2026-09-22
Alcance: **SOLO AUDITORÍA + DISEÑO + PLAN DE PRUEBAS.** No se modificó código
de producción, no se creó ninguna migración, no se tocó `schema.prisma`, no
se cambió ningún endpoint existente, no se hizo ningún commit. Todo lo
propuesto en las secciones 8 en adelante es DISEÑO, no implementación.

Contexto reutilizado (no re-descubierto): `Reportes/RICOSOFT_COMERCIAL_ARCHITECTURE_AUDIT.md`
(2026-09-02) ya documentó que "Ventas" no tiene modelo propio (todo vive en
Siesa) y que Despachos es el módulo de referencia para "originarse desde un
documento real de Siesa". **Ese audit es anterior a que existieran
`Cotizacion`/`Proforma`/`PedidoComercial`** (las migraciones
`20260918155209_proforma_ventas`, `20260920063000_comercial_cotizacion_pedido`
son posteriores al 2026-09-02) — este documento extiende esa auditoría hacia
el submódulo que no existía entonces.

---

## 1. Resumen ejecutivo

RicoSoft **ya tiene** la base de datos, el patrón de identidad técnica y el
servicio SQL de lectura necesarios para resolver la pregunta central de este
encargo. No hace falta inventar nada de infraestructura nueva:

- `PedidoComercial` ya tiene 5 columnas **preparadas y sin usar**
  (`erpTipoDocumento`, `erpRowId`, `erpNumero`, `erpFechaSincronizacion`,
  `erpEstadoSincronizacion`) — comentario explícito en el schema: "Preparado
  para la integración Siesa de escritura (fase futura). Sin usar todavía."
- El **identificador técnico confiable ya está identificado y en uso real**:
  `f430_rowid` (columna `f430_rowid` de `t430_cm_pv_docto`). No es una
  inferencia — es el mismo campo que `Cotizacion.erpRowId` ya persiste hoy,
  vía el endpoint real `POST /comercial/cotizaciones/:id/asignar-erp`
  (`cotizaciones.controller.ts:359-421`).
- Existe un **patrón gemelo ya implementado y en producción** para el mismo
  problema, pero sobre facturas de venta (`t461`) en vez de PDV (`t430`):
  `Despacho.siesaDocRowId`, creado siempre desde un documento Siesa real
  (`despachos.controller.ts:102-175`). Este patrón tiene un defecto real
  (sección 5, R-01) que **no debe repetirse** en el diseño nuevo.
- La cadena completa PDV→líneas→remisiones→factura que pide el encargo **ya
  está resuelta en código, de solo lectura, para la Ficha 360 del cliente**
  (`ventas.controller.ts` + `siesa-pedidos.service.ts` +
  `siesa-remisiones.service.ts`). Es el precedente más valioso de todo el
  código existente para este diseño.
- `PedidoComercial.estado` **ya mezcla** estado comercial y estado de
  integración (`SINCRONIZADO`, `ERROR_SINCRONIZACION` conviven con
  `BORRADOR`, `CONFIRMADO`, `ANULADO` en la misma columna) — una decisión ya
  tomada antes de esta auditoría, que hay que decidir si se mantiene o se
  separa (sección 18, DECISIÓN #1).
- **No existe ningún mecanismo (manual ni automático) hoy para vincular un
  `PedidoComercial` a un PDV real de Siesa.** Cotización y Proforma sí lo
  tienen (manual); Pedido no. Ese es el vacío exacto que este encargo debe
  llenar.

---

## 2. Estado actual encontrado

### 2.1 Identidad técnica ya usada en producción (no propuesta, ya existe)

| Entidad Siesa | Tabla | Identidad técnica | Ya persistida en RicoSoft |
|---|---|---|---|
| PDV / documento de pedido-cotización | `t430_cm_pv_docto` | `f430_rowid` (int) | `Cotizacion.erpRowId`, `Proforma` (vía `cotizacionIdExterno`, ver 2.3) |
| Línea del PDV | `t431_cm_pv_movto` | `f431_rowid` (int) | Ninguna (solo se lee en vivo) |
| Remisión | `t460_cm_docto_remision_venta` | `f460_rowid_docto` (int) | `Despacho` NO usa remisión, usa `t461` directo |
| Movimiento de inventario / línea de remisión | `t470_cm_movto_invent` | `f470_rowid` (int) | Ninguna |
| Factura de venta | `t461_cm_docto_factura_venta` | `f461_rowid_docto` (int) | `Despacho.siesaDocRowId` |
| Compañía Siesa | — | `t*.f*_id_cia` (int) | `Tenant.siesaCiaId` (1 por tenant) |
| Tercero (cliente) | `t200_mm_terceros` + `t201_mm_clientes` | `f200_rowid` | `*.clienteRowId` en Cotizacion/Proforma/PedidoComercial (snapshot, no FK) |

### 2.2 Modelo Prisma de `PedidoComercial` (`server/prisma/schema.prisma:2696-2739`)

```
model PedidoComercial {
  id, tenantId, numero
  cotizacionId?  proformaId?
  clienteRowId, clienteNombre, clienteNit
  vendedorNombre, fecha, estado (String, default "BORRADOR"), moneda
  observaciones
  erpTipoDocumento? String @db.VarChar(10)
  erpRowId?         Int
  erpNumero?        String @db.VarChar(50)
  erpFechaSincronizacion?  DateTime
  erpEstadoSincronizacion? String @db.VarChar(20)
  creadoPorId?, creadoPorNombre
  createdAt, updatedAt
  @@unique([tenantId, numero])
  @@index([tenantId, clienteRowId]) @@index([tenantId, estado])
  @@index([tenantId, fecha]) @@index([cotizacionId]) @@index([proformaId])
}
```

Comentario textual del schema (línea 2695-2699): *"Deliberadamente NO se
llama 'PDV': PDV es el documento de pedido de venta en Siesa (t430_cm_pv_docto
tipo PDV) — este es un documento interno de RicoSoft con su propio
consecutivo (PC-XXXXX), preparado para relacionarse a futuro con un PDV real
vía los campos erp* (sin adaptador todavía, fase posterior)."*

**Ningún campo `erp*` tiene `@unique` ni `@@unique`.** Confirmado leyendo el
schema completo (grep de `@@unique` en todo el archivo): solo existe
`@@unique([tenantId, numero])`, sobre el consecutivo interno.

### 2.3 Líneas (`PedidoComercialItem`, líneas 2740-2758)

Mismo shape que `ProformaItem`/`CotizacionItem`: `itemRowId?`, `referencia?`,
`descripcion`, `bodegaRowId?`, `bodega?`, `unidadMedida?`, `cantidad`,
`precioUnitario`, `descuentoPct`, `ivaPct`. **Ninguna columna de identidad
Siesa a nivel de línea** (no hay `siesaMovtoRowId` ni equivalente).
`itemRowId` es el rowid del **ítem/producto** (`t120_mc_items`), no de la
línea del documento — no debe confundirse con `f431_rowid`.

### 2.4 Máquina de estados actual (`pedidos.controller.ts:217-226`)

```
BORRADOR        -> [CONFIRMADO, ANULADO]
CONFIRMADO      -> [LISTO_PARA_ERP, ANULADO]
LISTO_PARA_ERP  -> [ANULADO]
SINCRONIZADO    -> []   // sin transición manual disponible — nada la alcanza hoy
ERROR_SINCRONIZACION -> []  // ídem
ANULADO         -> []
```

Comentario textual: *"SINCRONIZADO/ERROR_SINCRONIZACION quedan preparados
para la integración futura con Siesa — sin transición manual disponible
todavía."* **Confirmado: ningún código hoy pone `estado` en `SINCRONIZADO` ni
`ERROR_SINCRONIZACION`.**

### 2.5 Controladores (`server/src/modules/comercial/`)

- `pedidos.controller.ts` (324 líneas): `listarPedidos`, `obtenerPedido`,
  `crearPedidoDesdeProforma` (snapshot 1:1 de la Proforma activa, dentro de
  `prisma.$transaction`, con reintento de consecutivo por `P2002`),
  `cambiarEstadoPedido` (genérico, reutilizado por confirmar/listo-erp/
  anular), `eliminarPedido` (borrado físico, solo superadmin).
- `cotizaciones.controller.ts` (462 líneas): incluye `asignarErpCotizacion`
  (359-421) — el **único** precedente real de "vincular a mano un documento
  Siesa" en todo Comercial.
- `documentos.controller.ts`: bandeja agregada de solo lectura
  (Cotizaciones+Proformas+Pedidos).
- `proformas.controller.ts` (fuera de `comercial/`, en `modules/proformas/`):
  contiene `resolverCiaSiesa` (propio, duplicado — ver 5.3), `crearProforma`,
  y usa `leerCotizacionSiesa`/`buscarCotizacionesSiesa` para vincular una
  Proforma a un documento Siesa vía `cotizacionIdExterno` (mismo `f430_rowid`
  como texto).

### 2.6 Schemas/validaciones (`comercial.schemas.ts`)

`idParamSchema` (uuid), `crearPedidoDesdeProformaSchema` (solo observaciones
opcionales — el resto se copia de la Proforma), `actualizarPedidoSchema`
(existe el schema pero **no hay controller/ruta que lo use** — otro hallazgo,
sección 5), `listarPedidosSchema`, `asignarErpCotizacionSchema` (
`erpRowId: z.coerce.number().int().positive()`) — **no existe
`asignarErpPedidoSchema`**.

### 2.7 Permisos (`server/src/lib/permissions.ts:117-128`)

```
COTIZACIONES_VER / GESTIONAR / APROBAR
PEDIDOS_COMERCIALES_VER / GESTIONAR / CONFIRMAR
PROFORMAS_VER / GESTIONAR
```

No existe un permiso específico de "publicar/sincronizar a Siesa" para
Comercial. El precedente más cercano es `INTEGRACION_SIESA_SINCRONIZAR`
(usado hoy solo para la sincronización de proveedores, módulo
`integraciones-siesa/siesa-sync.*`, no relacionado con ventas).

### 2.8 Endpoints existentes (`comercial.routes.ts`)

```
GET    /comercial/documentos
GET    /comercial/cotizaciones            POST /comercial/cotizaciones
GET    /comercial/cotizaciones/:id        PATCH /comercial/cotizaciones/:id
POST   /comercial/cotizaciones/:id/enviar|anular|aprobar|rechazar|proforma
POST   /comercial/cotizaciones/:id/asignar-erp   ← único endpoint de vínculo Siesa
DELETE /comercial/cotizaciones/:id        (superadmin)
GET    /comercial/pedidos                 GET /comercial/pedidos/:id
POST   /comercial/pedidos/:id/confirmar|listo-erp|anular
DELETE /comercial/pedidos/:id             (superadmin)
POST   /comercial/proformas/:id/pedido
```

**No existe `PATCH /comercial/pedidos/:id`** (a pesar de que
`actualizarPedidoSchema` está definido) **ni `POST /comercial/pedidos/:id/asignar-erp`.**

### 2.9 Frontend relacionado

- `src/hooks/use-comercial.ts`: DTOs `Cotizacion`/`PedidoComercial` (ambos
  exponen `erpNumero: string | null`, de solo lectura); `useAccionesCotizacion`
  expone `asignarErp(id, erpRowId)`; `useAccionesPedido` **no** expone ningún
  equivalente — consistente con que el backend tampoco lo tiene (no es un bug,
  es simplemente lo que falta construir).
- `src/routes/comercial.pedidos.$id.tsx`, `comercial.gestion.tsx`,
  `comercial.cotizaciones.$id.tsx`: detalle/bandeja del ciclo Cotización→
  Proforma→Pedido. Confirmado en `git status` que estos tres archivos estaban
  modificados al momento de esta auditoría (trabajo en curso ajeno a este
  encargo, no tocado aquí).

### 2.10 Relaciones con otros módulos

| Módulo | Relación con PedidoComercial | Evidencia |
|---|---|---|
| Cotizaciones | `cotizacionId?` (FK opcional, `onDelete: NoAction`) | schema:2705 |
| Proformas | `proformaId?` (FK opcional, `onDelete: NoAction`) — snapshot independiente, nunca se recalcula | schema:2708-2710, comentario explícito |
| Clientes | Ninguna FK — `clienteRowId`/`clienteNombre`/`clienteNit` son snapshot copiado de la Proforma al crear | `crearPedidoDesdeProforma` |
| Productos | `itemRowId?` por línea, sin FK — referencia a `t120_mc_items`, no validado contra existencia real al crear el pedido | `PedidoComercialItem` |
| Despachos | **Ninguna relación, ni conceptual ni de código.** `Despacho` se origina de `t461` (factura), no de `PedidoComercial` ni de `t430` (PDV) | confirmado por ausencia — ningún archivo de `despachos/` menciona `PedidoComercial` |
| Facturas (RicoSoft) | **Ninguna.** El modelo `Factura` de RicoSoft (`server/prisma/schema.prisma:508+`) es el módulo de **cuentas por pagar a proveedores** (Compras), no tiene ningún campo Siesa/erp y **no es lo mismo** que `t461_cm_docto_factura_venta` (factura de VENTA en Siesa). Riesgo real de confusión de nombres — ver sección 5.6 | grep de `siesa`/`erp` sobre el bloque `model Factura` → 0 resultados |
| Crédito | Ninguna — `CreditoCliente.cliente` es texto libre (hallazgo ya documentado en el audit previo, D-C-01) | — |
| Importaciones | Ninguna — módulo completamente distinto (compras internacionales, no ventas) | — |

### 2.11 Integración Siesa ya existente relacionada con ventas

`server/src/modules/integraciones-siesa/siesa-pedidos.service.ts` (462
líneas) — **el archivo más relevante de todo este audit.** Contiene, ya
implementado y probado contra datos reales (según comentarios del propio
código, con cifras concretas: "confirmado con datos reales que una línea
puede tener múltiples movimientos... caso real: 21 remisiones para una sola
línea"):

- `contarPedidosClienteSiesa` / `leerPedidosClienteSiesa` — encabezados de
  `t430`, paginados server-side (`OFFSET/FETCH`), agregando `t431` por
  `SUM`.
- `buscarCotizacionesSiesa` — búsqueda por consecutivo visible, filtrando
  `f430_id_tipo_docto = 'CDV'`.
- `leerCotizacionSiesa(ciaId, cotizacionIdExterno)` — detalle de UN
  documento por `f430_rowid`, con sus líneas de `t431` unidas a `t120`. **Es
  la función que ya usa `asignarErpCotizacion` para revalidar contra Siesa
  antes de guardar.**
- `leerLineasPedidoClienteSiesa(ciaId, clienteRowId, pedidoRowId)` — líneas
  de UN pedido, **unidas contra `t430` filtrando por `(ciaId, clienteRowId)`
  además del rowid pedido** — este JOIN es el mecanismo real que impide IDOR
  cross-cliente/cross-compañía (comentario explícito en el código).
- `leerTrazabilidadPedidoClienteSiesa(ciaId, clienteRowId, pedidoRowId)` —
  UNA sola consulta que resuelve línea→remisión→factura, uniendo
  `t431 → t470 (LEFT JOIN por f470_rowid_pv_movto) → t460 (LEFT JOIN por
  f470_rowid_docto)`, trayendo `f460_rowid_docto_factura`. Esta es
  **literalmente** la cadena que pide el encargo (Pedido→PDV→líneas→
  remisión→factura), ya resuelta, ya en producción, ya de solo lectura.

`server/src/modules/integraciones-siesa/siesa-remisiones.service.ts` (191
líneas) — remisiones de un cliente y sus líneas (`t460`/`t470`), con
clasificación de origen (`PEDIDO`/`VENTA_DIRECTA`/`DEVOLUCION` según
`f470_id_concepto` 501/502).

`server/src/modules/integraciones-siesa/siesa-ventas.service.ts` (1509
líneas) — `leerHistoricoVentasSiesa`/`leerDocumentoVentaPorIdSiesa`/
`leerLineasDocumentoVentaSiesa` sobre `t461`+`v470_ventas` (vista, **no** la
tabla `t470`, ver 5.6). Es lo que usa `Despacho`, no lo que debería usar
`PedidoComercial`.

Todo esto se consume hoy únicamente desde `ventas.controller.ts` (Ficha 360
del cliente, `GET /ventas/clientes/:clienteRowId/pedidos/...`), **nunca**
desde `comercial/pedidos.controller.ts`. Los dos módulos (`ventas` y
`comercial`) hoy no se comunican entre sí.

### 2.12 `getSiesaPool` / config (`server/src/config/siesa.ts`)

Pool único por proceso (`ConnectionPool`, `pool: {max:5, min:0}`), memoiza la
promesa de conexión en vuelo (fix M-05 ya documentado). `requestTimeout:
60000`. Nunca se abre un pool por request. Reutilizable tal cual — no
requiere cambios para esta integración.

### 2.13 `tenantId`/`siesaCiaId`

Función canónica: `server/src/lib/siesa-tenant.ts` →
`resolverCiaSiesa(tenantId)`, SIEMPRE desde `req.user!.tenantId` (nunca de
query/body/params), devuelve `null` si el tenant no tiene compañía
configurada (nunca cae a un default). **Deuda técnica confirmada:** 5
archivos (`proformas.controller.ts`, `ventas.controller.ts`,
`importaciones.controller.ts`, `item-clasificaciones.controller.ts`,
`objetivos.controller.ts`) tienen su **propia copia local idéntica** de esta
función, en vez de importar la de `lib/siesa-tenant.ts` (que el propio
comentario del archivo dice que fue creada exactamente para reemplazarlas).
`cotizaciones.controller.ts` importa la copia de `proformas.controller.ts`,
no la canónica. Comportamiento idéntico en las 6 copias — sin riesgo
funcional hoy, pero es deuda a no repetir con un séptimo archivo nuevo.

### 2.14 Auditoría existente

Acciones ya registradas para Pedido: `PEDIDO_COMERCIAL_CREADO`,
`PEDIDO_COMERCIAL_CONFIRMADO`, `PEDIDO_COMERCIAL_LISTO_PARA_ERP`,
`PEDIDO_COMERCIAL_ANULADO`, `PEDIDO_COMERCIAL_ELIMINADO` (todas con
`entidadTipo: "PedidoComercial"`, `entidadId`). Para Cotización existe
`COTIZACION_DOCUMENTO_ERP_ASIGNADO` — el patrón de nombre a seguir para el
futuro equivalente de Pedido.

### 2.15 Jobs existentes que puedan afectar el flujo

**Ninguno.** Confirmado por ausencia: ningún archivo bajo `server/src/jobs/`
ni los jobs de `importaciones/` mencionan `PedidoComercial`, `comercial` (el
único match era un comentario no relacionado), ni `t430`. Los 5 schedulers
`node-cron` existentes (`crosschex-sync`, `servicios-renovacion`,
`tracking-maritimo`, `bandeja-ingesta`, `bandeja-procesamiento`) son de
dominios completamente distintos (biométrico, servicios, importaciones
marítimas, correo). El precedente de proceso asíncrono más relevante NO es
un cron: es `SincronizacionSiesaLog` (modelo dedicado + `siesa-sync.
controller.ts`), un patrón de "disparo bajo demanda con estado persistido",
ver sección 3.4.

### 2.16 Tests actuales relacionados

- `comercial.integration.test.ts` — cubre creación de Cotización, consecutivo
  único por tenant, transiciones `BORRADOR→ENVIADA→APROBADA`, creación de
  Proforma desde Cotización, creación de Pedido desde Proforma, transiciones
  `BORRADOR→CONFIRMADO→LISTO_PARA_ERP→ANULADO`, aislamiento cross-tenant,
  paginación.
- `permisos-ver-manipular.integration.test.ts` — 13 casos de aislamiento de
  permisos VER/GESTIONAR/APROBAR, incluido aislamiento multi-tenant (caso
  #6) y "un permiso de una sección no da acceso a otra" (caso #4).
- **`asignarErpCotizacion` NO tiene NINGÚN test** — ni de éxito, ni de
  revalidación contra Siesa, ni de aislamiento tenant, ni de compañía
  incorrecta. Confirmado por ausencia (`grep` de `asignar-erp`/`asignarErp`
  en todo `*.test.ts` → 0 resultados). Este es el hueco de pruebas más
  directamente relevante para el diseño de este encargo: es el único
  endpoint hoy que hace exactamente lo que el Pedido necesitará hacer, y no
  tiene ninguna prueba que garantice que su aislamiento multi-tenant/ciaId
  sea correcto.

---

## 3. Flujo actual (tal como existe, sin la integración pedida)

```
Cotizacion (RicoSoft, BORRADOR→ENVIADA→APROBADA→CONVERTIDA/RECHAZADA/ANULADA)
   │  [opcional] asignar-erp → valida contra t430 (leerCotizacionSiesa) → guarda erpRowId=f430_rowid
   ▼
Proforma (RicoSoft, activa/anulada) ── crearPedidoDesdeProforma (snapshot 1:1)
   ▼
PedidoComercial (RicoSoft, BORRADOR→CONFIRMADO→LISTO_PARA_ERP→ANULADO)
   │
   X  ← AQUÍ TERMINA. No hay publicación, no hay vínculo a t430, no hay
        avance a SINCRONIZADO. LISTO_PARA_ERP es un estado terminal de facto.
```

En paralelo, sin ninguna relación con lo anterior:

```
Ficha 360 del cliente (módulo ventas, solo lectura, sin escritura, sin estado propio)
t430 (pedidos del cliente) → t431 (líneas) → t470 (movimientos) → t460 (remisión) → t461 (factura)
```

Y, también en paralelo:

```
t461 (factura de venta ya facturada) → Despacho.siesaDocRowId (snapshot al crear, RECIBIDO→...→ENTREGADO)
```

**Los tres flujos no se comunican entre sí hoy.**

---

## 4. Problemas / riesgos encontrados (nuevos, específicos de esta auditoría)

| ID | Severidad | Hallazgo | Evidencia | Impacto |
|---|---|---|---|---|
| R-01 | **P1** | `Despacho.siesaDocRowId` (el único precedente real de "vínculo a documento Siesa con prevención de duplicados") **no tiene constraint único en BD** — solo `@@index`, no `@@unique`. La prevención de duplicado es un `findFirst` en el controller, **fuera de una transacción**, antes del `create`. Bajo dos requests concurrentes sobre el mismo documento, ambas pueden pasar el `findFirst` antes de que cualquiera termine el `create` → dos `Despacho` para el mismo documento Siesa. | `despachos.controller.ts:140-147`, `schema.prisma:1199` (solo `@@index`) | Si se copia este patrón tal cual para `PedidoComercial↔PDV`, se hereda una condición de carrera real, no hipotética — el propio audit previo (2026-09-02) describió esto como "previene duplicados", lo cual es impreciso: el índice acelera la búsqueda, no impide la duplicación. |
| R-02 | P2 | `Cotizacion.erpRowId`/`Proforma` no tienen constraint único por tenant. Nada impide vincular el mismo `f430_rowid` a dos Cotizaciones distintas del mismo tenant (sí se revalida que el documento EXISTE en Siesa, pero no que no esté ya vinculado a otra fila RicoSoft). | `cotizaciones.controller.ts:396-404`, schema (ausencia de `@@unique` sobre `erpRowId`) | Un mismo PDV podría terminar "vinculado" simultáneamente a dos Cotizaciones/Proformas/Pedidos sin que el sistema lo detecte — divergencia silenciosa de trazabilidad. |
| R-03 | P2 | `asignarErpCotizacion` (único endpoint análogo existente) **no tiene ningún test**, incluido el caso crítico de aislamiento tenant/ciaId. | sección 2.16 | No hay evidencia automatizada de que el flujo de vinculación manual actual sea seguro multi-tenant; se confía solo en el `WHERE ciaId=@ciaId` del SQL, sin prueba de regresión. |
| R-04 | P2 | `PedidoComercial.estado` mezcla estado comercial (`BORRADOR`/`CONFIRMADO`/`ANULADO`) con estado de integración (`SINCRONIZADO`/`ERROR_SINCRONIZACION`) en la misma columna `VARCHAR(20)`. Esto ya es una decisión tomada en el schema actual, antes de esta auditoría. | schema:2718, comentario del modelo | Si se implementa la integración reusando esta columna, un Pedido `ANULADO` después de haber llegado a `SINCRONIZADO` pierde la información de "estaba sincronizado" (son mutuamente excluyentes en una sola columna) — limita la trazabilidad. Ver DECISIÓN #1. |
| R-05 | P3 | 5 archivos duplican `resolverCiaSiesa` en vez de usar `lib/siesa-tenant.ts` (sección 2.13). | grep confirmado | Bajo riesgo funcional (comportamiento idéntico), pero cualquier corrección futura a esa lógica (p. ej. cachear, loggear) tendría que replicarse en 6 lugares si no se consolida antes de agregar un séptimo consumidor. |
| R-06 | P3 | Nombre `Factura` (RicoSoft, cuentas por pagar) vs. `t461_cm_docto_factura_venta` (Siesa, factura de venta) — mismo campo semántico ("factura"), significados opuestos (RicoSoft: dinero que la empresa debe pagar; Siesa/`t461`: dinero que el cliente debe pagar a la empresa). | sección 2.10 | Riesgo real de confusión en código/UI/comunicación de equipo si no se nombra explícitamente "factura de venta (Siesa)" en todo lo nuevo. |
| R-07 | P2 | `itemRowId` en `PedidoComercialItem` no se valida contra la existencia real del ítem en Siesa al crear el Pedido (se copia tal cual de la Proforma, que a su vez no se valida contra `t120_mc_items` en el momento de crear la Cotización). | `crearPedidoDesdeProforma`, `crearCotizacionSchema` (solo exige `int`, no existencia) | Un pedido podría "confirmarse" y llegar a `LISTO_PARA_ERP` referenciando un `itemRowId` que ya no existe o pertenece a otra compañía en Siesa — se descubriría recién al intentar publicar. |
| R-08 | P3 | `actualizarPedidoSchema` está definido en `comercial.schemas.ts` pero **no hay ningún endpoint que lo use** (`PATCH /comercial/pedidos/:id` no existe). | grep de rutas | Código muerto / feature a medio construir — no es bloqueante para este diseño, pero conviene que quien lo retome sepa que no es una omisión de esta auditoría. |

---

## 5. Hechos confirmados sobre SIESA (con evidencia de código, no de documentación externa)

Todos verificados leyendo consultas SQL reales ya ejecutadas en producción
(varias con comentarios que citan cifras de verificación en vivo).

1. `t430_cm_pv_docto.f430_rowid` es la identidad técnica del PDV. Filtros
   siempre usados: `f430_id_cia = @ciaId`. El filtro `f430_id_tipo_docto =
   'CDV'` se usa para acotar a "cotización/pedido de venta" en las búsquedas
   de `siesa-pedidos.service.ts` (`buscarCotizacionesSiesa`,
   `leerCotizacionSiesa`) — **CDV es el único tipo de documento que el código
   actual consulta sobre t430**; no hay evidencia en el repo de otros tipos
   de documento en esa tabla.
2. Cliente/vendedor del PDV: `f430_rowid_tercero_fact` (cliente-factura),
   `f430_rowid_tercero_vendedor` (vendedor) — ambos apuntan a
   `t200_mm_terceros.f200_rowid`.
3. `t431_cm_pv_movto.f431_rowid` es la identidad técnica de la línea.
   `f431_rowid_pv_docto` la une al encabezado `t430`. `f431_rowid_item_ext`
   es el producto (`t120_mc_items.f120_rowid`).
4. Cantidades de línea disponibles y ya usadas: `f431_cant1_pedida`,
   `f431_cant1_remisionada`, `f431_cant1_facturada` — permiten calcular
   pendiente (`pedida - remisionada`) sin consulta adicional.
5. `t470_cm_movto_invent` es el movimiento de inventario/remisión.
   `f470_rowid_pv_movto` lo une a la línea del PDV (`t431.f431_rowid`);
   `f470_rowid_docto` lo une al documento de remisión (`t460.f460_rowid_docto`).
   `f470_id_concepto` distingue 501 (venta) de 502 (devolución) — confirmado
   en código, no inferido.
6. `t460_cm_docto_remision_venta.f460_rowid_docto` es la identidad de la
   remisión. `f460_rowid_pv_docto` la une (cuando existe) al PDV origen;
   `f460_rowid_docto_factura` la une a la factura si ya se facturó.
   **Confirmado por comentario de código que existen filas de `t470` SIN
   línea de pedido asociada** (`lineaPedidoRowId: null`, clasificadas como
   `VENTA_DIRECTA`) — la relación PDV→remisión **no es 1:1 garantizada**.
7. `t461_cm_docto_factura_venta.f461_rowid_docto` es la identidad de la
   factura de venta. Unida a remisión vía `t460.f460_rowid_docto_factura`,
   nunca directamente desde `t431`/`t430`.
8. **`v470_ventas` es una VISTA distinta de `t470_cm_movto_invent`, aunque
   comparten el prefijo "470".** `v470_ventas` trae costo/margen
   (`v470_costo_prom_tot`, `v470_utilidad_prom`) y se une a `t461` vía
   `v470_rowid_docto_fact` — **no** a `t430`/`t431`. Es la fuente de
   margen/costo mencionada en el contexto del encargo, y es una tabla/vista
   completamente distinta de la cadena PDV→remisión (`t470`). Confundirlas
   sería un error real — el código actual ya las mantiene separadas con
   cuidado (comentarios explícitos verificando reconciliación en vivo).
9. `resolverCiaSiesa`/`Tenant.siesaCiaId`: un tenant sin compañía configurada
   devuelve `null`, nunca cae a una compañía por defecto (confirmado en
   `lib/siesa-tenant.ts`, comentario explícito: "nunca `1` adivinado").
10. Todo query auditado en `siesa-pedidos.service.ts`/
    `siesa-remisiones.service.ts` que devuelve datos de UN cliente
    **siempre** filtra por `(ciaId, clienteRowId)` en el propio `JOIN` SQL
    contra `t430`/`t460`, no solo en una capa posterior — así, un
    `pedidoRowId`/`remisionRowId` de otro cliente/compañía nunca devuelve
    filas (0 filas = 404 silencioso, mismo patrón IDOR que el resto del
    sistema).
11. Todas las consultas de listado (`leerPedidosClienteSiesa`,
    `leerHistoricoVentasSiesa`, etc.) usan `OFFSET/FETCH` server-side —
    **nunca** se trae una tabla completa a Node. Confirmado contra
    volúmenes reales citados en comentarios (85K+ documentos en `t461`).

**Lo que el repo NO confirma (no inventar):** no hay ninguna consulta ni
comentario sobre un procedimiento almacenado, API REST, cola de mensajes o
cualquier otro mecanismo de **escritura** hacia Siesa. Todo el acceso
existente es `SELECT`. No hay evidencia de un campo "estado de aprobación"
distinto de `f430_ind_estado`/`f430_ind_ult_estado_aprobado` (leídos, nunca
explicados más allá de lo que el nombre sugiere — no se debe asumir su
significado exacto sin confirmarlo con Siesa/negocio).

---

## 6. Supuestos / inferencias (marcados explícitamente, no son hechos)

- **INFERENCIA:** se asume que "publicar un Pedido a Siesa" significaría, en
  algún momento futuro, crear un documento `t430` (tipo `CDV` u otro) desde
  RicoSoft. **Esto no está confirmado en el repo** — no existe ningún
  mecanismo de escritura hoy, y el mandato de esta fase es explícitamente no
  diseñar esa escritura salvo documentar qué se necesitaría (sección 9).
- **INFERENCIA:** se asume que, mientras no exista escritura, el flujo real
  y viable a corto plazo es el mismo que ya existe para Cotización: alguien
  crea el PDV manualmente en Siesa (fuera de RicoSoft) y luego lo **vincula a
  mano** desde RicoSoft. Es la única vía que el código actual demuestra que
  funciona.
- **INFERENCIA:** el significado exacto de `f430_ind_estado` (numérico) no
  está documentado en el repo más allá de leerse y mostrarse tal cual
  (`estado: number | null` en `PedidoClienteSiesa`) — no se debe traducir a
  español ni mapear a un estado de negocio sin confirmarlo con Siesa.
- **SUPUESTO DE DISEÑO (no hecho):** se asume que un PDV, una vez vinculado,
  puede volver a consultarse en vivo cuantas veces se quiera sin costo alto
  (mismo patrón ya usado en Ficha 360) — no hay evidencia de límites de
  Siesa sobre esto, es una extrapolación razonable del uso actual.

---

## 7. Diseño funcional propuesto

### 7.1 Flujo completo, paso a paso

1. **Creación** — sin cambios: `crearPedidoDesdeProforma` (ya existe).
2. **Validaciones** — sin cambios funcionales; se recomienda (DECISIÓN #4)
   evaluar si al pasar a `CONFIRMADO` se debe revalidar `itemRowId`/
   `clienteRowId` contra Siesa en vivo (hoy no se hace, R-07).
3. **Aprobación/Confirmación** — sin cambios: `confirmarPedido` (ya existe).
4. **Momento de publicación** — **NUEVO, propuesto:** solo permitido desde
   `LISTO_PARA_ERP` (el estado que hoy ya es terminal de facto). Un Pedido
   en `BORRADOR`/`CONFIRMADO` nunca se vincula a Siesa — evita vincular algo
   que todavía puede cambiar.
5. **Creación/identificación del PDV** — **fuera del alcance de escritura de
   esta fase** (sección 9). En la primera iteración viable: el documento ya
   existe en Siesa (creado por el proceso operativo actual, sea cual sea) y
   RicoSoft solo lo **busca y vincula**, exactamente como `asignarErpCotizacion`.
6. **Obtención del `f430_rowid`** — por búsqueda (`buscarCotizacionesSiesa`,
   ya existe, reutilizable tal cual) o por captura manual del rowid/consecutivo
   visible, revalidado siempre contra Siesa antes de persistir (mismo patrón
   ya validado).
7. **Asociación Pedido↔PDV** — **NUEVO:** persistir en los campos `erp*` ya
   existentes en `PedidoComercial` (reutilizar, no duplicar — ver 7.3).
8. **Asociación de líneas con `f431_rowid`** — **NUEVO, opcional en la
   primera iteración** (ver DECISIÓN #2): permite trazabilidad línea a línea,
   pero añade complejidad de mapeo Pedido-línea ↔ PDV-línea que hoy no existe
   en ningún módulo (ni siquiera Cotización lo hace).
9. **Consulta de estado** — reutilizar `leerCotizacionSiesa`/
   `leerLineasPedidoClienteSiesa` en vivo; **nunca** persistir el estado del
   documento Siesa como una copia que se desactualice (ver 7.5, snapshot vs.
   vivo).
10. **Remisión** — solo lectura, reutilizando
    `leerTrazabilidadPedidoClienteSiesa`/`leerRemisionesClienteSiesa`
    (adaptadas para no depender de `clienteRowId` del PARÁMETRO de la URL de
    Ventas, sino del `clienteRowId` ya persistido en el propio
    `PedidoComercial`).
11. **Facturación** — solo lectura, misma fuente (`t461` vía la cadena de
    remisión, o `leerHistoricoVentasSiesa` filtrado por cliente+fecha como
    fallback si la remisión no tiene factura vinculada todavía).
12. **Manejo de errores** — un fallo de Siesa (timeout, documento no
    encontrado, ciaId no configurado) **nunca** debe dejar el Pedido en un
    estado que sugiera éxito. Ver 7.4 (estado de integración) y sección 12.
13. **Reintentos** — el usuario reintenta el mismo POST idempotente (sección
    12); no hay reintento automático en background en esta fase (evitar
    sobre-ingeniería, regla 13 del encargo).
14. **Cancelación/anulación** — anular un Pedido ya vinculado a un PDV
    **no** debe intentar anular nada en Siesa (RicoSoft no escribe). Solo
    cambia el estado comercial local; el vínculo (`erpRowId`) se conserva
    como historial, nunca se borra.
15. **Auditoría** — reutilizar el patrón exacto de
    `COTIZACION_DOCUMENTO_ERP_ASIGNADO` → nueva acción
    `PEDIDO_COMERCIAL_DOCUMENTO_ERP_ASIGNADO`.

### 7.2 Reutilización explícita (regla 9 del encargo)

| Necesidad | Se reutiliza tal cual de |
|---|---|
| Resolver `ciaId` del tenant | `lib/siesa-tenant.ts::resolverCiaSiesa` (y de paso, consolidar los 5 duplicados) |
| Buscar/validar PDV contra Siesa | `siesa-pedidos.service.ts::leerCotizacionSiesa`/`buscarCotizacionesSiesa` |
| Consultar líneas del PDV | `siesa-pedidos.service.ts::leerLineasPedidoClienteSiesa` |
| Trazabilidad remisión/factura | `siesa-pedidos.service.ts::leerTrazabilidadPedidoClienteSiesa` |
| Patrón de endpoint "asignar-erp" | `cotizaciones.controller.ts::asignarErpCotizacion` (copiar estructura, no el código literal — Pedido tiene sus propias reglas de estado) |
| Campos de persistencia | `PedidoComercial.erpTipoDocumento/erpRowId/erpNumero/erpFechaSincronizacion/erpEstadoSincronizacion` (YA EXISTEN) |
| Patrón de auditoría | `Auditoria` genérica, mismo `entidadTipo`/`entidadId` que ya usa todo Comercial |

---

## 8. Diseño técnico propuesto (visión general — detalle en secciones 10-15)

No se propone ninguna tabla nueva en la primera iteración. Los 5 campos
`erp*` de `PedidoComercial` ya cubren lo mínimo necesario para persistir el
vínculo (documento, rowid, número visible, cuándo, y un estado de
sincronización). Lo que falta es:

1. Un **endpoint de vinculación manual** (`asignar-erp`, espejo de
   Cotización) — sin tabla nueva.
2. Decidir si el "estado de integración" sigue viviendo en la misma columna
   `estado` (como está diseñado hoy) o se separa (DECISIÓN #1) — si se
   separa, **sí** requeriría una columna nueva (`estadoIntegracion` o
   similar), que sería la única migración de este diseño.
3. Si se decide trazabilidad línea a línea (DECISIÓN #2), una tabla nueva
   pequeña (`PedidoComercialItem.erpMovtoRowId Int?`, columna simple, no
   tabla nueva) sería suficiente — no se necesita una tabla de mapeo
   separada.

---

## 9. Si el flujo futuro requiere escritura hacia Siesa (documentado, NO implementado)

Por mandato explícito del encargo, esto es solo documentación de lo que
haría falta, no una propuesta a implementar ahora:

- **Qué dato tendría que enviarse:** encabezado (cliente `f200_rowid`,
  compañía `f430_id_cia`, fecha, vendedor) + líneas (ítem `f120_rowid`,
  cantidad, precio, descuentos) — equivalente a lo que hoy ya se captura en
  `PedidoComercial`/`PedidoComercialItem`.
- **En qué momento:** al pasar de `LISTO_PARA_ERP` a un intento de
  publicación, únicamente si el usuario lo dispara explícitamente (nunca
  automático en background, para no crear documentos en Siesa sin control
  humano directo).
- **Qué mecanismo sería necesario:** el repo **no tiene hoy ningún cliente
  de escritura hacia UnoEE** (ni API REST de Siesa, ni un stored procedure
  documentado, ni una cola). El pool actual (`getSiesaPool`) es un cliente
  `mssql` genérico — técnicamente PODRÍA ejecutar un `INSERT`, pero:
  - no hay evidencia de que exista un procedimiento oficial de UnoEE para
    esto (escribir directo a `t430`/`t431` sin pasar por la lógica de
    negocio de Siesa sería peligroso y no está avalado por nada en el repo);
  - el mandato explícito de la Fase 3 prohíbe diseñar esa escritura directa.
- **Qué respuesta de Siesa se necesitaría:** como mínimo, el `f430_rowid`
  generado (para completar el ciclo de identidad ya diseñado en 7.1) y una
  confirmación de que el documento quedó creado correctamente (código de
  error si no).
- **Qué identificador regresaría:** `f430_rowid` (int) — el mismo campo que
  ya se persiste manualmente hoy en `Cotizacion.erpRowId`.

**Conclusión de esta sección:** la vía de escritura queda como decisión de
negocio/infraestructura futura y separada (mismo criterio que el audit
previo aplicó a "ajustar inventario en Siesa desde Toma Física" — sección 31
de ese documento). No se diseña aquí más allá de esta enumeración.

---

## 10. Modelo de datos propuesto

### 10.1 Reutilización de columnas existentes (sin migración)

```
PedidoComercial.erpTipoDocumento  → "CDV" (mismo valor que ya usa Cotizacion)
PedidoComercial.erpRowId          → f430_rowid (Int) — YA EXISTE, sin usar
PedidoComercial.erpNumero         → número visible del PDV (ej. "PDV-34147") — YA EXISTE
PedidoComercial.erpFechaSincronizacion → fecha del último vínculo/verificación — YA EXISTE, sin usar
PedidoComercial.erpEstadoSincronizacion → ver DECISIÓN #1 — YA EXISTE, sin usar
```

### 10.2 Unicidad — GAP a corregir (no existe hoy en ningún modelo hermano)

Se propone (pendiente de aprobación, ver DECISIÓN #3):

```
@@unique([tenantId, erpRowId])   -- solo cuando erpRowId no es null
```

SQL Server soporta índice único filtrado (`WHERE erpRowId IS NOT NULL`) —
Prisma lo expresa como índice único parcial vía `@@unique` sobre un campo
nullable (Prisma permite múltiples `NULL` en una columna única por defecto
en SQL Server, que es exactamente el comportamiento deseado: muchos pedidos
sin vincular, pero un `erpRowId` no puede repetirse dos veces cuando sí está
presente). Esto es lo que le falta a `Despacho.siesaDocRowId` (R-01) y a
`Cotizacion`/`Proforma.erpRowId` (R-02) — se recomienda aplicar el mismo
fix a los tres si se aprueba, no solo al nuevo.

### 10.3 Qué debe ser snapshot vs. vivo

| Dato | Snapshot en RicoSoft | Vivo desde Siesa |
|---|---|---|
| Cliente/producto/cantidades del Pedido | ✅ (ya es así — copiado de la Proforma al crear) | — |
| `erpRowId`/`erpNumero`/`erpTipoDocumento` (identidad del vínculo) | ✅ (una vez vinculado, no cambia) | — |
| Estado real del documento en Siesa (aprobado, backorder, etc.) | ❌ nunca copiar/cachear | ✅ siempre en vivo, bajo demanda |
| Líneas del PDV, remisiones, facturas | ❌ | ✅ siempre en vivo (mismo patrón que Ficha 360) |
| Cupo/crédito del cliente | ❌ | ✅ (ya existe en `siesa-clientes.service.ts`) |

### 10.4 Índices

`erpRowId` ya quedaría cubierto por el `@@unique` propuesto (que también
sirve como índice de búsqueda). No se requieren índices adicionales para
esta fase — las consultas de trazabilidad se hacen contra Siesa (ya
indexado del lado de UnoEE, fuera de control de RicoSoft) o contra
`PedidoComercial` por `id`/`tenantId` (ya cubierto por índices existentes).

### 10.5 Ligado al tenant

Sin cambios respecto al patrón ya universal en el repo: `tenantId` en la fila
+ `ciaId` resuelto siempre server-side vía `resolverCiaSiesa(tenantId)`, y
todo `WHERE` contra Siesa incluye `ciaId` explícito. **Nunca** se acepta un
`ciaId` del frontend (ya es así en el 100% del código auditado, sin
excepciones encontradas).

---

## 11. Flujo de estados propuesto

Se diferencian explícitamente los tres conceptos que el encargo pide no
mezclar — **aunque el schema actual (antes de esta auditoría) ya los mezcla
parcialmente** (R-04). Se documentan aquí los tres por separado; cuál de las
dos opciones de DECISIÓN #1 se implementa queda pendiente de aprobación.

**A. Estado comercial del Pedido RicoSoft** (sin cambios — ya existe y
funciona):
```
BORRADOR → CONFIRMADO → LISTO_PARA_ERP → ANULADO
```

**B. Estado de integración (RicoSoft↔Siesa)** — conceptualmente nuevo,
independiente del anterior:
```
NO_VINCULADO → VINCULANDO → VINCULADO → ERROR_VINCULACION
```
- `NO_VINCULADO`: default, ningún `erpRowId`.
- `VINCULANDO`: transitorio, mientras la llamada a Siesa está en curso
  (relevante solo si se decide que sea asíncrono — sección 12).
- `VINCULADO`: `erpRowId` persistido y validado contra Siesa.
- `ERROR_VINCULACION`: el intento falló (documento no existe, Siesa caído,
  timeout) — **nunca** implica que el Pedido comercial retroceda de estado;
  el Pedido sigue en `LISTO_PARA_ERP`, solo su integración quedó en error, y
  el usuario puede reintentar.

**C. Estado del documento SIESA** — nunca se persiste, siempre se consulta
en vivo (ver 10.3): `f430_ind_estado`, `f430_ind_ult_estado_aprobado`,
`f430_ind_backorder` tal como ya se leen hoy en
`leerPedidosClienteSiesa`.

---

## 12. Diseño de API propuesto

Ninguno de estos endpoints se implementa en esta fase.

### `POST /comercial/pedidos/:id/asignar-erp`
- **Permiso:** `PEDIDOS_COMERCIALES_GESTIONAR` (mismo criterio que
  `asignarErpCotizacion` usa `COTIZACIONES_GESTIONAR` — es una corrección/
  vínculo manual del documento, no una "confirmación" de autoridad).
- **Request:** `{ erpRowId: number }` (positivo, entero — mismo schema que
  `asignarErpCotizacionSchema`).
- **Response 200:** `{ id, erpTipoDocumento, erpRowId, erpNumero,
  erpFechaSincronizacion }`.
- **Errores:** 400 (Pedido no está en `LISTO_PARA_ERP` — regla nueva, no
  existe en Cotización porque Cotización no tiene esa restricción de
  estado), 400 (tenant sin `siesaCiaId`), 404 (Pedido no encontrado en el
  tenant), 400/404 (documento no existe en Siesa para esa compañía), 409
  (ese `erpRowId` ya está vinculado a otro Pedido del tenant — requiere
  DECISIÓN #3), 502 (Siesa no responde).
- **Tenant scope:** sí, `findFirst({id, tenantId})` antes de tocar nada.
- **Consulta:** SIESA (validación) + RicoSoft (persistencia).
- **Síncrono/asíncrono:** **síncrono** en la primera iteración (una sola
  consulta a `leerCotizacionSiesa`, ya usada síncronamente hoy en Cotización
  sin problema reportado) — ver DECISIÓN #5 si el volumen/latencia lo
  justificara a futuro.

### `GET /comercial/pedidos/:id/trazabilidad-siesa`
- **Permiso:** `PEDIDOS_COMERCIALES_VER`.
- **Request:** sin body; usa el `erpRowId`/`clienteRowId` ya persistidos en
  el Pedido.
- **Response 200:** `{ disponible: boolean, lineas: [...], motivo?: string }`
  — mismo shape que `obtenerTrazabilidadPedido` de `ventas.controller.ts`,
  reutilizando la función de servicio tal cual.
- **Errores:** 400 (Pedido sin `erpRowId` — "Este pedido todavía no está
  vinculado a un documento Siesa"), 404 (Pedido no encontrado en el
  tenant).
- **Tenant scope:** sí.
- **Consulta:** SIESA (en vivo, sin cache — igual que Ficha 360).
- **Síncrono/asíncrono:** síncrono (mismo patrón ya en producción en
  `ventas.controller.ts`).

### `DELETE /comercial/pedidos/:id/asignar-erp` (desvincular)
- **Permiso:** `PEDIDOS_COMERCIALES_GESTIONAR`.
- **Uso:** corregir un vínculo hecho por error (mismo caso de uso que
  justifica que `asignar-erp` de Cotización permita "corregir", según su
  propio comentario: "vincula/**corrige a mano**").
- **Response 200:** Pedido con `erp*` en `null`.
- **Tenant scope:** sí.
- **Consulta:** solo RicoSoft (no requiere validar contra Siesa para
  desvincular).
- **Síncrono.**
- **Nota:** este endpoint **no existe** para Cotización hoy (el patrón
  actual solo permite "asignar", nunca "quitar") — es una extensión nueva,
  útil precisamente porque se detectó el vacío al diseñar el caso de
  "vinculación errónea" (sección 13, caso de prueba).

**No se propone** ningún endpoint de "publicar/crear PDV" en esta fase (eso
requeriría escritura, fuera de alcance — sección 9).

---

## 13. Diseño frontend

Cada elemento se justifica por una necesidad operativa concreta, no por
"quedaría bien":

| Elemento | Justificación | Precedente ya existente a reutilizar |
|---|---|---|
| Badge "Vinculado a PDV-XXXXX" / "Sin vincular" en el detalle del Pedido | El usuario necesita saber, de un vistazo, si este pedido ya tiene su contraparte en Siesa antes de asumir que "está listo" | Mismo badge de `erpNumero` que ya se muestra en Cotización (confirmado que `PedidoComercial.erpNumero` ya está en el DTO del frontend, sección 2.9) |
| Botón "Vincular documento Siesa" (solo visible en `LISTO_PARA_ERP`, con permiso `GESTIONAR`) | Acción explícita, controlada — evita vincular pedidos que todavía pueden cambiar | Mismo patrón de `asignarErp` ya implementado en la UI de Cotización (confirmar diseño exacto en el componente real al implementar) |
| Pestaña "Trazabilidad Siesa" (líneas → remisiones → factura), solo si `erpRowId` no es null | Es la razón de negocio completa de este encargo: saber qué pasó después de vincular | Reutilizar el componente/patrón visual ya usado en la Ficha 360 del cliente (`ventas` module) — **no reinventar la UI**, adaptar la ya existente |
| Mensaje de error explícito si Siesa no responde ("No fue posible validar con Siesa, intenta de nuevo") | Coherente con el patrón ya universal (`disponible:false, motivo:...`) en todo el frontend de Siesa | Mismo patrón textual ya usado en Ventas/Despachos |
| **NO se propone** mostrar `f430_ind_estado` traducido a español en la UI | Su significado exacto no está confirmado (sección 6) — mostrarlo mal traducido sería peor que no mostrarlo | — |
| **NO se propone** un dashboard nuevo de "pedidos pendientes de vincular" en esta fase | No hay evidencia de que el volumen lo justifique todavía (regla 13, evitar sobre-ingeniería) — se puede resolver con el filtro `estado=LISTO_PARA_ERP` ya existente en el listado | `listarPedidos` ya soporta filtro por `estado` |

---

## 14. Estrategia de idempotencia (diseño, no implementación)

| Escenario | Diseño propuesto |
|---|---|
| Se intenta publicar (vincular) dos veces con el mismo `erpRowId` | Rechazado en BD por el `@@unique([tenantId, erpRowId])` propuesto (10.2) — el segundo intento recibe 409 con el Pedido que ya lo tiene, no un duplicado silencioso. **Sin este constraint, el diseño no es idempotente** (mismo defecto que R-01/R-02). |
| Se repite la consulta de trazabilidad | Sin efecto — es `GET`, sin escritura, naturalmente idempotente. |
| Se pierde la respuesta después de vincular (el request llegó a Siesa/BD pero el cliente no recibió la respuesta) | Como no hay escritura hacia Siesa (solo lectura+validación), "vincular" es en realidad un `UPDATE` local tras una lectura externa — si el `UPDATE` sí se aplicó, un reintento del usuario con el MISMO `erpRowId` es un no-op exitoso (mismo resultado, gracias al `@@unique` + lógica "si ya está vinculado a este mismo erpRowId, responder 200 en vez de 409"). Si el `UPDATE` no llegó a aplicarse, el reintento simplemente lo completa. |
| El usuario vuelve a presionar "Vincular" | Mismo caso anterior — el botón debe deshabilitarse mientras la request está en vuelo (UX), pero el backend debe ser seguro aunque no lo esté (no confiar solo en deshabilitar el botón). |
| Siesa responde con error (documento no existe, timeout) | El Pedido **permanece exactamente como estaba** (`LISTO_PARA_ERP`, sin `erpRowId`) — no hay estado intermedio persistido de "a medias". La validación contra Siesa ocurre ANTES del `UPDATE` a RicoSoft, nunca después (mismo orden que `asignarErpCotizacion` ya usa: primero `leerCotizacionSiesa`, luego `prisma.update`). |
| RicoSoft se reinicia durante la operación | Como no hay una operación de larga duración (una sola consulta síncrona + un `UPDATE`), no hay estado intermedio que sobreviva a un reinicio a medias — a diferencia de `SincronizacionSiesaLog` (que si necesita recuperación al arrancar, ver `recuperarSincronizacionesInterrumpidas` en `index.ts`), este diseño síncrono no lo requiere **mientras siga siendo síncrono** (ver DECISIÓN #5: si se vuelve asíncrono, sí se necesitaría un mecanismo de recuperación equivalente). |

**Precondición para que este diseño sea realmente idempotente:** el
`@@unique` de la sección 10.2 debe implementarse. Sin él, todo lo anterior
queda solo parcialmente garantizado (mismo defecto real ya presente en
`Despacho`, R-01).

---

## 15. Seguridad y multi-tenancy

- **Tenant isolation:** todo acceso a `PedidoComercial` ya pasa por
  `findFirst({id, tenantId})` (patrón universal del repo, sin excepciones
  encontradas en Comercial). El diseño nuevo no cambia esto.
- **Permisos:** reutilizar `PEDIDOS_COMERCIALES_VER`/`GESTIONAR` (sección
  12) — no se propone un permiso nuevo salvo que la revisión de negocio
  decida que "vincular a Siesa" merece su propio permiso especial (ver
  DECISIÓN #6, comparando con el patrón `APROBAR` que sí existe para
  Cotización).
- **IDOR:** el riesgo real no es sobre `PedidoComercial.id` (ya protegido),
  sino sobre `erpRowId`: un usuario del tenant A que adivine/pruebe un
  `erpRowId` que pertenece a un PDV del tenant B (compañía B en Siesa) no
  debe poder vincularlo. Esto ya está resuelto por diseño: `leerCotizacionSiesa`
  siempre filtra por `ciaId` del tenant autenticado — si el rowid pertenece a
  otra compañía, la consulta devuelve `null` y el endpoint responde 404/400,
  nunca revela que el documento existe en otra compañía.
- **Validación de `ciaId`:** nunca aceptado del frontend — siempre resuelto
  server-side (patrón ya universal, sección 2.13).
- **Acceso directo a documentos Siesa:** el nuevo endpoint de trazabilidad
  NO acepta un `erpRowId`/`pedidoRowId` arbitrario por parámetro — siempre
  usa el que ya está persistido y validado en el propio `PedidoComercial`
  del tenant (a diferencia de la Ficha 360 actual, que sí recibe
  `pedidoRowId` por URL, protegido solo por el `JOIN` con `clienteRowId`).
  Esto es un endurecimiento adicional respecto al patrón existente, no una
  regresión.
- **Auditoría:** toda vinculación/desvinculación genera `Auditoria` (patrón
  ya universal) con `entidadTipo: "PedidoComercial"`.
- **Datos expuestos al frontend:** nunca exponer `ciaId` ni ningún detalle de
  conexión/credenciales (mismo principio que ya rige en todo el sistema,
  confirmado también en el trabajo de monitoreo de Siesa de esta misma
  sesión). El `erpRowId` numérico sí es aceptable exponerlo (ya se expone
  hoy vía `Cotizacion.erpRowId` sin que eso represente un riesgo — es un
  identificador interno de Siesa, no un secreto).

---

## 16. Plan de pruebas detallado

### 16.1 Unitarias

| Caso | Objetivo |
|---|---|
| `asignarErpPedidoSchema` rechaza `erpRowId` no positivo/no entero | Validación de forma antes de tocar BD/Siesa |
| Máquina de estados: transición de vinculación solo permitida desde `LISTO_PARA_ERP` | La regla de negocio "solo se vincula un pedido listo" está codificada, no solo documentada |
| Serialización: un Pedido sin `erpRowId` no incluye datos de trazabilidad en la respuesta | Evita filtrar `undefined`/`null` de forma inconsistente al frontend |

### 16.2 Integración (reutilizando el patrón ya usado en `comercial.integration.test.ts`)

| Caso | Preparación | Acción | Resultado esperado |
|---|---|---|---|
| Vincular un Pedido `LISTO_PARA_ERP` a un PDV real | Tenant con `siesaCiaId` válido, Pedido en `LISTO_PARA_ERP`, `erpRowId` de un documento real de esa compañía (fixture o mock del pool Siesa) | `POST /comercial/pedidos/:id/asignar-erp {erpRowId}` | 200, `erpRowId`/`erpNumero`/`erpTipoDocumento` persistidos, `Auditoria` creada |
| Vincular un Pedido que NO está en `LISTO_PARA_ERP` | Pedido en `BORRADOR` | mismo POST | 400, sin cambios en BD |
| **Pedido tenant A + PDV tenant B (aislamiento multi-tenant)** | Tenant A y Tenant B con `siesaCiaId` distintos; `erpRowId` real de una compañía de Tenant B | Usuario de Tenant A intenta vincular su Pedido a ese `erpRowId` | 400/404 ("el documento no existe en esta compañía") — **nunca** 200, nunca revela que el documento sí existe en otra compañía |
| ciaId incorrecto / tenant sin `siesaCiaId` | Tenant sin `siesaCiaId` configurado | POST asignar-erp | 400 explícito ("Este tenant no tiene Siesa configurado"), sin intentar conectar |
| PDV inexistente | `erpRowId` que no existe en ninguna compañía | POST asignar-erp | 400/404 ("El documento indicado no existe") |
| Línea inexistente (si se implementa DECISIÓN #2) | `erpMovtoRowId` que no pertenece al `erpRowId` del Pedido | intento de vincular línea | 400, sin persistir |
| Cliente inexistente en Siesa | `clienteRowId` del Pedido no coincide con el `f430_rowid_tercero_fact` del PDV encontrado | POST asignar-erp | Diseño pendiente de decisión: ¿bloquear si el cliente no coincide, o solo advertir? (DECISIÓN #7) |
| **Duplicación: vincular el mismo `erpRowId` a un segundo Pedido del mismo tenant** | Pedido X ya vinculado a `erpRowId=100` | Pedido Y intenta vincularse también a `erpRowId=100` | 409, con el `@@unique` propuesto — mensaje indicando cuál Pedido ya lo tiene |
| Respuesta parcial de Siesa (encabezado existe, líneas fallan) | Mock que devuelve encabezado pero lanza error en la query de líneas | intento de vinculación (si el diseño exige líneas también) | Ninguna escritura parcial — todo o nada |
| **Timeout de Siesa** | Mock/fixture que simula timeout del pool | POST asignar-erp | 502, Pedido sin cambios, mensaje "no fue posible conectar con Siesa" (mismo patrón textual ya universal) |
| **Siesa caído (conexión rechazada)** | Mock que simula `ECONNREFUSED` | cualquier operación de esta sección | 502, mismo patrón, sin caer el proceso |
| **Documento ya publicado (repetir la misma vinculación)** | Pedido ya vinculado a `erpRowId=100` | Reintento del mismo `POST asignar-erp {erpRowId:100}` | 200 idempotente (no-op), NO 409 contra sí mismo — ver 14 |
| **Reintento después de error** | Primer intento falla por timeout | Segundo intento con los mismos datos, Siesa ahora responde | 200, vinculación completa — confirma que un error transitorio no deja el Pedido en un estado que bloquee reintentos |
| Desvincular y volver a vincular con otro `erpRowId` | Pedido vinculado a `erpRowId=100` | `DELETE asignar-erp` luego `POST asignar-erp {erpRowId:200}` | Ambas operaciones exitosas, auditoría de ambos eventos, `erpRowId=100` queda libre para otro Pedido |

### 16.3 Aislamiento multi-tenant (dedicado, además de los casos de 16.2)

- Un usuario del Tenant A nunca puede listar/ver la trazabilidad de un
  Pedido del Tenant B (`GET /comercial/pedidos/:id/trazabilidad-siesa` con
  un `id` de otro tenant → 404, mismo patrón que `obtenerPedido` ya prueba
  hoy — reutilizar el caso #6 de `permisos-ver-manipular.integration.test.ts`
  como plantilla).
- Dos tenants con `siesaCiaId` distintos, cada uno vinculando PDVs de su
  propia compañía en paralelo, no deben interferir entre sí (test de
  concurrencia liviano: dos vinculaciones simultáneas a compañías distintas
  deben completarse ambas sin error cruzado).

### 16.4 Permisos

- Usuario con `PEDIDOS_COMERCIALES_VER` pero sin `GESTIONAR` no puede
  vincular (403), sí puede consultar trazabilidad si ya está vinculado.
- Usuario sin ningún permiso de Comercial recibe 403 en todos los endpoints
  nuevos.
- (Si DECISIÓN #6 crea un permiso especial) Usuario con `GESTIONAR` pero sin
  el permiso especial no puede vincular, aunque sí edite el Pedido en otros
  aspectos.

### 16.5 Concurrencia

- Dos requests simultáneas intentando vincular el mismo Pedido a `erpRowId`
  distintos — solo una debe ganar (la segunda ve que el Pedido ya tiene
  `erpRowId` y responde 409, o se serializa por el `UPDATE` — a definir en
  implementación, pero el test debe existir).
- Dos requests simultáneas intentando vincular `erpRowId` iguales a Pedidos
  distintos del mismo tenant — el `@@unique` debe garantizar que solo una
  tenga éxito (test de carrera real, no solo lógico — mismo tipo de test que
  ya usa el repo para `P2002` en `crearPedidoDesdeProforma`, ver
  `esViolacionUnicidad`).

### 16.6 Regresión

- Todos los tests actuales de `comercial.integration.test.ts` y
  `permisos-ver-manipular.integration.test.ts` deben seguir pasando sin
  modificación (el diseño es puramente aditivo sobre columnas ya existentes).
- La suite completa de `ventas.integration.test.ts` no debe verse afectada
  (los servicios `siesa-pedidos.service.ts` se reutilizan tal cual, sin
  modificar sus funciones existentes — cualquier función nueva debe ser
  **aditiva**, no un cambio de firma de las ya usadas por Ventas).

---

## 17. Criterios de aceptación

1. Un `PedidoComercial` solo puede vincularse a un PDV cuya compañía Siesa
   coincida con `Tenant.siesaCiaId` del tenant dueño del Pedido — verificado
   por el `WHERE ciaId=@ciaId` en la consulta de validación, nunca por
   confianza en el frontend.
2. El identificador técnico Siesa (`f430_rowid`) queda persistido en
   `PedidoComercial.erpRowId`, de forma trazable (con fecha y, vía
   `Auditoria`, con quién lo vinculó).
3. Una segunda vinculación con el mismo `erpRowId` sobre el mismo Pedido es
   idempotente (200, no-op); sobre un Pedido distinto del mismo tenant es
   rechazada (409) — garantizado por constraint de base de datos, no solo
   por lógica de aplicación.
4. Un error de Siesa (timeout, caído, documento inexistente) nunca deja el
   Pedido con un `erpRowId` parcial o inconsistente — o queda completamente
   vinculado, o queda exactamente como estaba antes del intento.
5. Solo se puede vincular un Pedido en estado comercial `LISTO_PARA_ERP`.
6. Un usuario solo puede consultar/vincular documentos Siesa de Pedidos de
   su propio tenant — verificado con al menos un test de aislamiento
   cross-tenant explícito (Pedido tenant A + PDV tenant B).
7. Ningún endpoint nuevo acepta `ciaId` como parámetro de entrada del
   cliente.
8. La trazabilidad (líneas→remisiones→factura) se consulta siempre en vivo
   contra Siesa — nunca se persiste una copia que pueda desactualizarse.
9. Todas las pruebas de la sección 16.2/16.3/16.4 pasan, incluidos los casos
   negativos.
10. La suite completa de regresión (16.6) pasa sin modificaciones a tests
    existentes.
11. Ningún endpoint nuevo escribe hacia tablas de Siesa.
12. El botón/acción de vincular en frontend queda deshabilitado mientras la
    operación está en curso, y el backend es seguro aunque el usuario lo
    presione más de una vez de todas formas (criterio de UX + backend, no
    solo backend).

---

## 18. Riesgos y decisiones pendientes

Ver sección 4 (riesgos ya confirmados en el código actual) — no se repiten
aquí. Esta sección es solo sobre riesgos **del diseño propuesto**:

- Si se decide implementar trazabilidad línea a línea (DECISIÓN #2) sin
  definir antes cómo se mapea una línea RicoSoft a una línea Siesa cuando el
  PDV se creó fuera de RicoSoft (orden de líneas no garantizado, cantidades
  pueden no coincidir 1:1), el mapeo automático podría ser incorrecto — el
  diseño de esa sección debería ser manual/asistido, no automático por
  posición.
- Si se aprueba el `@@unique([tenantId, erpRowId])` (sección 10.2) pero NO
  se aplica también a `Despacho.siesaDocRowId`/`Cotizacion.erpRowId`/
  `Proforma`, quedaría una inconsistencia de rigor entre módulos hermanos
  del mismo repo (mismo problema, solucionado en un lugar y no en otro).

---

## 19. Plan de implementación por etapas (si se aprueba, ninguna ejecutada aquí)

1. **Etapa 0 — Decisiones bloqueantes:** resolver las 7 decisiones de la
   sección final antes de escribir una sola línea.
2. **Etapa 1 — Consolidar `resolverCiaSiesa`** (R-05): migrar los 5+1
   duplicados a `lib/siesa-tenant.ts`, sin cambiar comportamiento. Bajo
   riesgo, aditivo, no depende de ninguna decisión de negocio — se puede
   hacer primero e independiente.
3. **Etapa 2 — Tests de regresión para `asignarErpCotizacion`** (R-03):
   cerrar el hueco de pruebas del precedente existente ANTES de copiar su
   patrón — así el patrón que se reutiliza para Pedido queda probado en su
   origen.
4. **Etapa 3 — Migración aditiva:** `@@unique([tenantId, erpRowId])` sobre
   `PedidoComercial` (y, si se aprueba, sobre `Cotizacion`/`Proforma`/
   `Despacho.siesaDocRowId`) — requiere verificar primero que no existan ya
   duplicados en datos reales (consulta de verificación antes de aplicar el
   constraint).
5. **Etapa 4 — Backend:** `POST/DELETE /comercial/pedidos/:id/asignar-erp`,
   reutilizando servicios existentes, con toda la batería de tests de la
   sección 16.
6. **Etapa 5 — Frontend:** badge + botón + pestaña de trazabilidad,
   reutilizando el componente visual ya existente en Ficha 360.
7. **Etapa 6 (solo si negocio lo pide, DECISIÓN #2):** trazabilidad línea a
   línea.
8. **Etapa 7 (bloqueada por decisión de negocio externa, no técnica,
   sección 9):** escritura hacia Siesa — fuera del roadmap actual salvo
   nueva decisión explícita y separada.

---

## DECISIONES QUE REQUIEREN APROBACIÓN ANTES DE IMPLEMENTAR

1. **¿Se separa el estado de integración del estado comercial en
   `PedidoComercial`, o se mantiene `SINCRONIZADO`/`ERROR_SINCRONIZACION`
   como valores de la misma columna `estado`, tal como el schema ya lo
   anticipa hoy?** (R-04, sección 11). Mantenerlo mezclado es más barato
   (cero migración) pero pierde información (un Pedido anulado después de
   sincronizado no puede recordar que llegó a sincronizarse). Separarlo
   requiere una columna nueva.

2. **¿La primera iteración incluye trazabilidad línea a línea (Pedido↔línea
   PDV vía `f431_rowid`), o solo vínculo a nivel de documento (`f430_rowid`)
   en la primera entrega?** Ningún módulo hermano (ni Cotización) lo hace
   hoy a nivel de línea — sería la primera vez en el repo. Impacta
   directamente el alcance de la Etapa 6.

3. **¿Se aprueba agregar `@@unique([tenantId, erpRowId])` a
   `PedidoComercial`, y — de paso — corregir el mismo gap ya confirmado en
   `Despacho.siesaDocRowId` (R-01) y en `Cotizacion`/`Proforma.erpRowId`
   (R-02)?** Sin esto, la idempotencia del diseño (sección 14) queda
   incompleta, igual que ya está incompleta hoy en Despachos.

4. **¿Al confirmar un Pedido (`CONFIRMADO`) se debe revalidar
   `itemRowId`/`clienteRowId` en vivo contra Siesa, o se mantiene el
   comportamiento actual (sin validar, R-07) hasta el momento de vincular?**
   Cambia si el error "este ítem ya no existe" se detecta temprano (al
   confirmar) o tarde (al intentar vincular).

5. **¿La vinculación debe ser síncrona (como `asignarErpCotizacion` hoy) o
   asíncrona con un log de estado tipo `SincronizacionSiesaLog`?** Dado que
   hoy es una sola consulta de lectura (no un proceso largo), síncrono
   parece suficiente — pero si a futuro se agrega escritura real (sección 9),
   esa sí necesitaría el patrón asíncrono. Definir si se diseña ya pensando
   en ese futuro o se resuelve cuando llegue.

6. **¿"Vincular un Pedido a Siesa" debe ser un permiso especial separado de
   `PEDIDOS_COMERCIALES_GESTIONAR`** (como `COTIZACIONES_APROBAR` es
   independiente de `COTIZACIONES_GESTIONAR`), **o basta con reutilizar
   `GESTIONAR`** (como hoy hace `asignarErpCotizacion`, que NO tiene un
   permiso especial propio)? Definir el criterio de autoridad de negocio
   antes de codificar rutas.

7. **Si el `clienteRowId` del PDV encontrado en Siesa no coincide con el
   `clienteRowId` ya persistido en el `PedidoComercial`** (p. ej. alguien
   captura mal el `erpRowId` y apunta al PDV de otro cliente), **¿se
   bloquea la vinculación (400) o se permite con una advertencia?** Ningún
   precedente existente en el repo resuelve este caso exactamente
   (`asignarErpCotizacion` no compara clientes, solo confirma que el
   documento existe en la compañía correcta).
