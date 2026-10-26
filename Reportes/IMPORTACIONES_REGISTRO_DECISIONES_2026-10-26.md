# Importaciones — Registro de decisiones (2026-10-26)

**Estado del módulo: NO-GO** (no se recomienda todavía migrar al servidor ni desplegar; condiciones en la sección I.7 del informe
`IMPORTACIONES_AUDITORIA_EVOLUCION_2026-10-26.md`). Este registro es la **fuente canónica de la numeración D-1 a D-11**; el informe
la copia sin cambios en su sección E.

**Paquete de decisiones:** `IMPORTACIONES_PAQUETE_DECISIONES_2026-10-26.md` presenta cada D-1…D-11 en fichas para resolverlas con sus
responsables. El director lo aprobó **solo como material de preparación**: no aprueba ninguna decisión. Sus "datos requeridos", sus
"criterios de aceptación" y el orden de resolución sugerido son propuestas de Claude hasta que el director los revise y confirme.
Los responsables siguen siendo roles hasta que el director confirme personas.

Estado: **ninguna decisión de esta lista está aprobada**. Este registro no las toma; identifica quién debe tomarlas,
qué opciones hay, qué impacto tienen y qué trabajo queda bloqueado hasta que se resuelvan. Hasta entonces el sistema
**no** calcula, alerta ni exporta con valores supuestos.

Los "dueños" son **roles propuestos** (el repositorio no designa responsables nominales: NO VERIFICADO EN EL REPOSITORIO);
el director del proyecto debe confirmarlos.

Ya resueltas (no se reabren; fuente `Reportes/ARCHITECTURAL_DECISIONS_PENDING.md`): #2 landed cost por participación FOB;
#5 máquina de estados del lote.

| ID | Decisión | Dueño propuesto | Opciones | Impacto | Depende de | Trabajo bloqueado |
|---|---|---|---|---|---|---|
| D-1 | Semántica de `fechaEmbarque` y definición de cada hito (embarque real, llegada a puerto, inspección, levante, recepción) | Comercio exterior + Logística | (a) `fechaEmbarque` = fecha planificada y `EMBARQUE_REAL` = confirmada (hoy conviven); (b) una sola fecha con origen; (c) deprecar `fechaEmbarque` | KPI de tránsito y desaduanamiento; migración de datos históricos | — | Migrar/deprecar `fechaEmbarque`; KPI de tránsito puerto→planta con definición cerrada. Hitos actuales siguen funcionando |
| D-2 | Redondeo contable (centavos entre ítems) y si el método de prorrateo aplica por gasto o a toda la liquidación | Contabilidad | Redondeo al centavo con resto al ítem mayor / al último / sin redondeo; método único por liquidación o por gasto | Costos unitarios y asientos | D-3 | Prorrateo con redondeo; esquema por gasto |
| D-3 | Métodos de prorrateo distintos de FOB (PESO/VOLUMEN) y significado de `pesoKg` (neto/bruto/total o por unidad) y unidad de `volumenM3` | Contabilidad + Comercio exterior | Mantener solo FOB; aprobar PESO; aprobar VOLUMEN; mixto por tipo de gasto | `ARCHITECTURAL_DECISIONS_PENDING.md` #3 sigue "REQUIERE DECISIÓN CONTABLE". El cálculo existe en `domain/importaciones/prorrateo-gastos.ts` pero **la API solo acepta FOB** (`METODOS_PRORRATEO_APROBADOS`) | — | Habilitar PESO/VOLUMEN (ampliar la lista aprobada) y captura de volumen en la UI |
| D-4 | Fuente y vigencia de aranceles, IVA y su recuperabilidad | Comercio exterior + Contabilidad/Fiscal | Carga manual versionada; fuente oficial (a definir); por posición arancelaria con vigencia | Cálculo automático de tributos; `ClasificacionArancelariaMatriz` solo tiene `tarifaArancelariaBase` | — | Cálculo automático de arancel/IVA; catálogo tributario con vigencia. Hoy los montos los digita quien liquida |
| D-5 | Obligatoriedad documental por material/país/estado y bloqueo de liquidación (`#13`) | Comercio exterior + Calidad | Lista por tenant (material/país/estado); solo informativo | Bloqueos de flujo; alertas de documentos faltantes | — | Alerta/bloqueo por documento faltante; COA obligatorio. Hoy solo hay inventario de documentos adjuntos |
| D-6 | Días libres pactados y umbrales de alertas (ETA vencida, desviación de costo, etc.) | Logística / Comercio exterior | Parámetro por tenant (tabla/config) con aprobación del valor | Alertas con número | Dato contractual (contrato con naviera) | Alertas con umbral numérico y por tenant |
| D-7 | Política de recepción, cuarentena, inspección COA y responsable de liberar | Calidad + Operaciones | Cuarentena obligatoria u opcional por material; liberación por Calidad; rechazo parcial | Modelo de lote físico, permisos nuevos | D-8 | Etapa 5 completa (cuarentena/inspección/liberación) |
| D-8 | Sistema de registro de existencias por lote y relación con Siesa | Dirección + TI + Contabilidad (`ARCHITECTURAL_DECISIONS_PENDING.md` #7) | Siesa sigue siendo el sistema de inventario (RicoSoft solo informa estado de calidad); inventario nativo por lote en RicoSoft; híbrido | Duplicar o no existencias; frontera de solo lectura con Siesa | — | Etapas 3 (stock por lote) y 5. **No** se modela inventario hasta resolver esto |
| D-9 | Contrato oficial para intercambio asistido con Siesa (`#8`) | Contabilidad + TI/Siesa | Archivo de importación de Siesa (formato a definir); API oficial; sin intercambio | Etapa 7 | Documento oficial de Siesa | Etapa 7 completa. No hay formato en el repositorio (ver más abajo) |
| D-10 | Rotación de credenciales expuestas y política de `.env.integration.qa.example` | Administrador de QA/BD + TI | Rotar y reescribir historial / solo rotar | Seguridad. Ver hallazgo S-1 | — | Cierre del hallazgo S-1 |
| D-11 | Limpieza de residuos en `saas_dev_qa` (IDs exactos en la sección «Residuos y datos de QA» del registro) y **confirmar el estado esperado** de `METODO_PAGO` (Contabilidad/Tesorería) y del tenant Ricol (TI/Siesa) en QA; sin confirmación no se reactiva ni se crea nada | Administrador de QA | Borrado por IDs autorizados; recrear QA | Gate de integración | — | Gate global verde |

## Evidencia de la búsqueda de contrato Siesa (Etapa 7)

Búsqueda en el repositorio (`git ls-files` y `git grep` sobre "siesa/unoee × importaci"): solo aparecen informes de
auditoría, `ARCHITECTURAL_DECISIONS_PENDING.md` (#7, #8: "sin módulo de contabilidad; Siesa sincroniza en un solo
sentido, Siesa→RicoSoft, solo Proveedores"), `PENDIENTES_CONSOLIDADO.md` y código de lectura. **NO VERIFICADO EN EL
REPOSITORIO**: no existe contrato, plantilla, formato de importación de Siesa ni evidencia aprobada de interfaz
oficial. Por regla (§7, §13 de AGENTS.md) no se produce un CSV/JSON supuesto ni se escribe en Siesa.

Datos/decisiones mínimos para especificar la exportación cuando exista contrato: documento oficial del formato (campos,
tipos, codificación, versión), tipo de documento contable destino (¿entrada de importación, costo de inventario?),
cuenta/centro de costo por concepto (CIF, arancel, IVA, flete, agenciamiento), regla de redondeo (D-2), identificador
de conciliación (`exportId`, hash y versión del formato quedan definidos en el diseño), y quién carga el archivo.

## Hallazgos de seguridad (Etapa 1)

- **S-1 — Credenciales en historial git (valores NO mostrados).** El commit `c66740d` ("FIX: Deploy v1") versionó
  `server/.env.integration.qa.example` con contraseñas de los logins de QA (`…_migrador`, `…_runner`) que **no** son
  marcadores, y un `JWT_SECRET` de 64 caracteres hexadecimales. La copia de trabajo (cambio previo sin confirmar) ya los
  sustituye por marcadores, pero **siguen en el historial** y, si el commit está en `origin/main`, en el remoto.
  Acción: el administrador de QA debe **rotar** las dos contraseñas y cualquier secreto JWT que se haya reutilizado;
  decidir si se reescribe el historial (decisión del responsable; no se hizo, está prohibido sin autorización).
  Los demás archivos versionados de ejemplo (`.env.example`, `server/.env.example`) contienen solo marcadores; no se
  encontraron secretos literales en el código versionado fuera de tests/ejemplos, y `.env` está en `.gitignore`.
- **S-2 — Hecho / mitigado en esta etapa:** rutas de lote/orden ahora rechazan órdenes anuladas o eliminadas en
  estado, embarque, contenedores, tracking, expediente, vistos buenos, documentos, recepción y liquidación; toda
  descarga de documento queda en `ImportacionHistorial` (actor, documento, acción, sin ruta ni contenido) y falla
  cerrada si el registro falla.
- **S-3 — Pendiente menor:** `ImportacionHistorial` no tiene `tenantId` propio (se aísla por la orden); no se modificó.

## Residuos y datos de QA (D-11) — IDs exactos, no se borró nada

Base verificada por el guard: `saas_dev_qa` en el host de QA aprobado, login de pruebas. Consulta de solo lectura.

Tenants residuales (requieren autorización del administrador antes de eliminarse; borrar por estos IDs, nunca por patrón):

| ID | Nombre | Creado | Origen |
|---|---|---|---|
| `541ece5e-38cd-4b42-addc-86889b6fc53e` | Fact Siesa A 90c6cbcc | 2026-10-09 | Origen NO VERIFICADO: el nombre coincide con `facturas-siesa` (hipótesis no comprobada); fecha previa a este trabajo |
| `f69ebdc7-50dc-464e-9241-b91fc2613e59` | Fact Siesa B 90c6cbcc | 2026-10-09 | ídem (hipótesis no comprobada) |
| `4b0bb84e-7809-4712-babe-b207c1a6cb3c` | Fact Siesa Sin Cia 90c6cbcc | 2026-10-09 | ídem (hipótesis no comprobada) |
| `bd9da495-ca3c-40a4-9284-36ea2f5884ba` | Lote Hitos A 62349322 | 2026-10-26 | Primera corrida de mis pruebas (limpieza defectuosa, ya corregida) |
| `ec2ee3a9-6c6f-42a2-8356-7fa151d0ba5c` | Lote Hitos B 62349322 | 2026-10-26 | ídem |

Los tenants "Fact Siesa" tienen `siesaCiaId` fijo (900980/900981), que es una restricción única: esa es la causa
comprobada de que las pruebas de Siesa fallen al crear sus propios tenants. Además de los tenants hay filas hijas
(usuarios, facturas, etc.) cuyo borrado debe ser en cascada ordenada por el administrador.

Datos de QA fuera de especificación (no tocados): en `CatalogoValor` `METODO_PAGO` las claves generales
`TRANSFERENCIA` y `CHEQUE` están `activo=false` (código y pruebas esperan "Transferencia"/"Cheque" válidos); no hay
tenant con `siesaCiaId = 1` ni tenant Ricol que `auth-register` e `inventario-comprometidos` requieren.
Quién desactivó los métodos de pago: NO VERIFICADO EN EL REPOSITORIO. **No se reactivaron ni se creó/restauró ningún tenant:** el área responsable debe primero confirmar el estado esperado (informe, sección I.5).
