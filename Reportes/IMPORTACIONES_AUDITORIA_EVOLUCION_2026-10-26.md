# Importaciones — auditoría y evolución del módulo (2026-10-26)

**Alcance:** módulo de Importaciones **por tenant** (cada tenant ve solo sus órdenes, lotes, documentos, costos, alertas e indicadores; no hay consolidación entre Ricol, Flexipack y Green Solutions).
**Base inspeccionada:** rama `main`, HEAD `17a48ae`, con los cambios locales previos sin commit preservados (ninguno revertido; ningún archivo del módulo tenía diferencias locales antes de empezar).
**Fuentes leídas antes de cambiar código:** `AGENTS.md`, `MEMORY.md` (secciones de Importaciones), `Reportes/VERIFICACION_PRELIBERACION_2026-10-23.md`, `Reportes/IMPORTACIONES_IMPLEMENTATION_REPORT.md`, esquema Prisma, migraciones del módulo, rutas, controlador completo (`importaciones.controller.ts`), analítica, motor de seguimiento, condiciones de cierre, middleware de carga, catálogo de permisos, frontend (`importaciones.$id.tsx`, `importaciones.analitica.tsx`, hooks) y pruebas. `SKILL.md` no contiene procedimientos específicos de Importaciones.

> Convención: **"NO VERIFICADO EN EL REPOSITORIO"** marca lo que no pude comprobar.

---

## 0. Dictamen

**Estado actual: NO-GO.** No se recomienda todavía aplicar la migración en el servidor (PC-RC-SV) ni desplegar. El NO-GO se mantiene mientras
el gate global de integración no termine en verde, las omisiones requeridas no estén resueltas, las credenciales expuestas no estén rotadas, el
rollback no esté probado ni el UAT ejecutado y las decisiones bloqueantes no estén aprobadas (condiciones completas en I.7).

El único paso siguiente es la **revisión del director** de este informe y del registro de decisiones; la migración en PC-RC-SV se reevaluará
solo cuando se cumplan esas condiciones.

Motivos del NO-GO: faltan decisiones de negocio críticas (D-1…D-11 del registro canónico, ninguna aprobada); el gate de integración contra QA no está
aprobado (8 pruebas fallidas, 8 errores de hook y 40 omitidas, ver I.4); no se ha hecho aceptación operativa ni rollback probado; la migración solo
se aplicó en la base QA aprobada (no en la del servidor objetivo); y el módulo sigue sin inventario por lote / Calidad / intercambio con Siesa
(fuera de alcance por falta de contrato o decisión).

**Registro canónico de decisiones:** `IMPORTACIONES_REGISTRO_DECISIONES_2026-10-26.md` (D-1 a D-11). Toda referencia "D-n" de este informe usa esa numeración.
---

## A. Estado actual antes del cambio

### A.1 Mapa "ya existe / parcial / falta / no verificable"

| Tema | Estado | Evidencia (estado anterior, HEAD) |
|---|---|---|
| Orden internacional: proveedor, ítems, moneda, Incoterm, lugar pactado | **Existe** | `schema.prisma` `OrdenCompraIntl` L1867-1974 (`incoterm`, `lugarPactado`, `moneda`, `proveedorId`); alta validada en `importaciones.controller.ts` `crearOrdenCompraIntl` L846-1142; consecutivo `IMP-año-n` en servidor (MEMORY 2026-10-05) |
| TRM pactada con fecha y fuente | **Existe** | `OrdenCompraIntl.trmPactada`, `tasaCambioFecha`, `tasaCambioFuente` (Oficial/Pactada/Manual) — `schema.prisma` L1910-1920; la TRM oficial nunca sobrescribe una tasa escrita a mano |
| ETA del proveedor vs ETA del tracking | **Existe y está separada** | `LoteImportacion.fechaLlegadaEstimada` (proveedor) y `etaTrackingActual` (AIS) — `schema.prisma` L2254 y L2276; el comentario del esquema prohíbe sobrescribir una con otra |
| Fecha **real** de embarque / llegada a puerto / inspección | **Falta** | Solo `fechaEmbarque` (sin distinguir informada vs real) y `fechaLlegadaReal` |
| Recepción física en planta | **Parcial** | `fechaLlegadaReal` se escribe **solo** en `recibirPreCompraPlanta` (controlador L1496) |
| Levante aduanero | **Existe** | `ExpedienteAduanero.fechaLevante` (editable a mano) |
| Torre logística: actividades, novedades automáticas, historial append-only | **Existe** | `ImportacionActividad`, `ImportacionNovedad`, `ImportacionHistorial`; motor puro `domain/importaciones/motor-seguimiento.ts`; tracking que no escribe fechas reales |
| Documentos: DIM, factura comercial, certificado de origen, vistos buenos | **Existe** | `TIPOS_DOCUMENTO_EXPEDIENTE` L65-87; `VistoBuenoAduanero`; almacenamiento privado, descarga por endpoint con tenant |
| Documentos: cotización/proforma/oferta (orden) | **Existe** | `TIPOS_DOCUMENTO_ORDEN` L92 |
| Documentos: **B/L-AWB como archivo** y **COA** | **Falta** | `blAwb` es solo texto; no hay tipo COA en ningún modelo |
| Clasificación arancelaria | **Parcial** | `ClasificacionArancelariaMatriz` (`tarifaArancelariaBase`, `decretoReferencia`, `requiereInvima/Ica`) `schema.prisma` L1827-1840; clasificación por ítem existe (`ItemOrdenCompraIntl.subpartidaArancelariaId`). **No hay** vigencia/fecha de la tasa, **no hay** semilla ni endpoint de mantenimiento del catálogo (búsqueda en `server/src`, `prisma/seed.ts` y migraciones: solo la migración base crea la tabla), **no hay** IVA ni marca recuperable/no recuperable |
| Costeo landed provisional y definitivo por ítem | **Existe** | `recibirPreCompraPlanta` L1455 (provisional, conserva fila) y `liquidarCosteoImportacion` L1529 (definitivo, agrega fila, `trmLiquidacion`, `diferenciaCambioCop`) |
| Distribución de gastos por valor | **Existe** | participación FOB — L1585-1617 |
| Distribución por **peso / volumen** | **Falta** | `pesoKg`/`volumenM3` existen en el ítem (L2002-2003) pero no se usan; la UI captura "Peso total (Kg)" (`importaciones.nueva.tsx` ~L944-969) y **no captura volumen** |
| Inventario por lote / movimientos / Calidad (WMS/QMS) | **No existe** | "Recibir" = cambio de estado + costeo provisional + `fechaLlegadaReal` (L1455-1520); no hay modelo de existencias, cuarentena ni inspección contra COA |
| Alertas: ETA vencida, actividades vencidas | **Parcial** | solo novedades automáticas del motor de seguimiento |
| Alertas: días libres en puerto, % máx. de desviación de costos | **Falta / no parametrizado** | no hay campos de configuración; `ConfiguracionInventario.umbralAlertaTrmPct` (L923) compara **TRM oficial vs TRM de la orden**, no pactada vs liquidación |
| Analítica: lead time, desaduanamiento, factor logístico | **Existe con defecto** | ver hallazgo H-1 |
| Intercambio con Siesa (exportación) | **No existe formato** | solo hay lectura de Siesa; en `Reportes/referencias/` solo hay una proforma `.xlsx`, que no es un formato de importación. **NO VERIFICADO EN EL REPOSITORIO** ningún contrato de importación de Siesa |
| Integración SQL Server (gate) | **No verificado** a 2026-10-23 | `VERIFICACION_PRELIBERACION_2026-10-23.md` |

### A.2 Hallazgos (prioridad · impacto · archivo:línea en el estado anterior)

| # | Prio | Hallazgo | Impacto | Dónde (HEAD) | Estado |
|---|---|---|---|---|---|
| H-1 | **Alta** | El KPI de desaduanamiento usaba `LoteImportacion.fechaLlegadaReal` (recepción en **planta**) como "llegada a puerto" y como "disponible en bodega" a la vez | KPI falseado: "llegada a puerto" posterior al levante ⇒ diferencia negativa ⇒ operación excluida o dato sin sentido | `importaciones-analitica.service.ts` L149-150, L165-166 | **Corregido** |
| H-2 | Alta | Lead time rotulado "orden → bodega" medía hasta la recepción física, no hasta la liberación para inventario (evento inexistente) | Etiqueta engañosa | mismo archivo L149; `importaciones.analitica.tsx` | **Corregido** (rótulo y definición) |
| H-3 | Media | `fechaNacionalizado` caía a `fechaLiquidacion` del costeo cuando faltaba el levante (proxy) | Mezcla "levante" con "fecha en que se digitó la liquidación" | mismo archivo L158-162 | **Corregido** (se elimina el proxy) |
| H-4 | Alta | La liquidación aceptaba cualquier valor: texto ⇒ `NaN` ⇒ error 500 al guardar; montos negativos aceptados; IVA descontable > IVA total aceptado | Datos financieros inválidos / error genérico | `liquidarCosteoImportacion` L1583-1601 | **Corregido** |
| H-5 | Alta | Recepción y liquidación verificaban el estado **fuera** de la transacción (lectura → escritura): dos solicitudes simultáneas podían duplicar el costeo provisional/definitivo | Costeo duplicado; doble nacionalización | L1491-1508 y L1651-1664 | **Corregido** (cambio de estado condicional dentro de la transacción ⇒ 409) |
| H-6 | Media | Los gastos solo se repartían por FOB | No se podía repartir por peso/volumen | L1585-1617 | **Corregido** (método explícito; ver C) |
| H-7 | Media | Borrar un documento eliminaba el **archivo antes** de confirmar la transacción | Si la transacción falla: fila sin archivo | L1963 (expediente) y L2291 (orden) | **Corregido** |
| H-8 | Media | No existían B/L-AWB ni COA como documentos | Brecha documental | L65-97 | **Corregido** (tabla `LoteImportacionDocumento`) |
| H-9 | Media | Recibir/liquidar/estado/embarque/expediente/vistos buenos no comprueban que la orden del lote no esté anulada | Se puede operar sobre un expediente anulado | L1252-1300, L1455, L1529, L1780… | **Corregido** en recibir, liquidar y rutas nuevas. **Cerrado en la 2.ª ronda** (`ordenNoOperable` en todas las rutas mutantes de lote; 35 pruebas) |
| H-10 | Media | El catálogo de subpartidas no tiene carga, vigencia ni fuente de la tasa; no existe IVA ni recuperable/no recuperable; el arancel/IVA de la liquidación se digita como total | No hay trazabilidad del cálculo tributario | `schema.prisma` L1827-1840 | **Sin cambio** — bloqueo D-4 |
| H-11 | Media | `volumenM3` no se captura en la UI de la orden | El método VOLUMEN solo es usable cargando el dato por API | `importaciones.nueva.tsx` (sin campo) | **Pendiente** (D-3) |
| H-12 | Baja | Las descargas de documentos no dejan rastro | Sin trazabilidad de acceso | descargas del módulo | **Cerrado en la 2.ª ronda** (`registrarDescargaDocumento`, falla cerrada) |
| H-13 | Info | Auditoría del módulo = `ImportacionHistorial` (append-only, por orden); `Auditoria` solo en bandeja/consecutivo/requisitos | Es el patrón existente; no se creó un segundo sistema | — | Sin cambio (consistente con AGENTS §11) |
| H-14 | Info | El tracking marítimo no escribe fechas reales | Diseño correcto: se conserva | `embarques-tracking.job.ts` | Sin cambio |

---

## B. Matriz de similitud contra el diseño

**Escala:** `0` no existe · `0.5` existe parcialmente o sin cobertura suficiente · `1` implementado **y** verificado.
**Regla para otorgar `1` (transparente):** el comportamiento está implementado, no depende de una decisión de negocio abierta **y** hay al menos una prueba automatizada **ejecutada y en verde en esta sesión** que lo ejercita. Una prueba de integración con BD que existe pero no se ejecutó **no basta** por sí sola. Peso igual para los 13 requisitos.

| # | Requisito | Antes | Cambios realizados | Después | Evidencia de código | Evidencia de prueba |
|---|---|:-:|---|:-:|---|---|
| R1 | Orden internacional: proveedor, ítems, moneda, Incoterm, lugar pactado, TRM pactada con fecha y fuente | 0.5 | Ninguno (ya existía). Su cobertura es de integración con BD | 0.5 | `schema.prisma` L1867-1974; `crearOrdenCompraIntl` | `importaciones-oc-campos-nuevos.integration.test.ts` (ver estado de ejecución en C.3) |
| R2 | Diferenciar estimación del proveedor / tracking / fecha real, sin reemplazar en silencio | 0.5 | Nuevo modelo `LoteImportacionHito` (embarque real, llegada a puerto, inspección, recepción en planta) con **origen**, responsable y nota; panel que muestra las estimaciones aparte | 1 | `schema.prisma` L2321-2349; `domain/importaciones/hitos-lote.ts`; `registrarHitoLote` L2516; `hitos-lote-panel.tsx` | `hitos-lote.test.ts`; `importaciones-lote-hitos-costeo.controller.test.ts`; `hitos-lote-panel.test.tsx` |
| R3 | Torre logística: orden emitida, embarque, tránsito, llegada a puerto, inspección, levante, tránsito terrestre, recepción física, liberación a inventario | 0.5 | Se agregan embarque real, llegada a puerto, inspección, levante (del expediente) y recepción en planta como hechos con fecha. **Quedan sin modelar:** tránsito terrestre y liberación a inventario (D-1, D-8) | 0.5 | `serializarHitosLote` L489 | `importaciones-lote-hitos-costeo.controller.test.ts` (hitos) |
| R4 | Indicadores sin dato proxy (lead time, desaduanamiento) | 0 | La recepción en planta ya no se usa como llegada a puerto; se elimina el proxy de nacionalización; cada exclusión lleva motivo | 1 | `importaciones-analitica.service.ts` `obtenerOperaciones` L100 | `importaciones-analitica.service.test.ts` (4 casos de "sin proxy") |
| R5 | Documentos y aduana: factura, B/L-AWB, DIM, certificado de origen, COA, vistos buenos — tipos, almacenamiento privado, permisos, descarga, aislamiento | 0.5 | B/L-AWB, COA y "otros" como documentos del lote (varios por tipo), con validación por magic bytes, 10 MB, historial atómico, borrado de archivo después de la transacción; sin regla de obligatoriedad | 1 | `schema.prisma` L2351; `subirDocumentoLote` L2677; rutas `importaciones.routes.ts` L349-361 | `importaciones-lote-hitos-costeo.controller.test.ts` (documentos); `importaciones-lote.routes-rbac.test.ts` |
| R6 | Clasificación y tributos: fuente y vigencia de la tasa, clasificación por ítem, trazabilidad, recuperable/no recuperable | 0.5 | **Ninguno** — bloqueo de fuente oficial y regla contable (D-4). No se automatizó ningún cálculo tributario | 0.5 | `schema.prisma` L1827-1840 | — |
| R7 | Costeo landed: provisional vs definitivo, conversión a COP, TRM de liquidación, arancel, IVA, diferencia cambiaria, otros gastos; sin alterar histórico | 0.5 | Validación de montos (no numéricos, negativos, TRM/CIF ≤ 0, IVA descontable > IVA); cambio de estado condicional (idempotencia/concurrencia); orden anulada rechazada. La fórmula no cambió | 1 | `liquidar…` L1683; `domain/importaciones/liquidacion-entrada.ts` | `liquidacion-entrada.test.ts`; `importaciones-lote-hitos-costeo.controller.test.ts` |
| R8 | Distribuir gastos por valor, peso o volumen, validando datos faltantes | 0.5 | El cálculo por PESO/VOLUMEN existe en `domain/importaciones/prorrateo-gastos.ts` (con rechazo de datos faltantes/≤0, sin división por cero ni caída a otro método), pero **la API solo acepta FOB**: `ARCHITECTURAL_DECISIONS_PENDING.md` #3 sigue sin decisión contable y el mandato exige métodos aprobados. PESO/VOLUMEN responden 400 "no está aprobado" | 0.5 | `domain/importaciones/prorrateo-gastos.ts` (`METODOS_PRORRATEO_APROBADOS`); `liquidarCosteoImportacion` | `prorrateo-gastos.test.ts` (cálculo + lista aprobada), controlador: PESO/VOLUMEN → 400 sin escritura; integración: PESO → 400 y FOB con dos liquidaciones simultáneas. 0.5 por D-3 abierta (regla de negocio) |
| R9 | Recepción, cuarentena y Calidad (llegada física → recepción → cuarentena → inspección contra COA → liberación/rechazo) | 0.5 | Se documentó qué significa "recibir" hoy; la recepción física queda como hito con fecha y origen. **No se construyó** cuarentena/Calidad/inventario | 0.5 | `recibirPreCompraPlanta` L1561 | `importaciones-lote-hitos-costeo.controller.test.ts` (recepción) |
| R10 | Alertas y analítica: lead time, landed vs FOB, variación TRM pactada vs liquidación, hitos retrasados, documentación faltante; definición, periodo, exclusiones, fuente/fecha | 0.5 | Se agrega variación de TRM, alerta de ETA del proveedor vencida, actividades vencidas, inventario de documentos adjuntos (explícitamente sin obligatoriedad), y bloque `metadatos` con definición, periodo y exclusiones por motivo | 1 | `importaciones-analitica.service.ts` `alertasImportaciones` L404, `resumenAnaliticaImportaciones` L524; `importaciones.analitica.tsx` | `importaciones-analitica.service.test.ts` (13 casos); `importaciones-analitica.calculos.test.ts` |
| R11 | Alertas de días libres en puerto y % máximo de desviación de costos | 0 | **Ninguno**: no hay umbrales parametrizados y no se inventaron (D-6). Propuesta en D.3 | 0 | — | — |
| R12 | Exportación/intercambio con Siesa | 0 | **Ninguno**: no hay contrato de formato; no se generó archivo ficticio ni se escribió en Siesa. Diseño en D.2 | 0 | — | — |
| R13 | Seguridad: autenticación, permisos canónicos, `tenantId` de sesión, IDOR, auditoría, atomicidad, validación de archivos, concurrencia | 0.5 | Rutas nuevas revisadas (ver F). Segunda ronda: **orden anulada/eliminada bloquea** estado, embarque, contenedores, tracking, expediente (datos y documentos), vistos buenos, hitos, documentos, recepción y liquidación; **toda descarga de documento queda en el historial** (actor, documento, acción; sin ruta ni contenido) y falla cerrada. Abierto: credenciales de QA en el historial git (S-1, requiere rotación) y gate de integración global no verde | 0.5 | `importaciones.controller.ts` (`ordenNoOperable`, `registrarDescargaDocumento`) | `importaciones-orden-anulada-descargas.controller.test.ts` (35), `importaciones-lote.routes-rbac.test.ts` (11); se mantiene 0.5 porque el gate de integración no está verde y S-1 sigue abierto |

**Puntaje (suma de la tabla, pesos iguales):** antes **5.0 / 13 = 38.5 %** · después **8.0 / 13 = 61.5 %** (+23.1 puntos porcentuales). **Corrección:** la versión anterior de este informe decía "antes 5.5 / 13 = 42.3 %"; era un error de suma (la tabla siempre sumó 5.0). El "después" no cambia. **Este porcentaje mide cobertura contra el diseño; NO es readiness de producción.**

**Qué quedó fuera (y por qué):** R6 (D-4), R11 (D-6), R12 (D-9), la parte de R3/R9 que depende de hitos, inventario y Calidad (D-1, D-7, D-8) y la mitad de R8 (D-3). R1 y R13 se quedan en 0.5 porque su cobertura es de integración con BD (ver C.3) y por hallazgos abiertos. No se usó ninguna impresión subjetiva: el puntaje sale de la tabla.

---

## C. Resultado técnico

### C.1 Archivos

**Modificados**
`server/prisma/schema.prisma` (+2 modelos, +1 columna, +2 relaciones en `Tenant`/`LoteImportacion`; sin tocar nada existente) ·
`server/src/lib/tenant-prisma.ts` (los 2 modelos nuevos en `MODELOS_TENANT_SCOPED`) ·
`server/src/middleware/upload.middleware.ts` (carpeta `lotes-importacion`, mismo `crearUploadArchivo`) ·
`server/src/modules/importaciones/importaciones.controller.ts`, `importaciones.routes.ts`, `importaciones.schemas.ts` ·
`server/src/modules/importaciones/importaciones-analitica.service.ts`, `…calculos.ts`, `…calculos.test.ts`, `…analitica.integration.test.ts` (el fixture creaba la llegada a puerto con la fecha de planta; ahora crea el hito) ·
`src/hooks/use-importaciones.ts`, `src/hooks/use-importaciones-analitica.ts`, `src/routes/importaciones.$id.tsx`, `src/routes/importaciones.analitica.tsx`.

**Nuevos**
`server/prisma/migrations/20261026120000_importaciones_hitos_documentos_prorrateo/migration.sql` ·
`server/src/domain/importaciones/{hitos-lote,prorrateo-gastos,liquidacion-entrada,documentos-lote}.ts` + tests de los tres primeros ·
`server/src/modules/importaciones/importaciones-analitica.service.test.ts`, `importaciones-lote-hitos-costeo.controller.test.ts`, `importaciones-lote.routes-rbac.test.ts`, `importaciones-lote-hitos-docs.integration.test.ts` ·
`src/components/importaciones/hitos-lote-panel.tsx` + `.test.tsx` ·
este informe.

### C.2 Migración

`20261026120000_importaciones_hitos_documentos_prorrateo` — **100 % aditiva**: crea `LoteImportacionHito` y `LoteImportacionDocumento` (FK a `Tenant` `NO ACTION`; FK a `LoteImportacion` `CASCADE`, sin ciclos de cascada) y agrega la columna **nullable** `CosteoImportacionDetalle.metodoProrrateoGastos`. No modifica ni borra datos, columnas, índices ni migraciones existentes. SQL generado con `prisma migrate diff` entre el esquema anterior y el nuevo (sin conectarse a ninguna base).

| Ambiente | Estado |
|---|---|
| `saas_dev_qa` @ 192.168.0.234:1433 (destino aprobado, verificado por el guardián; login `saas_dev_qa_migrador`) | **Aplicada** y `migrate status` = "Database schema is up to date" (74 migraciones). Antes de aplicar, `status` mostró que **solo** esta migración estaba pendiente |
| `saas_dev` | **No tocada** (prohibido) |
| Producción / PC-RC-SV | **No aplicada** — requiere respaldo previo y el runbook de `DEPLOY_CAMBIOS_ESCALAMIENTO_2026-10-23.md` |
| Siesa | **No tocada** |

### C.3 Pruebas

Ejecutadas en esta sesión sobre el árbol de trabajo (los cambios locales previos incluidos).

| Verificación | Resultado |
|---|---|
| Línea base del módulo antes de cambiar (`vitest` en `modules/importaciones` + `domain/importaciones`) | 15 archivos · **120 pasaron** |
| `npm test` backend (todo) | **110 archivos · 1093 pasaron · 0 fallaron · 0 omitidos** (el 23-oct: 1012 pasaron; +81 pruebas nuevas, +6 archivos) |
| `npm test` frontend | 17 archivos · **120 pasaron** · 0 fallaron (+4 del panel de hitos) |
| `npm run typecheck` (servidor y frontend) | OK |
| `npm run build` (servidor `tsc` y frontend Vite/Nitro) | OK |
| `npm run lint` (raíz) | **0 errores**, 17 warnings (los mismos 17 del informe del 23-oct; ninguno en archivos que creé) |
| `prettier --check` sobre los archivos que toqué | OK |
| `prisma validate` / `prisma generate` | OK / Client 5.22.0 |
| Pruebas nuevas, desglose | dominio: `prorrateo-gastos` (10), `hitos-lote` (8), `liquidacion-entrada` (7); servicio de analítica (13); cálculos nuevos (6); controlador (26); RBAC de rutas (11) = **81 en el backend** (1093 − 1012 del informe del 23-oct); componente de hitos (4) en el frontend |

**Integración contra SQL Server (QA):** ejecutada con `scripts/qa-runner.ts test` (login `saas_dev_qa_runner`, destino verificado `saas_dev_qa` @ 192.168.0.234). Dos corridas completas:

| Corrida | Archivos | Pruebas |
|---|---|---|
| 1.ª | 7 fallaron · 67 pasaron (74) | 8 fallaron · 749 pasaron · 40 omitidas (797) |
| 2.ª (tras corregir mi limpieza) | 6 fallaron · 68 pasaron (74) | 8 fallaron · 749 pasaron · 40 omitidas (797) |

- **Importaciones:** `importaciones-lote-hitos-docs.integration.test.ts` (14 pruebas: hitos, documentos, RBAC, IDOR entre tenants, recepción y liquidación simultáneas; PESO rechazado y FOB liquidado) **pasó**; el fixture actualizado de `importaciones-analitica.integration.test.ts` y el resto de archivos de Importaciones no aparecen entre los fallidos. En la 1.ª corrida mi `afterAll` falló al borrar lotes sin borrar antes los expedientes (error mío, corregido); esa corrida **dejó residuos en QA**: tenants `Lote Hitos A/B <sufijo>` con sus usuarios, órdenes y lotes — el administrador de QA debe retirarlos. La 2.ª corrida limpió bien lo suyo.
- **Fallos ajenos al módulo:** ver la reconciliación del resultado bruto de Vitest en **I.4** (8 pruebas fallidas = 2 `facturas.tenant-prisma` + 6 `pagos.hardening`; 8 errores de hook en 4 suites; 6 archivos fallidos; 40 omitidas). No toqué esos módulos; que fallaran antes de mi migración es NO VERIFICADO (no hay corrida previa comparable).
- **Gate anti-omisión: NO cumplido** (hay 8 fallos y 40 omitidas). No se declara aprobada la integración global.

**Omitidos:** 0 en la suite unitaria. No convertí ninguna prueba fallida en omitida ni reduje cobertura.

### C.4 Integraciones

- **Siesa:** sin cambios; sigue de solo lectura. No se escribió en Siesa ni se generó archivo de intercambio.
- **Tracking marítimo / CrossChex / correo:** sin cambios.
- **SQL Server QA:** usado únicamente a través de `scripts/qa-runner.ts` (guardián de destino): `status`, `deploy` de la migración nueva y la suite de integración. No se leyó ni se mostró el contenido de ningún `.env`.

### C.5 Revisión tenant / RBAC / auditoría

Detalle en la sección F.

---

## D. Diseños (no implementados)

### D.1 Recepción, cuarentena y Calidad

**Qué es "recibir" hoy (verificado):** `PATCH /importaciones/lotes/:id/recibir-pre-compra` (permiso `importaciones.recibir`) cambia el estado del lote a "Liberado pre-compra", sella `fechaLlegadaReal`/hito `RECEPCION_PLANTA` y crea el **costeo provisional**. No existe stock por lote, movimiento de almacén, estado de cuarentena, responsable de Calidad ni comparación contra COA; **no hay WMS/QMS** en el repositorio. RicoSoft no escribe en Siesa y esto no cambia.

**Brecha entre:** llegada física → recepción → cuarentena → inspección frente al COA → liberación/rechazo.

**Diseño propuesto (requiere decisiones D-7 y D-8 antes de construirlo):**
1. Entidad `LoteMaterial` (por tenant): `loteImportacionId`, `itemId`, `cantidadRecibida`, `estadoCalidad` ∈ {`EN_CUARENTENA`, `LIBERADO`, `RECHAZADO`}, `ubicacion`, trazabilidad `recibidoPor`/`fecha`. Hoy el esquema no tiene dónde guardar cantidades recibidas por ítem **y** lote (`ItemOrdenCompraIntl` cuelga de la orden, no del lote).
2. Entidad `InspeccionCalidad` ligada a `LoteMaterial` y a un documento COA (`LoteImportacionDocumento` ya existe): resultado, responsable, fecha, observaciones; transiciones auditadas y atómicas con el historial.
3. Permisos nuevos del catálogo canónico (p. ej. liberar/rechazar) — **a definir**; hoy no se reutiliza `importaciones.recibir` para liberar Calidad porque mezclaría responsabilidades.
4. Impacto: multi-tenancy (todo con `tenantId` de sesión), costeo (¿el costo se activa al liberar o al recibir?), Siesa (solo lectura: la liberación **no** puede mover existencias en Siesa sin una decisión y un contrato).
5. Pruebas necesarias: aislamiento por tenant, transiciones válidas/ inválidas, idempotencia de liberar, concurrencia, auditoría atómica.

### D.2 Intercambio asistido con Siesa

No existe formato oficial en el repositorio ⇒ **no se generó ningún archivo productivo ni se escribió en Siesa**. Propuesta para cuando exista el contrato (D-9):

| Elemento | Propuesta |
|---|---|
| `exportId` | UUID generado en servidor, único por (tenant, documento, versión de formato) |
| Hash del payload | SHA-256 del contenido canónico exportado; se guarda y se compara para detectar reexportaciones idénticas |
| Versionado del formato | `formatoVersion` explícito; un cambio de contrato crea versión nueva, nunca edita la anterior |
| Validación previa | Reglas del contrato (campos obligatorios, catálogos Siesa, compañía SIESA derivada del tenant — **nunca** `ciaId` del cliente) y bloqueo si el costeo es provisional |
| Prevención de duplicados | Índice único filtrado `(tenantId, documentoOrigenId, formatoVersion)` para exportaciones vigentes (SQL Server filtrado, patrón ya aprobado para `PedidoComercial.erpRowId`) + comparación de hash |
| Estado de exportación | `GENERADA` → `ENTREGADA` → `CONCILIADA` / `RECHAZADA` / `ANULADA` (estado de integración **separado** del estado comercial, AGENTS §8) |
| Conciliación posterior | Lectura de Siesa (solo lectura) para confirmar que el documento existe y coincide en valores |
| Permisos y auditoría | Permiso propio del catálogo; `Auditoria` con actor, tenant, `exportId` y hash en la misma transacción |

### D.3 Umbrales por tenant (días libres en puerto, % máximo de desviación de costos)

No existen en el repositorio y **no se inventaron valores**. Propuesta: una fila por tenant (patrón de `ConfiguracionInventario`/`ConfiguracionComercial`) con `diasLibresPuerto Int?` y `desviacionMaxCostosPct Decimal?`, ambos **nullable = alerta desactivada hasta que el director fije el valor**. Insumos que sí existen: llegada a puerto (hito nuevo), landed definitivo y FOB (costeo). La alerta de días libres necesita además el dato de **días libres pactados por naviera/contrato**, que tampoco está modelado (D-6).

### D.4 Clasificación y tributos

Para automatizar arancel/IVA harían falta: fuente oficial y fecha de vigencia por tasa, catálogo cargado (hoy sin mecanismo de carga), IVA aplicable por clasificación y regla contable de recuperable/no recuperable (hoy el IVA descontable se digita como total). **Bloqueado por D-4**; no se automatizó nada que pueda contabilizarse mal.

---

## E. Decisiones pendientes

Copia fiel (ID, decisión y dueño propuesto) del registro canónico `IMPORTACIONES_REGISTRO_DECISIONES_2026-10-26.md`; opciones, impacto,
dependencias y trabajo bloqueado están allí. **Ninguna está aprobada.** La numeración anterior de esta sección (D-1…D-9) queda sustituida.

| ID | Decisión | Dueño propuesto |
|---|---|---|
| D-1 | Semántica de `fechaEmbarque` y definición de cada hito (embarque real, llegada a puerto, inspección, levante, recepción) | Comercio exterior + Logística |
| D-2 | Redondeo contable (centavos entre ítems) y si el método de prorrateo aplica por gasto o a toda la liquidación | Contabilidad |
| D-3 | Métodos de prorrateo distintos de FOB (PESO/VOLUMEN) y significado de `pesoKg` (neto/bruto/total o por unidad) y unidad de `volumenM3` | Contabilidad + Comercio exterior |
| D-4 | Fuente y vigencia de aranceles, IVA y su recuperabilidad | Comercio exterior + Contabilidad/Fiscal |
| D-5 | Obligatoriedad documental por material/país/estado y bloqueo de liquidación (`#13`) | Comercio exterior + Calidad |
| D-6 | Días libres pactados y umbrales de alertas (ETA vencida, desviación de costo, etc.) | Logística / Comercio exterior |
| D-7 | Política de recepción, cuarentena, inspección COA y responsable de liberar | Calidad + Operaciones |
| D-8 | Sistema de registro de existencias por lote y relación con Siesa | Dirección + TI + Contabilidad (`ARCHITECTURAL_DECISIONS_PENDING.md` #7) |
| D-9 | Contrato oficial para intercambio asistido con Siesa (`#8`) | Contabilidad + TI/Siesa |
| D-10 | Rotación de credenciales expuestas y política de `.env.integration.qa.example` | Administrador de QA/BD + TI |
| D-11 | Limpieza de residuos en `saas_dev_qa` (IDs exactos en la sección «Residuos y datos de QA» del registro) y **confirmar el estado esperado** de `METODO_PAGO` (Contabilidad/Tesorería) y del tenant Ricol (TI/Siesa) en QA; sin confirmación no se reactiva ni se crea nada | Administrador de QA |

`MEMORY.md` **no se actualizó**: no hay decisión arquitectónica aprobada por el director. Las decisiones tomadas dentro del alcance (tabla de hitos con origen `Manual`/`Sistema` y nunca `Tracking`; método de prorrateo restringido a FOB (PESO/VOLUMEN rechazados por la API hasta aprobar D-3); documentos de lote sin obligatoriedad) quedan **propuestas** hasta su aprobación; si se aprueban, registrarlas.

---

## F. Revisión tenant / RBAC / auditoría de lo implementado

| Ruta | Permiso (catálogo canónico, sin permisos nuevos) | Aislamiento | Auditoría / atomicidad |
|---|---|---|---|
| `PUT /lotes/:id/hitos/:tipo` | `importaciones.gestionar_transito` | lote por `{id, tenantId de sesión}`; 404 en lote ajeno | hito + historial en una transacción; corrección conserva fecha anterior; P2002 ⇒ 409 |
| `DELETE /lotes/:id/hitos/:tipo` | `importaciones.gestionar_transito` | ídem; borrado por `{id, tenantId}` | `deleteMany` + historial en una transacción; segundo borrado ⇒ 404 |
| `POST /lotes/:id/documentos/:tipo` | `importaciones.gestionar_transito` | UUID validado antes de tocar disco; lote por tenant; el archivo solo se mueve a su carpeta definitiva **después** de validar | fila + historial atómicos; si falla, se borra el archivo movido; magic bytes, 10 MB, PDF/PNG/JPG/WEBP |
| `GET /lotes/:id/documentos/:documentoId` | `importaciones.ver` | `{id, tenantId, loteId}`; ruta en disco tomada de la BD, nunca del cliente | (descargas no auditadas — H-12) |
| `DELETE /lotes/:id/documentos/:documentoId` | `importaciones.gestionar_transito` | `{id, tenantId, loteId}` | fila + historial atómicos; archivo borrado **después** de la transacción |
| `PATCH /lotes/:id/recibir-pre-compra` | `importaciones.recibir` | lote por tenant | estado condicional + hito + costeo + historial en una transacción; concurrencia ⇒ 409 |
| `POST /lotes/:id/liquidar-costeo` | `importaciones.liquidar` | lote por tenant | estado condicional + costeo + historial en una transacción; concurrencia ⇒ 409; montos validados |
| Analítica y alertas | `importaciones.ver` | toda consulta lleva `tenantId` de sesión + `eliminado=false` | solo lectura |

- El `tenantId` **nunca** se toma del cliente. La recepción en planta **no** puede forjarse por el endpoint manual de hitos (solo la deriva el sistema con `importaciones.recibir`).
- Se agregaron `LoteImportacionHito` y `LoteImportacionDocumento` a `MODELOS_TENANT_SCOPED` (defensa en profundidad).
- **No se creó** otro sistema de auth, permisos ni auditoría. **No se tocó** JWT/`tokenVersion`/selección de tenant.
- Pendientes de seguridad: H-9 y H-12 quedaron cerrados en la 2.ª ronda; abierto S-1 (credenciales en el historial git).

---

## G. Revisión final del diff

- Cambios limitados a Importaciones + los 2 puntos transversales mínimos (`tenant-prisma.ts`, `upload.middleware.ts`). Los 108 archivos con cambios locales previos **no se revirtieron ni limpiaron** (incluido el borrado de `server/src/lib/notificaciones.test.ts` y `servicios-renovacion.service.test.ts`, que ya estaban renombrados a `*.integration.test.ts`).
- `prisma format` reordenó modelos ajenos al ejecutarse; **lo descarté** y reaplicé solo mis cambios (el diff del esquema son 4 bloques).
- No se hizo commit, push, merge, reset, deploy ni limpieza.
- Prettier se aplicó únicamente a los archivos que creé o modifiqué.

---

## I. Segunda ronda (2026-10-26, tarde): Etapas 0, 1, 2 y 8

Mandato: completar seguridad, registrar decisiones y verificar. Las Etapas 3–5 y 7 quedan **bloqueadas por decisiones**
(`IMPORTACIONES_REGISTRO_DECISIONES_2026-10-26.md`), no por trabajo omitido; las Etapas 4 y 6 se mantienen en lo que ya estaba aprobado.

### I.1 Qué se hizo
- **Etapa 1:** guardas de orden anulada/eliminada en los handlers que faltaban (estado, embarque, contenedores crear/eliminar,
  tracking, expediente datos/documentos, vistos buenos crear/actualizar/documento); auditoría de **4** descargas (lote, orden,
  expediente, visto bueno) en `ImportacionHistorial`, antes de entregar el archivo; hallazgo S-1 (credenciales) documentado sin mostrar valores.
- **Política de métodos de prorrateo:** el mandato exige solo métodos aprobados. `ARCHITECTURAL_DECISIONS_PENDING.md` #3 (peso/volumen) está sin decisión; **la API ahora solo acepta FOB** y la UI solo ofrece FOB. El cálculo PESO/VOLUMEN queda en el dominio con sus pruebas, inalcanzable por API. Es un retroceso deliberado respecto de la 1.ª ronda.
- **Etapa 2:** registro de decisiones D-1…D-11; búsqueda de contrato Siesa (no existe, `NO VERIFICADO EN EL REPOSITORIO`).
- **Etapa 8 (parcial):** verificación de abajo; runbook preparado, no ejecutado (`IMPORTACIONES_RUNBOOK_PC-RC-SV_2026-10-26.md`).
- **Corrección de este informe:** el puntaje "antes" era 5.0/13 = 38.5 %, no 5.5/13 = 42.3 %.
- **Numeración de decisiones:** única y canónica, D-1…D-11 del registro de decisiones; la sección E es una copia fiel.

### I.2 Estado por etapa (código implementado ≠ etapa cerrada)

Se separan cuatro estados distintos: **código implementado y probado** · **acción administrativa pendiente** ·
**verificación no aprobada** · **no ejecutado**. Ninguna etapa se da por cerrada si depende de algo de las tres últimas columnas.

| Etapa | Código implementado y probado (unitarias verdes) | Acción administrativa pendiente | Verificación no aprobada / no ejecutada |
|---|---|---|---|
| 0 Auditoría y línea base | Sí (este informe) | — | Línea base de integración **no** es verde (I.4); no hay corrida anterior comparable para afirmar que las fallas son preexistentes (ver I.4) |
| 1 Seguridad e integridad | **Sí**: guardas de orden anulada/eliminada en las rutas mutantes de lote; auditoría de 4 descargas con falla cerrada; 35 pruebas | **Rotación de credenciales (S-1) pendiente**: quien administre QA debe rotar; decidir sobre el historial git | La integración con BD de estas rutas no se ejecutó de forma específica en esta ronda: las 35 pruebas son con prisma simulado (RBAC de rutas y controlador) |
| 2 Registro de decisiones | Sí (documento) | Confirmar dueños (son roles propuestos) y resolver D-1…D-11 | — |
| 3 Modelo y migraciones | Parcial: hitos, documentos del lote, método de prorrateo; migración aditiva | Aplicarla en PC-RC-SV (no hecho); recepción física/stock por lote bloqueado (D-7, D-8) | Migración probada **solo** en `saas_dev_qa`; **rollback no probado** |
| 4 Costeo, documentos, backend | Parcial: costeo FOB atómico; PESO/VOLUMEN existen en el dominio pero la API los rechaza (D-3) | Catálogo tributario sin fuente (D-4) | — |
| 5 WMS/QMS | **No implementado** (D-7, D-8) | Decidir sistema de registro de existencias | — |
| 6 Analítica y alertas | Parcial: sin proxies, con exclusiones y definiciones | Umbrales por tenant sin aprobar (D-6) | — |
| 7 Siesa asistido | **No implementado** (no hay contrato; D-9) | Entregar contrato oficial | — |
| 8 Verificación y despliegue | Unidades, typecheck, build y `prisma validate` en verde | **Remediación de QA pendiente** (I.4) | **Gate global de integración NO aprobado**; gate anti-omisión NO cumplido; **rollback, UAT, smoke tests y despliegue NO ejecutados** (el runbook solo está preparado) |

### I.3 Pruebas ejecutadas (esta ronda)

| Verificación | Resultado |
|---|---|
| Backend `vitest run` | 111 archivos · 1128 pasaron · 0 fallaron · 0 omitidas |
| Frontend `vitest run` | 17 archivos · 120 pasaron · 0 fallaron · 0 omitidas |
| `tsc --noEmit` (servidor y raíz) / `npm run build` (ambos) / `prisma validate` | OK |
| ESLint raíz | 0 errores, 17 warnings (los mismos de antes) |
| Integración QA (`npm run test:integration:qa`, destino verificado `saas_dev_qa` @ 192.168.0.234, login runner) | Ver I.4: resultado bruto de Vitest |

### I.4 Integración contra QA — reconciliación del resultado bruto de Vitest

Fuente: salida de la última corrida (`npm run test:integration:qa`), guardada en
`C:\Users\admin\AppData\Local\Temp\claude\c--Users-admin-Downloads-RicoSoft-RicoSoft\9e0eb0a3-e291-4222-9546-b7421b8928f4\scratchpad\qa-test3.log`
(copia sin contraseñas: `qa-test3.masked.log`, misma carpeta). Líneas finales de Vitest, textuales:

```
 Test Files  6 failed | 68 passed (74)
      Tests  8 failed | 749 passed | 40 skipped (797)
```
y los encabezados `Failed Suites 4` y `Failed Tests 8`.

**Los cuatro números son magnitudes distintas y no se suman entre sí:**

| Magnitud | Valor | Qué es |
|---|---|---|
| Pruebas fallidas (`Tests … failed`) | **8** | Pruebas individuales que ejecutaron y fallaron: **2** en `facturas.tenant-prisma` + **6** en `pagos.hardening` |
| Errores de hook (`Failed Suites`) | **4 suites / 8 errores** | `beforeAll`/`afterAll` que lanzaron error: `auth-register` (2), `pedidos-compromiso` (2), `facturas-siesa` (2), `inventario-comprometidos` (2). Cada suite tiene un error de `beforeAll` y otro de `afterAll` |
| Archivos fallidos (`Test Files … failed`) | **6** | 4 por errores de hook + 2 por pruebas fallidas (`facturas.tenant-prisma`, `pagos.hardening`) |
| Omitidas (`skipped`) | **40** | Pruebas cuyo cuerpo no corrió. No son fallos de prueba, pero el gate anti-omisión las trata como falla |

Correcciones al informe anterior: (a) el resumen "8 fallos" y el desglose "2 de `auth-register` + 2 + 6" mezclaban pruebas
fallidas con errores de hook; las 2 entradas de `auth-register` son **errores de hook, no pruebas fallidas**, y las 8 pruebas
fallidas son solo las de facturas/pagos; (b) las 40 omitidas se reparten así: `auth-register` 3 (de 5 pruebas; las otras 2
pasan), `facturas-siesa` 7, `inventario-comprometidos` 7, `pedidos-compromiso` 23 (3+7+7+23 = 40); `Failed Suites` =
4 archivos con hooks fallidos, no 4 pruebas.

**Causa por grupo.** "Comprobado" = dato observado en QA con consultas `SELECT` o error literal de Vitest; "inferido" = deducido del código sin reproducir.

| Grupo | Qué se observó (comprobado) | Qué se infiere (no reproducido) |
|---|---|---|
| `facturas-siesa`, `pedidos-compromiso` | Error literal `Unique constraint failed on … Tenant_siesaCiaId_key` en `tenant.create` del `beforeAll`; existen en QA tres tenants `Fact Siesa A/B/Sin Cia 90c6cbcc` creados el 2026-10-09, dos con `siesaCiaId` 900980/900981 | Que esos tenants son la colisión exacta (las pruebas usan constantes que no leí una a una) |
| `inventario-comprometidos`, `auth-register` | Error literal "No existe ningún tenant con siesaCiaId=1" y `NotFoundError: No Tenant found`; en QA no hay tenant con `siesaCiaId=1` (5 tenants en total, ninguno Ricol). `afterAll` de `auth-register` lanza `PrismaClientValidationError` por `undefined` en `deleteMany` (consecuencia del `beforeAll` fallido) | Que el estado esperado por la prueba sea precisamente un tenant Ricol: lo confirma el área responsable |
| `facturas.tenant-prisma` (2), `pagos.hardening` (6) | Las pruebas reciben **400** donde esperan 201/404/409; en QA `CatalogoValor METODO_PAGO` tiene `TRANSFERENCIA` y `CHEQUE` con `activo=false`; el controlador responde 400 si el método no está entre los activos | Que ese sea el motivo del 400: **no capturé el cuerpo de la respuesta** (las pruebas no lo imprimen) |

**Sobre "preexistente":** los tenants `Fact Siesa` son de una fecha anterior (2026-10-09) a mi migración (2026-10-26). **No** existe una
corrida de integración previa comparable, así que no se puede afirmar que todas las 8 fallas y 40 omitidas existían antes
de mi cambio; se afirma solo que los datos que las explican son anteriores y que ningún archivo fallido pertenece a Importaciones.
Las pruebas de integración de Importaciones (`importaciones-lote-hitos-docs`, `importaciones-analitica`, etc.) **no figuran
entre los 6 archivos fallidos**; el informe no enumera sus pruebas una a una porque el reporter por defecto de Vitest solo detalla las fallidas.

### I.5 QA: lo que debe confirmar cada área (no se tocó ningún dato)

No se reactivó ningún método de pago, no se creó ni restauró ningún tenant y no se borró ningún residuo. Antes de cualquier
acción el área indicada debe **confirmar el estado esperado** de QA:

| Dato de QA | Estado observado | Quién debe confirmar el estado esperado | Pregunta |
|---|---|---|---|
| `METODO_PAGO`: `TRANSFERENCIA`, `CHEQUE` (GENERAL) | `activo=false` | Contabilidad/Tesorería + administrador de QA | ¿Deben estar activos en QA? ¿Alguien los desactivó a propósito (¿en producción también?)? Si en producción están activos, ¿el seed de QA quedó desactualizado? |
| Tenant Ricol con `siesaCiaId=1` | No existe en QA | Administrador de QA + TI (integración Siesa) | ¿QA debe contener un tenant Ricol? ¿Con qué datos? ¿Las pruebas de `inventario-comprometidos` y `auth-register` siguen vigentes o deben ajustarse? |
| Tenants `Fact Siesa A/B/Sin Cia` (2026-10-09) y `Lote Hitos A/B` (2026-10-26) | Presentes | Administrador de QA | Autorizar la eliminación **por estos 5 IDs exactos** y sus datos hijos (IDs en el registro de decisiones); nunca por patrón de nombre |

Hasta que esas tres confirmaciones ocurran y se ejecute la remediación autorizada, el gate global no puede evaluarse como verde.

### I.6 Riesgos y acciones
1. **S-1 (rotación de credenciales):** pendiente; rotar las contraseñas de QA y cualquier secreto JWT expuesto en el commit `c66740d` (valores no mostrados).
2. **QA:** remediación pendiente (I.5).
3. **Decisiones abiertas** D-1…D-11 (registro de decisiones).
4. **Rollback del despliegue no probado**, UAT y smoke tests no ejecutados; HTTPS y `/Ricosoft` no verificados en el repositorio.
5. Los scripts de diagnóstico de solo lectura viven solo en el directorio temporal de la sesión, no en el repositorio.

### I.7 Dictamen
**NO-GO para producción.** Se mantiene hasta que se cumplan, como mínimo: (1) gate global requerido en verde con
`test:integration:ci` y `test:integration:gate`, con cero fallos y cero omitidas no aprobadas por cambio formal de política;
(2) credenciales rotadas (S-1); (3) rollback probado y UAT ejecutado; (4) decisiones bloqueantes aprobadas. Una excepción documental
no convierte un check fallido en verde.
Listo para revisión del director (código con pruebas unitarias en verde): seguridad e integridad de rutas de lote/orden, hitos reales, documentos del lote con auditoría, analítica sin proxies, costeo por FOB atómico y migración aditiva (solo en QA).

### I.8 Comandos y evidencia usados (reproducibles)

Verificación local (sin escritura en BD):
```
cd server && npx vitest run                   # 111 archivos · 1128 pasaron
npx tsc --noEmit -p .                         # servidor
npx prisma validate
cd .. && npx vitest run                       # frontend: 17 archivos · 120 pasaron
npx tsc --noEmit ; npx eslint .               # 0 errores · 17 warnings
npm run build ; (cd server && npm run build)
```
Integración (ya ejecutada antes de esta revisión; **no se volvió a ejecutar** porque escribe fixtures en QA):
```
cd server && npm run test:integration:qa      # guard: saas_dev_qa @ 192.168.0.234, login runner
```
Diagnóstico de solo lectura (`SELECT`, tras `validarDestinoQa`; script fuera del repositorio):
```
cd server && npx tsx <scratchpad>\diag-qa-readonly.ts     # tenants con siesaCiaId, residuos 'Lote Hitos'
cd server && npx tsx <scratchpad>\diag-qa-catalogo2.ts     # filas METODO_PAGO
cd server && npx tsx <scratchpad>\diag-qa-tenants.ts       # id/nombre/fecha de los 5 tenants
```
Revisión de esta entrega (solo lectura de archivos locales): `grep` sobre `qa-test3.masked.log` de `Failed Suites`, `Failed Tests`, `Test Files`, `Tests` y de las líneas ` FAIL `.

### I.9 Confirmaciones
No se hizo commit, push, merge, reset, migración, limpieza ni deploy, y no se tocó ningún dato de QA en esta revisión. No hubo
escritura en producción, `saas_dev` ni Siesa. En la ronda anterior, las únicas escrituras en QA fueron las corridas de la suite de
integración con los fixtures propios de cada prueba. No se imprimieron credenciales ni contenido de `.env`. `MEMORY.md` no se
actualizó (no hay decisión aprobada). El árbol de trabajo se preservó íntegro.
