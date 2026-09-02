# RICOSOFT ENTERPRISE — Master Technical QA & Security Audit

Documento vivo de seguimiento. Origen: auditoría adversarial de 2026-09-02
(artefacto: https://claude.ai/code/artifact/529478cb-bdb8-45da-b0ea-07891db5a8ef).
Este archivo es el que se actualiza a partir de ahora; el artefacto queda
como snapshot del informe original.

## Taxonomía de estado

| Estado | Significado | Acción |
|---|---|---|
| CONFIRMADO → CORREGIR | Hallazgo verificado con evidencia, sin corregir | Priorizar según severidad |
| CONFIRMADO PERO ACEPTADO → DOCUMENTAR | Verificado, riesgo aceptado conscientemente | Dejar constancia de la decisión y por qué |
| PENDIENTE DE VERIFICACIÓN → NO TOCAR | Hipótesis sin confirmar en código/runtime | No modificar código basado en esto hasta verificar |
| YA CORREGIDO → REGRESIÓN | Se corrigió; si reaparece es una regresión, no un hallazgo nuevo | Investigar como regresión |
| OBSOLETO → DESCARTAR | La parte del sistema que motivó el hallazgo ya no existe o cambió de forma incompatible con el hallazgo original | Quitar del tracking |
| DECISIÓN DE NEGOCIO → NO IMPLEMENTAR HASTA VALIDAR | Requiere que el usuario decida antes de tocar código | Esperar validación |

## Actualización 2026-09-02 (fase de hardening y validación)

Los 6 hallazgos de esta ronda (A-01, A-02, M-09, M-01, A-03, M-04) pasaron
de "CORREGIDO — PENDIENTE VALIDACIÓN" a **CORREGIDO Y VALIDADO** con
pruebas de integración contra BD real (18 tests nuevos) y regresión
completa (211/212 tests de integración + 208/208 unitarios). Ver el
informe completo, con evidencia, matrices y el hallazgo nuevo M-10:
`Reportes/RICOSOFT_HARDENING_QA_REPORT.md`.

## Actualización 2026-09-02 (iteración final de hardening)

M-10, M-05 y M-03 quedan **CORREGIDOS Y VALIDADOS**. M-02 queda auditado
(brecha real confirmada en el frontend, no corregida — requiere decisión
de política CSP). A-04 sigue **NO MEDIDO — LIMITACIÓN DE ENTORNO** (sin
VPN). M-08 queda completamente relevado: 12 modelos hijos inventariados,
todos SEGURO POR RELACIÓN, sin vulnerabilidad nueva. Regresión final:
218/218 unitarios, 212/213 integración (único fallo: M-06 preexistente).
Ver `Reportes/RICOSOFT_HARDENING_FINAL_REPORT.md` para el detalle
completo.

## Nota de alcance — Despachos

El módulo de Control de Despachos y Entrega (implementado el 2026-09-02,
después del corte de la auditoría original) **no vuelve a entrar como
pendiente**. Cualquier hallazgo de la auditoría original que mencionara la
ausencia de este módulo queda OBSOLETO → DESCARTAR.

---

## Orden de remediación acordado

1. A-01 — Aislamiento/roles GENERAL
2. A-02 + M-09 — Integridad de pagos (validación de saldo + transacción)
3. M-01 — Roles desactivados seguían dando permisos
4. A-03 — Autoaprobación de solicitudes
5. M-04 — Auditoría incompleta en resolución de solicitudes
6. M-02 — Headers de seguridad
7. A-04 — Medir rendimiento real antes de optimizar
8. Pruebas cross-tenant automatizadas
9. Validación de contenido de archivos subidos
10. Pendientes funcionales de Importaciones/Facturas

---

## Hallazgos

### A-01 — Cualquier tenant podía crear/editar/eliminar roles de alcance GENERAL
- **Severidad:** Alto
- **Estado:** ✅ CORREGIDO (2026-09-02)
- **Módulo:** `server/src/modules/roles/roles.controller.ts`
- **Evidencia original:** `crearRol`/`actualizarRol`/`eliminarRol` solo verificaban
  `whereAlcance(tenantId)` (visibilidad), no quién puede mutar un registro con
  `tenantId: null` (visible y editable por todas las empresas).
- **Corrección aplicada:**
  - `crearRol`: si `alcance === "GENERAL"` y el usuario no es superadmin → 403.
  - `actualizarRol`: si el rol ya es GENERAL, o la edición lo convierte en
    GENERAL, y el usuario no es superadmin → 403.
  - `eliminarRol`: si el rol es GENERAL y el usuario no es superadmin → 403.
- **Pruebas:** cubierto por los 208 tests unitarios existentes (sin
  regresiones); **falta** una prueba de integración multi-tenant específica
  para este caso — ver ítem 8 del orden de remediación.
- **Riesgo de regresión:** bajo — el cambio es aditivo (agrega un 403, no
  cambia ningún flujo existente para superadmin).

### A-02 — `registrarPago` no validaba que el pago no superara el saldo pendiente
- **Severidad:** Alto
- **Estado:** ✅ CORREGIDO (2026-09-02)
- **Módulo:** `server/src/modules/facturas/pagos.controller.ts`
- **Evidencia original:** `registrarPago` solo validaba `valor > 0`, nunca
  contra el saldo pendiente real de la factura — permitía sobre-pagos.
- **Corrección aplicada:** antes de crear el pago, se recalcula el saldo
  pendiente real (suma de pagos `Confirmado`) y se rechaza con 409 si
  `valor > saldoPendiente`.
- **Riesgo de regresión:** bajo. Nota: la validación de saldo se hace fuera
  de la transacción (lectura previa) — en el peor caso de dos pagos
  concurrentes por el saldo exacto restante, ambos podrían pasar la
  validación antes de que el primero confirme. No es un problema nuevo (ya
  existía la misma ventana antes del fix) y el volumen de uso de este ERP no
  lo hace prioritario, pero queda documentado como limitación conocida.

### M-09 — `registrarPago`/`anularPago` no envolvían create+update+recálculo en una transacción
- **Severidad:** Medio
- **Estado:** ✅ CORREGIDO (2026-09-02)
- **Módulo:** `server/src/modules/facturas/pagos.controller.ts`
- **Corrección aplicada:** ambos handlers ahora usan
  `req.tenantPrisma!.$transaction(async (tx) => {...})` envolviendo
  create/update del pago, historial de factura, recálculo de estado y
  registro de auditoría. Si cualquier paso falla, no queda un pago
  registrado sin su auditoría ni una factura en un estado inconsistente con
  sus pagos reales.
- **Riesgo de regresión:** bajo — typecheck limpio, 208 tests unitarios
  pasan.

### M-01 — Un rol desactivado seguía otorgando permisos
- **Severidad:** Medio
- **Estado:** ✅ CORREGIDO (2026-09-02)
- **Módulo:** `server/src/lib/permissions.ts`
- **Evidencia original:** `calcularPermisosEfectivos`/
  `calcularPermisosEfectivosMembresia` nunca revisaban `rolRel.activo` — el
  toggle "activo" de un rol (visible en la UI) era decorativo.
- **Corrección aplicada:** ambas funciones ahora solo agregan los permisos
  del rol si `rolRel.activo === true`.
- **Riesgo de regresión:** bajo — todos los roles de sistema/existentes
  tienen `activo: true` por defecto, así que este cambio no afecta el
  comportamiento actual de ningún tenant salvo que alguien haya desactivado
  un rol explícitamente (que es exactamente el caso que se estaba rompiendo).

### A-03 — Un usuario podía aprobar/rechazar su propia solicitud de compra
- **Severidad:** Alto
- **Estado:** ✅ CORREGIDO (2026-09-02)
- **Módulo:** `server/src/modules/solicitudes/solicitudes.controller.ts`
- **Evidencia original:** `cambiarEstadoSolicitud` solo validaba el permiso
  `solicitudes.aprobar`/`solicitudes.rechazar`, no que el aprobador fuera
  distinto de `solicitud.solicitanteId`.
- **Corrección aplicada:** si la transición es de resolución (Aprobada/
  Rechazada) y `solicitud.solicitanteId === req.user!.id` → 403. No aplica a
  "Comprado" (paso posterior, normalmente ejecutado por la misma persona que
  gestionó la compra).
- **Riesgo de regresión:** medio-bajo — en tenants pequeños donde la misma
  persona históricamente crea y aprueba sus propias solicitudes, este cambio
  es un comportamiento nuevo y visible (un 403 donde antes había éxito).
  Comunicar antes de desplegar a producción.

### M-04 — Auditoría de `cambiarEstadoSolicitud` incompleta
- **Severidad:** Medio
- **Estado:** ✅ CORREGIDO (2026-09-02)
- **Módulo:** `server/src/modules/solicitudes/solicitudes.controller.ts`
- **Evidencia original:** el registro de `Auditoria` no incluía
  `entidadTipo`/`entidadId`/`datosAnteriores`/`datosNuevos`, dificultando
  reconstruir el historial de una solicitud específica o comparar estado
  antes/después.
- **Corrección aplicada:** se agregaron los cuatro campos (`entidadTipo:
  "SolicitudCompra"`, `entidadId: id`, `datosAnteriores` con el estado
  previo, `datosNuevos` con el estado nuevo y el comentario de resolución).
- **Riesgo de regresión:** ninguno — es una adición de datos, no cambia
  comportamiento.

### M-02 — Headers de seguridad
- **Severidad:** Medio
- **Estado:** PENDIENTE DE VERIFICACIÓN → NO TOCAR (parcial)
- **Módulo:** `server/src/app.ts` (backend), hosting del frontend (sin
  confirmar mecanismo — Vite build servido por Nitro/estático/otro).
- **Estado real:** el backend ya usa `helmet()` por defecto (línea 70 de
  `app.ts`), que aplica `X-Content-Type-Options`, `X-Frame-Options`, HSTS en
  producción, etc. **No verificado todavía:** si el CSP por defecto de
  helmet es compatible con las respuestas de este API (probablemente sí,
  porque son JSON, no HTML) y qué headers, si alguno, aplica el hosting del
  frontend. El hallazgo original sobre JWT en `localStorage`
  (`src/lib/session.ts`) sigue sin resolver — es una decisión de arquitectura
  (localStorage vs cookie httpOnly) que implica cambios más amplios de
  sesión, no un simple header.
- **Siguiente paso:** confirmar mecanismo de hosting del frontend antes de
  tocar nada.

### A-04 — Debt de rendimiento introducido en esta misma sesión (consultas Siesa síncronas repetidas)
- **Severidad:** Alto
- **Estado:** CONFIRMADO → CORREGIR (no iniciado)
- **Módulo:** Centro de Decisiones / Ventas / Despachos — varios controllers
  que consultan Siesa en vivo por request sin cache.
- **Nota:** este es debt introducido por trabajo de esta misma sesión (Fase
  H, Centro Comercial, contexto de producto), no un hallazgo preexistente.
  Antes de "optimizar" a ciegas, el paso 1 es medir tiempos reales de
  respuesta con el VPN activo (los queries a Siesa ya están acotados con
  `TOP`/filtros de fecha, pero no hay medición real de latencia bajo carga).
- **Siguiente paso:** instrumentar tiempos de los endpoints que golpean
  Siesa (Centro Comercial, contexto de producto, disponibilidad) antes de
  decidir si hace falta cache o rediseño.

### Pendientes sin iniciar (del orden acordado)

- **8. Pruebas cross-tenant automatizadas** — no iniciado. Cubriría en
  particular el nuevo comportamiento de A-01 (un tenant no-superadmin
  intentando crear/editar/eliminar un rol GENERAL) y A-03 (autoaprobación).
- **9. Validación de contenido de archivos subidos (M-03)** — no iniciado.
  `upload.middleware.ts` sigue confiando en el mimetype declarado por el
  cliente (`TIPOS_PERMITIDOS`), sin verificar el contenido real del archivo
  (magic bytes).
- **10. Pendientes funcionales de Importaciones/Facturas** — no relevado en
  esta sesión; requiere retomar el estado de `IMPORTACIONES_IMPLEMENTATION_REPORT.md`
  (si aún existe) o re-auditar el módulo desde cero si ese documento fue
  eliminado.

### B-01 a B-04, H-01, M-03, M-05 a M-08 (severidad Bajo/Media, del informe original)
- **Estado:** sin cambios desde el informe original — no tocados en esta
  ronda. Ver el artefacto original para el detalle de cada uno. Se
  re-listarán aquí individualmente en la próxima iteración de este
  documento, con su estado y evidencia actualizados.

---

## Resumen de verificación de esta ronda

- `npx tsc --noEmit` en `server/`: limpio, sin errores.
- `npx vitest run` en `server/`: 208/208 tests unitarios pasando, sin
  regresiones.
- No se ejecutaron migraciones de base de datos ni cambios de schema — todos
  los fixes de esta ronda son lógica de aplicación pura.
- Pendiente: correr la suite de integración completa contra una base real
  (`RUN_DB_INTEGRATION_TESTS=true`) para confirmar A-01/A-02/A-03/M-01/M-04
  en un entorno con datos reales antes de desplegar.
