# RICOSOFT_TARGET_ARCHITECTURE_AUDIT.md

Auditoría de solo lectura. Ningún archivo fue modificado, ninguna migración creada, ninguna escritura ejecutada. Basada en código real (con evidencia archivo:línea donde aplica) + el marco de negocio que definiste en este prompt. Donde el código no permite inferir una regla de negocio, queda marcado explícitamente como **PENDIENTE DE VALIDACIÓN**, nunca inventado.

---

## 1. Resumen ejecutivo

RicoSoft hoy **ya funciona, en su diseño real, como la capa de control previo que describes** — no como un segundo ERP. La evidencia más fuerte de esto es negativa y contundente: en todo el backend existe **una sola consulta** contra la base de Siesa, y es un `SELECT` (`siesa-sync.service.ts:19`). No hay ni un solo `INSERT`/`UPDATE`/`DELETE` hacia Siesa en ningún punto del código. El principio "Siesa → RicoSoft sí, RicoSoft → Siesa no" no es una aspiración: ya está respetado estructuralmente, porque la única conexión que existe hacia Siesa (`getSiesaPool()`) fue construida desde el inicio como credencial de solo lectura.

Dicho esto, la auditoría encontró **dos gaps concretos y accionables** en la parte que sí te importa — la trazabilidad — que no habían salido en auditorías anteriores porque nadie había preguntado específicamente "¿podemos reconstruir el POR QUÉ y evitar que alguien apruebe su propia solicitud?": (1) **no existe ninguna verificación de que quien aprueba una compra no sea quien la solicitó**, y (2) **la justificación que un aprobador escribe al aprobar/rechazar (`comentarioResolucion`) se guarda en la tabla de la solicitud, pero nunca se copia al registro de auditoría** — así que el "por qué" existe en la base de datos, pero no en el rastro de auditoría que normalmente se consulta para reconstruir una decisión.

## 2. Principio arquitectónico rector

```
SIESA/UnoEE = ERP y sistema de registro definitivo
              (contabilidad, inventario, compras ejecutadas, pagos)

RICOSOFT    = capa de control, aprobación, trazabilidad y
              preparación operativa PREVIA a Siesa

Frontera: cuando una operación queda "Aprobada"/"Comprado"/"Facturada"
          dentro de RicoSoft, la responsabilidad de RicoSoft TERMINA.
          El registro definitivo en Siesa es un acto humano, manual,
          fuera del sistema.
```

Este principio **ya está implementado**, no solo declarado — confirmado por la ausencia total de escritura hacia Siesa (sección 12).

## 3. Mapa de responsabilidades

| Proceso | RicoSoft | Siesa | Responsable | Punto de transferencia |
|---|---|---|---|---|
| Compras | Solicitud, 3 cotizaciones, comparación, aprobación, estado "Comprado" | Orden de compra ejecutada, registro contable | Solicitante → Gerencia Adm/Fin | Al pasar a "Comprado" (manual en Siesa) |
| Facturas | Carga, vinculación a SC, aprobación/rechazo, historial | Registro contable definitivo, pago | Contabilidad | Al aprobar la factura en RicoSoft (registro manual posterior en Siesa) |
| Importaciones | Orden, lotes, tránsito, expediente aduanero, vistos buenos, costeo landed (referencial) | Nacionalización contable, inventario, costo definitivo | Comercio Exterior | **PENDIENTE DE VALIDACIÓN** — no hay ningún punto de transferencia explícito en código (ver sección 6) |
| Proveedores | Catálogo operativo (contacto, departamento, clasificación) | Maestro de terceros (NIT, razón social) | Sistemas/Comercio Exterior | Sincronización de solo lectura, continua |
| Contabilidad | Ninguna — no existe módulo | Todo | Contabilidad | No aplica — no debe construirse en RicoSoft (ver sección 16) |
| Inventario | Ninguna — no existe módulo | Todo | Comercio Exterior/Bodega | No aplica — no debe construirse en RicoSoft (ver sección 16) |
| Pagos | Registro de pagos aplicados a Factura (parciales, comprobantes) | Pago real, tesorería | Contabilidad/Tesorería | **PENDIENTE DE VALIDACIÓN** — RicoSoft registra `Pago` pero no está confirmado si esto es informativo o si duplica lo que Tesorería hace en Siesa |
| Aprobaciones | Todas las de Compras/Facturas | Ninguna | Gerencia Adm/Fin | — |
| Documentos | Cotizaciones, facturas, expediente aduanero, vistos buenos (todo con `upload.middleware.ts`, aislado por tenant) | Los que Siesa genere internamente | Cada responsable de etapa | — |

## 4. Flujo objetivo de Compras

```
Solicitud (CONFIRMADO en código)
  ↓
Cotizaciones (CONFIRMADO: exactamente 3 exigidas por el sistema — ver sección 7)
  ↓
Comparación (CONFIRMADO: cuadro comparativo en frontend)
  ↓
Justificación (PARCIAL — existe SolicitudCompra.comentarioResolucion, pero no
               se propaga a Auditoria — ver hallazgo #2)
  ↓
Aprobación (CONFIRMADO, permiso SOLICITUDES_APROBAR — con el gap de
            autoaprobación del hallazgo #1)
  ↓
Aprobado (estado "Aprobada")
  ↓
Comprado (estado "Comprado" — CONFIRMADO como estado terminal puramente
          informativo, sin ningún side-effect hacia Siesa)
  ↓
════════ FRONTERA RICOSOFT | SIESA ════════
  ↓
Registro manual en Siesa (fuera del sistema, por diseño)
```

Dentro de RicoSoft: todo hasta "Comprado"/"Facturada". Fuera de RicoSoft: cualquier ejecución real de la orden de compra en Siesa.

## 5. Flujo objetivo de Facturas

```
Recepción (NO CONFIRMADO dónde ocurre físicamente — el sistema permite
           cargar la factura, pero el evento de recepción física
           correo/físico no está modelado como un paso propio)
  ↓
Carga documental (CONFIRMADO: archivo adjunto, aislado por tenant)
  ↓
Relación con compra (CONFIRMADO: solicitudCompraId opcional, valida estado
                      vinculable de la SC)
  ↓
Validación/Aprobación (CONFIRMADO: máquina de estados con permisos por
                        transición)
  ↓
Vinculación automática (CONFIRMADO: si se liga a una SC Aprobada/Comprada,
                         la factura se auto-aprueba dentro de una
                         transacción — atómico)
  ↓
════════ FRONTERA RICOSOFT | SIESA ════════
  ↓
Registro manual en Siesa por Contabilidad
```

**Gap real**: el proceso que describes — "el solicitante firma/valida el servicio, luego llega a Contabilidad, Contabilidad registra en Siesa" — tiene el primer paso (validación de que el servicio/producto realmente se recibió) **sin modelar explícitamente**. Hoy el flujo salta de "factura cargada" a "aprobada", sin un estado intermedio de "recibido/validado por el solicitante" distinto de la aprobación final de Gerencia. **PENDIENTE DE VALIDACIÓN** si esto debe separarse en dos pasos.

## 6. Flujo objetivo de Importaciones

**Lo que existe hoy en código** (confirmado, endpoint por endpoint):

```
Crear Orden de Compra Internacional
  ↓
Crear Lote de Importación (agrupa ítems de la orden)
  ↓
Cambiar estado de tránsito del lote (manual, varias veces)
  ↓
Recepción pre-compra en planta
  ↓
[en paralelo] Expediente aduanero (DIM, factura comercial, certificado
              origen) + Vistos buenos (documentos regulatorios)
  ↓
Liquidación de costeo (landed cost, prorrateo por valor FOB)
  ↓
(estado terminal — no hay "Cerrada" alcanzable, ver Reportes/
 ARCHITECTURAL_DECISIONS_PENDING.md #4, sigue sin resolver)
```

**Lo que NO se puede confirmar desde el código** (marcado explícitamente, no inventado):

- **NO CONFIRMADO**: qué hace exactamente Comercio Exterior vs. Compras vs. Contabilidad en cada paso — el código no distingue roles por etapa más allá del permiso `IMPORTACIONES_GESTIONAR_TRANSITO`/`IMPORTACIONES_RECIBIR`/`IMPORTACIONES_LIQUIDAR`.
- **NO CONFIRMADO**: qué información de una importación termina en Siesa y cómo llega ahí (manual, se asume, pero el proceso humano exacto no está documentado en ningún lado del repo).
- **INFERIDO**: el costeo landed liquidado en RicoSoft es "referencial" (para que alguien tenga un costo de referencia antes de que Contabilidad lo registre en Siesa) — inferido del propio comentario del código en `recibirPreCompraPlanta`, no confirmado con Comercio Exterior.
- **PENDIENTE DE VALIDACIÓN**: todo lo listado en `Reportes/ARCHITECTURAL_DECISIONS_PENDING.md` (TRM manual, anticipos a proveedor extranjero, recepción parcial, incidencias) sigue exactamente igual — no se tocó en esta auditoría porque son preguntas de negocio, no hallazgos de código nuevos.

## 7. Máquina de estados

### SolicitudCompra (confirmado, `solicitudes.controller.ts`)
```
Estados: Pendiente, En Cotización, Aprobada, Rechazada, Comprado, Facturada

Pendiente/En Cotización → Aprobada   (permiso SOLICITUDES_APROBAR)
Pendiente/En Cotización → Rechazada  (permiso SOLICITUDES_RECHAZAR)
Aprobada → Comprado                  (permiso SOLICITUDES_COMPRAR)
[Aprobada|Comprado] → Facturada      (SOLO desde facturas.controller.ts,
                                       transaccional, NO desde el endpoint
                                       de cambio de estado directo)
```
Sin estados sin transición ni transiciones imposibles. "Facturada" es intencionalmente inalcanzable desde `PATCH /solicitudes/:id/estado` — diseño correcto, no un bug.

### Factura (confirmado, sesión anterior)
```
Estados: Pendiente, Aprobada, Pagada, Rechazada
Máquina de transiciones explícita (TRANSICIONES), sin transición libre.
```

### OrdenCompraIntl / LoteImportacion (confirmado, auditoría Siesa anterior + esta)
- Orden: `Borrador → Confirmada → [Cerrada nunca alcanzable] / Anulada`.
- Lote: `En tránsito → En puerto → En inspección → Liberado pre-compra → Nacionalizado`, con los dos últimos como efectos secundarios (no asignables a mano) — ya documentado en `Reportes/ARCHITECTURAL_DECISIONS_PENDING.md`, sin cambios desde entonces.

### Hallazgo transversal de máquina de estados
Ningún estado detectado mezcla responsabilidad de forma incorrecta ni es redundante. El único "estado sin transición real" es `OrdenCompraIntl.Cerrada`, ya documentado previamente — no es un hallazgo nuevo de esta auditoría.

## 8. Trazabilidad

**Modelo `Auditoria`** (confirmado, `schema.prisma`): `tenantId, usuarioId, usuarioAfectado, accion, detalle (texto libre), entidadTipo, entidadId, datosAnteriores (JSON), datosNuevos (JSON), createdAt`.

Cruzando contra tu lista de 12 preguntas (sección 3 de tu prompt):

| Pregunta | ¿Se puede responder hoy? |
|---|---|
| A. Quién | ✅ `usuarioId` |
| B. Qué hizo | ✅ `accion` + `detalle` |
| C. Cuándo | ✅ `createdAt` |
| D. Por qué (justificación de una decisión) | 🔴 **NO** — ver hallazgo #2 abajo |
| E. Para qué | 🟡 Parcial — solo si el `detalle` textual lo menciona, no estructurado |
| F. Sobre qué operación | ✅ `entidadTipo`/`entidadId` (cuando se llena — no todos los `auditoria.create()` lo hacen) |
| G. Documentos que soportan la decisión | 🟡 Indirecto — el documento existe (archivo adjunto a la Cotización/Factura), pero la Auditoria no referencia el archivo específico |
| H/I. Estado antes/después | ✅ `datosAnteriores`/`datosNuevos`, cuando se llenan |
| J. Quién aprobó/rechazó | ✅ `SolicitudCompra.resueltoPorId`/`resueltoPorNombre` |
| K. Con qué justificación | 🔴 **NO en Auditoria** — existe en `SolicitudCompra.comentarioResolucion` pero no se copia al log de auditoría (hallazgo #2) |
| L. Qué ocurrió después | ✅ Reconstruible cruzando manualmente `Auditoria` + `FacturaHistorial`, pero no hay una vista unificada de "línea de tiempo completa de una operación" |

### 🔴 Hallazgo #1 — Sin prevención de autoaprobación (confirmado con evidencia)
`solicitudes.controller.ts`, función `cambiarEstadoSolicitud`: valida permiso y transición de estado, **pero en ningún punto compara `solicitud.solicitanteId` con `req.user.id`**. Un usuario con permiso `solicitudes.aprobar` puede aprobar su propia solicitud de compra sin ninguna restricción. Esto es exactamente el escenario que describiste como riesgo ("yo nunca aprobé eso" es defendible hoy; "yo aprobé mi propia compra" no tiene ninguna barrera).

### 🔴 Hallazgo #2 — La justificación de aprobación no llega a Auditoria (confirmado con evidencia)
`SolicitudCompra.comentarioResolucion` existe y se llena correctamente desde el body de la petición. Pero el `auditoria.create()` que registra el cambio de estado (`solicitudes.controller.ts`, dentro de `cambiarEstadoSolicitud`) construye su `detalle` solo con `"{nombre} cambió la solicitud '{item}' a '{nuevoEstado}'"` — **sin incluir el comentario**. Si alguien exporta o revisa el historial de auditoría (en vez de abrir la solicitud específica), el "por qué" de la decisión no aparece ahí.

## 9. Arquitectura de datos

| Categoría | Ejemplos | Fuente de verdad |
|---|---|---|
| Datos maestros de Siesa | `Proveedor.nit`, `nombre` (cuando `origen="SIESA"`), `siesaTerceroRowId` | Siesa (RicoSoft solo refleja) |
| Datos propios de RicoSoft | `Proveedor.contacto/telefono/email/departamentoId`, toda la clasificación operativa | RicoSoft |
| Datos derivados | Landed cost liquidado, comparativo de cotizaciones | RicoSoft (referencial, no definitivo) |
| Datos documentales | Cotizaciones, facturas, expediente aduanero, vistos buenos | RicoSoft (control previo) |
| Datos de aprobación | `resueltoPorId`, `comentarioResolucion`, estados | RicoSoft (registro de la decisión, no de la ejecución) |
| Datos históricos | `Auditoria`, `FacturaHistorial` | RicoSoft |

El modelo diferencia correctamente estas categorías donde se auditó — el único punto de mezcla real es el hallazgo #2 (la justificación vive en un modelo pero no se refleja en el modelo transversal de auditoría).

## 10. Multi-tenancy

Sin cambios respecto a la auditoría integral anterior — reconfirmado, no reevaluado desde cero en esta sesión:

- **Riesgo real**: 🔴 estructural, no activo. Aislamiento correcto donde se verificó línea por línea (Departamentos, Roles, Módulos, Proveedores, Facturas, Solicitudes, Cotizaciones, VistoBuenoAduanero vía relación anidada), pero sin garantía automática (sin middleware Prisma ni RLS) — depende de disciplina manual en cada query nueva.
- **Módulos más vulnerables**: cualquier endpoint nuevo que se agregue sin pasar por el patrón `whereAlcance`/filtro `tenantId` explícito — no hay ningún endpoint conocido hoy que falle esto, pero tampoco hay red de seguridad automatizada.
- **Solución compatible de menor riesgo**: un middleware de Prisma (`$use` / Prisma Client Extensions) que inyecte automáticamente el filtro `tenantId` en toda query de un modelo tenant-scoped, actuando como defensa en profundidad sobre la disciplina manual ya existente — no reemplazarla, sumarle una capa. Row-Level Security en SQL Server es la alternativa más fuerte pero de mayor riesgo de regresión (requiere que TODA conexión de Prisma pase el contexto de sesión SQL correctamente, cambio más invasivo).

## 11. Seguridad

- Autorización: permiso por endpoint, confirmado consistente (`requirePermission`).
- 🔴 Separación de funciones: **rota** — ver hallazgo #1 (autoaprobación).
- Acceso a documentos: aislado por tenant, confirmado en auditoría anterior (facturas, cotizaciones, vistos buenos).
- Auditoría: cobertura amplia pero con el gap del hallazgo #2.
- Escalamiento de privilegios: sin hallazgos nuevos — `isSuperadmin` sigue correctamente acotado al tenant activo.

## 12. Integración Siesa

**Confirmado con evidencia exhaustiva** (búsqueda de `getSiesaPool()` y `.query(` en todo `server/src`): existe una única conexión hacia Siesa, usada en un único lugar (`siesa-sync.service.ts`), para un único `SELECT`. **No existe ningún INSERT/UPDATE/DELETE hacia Siesa en absoluto.** El principio arquitectónico que describes en tu prompt no es una recomendación futura — ya es la realidad del código.

## 13. Dependencias entre módulos

```
SolicitudCompra
  → CotizacionProveedor (exactamente 3, con proveedor del catálogo o manual)
    → Proveedor (catálogo compartido, origen SIESA/MANUAL)
  → resueltoPorId (Aprobación, User)
  → estado "Comprado"
  → Factura (vinculación opcional, transaccional, auto-aprueba y marca "Facturada")
    → Pago (uno o varios, parciales)

OrdenCompraIntl — SIN relación con SolicitudCompra hoy (confirmado,
                  PENDIENTE DE VALIDACIÓN si debería existir)
  → LoteImportacion
    → ExpedienteAduanero
      → VistoBuenoAduanero (sin tenantId propio, aislado vía relación)
```

## 14. Decisiones de negocio pendientes (solo las que no se pueden inferir del código)

1. **Umbrales de aprobación por monto**: ¿existe un monto a partir del cual se requiere un nivel de aprobación distinto? Afecta: `SolicitudCompra`, permisos. Depende de: definir si `TRANSICIONES` necesita variantes por monto.
2. **Excepción a las 3 cotizaciones**: ¿qué constituye "relación previa suficiente" o "razón operativa" para no exigirlas? Afecta: `CotizacionProveedor`, validación de aprobación. Depende de: si se requiere un campo de justificación obligatorio cuando hay menos de 3.
3. **Separación de funciones**: ¿debe el sistema impedir estructuralmente la autoaprobación (hallazgo #1), o es aceptable como control administrativo fuera del sistema? Afecta: `solicitudes.controller.ts`. Depende de: decisión de Gerencia Adm/Fin.
4. **Paso de "recepción/validación del servicio" en Facturas**: ¿debe modelarse como un estado propio, distinto de la aprobación final? Afecta: máquina de estados de `Factura`. Depende de: confirmar el flujo real con Contabilidad.
5. **Transferencia Importación → Siesa**: ¿qué información exacta se lleva manualmente y quién lo hace? Afecta: todo el módulo de Importaciones. Depende de: Comercio Exterior.
6. **Relación Importación ↔ Compra nacional**: ya listada en `ARCHITECTURAL_DECISIONS_PENDING.md`, sigue abierta.
7. **Pagos**: ¿el módulo `Pago` de RicoSoft es puramente informativo o se espera que refleje pagos reales antes de que Tesorería los ejecute en Siesa? Afecta: `Pago`, `Factura`. Depende de: Contabilidad/Tesorería.
8. **TRM, anticipos, aranceles preferenciales, recepción parcial, incidencias** (Importaciones) — sin cambios desde `ARCHITECTURAL_DECISIONS_PENDING.md`.

## 15. Recomendaciones de arquitectura

**P0 — Seguridad/integridad**
- Agregar verificación de autoaprobación (hallazgo #1) — cambio pequeño, alto impacto en confianza del proceso.
- Propagar `comentarioResolucion` al `detalle` de `Auditoria` en la transición de estado (hallazgo #2) — cambio trivial.

**P1 — Procesos prioritarios**
- Definir con Comercio Exterior el punto de transferencia Importación→Siesa (sección 14 #5).
- Confirmar con Contabilidad si falta un estado de "recepción/validación" en Facturas (sección 14 #4).

**P2 — Trazabilidad**
- Vista unificada de "línea de tiempo de una operación" (cruzando Auditoria + FacturaHistorial + resolución de SC) — hoy reconstruible manualmente, no de un vistazo.

**P3 — UX/optimización**
- Sin hallazgos nuevos en esta auditoría (fuera de alcance del enfoque de negocio pedido).

**P4 — Mejoras futuras**
- Middleware Prisma para aislamiento tenant estructural (sección 10) — grande, se justifica solo cuando el equipo crezca lo suficiente para que la disciplina manual sea insostenible.

## 16. Qué NO debemos construir

- **Contabilidad completa en RicoSoft** — confirmado que no existe, y no debe existir: Siesa ya es la fuente de verdad contable. Construirla duplicaría el ERP.
- **Inventario completo en RicoSoft** — mismo razonamiento; el costeo landed que ya existe es explícitamente referencial, no debe convertirse en un sistema de existencias paralelo.
- **Escritura automática hacia Siesa** — confirmado que hoy no existe; no debe agregarse sin que sea una decisión arquitectónica explícita y deliberada, no un "para automatizar".
- **Un segundo motor de aprobaciones/estados por módulo** — la máquina de estados actual (SolicitudCompra/Factura) es el patrón correcto a replicar, no a reinventar para Importaciones.

## 17. Roadmap recomendado (por dependencias reales, no por facilidad técnica)

```
FASE 0 — Cerrar los 2 gaps de trazabilidad ya evidenciados
  (autoaprobación + justificación en Auditoria)
       ↓
FASE 1 — Validar con Comercio Exterior el flujo real de Importaciones
  (sin esto, cualquier cambio de código en ese módulo es una suposición)
       ↓
FASE 2 — Validar con Contabilidad el paso de recepción/validación de
  Facturas, y el rol real de Pago frente a Siesa
       ↓
FASE 3 — Definir con Gerencia Adm/Fin los umbrales de aprobación y las
  excepciones a las 3 cotizaciones
       ↓
FASE 4 — Solo entonces: cualquier construcción nueva de Compras/
  Facturas/Importaciones basada en las decisiones ya tomadas
       ↓
FASE 5 — Aislamiento tenant estructural (middleware Prisma), cuando el
  equipo/volumen lo justifique
```

## 18. Riesgos

- **Técnicos**: aislamiento tenant sin garantía estructural (sección 10), ya conocido.
- **Funcionales**: proceso de Importaciones construido parcialmente sobre supuestos no confirmados con Comercio Exterior.
- **Seguridad**: autoaprobación sin control (hallazgo #1) — el más concreto y accionable de toda esta auditoría.
- **Auditoría**: justificaciones de decisión no trazables desde el log central (hallazgo #2).
- **Integración**: ninguno nuevo — la frontera con Siesa está bien respetada.
- **Humanos/operativos**: dependencia de que Contabilidad/Comercio Exterior efectivamente registren en Siesa lo que RicoSoft ya aprobó — RicoSoft no puede garantizar ni verificar que ese paso manual ocurra ni cuándo.

## 19. Preguntas para Gerencia Administrativa y Financiera

1. ¿Existen montos a partir de los cuales se requiere un nivel de aprobación adicional (comité, gerencia general, etc.)?
2. ¿Qué constituye una excepción válida a las 3 cotizaciones, y debe quedar documentada obligatoriamente?
3. ¿Es aceptable que hoy un aprobador pueda aprobar su propia solicitud, o debe bloquearse?
4. ¿Existen categorías de compra (papelería, aseo) que deban tener un flujo simplificado formal, o es una excepción caso a caso?
5. ¿Quién más allá de Gerencia Adm/Fin debe poder aprobar, y bajo qué condición?

## 20. Preguntas para Comercio Exterior

1. ¿Cuál es la secuencia real de responsables en una importación (quién crea la orden, quién gestiona el lote, quién liquida el costeo)?
2. ¿Qué información de la importación se lleva manualmente a Siesa, y en qué momento del proceso?
3. ¿El costeo landed que calcula RicoSoft hoy corresponde al que ustedes usan como referencia, o hay diferencias?
4. ¿Cómo se maneja hoy una recepción parcial o una incidencia (mercancía dañada/faltante)?
5. ¿La orden de compra internacional nace siempre independiente, o a veces debería originarse desde una solicitud de compra interna?

## 21. Preguntas para Contabilidad

1. ¿Cómo llega hoy físicamente una factura (correo, físico, otro canal) y quién la recibe primero?
2. ¿Existe un paso de "el solicitante valida que el servicio/producto se recibió" antes de que la factura llegue a ustedes, y debería quedar registrado en RicoSoft?
3. ¿El módulo de Pagos de RicoSoft debe reflejar pagos que ustedes ya ejecutaron en Siesa, o es un control previo antes de pagar?
4. ¿Qué tiempos máximos manejan entre que una factura se aprueba en RicoSoft y se registra en Siesa?
5. ¿Qué excepciones existen hoy (facturas sin solicitud de compra previa, notas crédito, anticipos)?

## 22. Arquitectura objetivo final

```
Usuarios
  ↓
RICOSOFT
 ├── Solicitudes de Compra
 ├── Cotizaciones (3 obligatorias, con excepción justificada)
 ├── Aprobaciones (Gerencia Adm/Fin)
 ├── Facturas (carga, vinculación, validación)
 ├── Importaciones (orden, lote, expediente, costeo referencial)
 ├── Documentos (todo tipo, aislado por tenant)
 ├── Auditoría
 └── Trazabilidad
          ↓
   ═══ TRANSFERENCIA MANUAL (frontera de responsabilidad) ═══
          ↓
     SIESA/UnoEE
 ├── Contabilidad
 ├── Inventario
 ├── Compras/órdenes ejecutadas
 ├── Pagos definitivos
 └── demás procesos ERP

     SIESA → RICOSOFT (integración de solo lectura, confirmada 100%
     en el código actual — proveedores hoy, potencialmente otros
     catálogos maestros en el futuro)
```

---

## RESUMEN EJECUTIVO

RicoSoft ya está arquitectónicamente alineado con ser una capa de control previo a Siesa, no un segundo ERP — confirmado con evidencia exhaustiva de que la integración con Siesa es 100% de lectura, sin ninguna excepción en todo el código. Los dos problemas reales que sí encontré son puntuales y baratos de resolver: falta impedir que alguien apruebe su propia solicitud, y falta que la justificación de una aprobación/rechazo llegue al registro de auditoría central. El resto de lo pendiente no es trabajo de código — son preguntas de negocio sin responder, sobre todo en Importaciones, donde el sistema fue construido antes de confirmar el proceso real con Comercio Exterior.

## 10 HALLAZGOS MÁS IMPORTANTES

1. La integración con Siesa es 100% lectura, verificado exhaustivamente — cero escritura en todo el código.
2. No existe prevención de autoaprobación en Solicitudes de Compra.
3. La justificación de aprobación/rechazo no se propaga al log de Auditoría.
4. "Comprado" es correctamente un estado terminal informativo, sin ningún intento de ejecutar nada en Siesa.
5. "Facturada" está correctamente diseñado como inalcanzable desde el endpoint directo — solo se llega vía transacción atómica desde Facturas.
6. El costeo landed de Importaciones es referencial por diseño (no pretende ser el costo contable definitivo).
7. El proceso de Importaciones en código no se puede validar contra el proceso real sin hablar con Comercio Exterior — hay demasiadas suposiciones heredadas.
8. Facturas no modela un paso explícito de "el solicitante validó que el servicio/producto se recibió".
9. El modelo de datos separa correctamente Siesa (maestro) de RicoSoft (operativo) en Proveedores — patrón replicable si se agregan más integraciones de lectura.
10. El aislamiento multi-tenant sigue siendo disciplina manual, sin garantía estructural — riesgo conocido, no nuevo, pero sigue vigente.

## 10 DECISIONES PENDIENTES

1. Umbrales de aprobación por monto.
2. Qué constituye excepción válida a las 3 cotizaciones.
3. Si la autoaprobación debe bloquearse en el sistema o queda como control administrativo externo.
4. Si Facturas necesita un estado explícito de "recibido/validado" antes de la aprobación final.
5. Punto exacto de transferencia Importación → Siesa.
6. Relación Importación ↔ Solicitud de Compra nacional.
7. Rol real del módulo Pagos frente a lo que Tesorería hace en Siesa.
8. TRM manual vs. fuente oficial.
9. Anticipos a proveedor extranjero.
10. Manejo de recepción parcial e incidencias en Importaciones.

## 10 ACCIONES PRIORITARIAS

1. Agregar verificación de que `solicitanteId !== usuario que aprueba`.
2. Incluir `comentarioResolucion` en el `detalle` de `Auditoria` al aprobar/rechazar.
3. Reunión con Comercio Exterior para validar el flujo real de Importaciones contra el implementado.
4. Reunión con Contabilidad para el paso de recepción/validación de Facturas y el rol de Pagos.
5. Reunión con Gerencia Adm/Fin para umbrales de aprobación y excepciones de cotizaciones.
6. Documentar formalmente (no solo en código) el principio "Siesa=definitivo, RicoSoft=previo" para que sobreviva a rotación de equipo.
7. Diseñar (sin implementar) una vista de "línea de tiempo completa" por operación.
8. Evaluar middleware Prisma de aislamiento tenant como capa adicional, no urgente.
9. Definir si Importaciones debe vincularse a Solicitud de Compra nacional.
10. Actualizar `Reportes/ARCHITECTURAL_DECISIONS_PENDING.md` con los 2 hallazgos nuevos de esta auditoría.

## RIESGOS BLOQUEANTES

Ninguno de los hallazgos de esta auditoría bloquea el uso actual del sistema. El único riesgo verdaderamente bloqueante para *seguir construyendo* Importaciones sin retrabajo es la falta de validación del proceso real con Comercio Exterior — cualquier funcionalidad nueva que se construya sobre supuestos no confirmados corre el riesgo de tener que rehacerse.

## ARCHIVO GENERADO

`Reportes/RICOSOFT_TARGET_ARCHITECTURE_AUDIT.md`
