# RicoSoft Enterprise — Auditoría de Arquitectura del Módulo Comercial

Fecha: 2026-09-02
Alcance: SOLO AUDITORÍA (lectura de código). No se modificó ningún archivo del
repositorio salvo la creación de este documento. No se ejecutó ninguna
operación destructiva ni migración.

Contexto reutilizado (no re-descubierto como nuevo): `RICOSOFT_MASTER_TECHNICAL_QA_AUDIT.md`
y `Reportes/RICOSOFT_HARDENING_FINAL_REPORT.md` documentan A-01, A-02, M-09,
M-01, A-03, M-04, M-10, M-05, M-03 como CORREGIDOS Y VALIDADOS, y M-02/A-04
como abiertos (frontend sin headers propios / rendimiento Siesa sin medir por
falta de VPN). El patrón "SEGURO POR RELACIÓN" de Despachos
(`DespachoLinea`/`DespachoNovedad`) se usa aquí como referencia de aislamiento
correcto.

---

## 1. Resumen ejecutivo

El menú "Comercial" del código no es un módulo cohesivo: es una colección de
siete capacidades con arquitecturas de datos radicalmente distintas entre sí,
unidas solo por aparecer juntas en la barra de navegación.

- **Ventas** (CONFIRMADO) no tiene modelo Prisma propio: es una capa de
  cálculo en vivo sobre Siesa (`server/src/modules/ventas/ventas.controller.ts`).
  No existe un "pedido" ni un "cliente" nativos de RicoSoft — todo vive en
  Siesa, ya facturado.
- **Oportunidades** (CONFIRMADO) no es ni siquiera un módulo backend propio:
  es un endpoint de Inventario (`GET /inventario/oportunidad-comercial`,
  `server/src/modules/inventario/inventario.controller.ts:197-233`) consumido
  por una ruta de frontend con nombre distinto (`src/routes/oportunidades.tsx`
  → `src/hooks/use-oportunidades.ts:37`). No existe modelo
  `Oportunidad` en `schema.prisma` — se buscó explícitamente y no existe.
- **Créditos de Clientes** (CONFIRMADO) es 100% nativo de RicoSoft
  (`CreditoCliente`, `schema.prisma:629-641`) y **desconectado de Siesa**: el
  campo `cliente` es texto libre, sin `clienteRowId` ni vínculo a
  `t200_mm_terceros`. Es la única pieza de "Comercial" que no lee ni compara
  contra la cartera real de Siesa — riesgo de que el saldo mostrado no
  coincida con la cartera contable real.
- **Inventario, Toma Física, Plan de Producción, Despachos** (CONFIRMADO)
  siguen consistentemente el patrón arquitectónico correcto documentado en el
  propio schema: Siesa es la fuente de verdad de existencias/ventas/BOM;
  RicoSoft solo persiste **decisiones y seguimiento operativo** (snapshots
  congelados, máquinas de estado, nunca escritura de vuelta a Siesa).
- **Despachos es el módulo mejor construido de todo Comercial**: aislamiento
  multi-tenant vía `req.tenantPrisma` (extensión con enforcement automático),
  transacciones atómicas para estado+auditoría, notificaciones, máquina de
  estados validada en backend. Es la referencia a seguir para el resto.
- **Plan de Producción y Gestión de Liquidación** (CONFIRMADO) tienen máquina
  de estados validada en backend, pero **cero registros de auditoría** en
  ningún cambio de estado — a diferencia de Despachos, que sí audita cada
  transición. Esto es una regresión del patrón ya corregido como M-04 en
  Solicitudes, reaparecida en dos módulos nuevos.
- **Cero escrituras hacia Siesa** confirmado de nuevo en todo
  `server/src/modules/integraciones-siesa/` y `server/src/config/siesa.ts`
  (grep de `INSERT INTO|UPDATE |DELETE FROM|MERGE` sin resultados de código
  ejecutable) — la frontera de solo lectura declarada en el mandato de esta
  auditoría se cumple en el 100% del código de Comercial revisado.

---

## 2. Estado actual del Comercial

El menú actual (Analítica, Ventas, Créditos de Clientes, Inventario, Toma
Física, Oportunidades, Plan de Producción, Despachos) mapea a exactamente
ocho rutas de frontend (`src/routes/analitica.tsx`, `ventas.tsx`,
`creditos.tsx`, `inventario.tsx`, `toma-fisica.tsx` + `toma-fisica.$id.tsx`,
`oportunidades.tsx`, `plan-produccion.tsx`, `despachos.tsx` +
`despachos.$id.tsx`), pero a **seis** módulos de backend reales
(`analitica`, `ventas`, `creditos`, `inventario`, `toma-fisica`,
`plan-produccion`, `despachos`; `gestion-liquidacion` no tiene ruta de menú
propia — se consume desde el Centro de Decisiones de Inventario) y a
**cinco** modelos Prisma nativos (`CreditoCliente`, `TomaFisica`/
`TomaFisicaLinea`, `PlanProduccion`, `GestionLiquidacion`, `Despacho`/
`DespachoLinea`/`DespachoNovedad`, `ConfiguracionInventario`,
`ProyeccionMensual`). "Oportunidades" no tiene módulo backend ni modelo
propio (ver sección 17).

`gestion-liquidacion` (CONFIRMADO, `server/src/modules/gestion-liquidacion/`)
pertenece funcionalmente a Comercial/Planeación (se origina desde el Centro
de Decisiones de Inventario) pero no aparece en el menú actual — es un
séptimo módulo de backend "huérfano" de navegación directa.

---

## 3. Inventario real de módulos

| Funcionalidad | Frontend | Backend | BD | Siesa | Estado | Evidencia |
|---|---|---|---|---|---|---|
| Ventas (disponibilidad, centro comercial, contexto de producto) | 🟢 `src/routes/ventas.tsx`, `use-ventas.ts` | 🟢 `ventas.controller.ts` | ⚪ sin modelo propio | 🟢 lectura en vivo | 🟢 | `server/src/modules/ventas/ventas.controller.ts:1-209` |
| Créditos de Clientes | 🟢 `src/routes/creditos.tsx` | 🟢 `creditos.controller.ts` | 🟢 `CreditoCliente` | ⚪ sin vínculo | 🟡 | `schema.prisma:629-641`, `creditos.controller.ts:1-237` |
| Inventario (Centro de Decisiones) | 🟢 `src/routes/inventario.tsx` | 🟢 `inventario.controller.ts` | 🟡 `ConfiguracionInventario` (solo umbrales) | 🟢 lectura en vivo | 🟢 | `inventario.controller.ts:1-488` |
| Toma Física | 🟢 `src/routes/toma-fisica.tsx`, `.$id.tsx` | 🟢 `toma-fisica.controller.ts` | 🟢 `TomaFisica`/`TomaFisicaLinea` | 🟢 snapshot al crear | 🟢 | `schema.prisma:643-685` |
| Oportunidades | 🟢 `src/routes/oportunidades.tsx` | 🔵 endpoint de Inventario, sin módulo propio | ⚪ sin modelo | 🟢 cálculo en vivo | 🔵 | `inventario.controller.ts:197-233`, `oportunidad-comercial-siesa.ts` |
| Plan de Producción | 🟢 `src/routes/plan-produccion.tsx` | 🟢 `plan-produccion.controller.ts` | 🟢 `PlanProduccion` | 🔵 origen manual/recomendación, sin snapshot BOM | 🟡 | `schema.prisma:711-737` |
| Gestión de Liquidación | 🟠 sin ruta de menú propia | 🟢 `gestion-liquidacion.controller.ts` | 🟢 `GestionLiquidacion` | 🔵 snapshot al crear | 🟡 | `schema.prisma:739-771` |
| Despachos | 🟢 `src/routes/despachos.tsx`, `.$id.tsx` | 🟢 `despachos.controller.ts` | 🟢 `Despacho`/`Linea`/`Novedad` | 🟢 origen obligatorio en doc. real | 🟢 | `schema.prisma:773-881`, `despachos.controller.ts:1-408` |
| Analítica (Ventas/Financiero/Gerencial) | 🟢 `src/routes/analitica.tsx` | 🟢 `analitica.controller.ts` | ⚪ sin modelo propio | 🟢 lectura en vivo | 🟢 | `server/src/modules/analitica/` |

Leyenda: 🟢 completo y consistente · 🟡 parcial/con brechas · 🔵 existe pero
con diseño distinto al asumido en el menú · 🟠 inconsistencia de navegación ·
🔴 crítico · ⚪ no aplica/no existe.

---

## 4. Arquitectura actual

Dos patrones de persistencia conviven en Comercial:

1. **Cálculo puro sobre Siesa, sin persistencia propia** (Ventas, Analítica,
   los bloques de solo-lectura de Inventario, Oportunidades): el controller
   arma queries SQL contra Siesa (`server/src/modules/integraciones-siesa/`),
   las pasa a funciones de dominio puras (`server/src/lib/*-siesa.ts`,
   `server/src/domain/planeacion/*`, `server/src/domain/ventas/*`) y devuelve
   JSON. Nunca escribe en `server/prisma`.
2. **Registro nativo de decisión/seguimiento operativo, con snapshot de
   Siesa congelado al crear** (Toma Física, Plan de Producción, Gestión de
   Liquidación, Despachos): el modelo Prisma nunca se relee contra Siesa
   después de creado — es fuente de verdad de **la decisión**, no de la
   existencia/venta real.

Créditos de Clientes no encaja en ninguno de los dos: es persistencia nativa
pura, sin ningún vínculo (ni snapshot ni lectura en vivo) a Siesa.

---

## 5. Frontend

`src/routes/` mapea 1:1 con la navegación de menú declarada en el prompt,
salvo Gestión de Liquidación (sin ruta propia — HIPÓTESIS: se maneja dentro de
`inventario.tsx`/Centro de Decisiones, no verificado línea por línea en esta
pasada). Cada ruta tiene su hook dedicado en `src/hooks/` (`use-ventas.ts`,
`use-creditos.ts`, `use-inventario.ts`, `use-toma-fisica.ts`,
`use-oportunidades.ts`, `use-plan-produccion.ts`, `use-despachos.ts`,
`use-analitica.ts`) que envuelve `fetchAuth` (`src/lib/session.ts`) — ningún
hook de Comercial parece mantener estado propio fuera de lo que devuelve el
backend (PENDIENTE DE VERIFICACIÓN: no se leyeron los ~9 hooks completos
línea por línea, solo `use-oportunidades.ts`).

## 6. Backend

Seis módulos (`ventas`, `creditos`, `inventario`, `toma-fisica`,
`plan-produccion`, `gestion-liquidacion`, `despachos`) más `analitica`. Todos
montan `authenticateJWT` primero; los que tocan modelos `MODELOS_TENANT_SCOPED`
(`toma-fisica`, `plan-produccion`, `gestion-liquidacion`, `despachos`,
`inventario` para configuración) además montan `attachTenantPrisma`
(`server/src/middleware/tenant-prisma.middleware.ts:13-19`). `ventas` y
`creditos` NO montan `attachTenantPrisma` — `ventas` no lo necesita (no toca
BD propia), `creditos` sí toca `CreditoCliente` (que SÍ está en
`MODELOS_TENANT_SCOPED`, `server/src/lib/tenant-prisma.ts:39`) pero usa el
cliente Prisma global con filtro manual de `tenantId` en cada query
(`creditos.controller.ts:29-33,91,141,183,217`) — funciona, pero es un patrón
distinto al resto de Comercial sin razón documentada (RECOMENDACIÓN: migrar
`creditos.controller.ts` a `req.tenantPrisma` por consistencia, no por
inseguridad — hoy no hay bug, ver sección 8).

## 7. Base de datos

Modelos nativos de Comercial en `server/prisma/schema.prisma`:

- `CreditoCliente` (629-641): `tenantId` directo, sin `clienteRowId` de Siesa.
- `TomaFisica`/`TomaFisicaLinea` (643-685): `TomaFisica` con `tenantId`
  directo; `TomaFisicaLinea` aislado por relación (`tomaFisicaId`).
- `ConfiguracionInventario` (687-709): `tenantId` único (una fila máx. por
  tenant), umbrales configurables.
- `PlanProduccion` (711-737): `tenantId` directo.
- `GestionLiquidacion` (739-771): `tenantId` directo.
- `Despacho`/`DespachoLinea`/`DespachoNovedad` (773-881): `Despacho` con
  `tenantId` directo + índice compuesto `[tenantId, estado]` y
  `[tenantId, siesaDocRowId]` (éste último previene despachos duplicados
  para el mismo documento de venta real — ver `despachos.controller.ts:115-118`);
  líneas/novedades aisladas por relación.
- `ProyeccionMensual` (883-894): `tenantId` directo, `@@unique([tenantId, mes, anio])`.

Todos los comentarios del schema declaran explícitamente (CONFIRMADO por
lectura directa del código fuente, no solo del comentario) que ninguno de
estos modelos escribe de vuelta a Siesa.

## 8. Multi-tenancy

`server/src/lib/tenant-prisma.ts` implementa una extensión de Prisma
(`getTenantPrisma`) con una lista curada `MODELOS_TENANT_SCOPED` (línea
33-60) que incluye `CreditoCliente`, `ProyeccionMensual`, `TomaFisica`,
`PlanProduccion`, `GestionLiquidacion`, `Despacho`. Para `findUnique`/
`findUniqueOrThrow` hace un post-chequeo (`tenant-prisma.ts:119-125`): si el
registro encontrado no pertenece al tenant, devuelve `null` en vez de
filtrar en el `where` (Prisma no permite añadir campos no-únicos al `where`
de `findUnique`) — patrón correcto y verificado. Para `update`/`delete`/
`upsert` hace un pre-chequeo con `findFirst` y redirige el `where` a un id
imposible si no pertenece al tenant (`tenant-prisma.ts:127-150`) — evita
mutar filas de otro tenant incluso si el controller olvida filtrar.

| Endpoint | Tenant seguro | Riesgo | Evidencia |
|---|---|---|---|
| `plan-produccion.controller.ts` (`actualizarEstadoPlanProduccion`) | Sí — vía extensión (`findUnique` post-check) | Bajo | `plan-produccion.controller.ts:56` usa `req.tenantPrisma!.planProduccion.findUnique({where:{id}})` sin `tenantId` explícito — CONFIRMADO seguro solo porque `PlanProduccion` está en `MODELOS_TENANT_SCOPED` |
| `gestion-liquidacion.controller.ts` (`actualizarEstadoGestionLiquidacion`) | Sí — mismo mecanismo | Bajo | `gestion-liquidacion.controller.ts:62` |
| `despachos.controller.ts` (`buscarDespachoDelTenant`) | Sí — extensión + re-verificación explícita antes de tocar líneas/novedades | Bajo | `despachos.controller.ts:39-41` |
| `toma-fisica.controller.ts` (`buscarTomaFisicaDelTenant`) | Sí — filtro manual explícito, sin usar la extensión (usa `prisma` global) | Bajo, pero patrón inconsistente | `toma-fisica.controller.ts:30-32` |
| `creditos.controller.ts` (todos los handlers) | Sí — filtro manual `tenantId` en cada `findFirst` antes de mutar | Bajo, pero patrón inconsistente (no usa `req.tenantPrisma` ni la extensión, pese a que `CreditoCliente` está en la lista curada) | `creditos.controller.ts:91,141,183,217` |
| `ventas.controller.ts` (todos) | N/A — no toca BD propia; `siesaCiaId` se resuelve SIEMPRE de `req.user!.tenantId`, nunca de query/body | Ninguno | `ventas.controller.ts:18-21` |
| `inventario.controller.ts` (lectura) | N/A — igual patrón: `siesaCiaId` resuelto del tenant autenticado | Ninguno | `inventario.controller.ts:68-72` (repetido en cada handler) |
| `DespachoLinea`/`DespachoNovedad`/`TomaFisicaLinea` (acceso directo sin pasar por el padre) | No hay endpoint que lo permita — todos pasan primero por `buscarDespachoDelTenant`/`buscarTomaFisicaDelTenant` | Bajo (mismo veredicto que M-08 del informe de hardening) | `despachos.controller.ts:320,341,387`; `toma-fisica.controller.ts:164` |

Conclusión de esta sección: **ningún hallazgo nuevo de fuga cross-tenant en
Comercial**. El riesgo real es de **proceso**, no de vulnerabilidad activa:
tres patrones distintos (extensión automática, filtro manual explícito,
resolución desde tenant autenticado) coexisten sin que nada impida que un
desarrollador nuevo, al copiar el patrón equivocado como plantilla, introduzca
un descuido — mismo riesgo estructural ya señalado como P3 en M-08 del
informe de hardening previo.

## 9. Autorización

Todos los permisos de Comercial están registrados en
`server/src/lib/permissions.ts:83-92` (`INVENTARIO_CONFIGURAR`,
`TOMA_FISICA_VER/GESTIONAR`, `PLAN_PRODUCCION_VER/GESTIONAR`,
`GESTION_LIQUIDACION_VER/GESTIONAR`, `VENTAS_VER`, `DESPACHOS_VER/GESTIONAR`)
más `CREDITOS_VER/GESTIONAR/ELIMINAR` (líneas 60-62) y `ANALITICA_VER` (línea
73, reutilizado por los endpoints de solo lectura de Inventario y
Oportunidades — ver nota en `inventario.routes.ts:21-24`). Todos los
endpoints de escritura de Comercial revisados usan `requirePermission` con
una clave que existe en el catálogo — no se encontró ningún endpoint sin
permiso o con un string de permiso no registrado.

Nota de diseño (CONFIRMADO, comentario explícito en el código): Inventario
reutiliza `analitica.ver` para todo lo de solo lectura, incluida
Oportunidades, en vez de tener permisos propios — decisión consciente
documentada en `inventario.routes.ts:21-24`, no un descuido.

**Auto-aprobación (patrón A-03)**: a diferencia de Solicitudes de Compra
(donde se bloqueó explícitamente que el solicitante apruebe su propia
solicitud), **ningún** módulo de Comercial con máquina de estados
(Plan de Producción, Gestión de Liquidación, Despachos) verifica que el
`responsableId` que crea el registro sea distinto de quien lo hace avanzar de
estado — CONFIRMADO por ausencia: no se encontró ningún chequeo equivalente
a `solicitud.solicitanteId === req.user!.id` en `plan-produccion.controller.ts`,
`gestion-liquidacion.controller.ts` ni `despachos.controller.ts`. Ver hallazgo
R-C-01 (sección 29).

## 10. Auditoría

| Módulo | Crea auditoría | Campos completos (`entidadTipo`/`entidadId`/`datosAnteriores`/`datosNuevos`) | Evidencia |
|---|---|---|---|
| Despachos — creación | Sí | Sí (parcial: solo `datosNuevos`, no `datosAnteriores` porque es creación) | `despachos.controller.ts:149-159` |
| Despachos — cambio de estado | Sí, transaccional con el `update` | Sí, completo | `despachos.controller.ts:277-291` |
| Despachos — novedad | Sí | Parcial (`entidadTipo`/`entidadId`, sin `datosAnteriores`/`datosNuevos`) | `despachos.controller.ts:351-360` |
| Despachos — resolver novedad | **No** | — | `despachos.controller.ts:378-407` — ninguna auditoría al resolver una novedad |
| Créditos — crear/editar/pago/paz y salvo/eliminar | Sí, en los 5 handlers | **No** — solo `accion`/`detalle` de texto libre, sin `entidadTipo`/`entidadId`/`datosAnteriores`/`datosNuevos` | `creditos.controller.ts:69-76,109-116,157-164,191-198,222-229` |
| Plan de Producción — crear/cambiar estado | **No, en ningún handler** | — | `plan-produccion.controller.ts` completo — cero llamadas a `auditoria.create` |
| Gestión de Liquidación — crear/cambiar estado | **No, en ningún handler** | — | `gestion-liquidacion.controller.ts` completo — cero llamadas a `auditoria.create` |
| Toma Física — crear/conteo/cerrar | **No, en ningún handler** | — | `toma-fisica.controller.ts` completo — cero llamadas a `auditoria.create` |
| Ventas / Inventario (solo lectura) | N/A | N/A | No mutan estado, no aplica |

Esto es el hallazgo más consistente de esta auditoría: **tres módulos
completos de Comercial (Toma Física, Plan de Producción, Gestión de
Liquidación) no dejan ningún rastro de auditoría**, pese a que todos mutan
estado de negocio (cerrar una toma física, aprobar/ejecutar una liquidación,
avanzar un plan de producción a "Terminada"). Es exactamente el tipo de
brecha que M-04 corrigió en Solicitudes — reaparece sin corregir en tres
módulos más nuevos. Ver hallazgo R-C-02.

## 11. Integración Siesa

Tabla de queries reales verificadas en `server/src/modules/integraciones-siesa/siesa-ventas.service.ts`
y `siesa-inventario.service.ts` que alimentan Comercial (no exhaustiva de
todo el archivo — se listan las usadas por los controllers de Comercial
auditados en esta pasada):

| archivo:línea | Tabla/vista Siesa | Campos clave | Filtros | Propósito | Endpoint | Pantalla |
|---|---|---|---|---|---|---|
| `siesa-ventas.service.ts:62-71` | `t461_cm_docto_factura_venta` | `f461_vlr_bruto`, `f461_vlr_dscto`, `f461_id_fecha` | `f461_id_cia`, `f461_id_fecha >= @desde` | Ventas mensuales por cabecera | usado por Analítica/Inventario (demanda) | `/analitica`, `/inventario` |
| `siesa-ventas.service.ts:104-114` | `t461_cm_docto_factura_venta` + `t200_mm_terceros` | cliente, bruto, dscto, neto | `f461_id_cia`, rango fecha | Top clientes por venta | Analítica | `/analitica` |
| `siesa-ventas.service.ts:172-187` | `v470_ventas` + `t120_mc_items` | kilos, neto, costo, margen | `f461_id_cia`, `v470_rowid_docto_fact IS NOT NULL`, `unidad_medida='KG'` | Actividad mensual en kilos por cliente | `obtenerCentroComercial` | `/ventas` (Centro Comercial) |
| `siesa-ventas.service.ts:233-246` | `v470_ventas` + `t120_mc_items` | itemRowId, cantidad, mes/año | `f461_id_cia`, `docto_fact IS NOT NULL` | Ventas mensuales por producto | Inventario (demanda/cobertura/producción) | `/inventario` |
| `siesa-ventas.service.ts:290-298` | `v470_ventas` | itemRowId, cantidad, neto | rango [desde,hasta) | Ventas por producto en rango (30/90/180d) | Inventario (ventanas de demanda) | `/inventario` (Centro de Decisiones) |
| `siesa-ventas.service.ts:342-356` | `v470_ventas` + join `t461` + `t200_mm_terceros` | neto, costo, margen por cliente | rango fecha | Rentabilidad por cliente | Analítica | `/analitica` |
| `siesa-ventas.service.ts:829-839` | `v470_ventas` + `t120_mc_items` | líneas de un documento específico | `v470_rowid_docto_fact = @docRowId` | Líneas reales del documento origen | `crearDespacho` | `/despachos` (crear) |
| `siesa-ventas.service.ts:877-892` | `t461_cm_docto_factura_venta` | cabecera de un documento específico | `f461_rowid_docto = @docRowId` | Documento origen del despacho | `crearDespacho` | `/despachos` (crear) |
| `siesa-ventas.service.ts:944-953` | `v470_ventas` | cantidad, neto, costo totales 90d | `itemRowId`, `desde` | Precio/costo promedio de venta de un producto | `obtenerContextoProducto` | `/ventas` (contexto de producto) |
| `siesa-ventas.service.ts:996-1010` | `v470_ventas` + `t461` + `t200_mm_terceros` | cantidad/neto históricos por cliente | `itemRowId`, `desde` | Clientes que compran un producto | `obtenerContextoProducto` | `/ventas` |
| `siesa-ventas.service.ts:1054-1071` | `v470_ventas` + `t461` + `t200_mm_terceros` + `t120_mc_items` | compra histórica cliente×producto (12m) | `f461_id_cia`, `desde` | Base de Oportunidad Comercial | `obtenerOportunidadComercialGerencial` | `/oportunidades` |
| `siesa-inventario.service.ts` (no releído línea por línea en esta pasada — HIPÓTESIS de continuidad con auditorías previas) | `t400_cm_existencia`, `t150_mc_bodegas` | existencias, bodegas | `f400_id_cia` | Inventario real, bodegas para Toma Física | Inventario, Toma Física, Despachos | `/inventario`, `/toma-fisica`, `/despachos` |

Confirmado (grep exhaustivo, sección 1 de este informe): **cero** resultados
de `INSERT INTO|UPDATE |DELETE FROM|MERGE ` como código ejecutable en todo
`server/src/modules/integraciones-siesa/` y `server/src/config/siesa.ts`.

## 12. Fuente de verdad por dominio

| Dominio | Fuente de verdad real | Evidencia |
|---|---|---|
| Existencia de inventario | Siesa (`t400_cm_existencia`), leída en vivo, nunca copiada | `inventario.controller.ts` (cada handler resuelve `siesaCiaId` y llama a Siesa en cada request) |
| Ventas/facturación real | Siesa (`t461_cm_docto_factura_venta`, `v470_ventas`) | Confirmado en sección 11 |
| Clientes (identidad, NIT) | Siesa (`t200_mm_terceros`) para Ventas/Despachos/Oportunidades — pero **NO** para Créditos | `despachos.controller.ts:125` congela `clienteNombre`/`clienteNit` desde el documento Siesa; `creditos.controller.ts` recibe `cliente` como texto libre del formulario, sin ningún cruce |
| Cartera/cuentas por cobrar reales | **PENDIENTE DE NEGOCIO** — no determinable en código | Ver sección 30, decisión D-C-01 |
| Decisión de producir/liquidar/despachar | RicoSoft (snapshot congelado al crear + máquina de estados propia) | `PlanProduccion`, `GestionLiquidacion`, `Despacho` — todos con comentario explícito de "nunca escribe a Siesa" en el schema |
| Toma física / diferencia de inventario | RicoSoft registra el conteo; Siesa sigue siendo la única fuente de la existencia "oficial" hasta que alguien ajuste manualmente en Siesa | `TomaFisica` (schema.prisma:643-650, comentario explícito) |

## 13. Ventas

No existe un módulo "Ventas" con CRUD propio: es una capa de 4 endpoints de
solo lectura (`GET /ventas/disponibilidad`, `/centro`, `/productos/buscar`,
`/productos/:itemRowId/contexto`) que calculan sobre Siesa en tiempo real
(`ventas.controller.ts:1-209`). No hay "pedido" de RicoSoft — un vendedor no
puede crear ni registrar una venta desde RicoSoft; solo puede **consultar**
disponibilidad, ver el "Centro Comercial" (clientes en riesgo + productos en
riesgo de quiebre, ambos reutilizados de otros módulos, sin cálculo nuevo) y
consultar contexto de producto (precio/margen/clientes reales). CONFIRMADO:
esto es coherente con la decisión arquitectónica documentada en el schema de
Despachos ("RicoSoft no tiene un modelo Pedido ni Cliente nativo").

## 14. Créditos de Clientes

Único módulo de Comercial **completamente desconectado de Siesa**
(CONFIRMADO). `CreditoCliente.cliente` es un `String` libre
(`schema.prisma:632`), sin relación a ningún tercero real de Siesa
(`t200_mm_terceros`, el mismo maestro que Ventas/Despachos/Oportunidades sí
usan). El cupo, saldo y estado ("Al día"/"Por vencer"/"Vencido"/"Paz y Salvo")
se gestionan 100% a mano por el usuario de RicoSoft
(`creditos.controller.ts:41-83,130-171,178-205`), sin cruzar contra la
cartera contable real de Siesa (que si existe, vive en módulos de cuentas por
cobrar que esta auditoría no tuvo mandato de revisar en profundidad). Esto es
un riesgo de **divergencia silenciosa**: nada impide que el saldo mostrado en
RicoSoft no coincida con el saldo contable real en Siesa, y no hay ningún
mecanismo de reconciliación. Ver decisión pendiente D-C-01 (sección 30).

## 15. Inventario

El bloque más maduro de Comercial: 9 endpoints (`resumen`, `demanda`,
`produccion-recomendada`, `oportunidad-comercial`, `cobertura`,
`abastecimiento`, `decisiones`, `configuracion` GET/PUT) todos derivados de
Siesa en vivo, con una función central reutilizable
(`construirContextoPlaneacionSiesa`, `inventario.controller.ts:338-389`) que
también consume el módulo `gerencial` (mencionado en el comentario, no
verificado en esta pasada). Umbrales configurables por tenant vía
`ConfiguracionInventario` (único modelo Prisma de este bloque, y solo
almacena parámetros de cálculo, nunca datos de inventario). El permiso de
lectura reutiliza `analitica.ver` de forma consciente y documentada (sección
9); solo la escritura de configuración tiene permiso dedicado
(`inventario.configurar`).

## 16. Toma Física

Modelo nativo de dos niveles (`TomaFisica`/`TomaFisicaLinea`) con snapshot
congelado de la existencia real de Siesa al crear
(`toma-fisica.controller.ts:99-121`) y diferencia calculada siempre en
lectura (`lib/toma-fisica.ts`, nunca persistida — evita datos
desactualizados). Máquina de estados simple: `Abierta` → `Cerrada`, sin
posibilidad de reabrir (`cerrarTomaFisica`, líneas 183-196). **Sin
auditoría** en ninguno de los tres verbos mutantes (crear, registrar conteo,
cerrar) — ver hallazgo R-C-02.

## 17. Oportunidades

**No existe como módulo backend independiente** (CONFIRMADO, no HIPÓTESIS: se
buscó `model Oportunidad` en `schema.prisma` y no aparece; se buscó
`oportunidades.controller.ts`/`oportunidades.routes.ts` y no existen). Es
puramente el endpoint `GET /inventario/oportunidad-comercial`
(`inventario.controller.ts:197-233`) más la función pura
`calcularOportunidadComercialSiesa` (`server/src/lib/oportunidad-comercial-siesa.ts`),
consumido por una ruta de frontend con nombre distinto
(`src/routes/oportunidades.tsx`). Es un cálculo determinista, probado con
datos fabricados (`oportunidad-comercial-siesa.test.ts`), sin ningún estado
propio, sin posibilidad de "actuar" sobre la oportunidad desde la UI (no crea
una cotización, un pedido ni un despacho directamente — es solo información).
Esta discrepancia entre el nombre del menú ("Oportunidades", sugiriendo un
módulo con ciclo de vida propio, como un CRM) y lo que realmente hay (un
reporte de solo lectura) es el hallazgo de arquitectura más importante de
esta sección — ver sección 27.

## 18. Plan de Producción

Modelo nativo simple con máquina de estados (`Planificada → Aprobada → En
producción → Parcial/Terminada`, con `Cancelada` alcanzable desde cualquier
estado no terminal, validada en `lib/plan-produccion.ts` y aplicada en
backend antes de escribir, `plan-produccion.controller.ts:61-63` — no es
solo una validación de frontend). Puede originarse a mano o desde una
recomendación de Bloque 4 de Inventario, pero el controller **no** conserva
ningún vínculo con esa recomendación (ni un campo `origenRecomendacion`, ni
un BOM congelado) — si se crea desde una recomendación y luego cambia el BOM
real en Siesa, no hay forma de saber si el plan sigue siendo viable
(PARCIAL). Sin auditoría en ningún verbo (sección 10).

## 19. Despachos

El módulo de referencia de todo Comercial. Máquina de estados completa
(`RECIBIDO → PREPARANDO → PREPARADO → PENDIENTE_CARGUE → CARGANDO → CARGADO
→ DESPACHADO → EN_TRANSITO → ENTREGADO|ENTREGA_PARCIAL`, con `CANCELADO`/
`DEVUELTO` como ramas), validada en backend (`lib/despachos.ts`,
`esTransicionValidaDespacho` + `camposRequeridosParaTransicion`,
`despachos.controller.ts:250-264` — exige campos concretos como
vehículo/conductor antes de permitir "CARGANDO", no solo el estado).
Siempre se origina desde un documento de venta real de Siesa
(`t461_cm_docto_factura_venta`), con `@@index([tenantId, siesaDocRowId])`
que previene duplicados (`despachos.controller.ts:115-118`). Auditoría
transaccional en el cambio de estado (`prisma.$transaction`, líneas 277-291)
y notificaciones dirigidas por permiso (`notificarPorPermiso`, líneas
293-305, 362-372). Único hueco de auditoría: `resolverNovedad` (línea
378-407) no deja rastro.

## 20. Analítica

No forma parte del mandato de exploración profunda de esta auditoría más
allá de lo ya usado como evidencia cruzada (`leerActividadMensualClientesSiesa`,
`calcularClientesEnRiesgoSiesa` compartidos con Ventas/Centro Comercial). Se
confirma que `analitica.controller.ts`/`analitica.routes.ts` existen y que
`ANALITICA_VER` es el permiso reutilizado por Inventario/Oportunidades
(sección 9). No se auditó su contenido completo — PENDIENTE DE VERIFICACIÓN
si se requiere una auditoría dedicada de Analítica en una siguiente fase.

## 21. Clientes y maestros

**No existe un maestro de clientes propio de RicoSoft** (CONFIRMADO por
ausencia: no hay modelo `Cliente` en `schema.prisma`). Cada módulo resuelve
"cliente" de forma distinta:
- Ventas/Despachos/Oportunidades: `t200_mm_terceros` de Siesa, en vivo o
  congelado como snapshot.
- Créditos: texto libre, sin maestro (sección 14).

Esto es una decisión arquitectónica consciente y documentada para
Ventas/Despachos (comentario explícito en `schema.prisma:776-778`: "RicoSoft
no tiene un modelo Pedido ni Cliente nativo"), pero **no** está documentada
como decisión consciente para Créditos — ahí simplemente no se implementó el
cruce. Ver decisión D-C-01.

## 22. Performance

Clasificación P0-P3 basada en patrones de código (no medición en runtime —
sin VPN disponible en este entorno, igual que A-04 del informe de hardening):

- **P1** — `obtenerCentroComercial` (`ventas.controller.ts:82-123`) hace 4
  llamadas a Siesa en paralelo (`Promise.all`), una de las cuales
  (`construirContextoPlaneacionSiesa`) internamente hace 7 llamadas más
  (`inventario.controller.ts:349-357`) — hasta ~10 queries reales a Siesa en
  un solo request, sin cache. Mismo patrón ya señalado como A-04 en el
  informe de hardening, reconfirmado aquí específicamente para Comercial.
- **P1** — `crearTomaFisica` (`toma-fisica.controller.ts:67-121`) lee TODA
  la existencia de una bodega completa de Siesa (`leerExistenciaPorBodegaSiesa`)
  y la inserta como N líneas en una sola operación `create` anidada — sin
  límite superior documentado ni paginación; para una bodega grande esto
  puede ser una escritura de miles de filas en una sola transacción implícita.
- **P2** — `listarCreditos` usa `take: 1000` como "límite de seguridad
  temporal" con un comentario propio admitiendo la falta de paginación real
  (`creditos.controller.ts:32`) — ya autodocumentado como deuda por el propio
  código.
- **P2** — `obtenerDecisionesPlaneacion`/`obtenerCoberturaGerencial`/
  `obtenerAbastecimientoGerencial` repiten la misma secuencia de llamadas a
  Siesa (`leerVentasMensualesPorProductoSiesa` + `leerExistenciasSiesa` +
  a veces `leerListaMaterialesSiesa`) en endpoints separados sin ningún cache
  compartido entre requests — cada carga de pantalla repite trabajo que otro
  endpoint ya hizo segundos antes.
- **P3** — `calcularPatronesRecurrentesTenant` (`toma-fisica.controller.ts:206-230`)
  carga TODAS las tomas físicas cerradas del tenant con TODAS sus líneas
  (`include: { lineas: true }`, sin límite) para calcular patrones — crece
  sin cota con el histórico.

Sin medición real de latencia contra Siesa (mismo motivo que A-04): esta
clasificación es de **patrón de código**, no de impacto medido.

## 23. Cache

**No existe ninguna capa de cache** en Comercial (CONFIRMADO por ausencia:
no se encontró Redis, cache en memoria, ni `Cache-Control` relevante en
ninguno de los controllers auditados). Cada request a un endpoint gerencial
de Inventario/Ventas repite las consultas a Siesa desde cero. Coherente con
la nota A-04 del informe de hardening: "no se introdujo caché — requiere
medición real primero".

## 24. Documentos

Ningún módulo de Comercial (Ventas, Créditos, Inventario, Toma Física, Plan
de Producción, Gestión de Liquidación, Despachos) sube archivos —
CONFIRMADO por ausencia de referencias a `upload.middleware.ts` en ninguno
de los controllers/rutas de estos módulos (a diferencia de Facturas/
Importaciones, que sí lo usan y ya tienen el fix M-03 de magic bytes). No
aplica ningún hallazgo de esta sección a Comercial.

## 25. Máquinas de estado

| Módulo | Estados | Validada en backend | Auto-aprobación bloqueada (patrón A-03) |
|---|---|---|---|
| Despachos | 10 estados, transiciones + campos requeridos | Sí (`lib/despachos.ts`) | No verificado ningún chequeo — ver R-C-01 |
| Plan de Producción | 5 estados | Sí (`lib/plan-produccion.ts`) | No — ver R-C-01 |
| Gestión de Liquidación | `PENDIENTE→EN_REVISION→APROBADA/RECHAZADA→EJECUTADA` | Sí (`lib/gestion-liquidacion.ts`, no releído línea por línea, HIPÓTESIS de que sigue el mismo patrón que los otros dos por estructura idéntica del controller) | No — ver R-C-01 |
| Toma Física | `Abierta→Cerrada` (sin retorno) | Sí (chequeo directo de `estado !== "Abierta"`) | N/A (no es un flujo de aprobación) |
| Créditos | `Al día/Por vencer/Vencido` (derivado) + `Paz y Salvo` (manual, terminal) | Sí (`calcularEstado`, `creditos.controller.ts:17-24`) | N/A |

## 26. Modelo de datos (conceptual, sin tocar schema.prisma)

Conceptualmente, Comercial tiene hoy tres familias de entidades sin relación
formal entre sí en el schema:

```
Siesa (solo lectura)          RicoSoft (decisión/seguimiento)      RicoSoft (huérfano de Siesa)
──────────────────           ─────────────────────────────        ────────────────────────────
t461/v470 (ventas)      ┐                                          CreditoCliente (cliente: texto)
t400 (existencia)       ├──► snapshot congelado ──► TomaFisica
t150 (bodegas)          ┤                       ──► Despacho
t120/t820 (items/BOM)   ┘                       ──► PlanProduccion
                                                 ──► GestionLiquidacion
                                                 ──► ConfiguracionInventario (solo umbrales)
```

No hay ninguna relación Prisma entre `Despacho` y `PlanProduccion`, ni entre
`GestionLiquidacion` y `TomaFisica`, aunque conceptualmente un plan de
producción podría originarse de una necesidad detectada en Toma Física, o
una liquidación podría afectar qué se despacha — hoy son silos
independientes que comparten solo el mismo `itemRowId` de Siesa como
referencia implícita, nunca una FK real.

## 27. Arquitectura funcional objetivo (RECOMENDACIÓN)

El árbol de menú actual mezcla dos naturalezas distintas bajo "Comercial":
**operación de venta/entrega** (Ventas, Créditos, Despachos) y **planeación
de inventario/producción** (Inventario, Toma Física, Plan de Producción,
Oportunidades, Gestión de Liquidación). RECOMENDACIÓN — reorganizar (sin
implementar aún) en dos sub-árboles:

```
Comercial
├── Operación Comercial
│   ├── Ventas (consulta/disponibilidad — ya existe)
│   ├── Créditos de Clientes (requiere decisión D-C-01 antes de evolucionar)
│   └── Despachos (ya maduro, sin cambios estructurales)
└── Planeación & Inventario
    ├── Centro de Decisiones (ya existe como /inventario)
    ├── Toma Física
    ├── Plan de Producción
    ├── Gestión de Liquidación (RECOMENDACIÓN: darle ruta de menú propia — hoy es huérfana de navegación, sección 2)
    └── Oportunidad Comercial (RECOMENDACIÓN: renombrar en el menú a "Oportunidad de Inventario" o similar — "Oportunidades" hoy comunica más de lo que el sistema realmente ofrece, sección 17)
```

Esta reorganización es de navegación/nomenclatura únicamente — no implica
mover modelos Prisma ni tocar rutas de API existentes.

## 28. Frontera RicoSoft ↔ Siesa

| Proceso | RicoSoft | Siesa | Transferencia |
|---|---|---|---|
| Registrar una venta/factura | No aplica — no existe en RicoSoft | Fuente única y real | N/A — RicoSoft nunca crea ventas |
| Consultar disponibilidad para vender | Calcula en vivo sobre datos de Siesa | Fuente de existencia/BOM | Lectura en cada request, sin cache |
| Decidir despachar | Crea `Despacho` desde un documento de venta ya existente en Siesa | Documento de venta ya facturado | Lectura al crear (snapshot), nunca más |
| Ejecutar el despacho físico | Seguimiento de estado 100% en RicoSoft | No participa | Ninguna — es un proceso paralelo, no un ajuste de Siesa |
| Contar inventario físico | Snapshot al crear, conteo y diferencia en RicoSoft | Fuente del "stock sistema" al momento de crear | Lectura al crear, nunca escritura de vuelta |
| Ajustar inventario por diferencia | **No lo hace RicoSoft** — queda como PENDIENTE DE NEGOCIO / DECISIÓN FUTURA si algún día se automatiza | El ajuste real, si ocurre, lo hace un usuario manualmente en Siesa | Ninguna (por diseño explícito) |
| Producir | `PlanProduccion` es seguimiento nativo; no crea una orden real en Siesa | No trackea WIP en tiempo real (confirmado en comentario del schema: `t851_mf_op_docto_item` con 0 líneas abiertas) | Ninguna |
| Liquidar inventario obsoleto | `GestionLiquidacion` registra la decisión; "EJECUTADA" es solo un registro | La acción comercial real ocurre fuera de RicoSoft | Ninguna hoy — ver nota explícita del schema sobre integración futura, marcada como decisión de negocio separada |
| Gestionar cartera/crédito de cliente | Registro 100% manual, sin cruce | Posible fuente real de cartera (no verificado en esta auditoría — fuera del árbol de módulos revisado) | Ninguna — ver D-C-01 |

## 29. Riesgos

| ID | Severidad | Categoría | Módulo | Hallazgo | Evidencia | Impacto | Recomendación |
|---|---|---|---|---|---|---|---|
| R-C-01 | P1 | Autorización/proceso | Plan de Producción, Gestión de Liquidación, Despachos | Ningún chequeo de auto-aprobación (patrón A-03) en las transiciones de estado de estos tres módulos | Ausencia confirmada en `plan-produccion.controller.ts`, `gestion-liquidacion.controller.ts`, `despachos.controller.ts` — sin ningún `=== req.user!.id` comparado con `responsableId` | Quien crea un plan/liquidación/despacho puede aprobarlo/ejecutarlo/despacharlo él mismo sin segundo control, igual que el caso ya corregido en Solicitudes | Confirmar con negocio si aplica el mismo control que A-03 a estos flujos (ver D-C-02) antes de implementar |
| R-C-02 | P1 | Auditoría | Toma Física, Plan de Producción, Gestión de Liquidación | Cero registros de auditoría en operaciones que mutan estado de negocio (cerrar toma física, aprobar/ejecutar liquidación, avanzar/cancelar plan) | Ausencia confirmada, sección 10 | Sin trazabilidad de quién/cuándo/por qué se tomó una decisión operativa — mismo patrón ya corregido como M-04 en Solicitudes | Aplicar el mismo patrón de `Auditoria` con `entidadTipo`/`entidadId`/`datosAnteriores`/`datosNuevos` ya usado en Despachos |
| R-C-03 | P2 | Fuente de verdad | Créditos de Clientes | `CreditoCliente.cliente` es texto libre sin vínculo a `t200_mm_terceros` de Siesa; sin ningún mecanismo de reconciliación contra la cartera real | `schema.prisma:632`, sección 14 | Riesgo de que el saldo mostrado en RicoSoft diverja silenciosamente del real; dos usuarios podrían escribir el mismo cliente con nombres ligeramente distintos, fragmentando su historial | Ver decisión de negocio D-C-01 antes de construir nada nuevo sobre Créditos |
| R-C-04 | P2 | Consistencia arquitectónica | Créditos, Toma Física | No usan `req.tenantPrisma`/la extensión de aislamiento pese a que sus modelos están en `MODELOS_TENANT_SCOPED`; usan el cliente Prisma global con filtro manual | `creditos.controller.ts`, `toma-fisica.controller.ts` — sección 6, 8 | Hoy sin bug funcional (los filtros manuales son correctos y fueron verificados línea por línea), pero es más fácil que un futuro desarrollador olvide el filtro manual que si dependiera de la extensión automática | Migrar ambos controllers a `req.tenantPrisma` por consistencia con Despachos/Plan de Producción/Gestión de Liquidación |
| R-C-05 | P2 | Performance | Ventas (Centro Comercial), Inventario (Centro de Decisiones) | Hasta ~10 queries reales a Siesa en un solo request, sin cache compartido entre endpoints que repiten el mismo cálculo | Sección 22 | Latencia real desconocida (mismo A-04 no medido); riesgo de timeouts bajo uso concurrente real | Medir con VPN activa antes de optimizar (mismo siguiente paso ya definido para A-04 en el informe de hardening) |
| R-C-06 | P2 | Nomenclatura/expectativa de producto | Oportunidades | El nombre de menú sugiere un módulo de gestión (tipo CRM) pero es un reporte de solo lectura sin módulo backend propio | Sección 17 | Riesgo de expectativa de negocio desalineada con lo que el sistema realmente ofrece | Ver sección 27 (renombrar) o decisión D-C-03 (si negocio quiere que sea un módulo real de seguimiento) |
| R-C-07 | P3 | Performance | Créditos | `take: 1000` como límite temporal sin paginación real, ya autodocumentado en el código | `creditos.controller.ts:32` | Bajo mientras el volumen de créditos por tenant sea pequeño; crecerá con el uso | Implementar paginación real cuando el volumen lo justifique |
| R-C-08 | P3 | Auditoría | Despachos | `resolverNovedad` no genera auditoría (único hueco en un módulo por lo demás completo) | `despachos.controller.ts:378-407` | Menor — el resto del ciclo de vida del despacho sí está auditado | Agregar el mismo patrón usado en `actualizarEstadoDespacho` |

## 30. Decisiones pendientes de negocio

| Pregunta | Módulo | Impacto técnico | Opciones | Recomendación provisional |
|---|---|---|---|---|
| D-C-01: ¿Créditos de Clientes debe cruzar contra la cartera real de Siesa, o seguir siendo un registro manual independiente? | Créditos | Si debe cruzar: requiere vincular `CreditoCliente` a `t200_mm_terceros` (clienteRowId) y posiblemente leer cartera real de Siesa (módulo no auditado en esta pasada) | (a) Mantener manual, documentando explícitamente el riesgo de divergencia; (b) Vincular a cliente real de Siesa (autocompletado, sin cambiar el registro de saldo); (c) Reemplazar por lectura en vivo de cartera de Siesa, si existe una tabla real de cuentas por cobrar | No implementar nada hasta que negocio confirme si existe una fuente contable de cartera en Siesa que deba ser la autoridad |
| D-C-02: ¿Los flujos de Plan de Producción/Gestión de Liquidación/Despachos deben bloquear que el mismo usuario cree y apruebe/ejecute, igual que se hizo en Solicitudes (A-03)? | Plan de Producción, Gestión de Liquidación, Despachos | Bajo si se decide sí (mismo patrón ya probado) | (a) Aplicar el mismo bloqueo; (b) No aplicarlo porque en la operación real de despacho/producción es común que la misma persona gestione todo el ciclo | Confirmar con cada proceso operativo real antes de tocar código — el riesgo de negocio es distinto en logística que en aprobación de compras |
| D-C-03: ¿"Oportunidades" debe seguir siendo solo un reporte, o el negocio espera poder actuar sobre una oportunidad (crear una cotización/pedido/despacho directamente desde ahí)? | Oportunidades | Si se espera acción: requiere diseñar el ciclo de vida completo (¿modelo propio? ¿vínculo a Despachos?) | (a) Mantener como reporte de solo lectura, renombrando en el menú; (b) Construir un módulo real de seguimiento de oportunidades | No construir nada nuevo hasta esta decisión — construir un CRM ligero sin esta definición sería trabajo desechable |
| D-C-04: ¿Existe un maestro de bodegas/vehículos/conductores propio que valga la pena construir, o seguir con texto libre en Despachos? | Despachos | Bajo (decisión ya documentada explícitamente en el schema como "sobre-ingeniería sin flota que gestionar todavía") | (a) Mantener texto libre; (b) Construir maestro cuando haya flota real que gestionar | Mantener como está — decisión ya tomada y documentada, no requiere revisitarse sin una señal de negocio nueva |
| D-C-05: ¿Debe existir alguna vía formal (aunque sea manual, fuera de RicoSoft) para que la diferencia detectada en Toma Física dispare un ajuste real en Siesa, o queda a discreción de cada usuario? | Toma Física | Ninguno si se mantiene manual; si se formaliza, requiere definir el flujo exacto de comunicación/aprobación | (a) Mantener sin proceso formal; (b) Agregar un campo/estado de "ajuste solicitado" que sea solo informativo (nunca escritura real a Siesa) | No implementar escritura automática a Siesa bajo ninguna circunstancia sin que esto se convierta en una decisión de negocio explícita y separada, per mandato de esta auditoría |

## 31. Qué NO debemos construir

- **No** escribir de vuelta a Siesa desde ningún módulo de Comercial (ajustes
  de inventario automáticos desde Toma Física, órdenes de producción reales
  desde Plan de Producción, ejecución automática de liquidaciones) — mandato
  explícito de esta auditoría y decisión arquitectónica ya vigente en todo
  el código revisado. Cualquier propuesta en esta dirección debe quedar como
  decisión de negocio futura separada, nunca como "solución por defecto".
- **No** construir un maestro de clientes/bodegas/vehículos propio de
  RicoSoft mientras Siesa siga siendo la fuente real y no haya una necesidad
  operativa concreta (flota propia, clientes que no existen en Siesa) — ya
  documentado como decisión consciente en el schema de Despachos.
- **No** construir un CRM completo de Oportunidades (pipeline, cotizaciones,
  seguimiento de contacto) sin antes resolver D-C-03 — el riesgo es
  construir un módulo de gestión sobre una base que hoy es solo un reporte.
- **No** migrar `creditos`/`toma-fisica` a `req.tenantPrisma` como una
  urgencia de seguridad — es una mejora de consistencia (R-C-04), no una
  vulnerabilidad activa; no debe competir en prioridad con R-C-01/R-C-02.
- **No** optimizar el rendimiento de Ventas/Inventario (cache, reducir
  llamadas a Siesa) antes de medir con VPN real — mismo principio ya
  aplicado a A-04, extendido aquí explícitamente a R-C-05.

## 32. Testing

Tests de integración/unitarios encontrados relacionados con Comercial:
`ventas.integration.test.ts`, `despachos.integration.test.ts`,
`plan-produccion-gestion-liquidacion.integration.test.ts`,
`oportunidad-comercial-siesa.test.ts`, `toma-fisica.test.ts` (lib),
`despachos.test.ts` (lib), `plan-produccion.test.ts` (lib),
`cobertura-siesa.test.ts`, `demanda-siesa.test.ts`, `inventario-siesa.test.ts`,
`ventas-siesa.test.ts`, `abastecimiento-siesa.test.ts`, `produccion-siesa.test.ts`.
No se encontró ningún archivo de test dedicado a `creditos.controller.ts` ni a
`gestion-liquidacion.controller.ts` en el listado de `server/src/modules/creditos/`
ni `server/src/modules/gestion-liquidacion/` (ningún `*.test.ts` en esas
carpetas) — CONFIRMADO por ausencia de archivos. Esto es consistente con el
hallazgo de auditoría faltante (R-C-02): son los mismos dos módulos con menos
cobertura de trazabilidad y de pruebas.

## 33. Observabilidad

No se encontró ninguna instrumentación estructurada de logs/métricas más
allá de `console.error` en los `catch` de cada controller (patrón uniforme en
todos los módulos de Comercial: `console.error("Error al ... desde Siesa:", error)`
seguido de una respuesta 200 con `disponible:false`). No hay logging
estructurado (JSON, correlación de request, tiempos), consistente con la nota
de A-04 sobre instrumentación pendiente para medir performance real contra
Siesa.

## 34. Roadmap (por dependencias, sin implementar nada)

- **Fase 0 — Decisiones de negocio bloqueantes**: resolver D-C-01 (Créditos),
  D-C-02 (auto-aprobación en Producción/Liquidación/Despachos), D-C-03
  (alcance real de Oportunidades). Nada de las fases siguientes debería
  empezar sin esto, porque cambia el diseño de lo que se construya.
- **Fase 1 — Auditoría (R-C-02)**: agregar `Auditoria` completa a Toma
  Física, Plan de Producción, Gestión de Liquidación, reusando el patrón ya
  validado en Despachos/Solicitudes (M-04). Sin dependencia de negocio, bajo
  riesgo, aditivo.
- **Fase 2 — Auto-aprobación (R-C-01)**: implementar el bloqueo si D-C-02 lo
  confirma, reusando el patrón de A-03.
- **Fase 3 — Consistencia de aislamiento (R-C-04)**: migrar Créditos/Toma
  Física a `req.tenantPrisma`, sin cambiar comportamiento observable.
- **Fase 4 — Medición de performance (R-C-05, dependiente de VPN)**:
  instrumentar tiempos reales antes de decidir cache — mismo bloqueo que A-04.
- **Fase 5 — Nomenclatura/navegación (sección 27, R-C-06)**: reorganizar el
  menú (Operación Comercial vs. Planeación & Inventario), dar ruta propia a
  Gestión de Liquidación, renombrar Oportunidades si D-C-03 confirma que
  sigue siendo solo reporte.
- **Fase 6 — Créditos↔Siesa (dependiente de D-C-01)**: si negocio decide
  vincular, implementar el cruce con `t200_mm_terceros` y, si aplica, con la
  cartera real.
- **Fase 7 — Oportunidades como módulo real (dependiente de D-C-03,
  solo si negocio lo pide)**: diseñar el ciclo de vida completo antes de
  escribir una sola línea de modelo Prisma nuevo.

## 35. Matriz de hallazgos (consolidada)

Ver sección 29 — tabla completa de R-C-01 a R-C-08, ya consolidada ahí (no se
duplica para evitar inconsistencia entre dos copias de la misma tabla).

## 36. Matriz de decisiones (consolidada)

Ver sección 30 — tabla completa de D-C-01 a D-C-05, ya consolidada ahí por la
misma razón.

## 37. Matriz de módulos (consolidada)

Ver sección 3 — tabla completa del inventario real de módulos, ya
consolidada ahí.

## 38. Veredicto final

Lo que está bien: Despachos, Toma Física e Inventario siguen consistentemente
el principio de "Siesa es la fuente de verdad, RicoSoft congela snapshots y
gestiona decisiones/estado" — con máquinas de estado validadas en backend
(no solo frontend) y, en el caso de Despachos, con auditoría transaccional y
notificaciones completas. Cero escrituras hacia Siesa en todo el módulo,
confirmado de nuevo.

Lo que está implementado y funciona: Ventas (consulta/disponibilidad),
Inventario (Centro de Decisiones completo con 8+ señales derivadas),
Despachos (ciclo de vida completo con 10 estados), Toma Física (snapshot +
conteo + cierre), Plan de Producción y Gestión de Liquidación (máquinas de
estado simples y correctas).

Lo que está incompleto: auditoría ausente en Toma Física/Plan de
Producción/Gestión de Liquidación (R-C-02); sin tests dedicados en
Créditos/Gestión de Liquidación; Gestión de Liquidación sin ruta de menú
propia; paginación pendiente en Créditos (ya autodocumentada como deuda).

Lo que es riesgo: ausencia del control de auto-aprobación (R-C-01) en tres
módulos con flujos de aprobación reales; inconsistencia de patrón de
aislamiento multi-tenant (R-C-04, sin vulnerabilidad activa hoy, pero
frágil ante nuevos desarrolladores); hasta ~10 queries síncronas a Siesa por
request en Ventas/Inventario sin cache (R-C-05).

Lo que depende de Siesa: prácticamente todo el valor operativo de Comercial
(existencias, ventas, clientes reales, BOM) — y esa dependencia está bien
gestionada arquitectónicamente (lectura en vivo o snapshot congelado, nunca
copia silenciosa que pueda divergir sin que el código lo declare).

Lo que depende de negocio: si Créditos debe cruzarse con la cartera real de
Siesa (D-C-01); si Producción/Liquidación/Despachos deben bloquear
auto-aprobación como Solicitudes (D-C-02); si Oportunidades debe seguir
siendo un reporte o convertirse en un módulo de gestión real (D-C-03).

Qué corregir antes de construir más: R-C-02 (auditoría faltante) y R-C-01
(auto-aprobación, sujeto a D-C-02) son las dos brechas que replican
exactamente hallazgos ya corregidos en otros módulos (M-04, A-03) — corregir
esto primero evita construir funcionalidad nueva sobre una base con la misma
clase de hueco que ya se demostró explotable/riesgosa en otro módulo.

Qué construir después: la reorganización de navegación (Fase 5) y, solo si
negocio lo confirma, el cruce Créditos↔Siesa (Fase 6) o un módulo real de
Oportunidades (Fase 7).

Qué NO construir: ninguna forma de escritura automática hacia Siesa (mandato
explícito, reconfirmado en el 100% del código revisado); ningún maestro de
clientes/bodegas/vehículos propio sin necesidad operativa demostrada; ningún
CRM de Oportunidades sin resolver D-C-03 primero.

### ESTADO DEL MÓDULO COMERCIAL

🟡 APTO CON RIESGOS
