# Importaciones — Paquete de decisiones D-1 a D-11 (2026-10-26)

**Estado del módulo: NO-GO** (ver `IMPORTACIONES_AUDITORIA_EVOLUCION_2026-10-26.md`, I.7). **Ninguna decisión está aprobada.**

Para: el director del proyecto. Sirve para cerrar las decisiones con los responsables de negocio. No autoriza cambios de datos en QA, migraciones, commits ni despliegue.

**Cómo leer este paquete**
- *Pregunta, responsable, opciones, impacto, dependencias y trabajo bloqueado* están **copiados sin reinterpretar** del registro canónico `IMPORTACIONES_REGISTRO_DECISIONES_2026-10-26.md`.
- *Datos que debe aportar el responsable* y *criterios de aceptación* son **propuestas de Claude** para facilitar la reunión; no están en el registro y quedan sujetas a la confirmación del director.
- Los responsables son **roles propuestos**; el director confirmará las personas. Los nombres de persona no se asumen.
- Lo que no se puede comprobar en el repositorio se marca `NO VERIFICADO EN EL REPOSITORIO`.

## Resumen

| ID | Decisión | Responsable (rol propuesto) | Depende de | Bloquea |
|---|---|---|---|---|
| D-1 | Semántica de `fechaEmbarque` y definición de cada hito (embarque real, llegada a puerto, inspección, levante, recepción) | Comercio exterior + Logística | — | Migrar/deprecar `fechaEmbarque`; KPI de tránsito puerto→planta con definición cerrada. Hitos actuales siguen funcionando |
| D-2 | Redondeo contable (centavos entre ítems) y si el método de prorrateo aplica por gasto o a toda la liquidación | Contabilidad | D-3 | Prorrateo con redondeo; esquema por gasto |
| D-3 | Métodos de prorrateo distintos de FOB (PESO/VOLUMEN) y significado de `pesoKg` (neto/bruto/total o por unidad) y unidad de `volumenM3` | Contabilidad + Comercio exterior | — | Habilitar PESO/VOLUMEN (ampliar la lista aprobada) y captura de volumen en la UI |
| D-4 | Fuente y vigencia de aranceles, IVA y su recuperabilidad | Comercio exterior + Contabilidad/Fiscal | — | Cálculo automático de arancel/IVA; catálogo tributario con vigencia. Hoy los montos los digita quien liquida |
| D-5 | Obligatoriedad documental por material/país/estado y bloqueo de liquidación (`#13`) | Comercio exterior + Calidad | — | Alerta/bloqueo por documento faltante; COA obligatorio. Hoy solo hay inventario de documentos adjuntos |
| D-6 | Días libres pactados y umbrales de alertas (ETA vencida, desviación de costo, etc.) | Logística / Comercio exterior | Dato contractual (contrato con naviera) | Alertas con umbral numérico y por tenant |
| D-7 | Política de recepción, cuarentena, inspección COA y responsable de liberar | Calidad + Operaciones | D-8 | Etapa 5 completa (cuarentena/inspección/liberación) |
| D-8 | Sistema de registro de existencias por lote y relación con Siesa | Dirección + TI + Contabilidad (`ARCHITECTURAL_DECISIONS_PENDING.md` #7) | — | Etapas 3 (stock por lote) y 5. **No** se modela inventario hasta resolver esto |
| D-9 | Contrato oficial para intercambio asistido con Siesa (`#8`) | Contabilidad + TI/Siesa | Documento oficial de Siesa | Etapa 7 completa. No hay formato en el repositorio (ver más abajo) |
| D-10 | Rotación de credenciales expuestas y política de `.env.integration.qa.example` | Administrador de QA/BD + TI | — | Cierre del hallazgo S-1 |
| D-11 | Limpieza de residuos en `saas_dev_qa` (IDs exactos en la sección «Residuos y datos de QA» del registro) y **confirmar el estado esperado** de `METODO_PAGO` (Contabilidad/Tesorería) y del tenant Ricol (TI/Siesa) en QA; sin confirmación no se reactiva ni se crea nada | Administrador de QA | — | Gate global verde |

**Orden de resolución sugerido por dependencias** (propuesta de Claude, a confirmar): D-3 antes que D-2; D-8 antes que D-7; D-2 antes que D-9; D-10 y D-11 son administrativas e independientes.

## D-1 — Semántica de `fechaEmbarque` y definición de cada hito (embarque real, llegada a puerto, inspección, levante, recepción)

- **Responsable (rol propuesto):** Comercio exterior + Logística
- **Opciones (del registro):** (a) `fechaEmbarque` = fecha planificada y `EMBARQUE_REAL` = confirmada (hoy conviven); (b) una sola fecha con origen; (c) deprecar `fechaEmbarque`
- **Impacto (del registro):** KPI de tránsito y desaduanamiento; migración de datos históricos
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Migrar/deprecar `fechaEmbarque`; KPI de tránsito puerto→planta con definición cerrada. Hitos actuales siguen funcionando
- **Datos que debe aportar el responsable (propuesta):**
  - Definición escrita de cada hito (embarque real, llegada a puerto, inspección aduanera, levante, recepción física) y si se añaden tránsito terrestre y liberación para inventario.
  - Si `fechaEmbarque` es fecha planificada o fecha real, y quién registra cada hito.
  - Muestra de datos históricos para decidir qué hacer con los lotes ya creados.
- **Criterios de aceptación (propuesta):**
  - Cada hito tiene definición, origen permitido (Manual/Sistema) y rol que lo registra.
  - Regla escrita sobre `fechaEmbarque` y plan aprobado para los datos históricos (sin editar migraciones aplicadas).
  - El indicador de tránsito puerto→planta se reproduce con ejemplos numéricos aprobados por el responsable.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-2 — Redondeo contable (centavos entre ítems) y si el método de prorrateo aplica por gasto o a toda la liquidación

- **Responsable (rol propuesto):** Contabilidad
- **Opciones (del registro):** Redondeo al centavo con resto al ítem mayor / al último / sin redondeo; método único por liquidación o por gasto
- **Impacto (del registro):** Costos unitarios y asientos
- **Depende de (del registro):** D-3
- **Trabajo bloqueado hasta resolverla (del registro):** Prorrateo con redondeo; esquema por gasto
- **Datos que debe aportar el responsable (propuesta):**
  - Regla de redondeo contable (al centavo, dónde va el resto de centavos, o sin redondeo) con 2–3 ejemplos reales.
  - Si el método de prorrateo se elige por cada gasto (flete, agenciamiento, otros) o una vez para toda la liquidación.
- **Criterios de aceptación (propuesta):**
  - En los ejemplos aprobados, la suma de las filas por ítem es exactamente el total liquidado.
  - Casos límite probados: un solo ítem, resto de un centavo, montos en cero.
  - No cambia liquidaciones históricas.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-3 — Métodos de prorrateo distintos de FOB (PESO/VOLUMEN) y significado de `pesoKg` (neto/bruto/total o por unidad) y unidad de `volumenM3`

- **Responsable (rol propuesto):** Contabilidad + Comercio exterior
- **Opciones (del registro):** Mantener solo FOB; aprobar PESO; aprobar VOLUMEN; mixto por tipo de gasto
- **Impacto (del registro):** `ARCHITECTURAL_DECISIONS_PENDING.md` #3 sigue "REQUIERE DECISIÓN CONTABLE". El cálculo existe en `domain/importaciones/prorrateo-gastos.ts` pero **la API solo acepta FOB** (`METODOS_PRORRATEO_APROBADOS`)
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Habilitar PESO/VOLUMEN (ampliar la lista aprobada) y captura de volumen en la UI
- **Datos que debe aportar el responsable (propuesta):**
  - Si PESO y/o VOLUMEN se aprueban como métodos de prorrateo (y para qué gastos).
  - Significado de `pesoKg` (neto/bruto; total de la línea o por unidad) y unidad de `volumenM3`.
  - Quién captura peso/volumen, en qué momento y si es obligatorio.
- **Criterios de aceptación (propuesta):**
  - Lista de métodos aprobados registrada en `METODOS_PRORRATEO_APROBADOS`.
  - Validación definida (> 0 en todos los ítems) y mensajes de rechazo estables; sin caída silenciosa a otro método.
  - La UI de la orden captura el dato con su unidad y validación (solo después de esta decisión).
  - Pruebas con ejemplos numéricos aprobados (p. ej. reparto por peso con pesos 100/300).
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-4 — Fuente y vigencia de aranceles, IVA y su recuperabilidad

- **Responsable (rol propuesto):** Comercio exterior + Contabilidad/Fiscal
- **Opciones (del registro):** Carga manual versionada; fuente oficial (a definir); por posición arancelaria con vigencia
- **Impacto (del registro):** Cálculo automático de tributos; `ClasificacionArancelariaMatriz` solo tiene `tarifaArancelariaBase`
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Cálculo automático de arancel/IVA; catálogo tributario con vigencia. Hoy los montos los digita quien liquida
- **Datos que debe aportar el responsable (propuesta):**
  - Fuente oficial de aranceles e IVA, vigencia por tasa y regla de recuperable/no recuperable.
  - Quién carga y mantiene el catálogo, y con qué periodicidad.
- **Criterios de aceptación (propuesta):**
  - Catálogo versionado con fecha de vigencia y fuente por tasa.
  - Cálculo reproducible con la tasa vigente a la fecha del documento y trazabilidad de la tasa usada.
  - Pruebas de cambio de vigencia y de recuperabilidad; ningún cálculo sin fuente aprobada.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-5 — Obligatoriedad documental por material/país/estado y bloqueo de liquidación (`#13`)

- **Responsable (rol propuesto):** Comercio exterior + Calidad
- **Opciones (del registro):** Lista por tenant (material/país/estado); solo informativo
- **Impacto (del registro):** Bloqueos de flujo; alertas de documentos faltantes
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Alerta/bloqueo por documento faltante; COA obligatorio. Hoy solo hay inventario de documentos adjuntos
- **Datos que debe aportar el responsable (propuesta):**
  - Matriz de documentos obligatorios por material / proveedor / país / clasificación y el estado del lote en que se exigen.
  - Si la ausencia bloquea la operación o solo avisa (incluye el bloqueo de la liquidación, `#13`).
- **Criterios de aceptación (propuesta):**
  - Matriz aprobada y versionada por tenant.
  - Comportamiento definido (bloquear/avisar) por estado y probado por combinación.
  - Sin obligatoriedad definida no se bloquea ni se alerta.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-6 — Días libres pactados y umbrales de alertas (ETA vencida, desviación de costo, etc.)

- **Responsable (rol propuesto):** Logística / Comercio exterior
- **Opciones (del registro):** Parámetro por tenant (tabla/config) con aprobación del valor
- **Impacto (del registro):** Alertas con número
- **Depende de (del registro):** Dato contractual (contrato con naviera)
- **Trabajo bloqueado hasta resolverla (del registro):** Alertas con umbral numérico y por tenant
- **Datos que debe aportar el responsable (propuesta):**
  - Días libres pactados por naviera/contrato y de dónde sale el dato.
  - Porcentaje máximo de desviación de costos aceptado.
  - Destinatarios de cada alerta y si el umbral es por tenant.
- **Criterios de aceptación (propuesta):**
  - Valores aprobados por tenant (nunca un número por defecto inventado).
  - La alerta se dispara exactamente en el límite acordado (≥ o >) y está probada en el límite, debajo y encima.
  - Sin valor configurado no hay alerta.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-7 — Política de recepción, cuarentena, inspección COA y responsable de liberar

- **Responsable (rol propuesto):** Calidad + Operaciones
- **Opciones (del registro):** Cuarentena obligatoria u opcional por material; liberación por Calidad; rechazo parcial
- **Impacto (del registro):** Modelo de lote físico, permisos nuevos
- **Depende de (del registro):** D-8
- **Trabajo bloqueado hasta resolverla (del registro):** Etapa 5 completa (cuarentena/inspección/liberación)
- **Datos que debe aportar el responsable (propuesta):**
  - Si la cuarentena es obligatoria u opcional y por qué material.
  - Quién inspecciona y quién libera; qué se valida contra el COA; si se permite rechazo parcial.
  - Estados del flujo (recepción, cuarentena, inspección, liberado, rechazado).
- **Criterios de aceptación (propuesta):**
  - Diagrama de estados aprobado con roles y permisos canónicos definidos.
  - Un lote en cuarentena o rechazado no puede producirse ni consumirse (probado).
  - Transiciones atómicas, con auditoría y aisladas por tenant.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-8 — Sistema de registro de existencias por lote y relación con Siesa

- **Responsable (rol propuesto):** Dirección + TI + Contabilidad (`ARCHITECTURAL_DECISIONS_PENDING.md` #7)
- **Opciones (del registro):** Siesa sigue siendo el sistema de inventario (RicoSoft solo informa estado de calidad); inventario nativo por lote en RicoSoft; híbrido
- **Impacto (del registro):** Duplicar o no existencias; frontera de solo lectura con Siesa
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Etapas 3 (stock por lote) y 5. **No** se modela inventario hasta resolver esto
- **Datos que debe aportar el responsable (propuesta):**
  - Qué sistema es el registro de existencias por lote (Siesa, RicoSoft nativo o híbrido).
  - Si es nativo: ubicaciones, unidades, tipos de movimiento y conciliación con Siesa.
- **Criterios de aceptación (propuesta):**
  - Decisión escrita y aprobada por Dirección, TI y Contabilidad.
  - No duplica un inventario existente y respeta que Siesa sigue en solo lectura.
  - Conciliación definida entre ambos sistemas.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-9 — Contrato oficial para intercambio asistido con Siesa (`#8`)

- **Responsable (rol propuesto):** Contabilidad + TI/Siesa
- **Opciones (del registro):** Archivo de importación de Siesa (formato a definir); API oficial; sin intercambio
- **Impacto (del registro):** Etapa 7
- **Depende de (del registro):** Documento oficial de Siesa
- **Trabajo bloqueado hasta resolverla (del registro):** Etapa 7 completa. No hay formato en el repositorio (ver más abajo)
- **Datos que debe aportar el responsable (propuesta):**
  - Documento oficial del formato (campos, tipos, codificación, versión) o de la interfaz oficial de Siesa.
  - Tipo de documento contable destino y cuentas/centros de costo por concepto (CIF, arancel, IVA, flete, agenciamiento).
  - Regla de redondeo (D-2), identificador de conciliación y quién carga el archivo.
- **Criterios de aceptación (propuesta):**
  - Archivo de ejemplo validado por el responsable de Siesa.
  - `exportId`, hash y versión del formato; validación previa; idempotencia; auditoría; conciliación.
  - Cero escrituras SQL en Siesa.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-10 — Rotación de credenciales expuestas y política de `.env.integration.qa.example`

- **Responsable (rol propuesto):** Administrador de QA/BD + TI
- **Opciones (del registro):** Rotar y reescribir historial / solo rotar
- **Impacto (del registro):** Seguridad. Ver hallazgo S-1
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Cierre del hallazgo S-1
- **Datos que debe aportar el responsable (propuesta):**
  - Lista de credenciales afectadas (sin valores): logins de QA y secretos JWT del commit `c66740d`.
  - Responsable de la rotación y decisión del responsable del repositorio sobre el historial git.
- **Criterios de aceptación (propuesta):**
  - Credenciales rotadas y verificadas por el administrador, con confirmación escrita (sin valores en el repositorio).
  - `.env.integration.qa.example` solo con marcadores.
  - Decisión sobre el historial git registrada.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## D-11 — Limpieza de residuos en `saas_dev_qa` (IDs exactos en la sección «Residuos y datos de QA» del registro) y **confirmar el estado esperado** de `METODO_PAGO` (Contabilidad/Tesorería) y del tenant Ricol (TI/Siesa) en QA; sin confirmación no se reactiva ni se crea nada

- **Responsable (rol propuesto):** Administrador de QA
- **Opciones (del registro):** Borrado por IDs autorizados; recrear QA
- **Impacto (del registro):** Gate de integración
- **Depende de (del registro):** —
- **Trabajo bloqueado hasta resolverla (del registro):** Gate global verde
- **Datos que debe aportar el responsable (propuesta):**
  - Estado esperado de `METODO_PAGO` (`TRANSFERENCIA`, `CHEQUE`) en QA: Contabilidad/Tesorería.
  - Si QA debe tener un tenant Ricol con `siesaCiaId=1` y con qué datos: TI/Siesa.
  - Autorización del administrador de QA para eliminar los 5 tenants residuales por ID exacto.
- **Criterios de aceptación (propuesta):**
  - Remediación hecha solo con autorización escrita, por IDs exactos.
  - Después: gate global de integración y gate anti-omisión en verde, con cero fallos y cero omisiones no aprobadas.
- **Resolución:** _pendiente_ · Fecha: _—_ · Aprobado por: _—_

## Fuera de este paquete

Rollback del despliegue, UAT y HTTPS/`/Ricosoft` no son decisiones de negocio sino pasos del runbook (`IMPORTACIONES_RUNBOOK_PC-RC-SV_2026-10-26.md`); siguen bloqueantes para producción junto con D-10 y D-11.
