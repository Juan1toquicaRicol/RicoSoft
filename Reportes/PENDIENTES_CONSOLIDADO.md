# PENDIENTES CONSOLIDADO — RicoSoft Enterprise

Fecha: 2026-09-01
Reemplaza, para efectos de planeación, las secciones "pendiente" de los 11 documentos previos en esta carpeta (`ARCHITECTURAL_DECISIONS_PENDING.md`, `ARCHITECTURE_AUDIT.md`, `DATABASE_ARCHITECTURE.md`, `IMPORTACIONES_*`, `MODULE_DEPENDENCIES.md`, `SECURITY_AUDIT.md`), la mayoría escritos entre el 27 y el 28 de agosto — antes de una sesión de trabajo intensa (28-31 de agosto) que resolvió una parte significativa de lo que ahí aparecía como abierto. Esos documentos **no se eliminan** (quedan como registro histórico de la auditoría original), pero ya no deben leerse como la lista vigente de pendientes.

---

## 1. Ya resuelto desde que se escribieron los reportes originales

No requieren ninguna acción — se listan solo para que quede explícito qué dejó de ser un gap:

| Pendiente original | Documento donde aparecía | Cómo quedó resuelto |
|---|---|---|
| Documentos aduaneros sin endpoint backend (DIM, vistos buenos, certificados) | `ARCHITECTURE_AUDIT.md` (deuda #7), `ARCHITECTURAL_DECISIONS_PENDING.md` (#1) | `crearVistoBueno`, `actualizarVistoBueno`, `subirDocumentoVistoBueno`, `obtenerDocumentoVistoBueno` implementados, con aislamiento tenant verificado vía `ExpedienteAduanero`. |
| Catálogo de permisos hardcodeado en 2 archivos sin fuente única | `ARCHITECTURE_AUDIT.md` (violación #2) | Catálogo dinámico `Permiso` en BD, administrable desde Configuración → Permisos. El mecanismo de sincronización frontend/backend original se mantiene como red de seguridad adicional. |
| Migración `20260826215604_tenant_dominio_activo` sin commitear | `ARCHITECTURE_AUDIT.md` (deuda #2) | Commiteada (`101ce6c`). |
| Sin selector de empresa dentro de la app (solo en login) | No documentado explícitamente, pero implícito en el modelo de `Membresia` | Selector en el header (`AppShell`), `POST /auth/switch-tenant` con revalidación server-side, auditado como `CAMBIO_EMPRESA`. |
| Departamentos/Roles/Módulos solo existían duplicados por tenant, sin alcance compartido | No documentado (posterior a estos reportes) | Alcance `GENERAL`/`TENANT` implementado (`tenantId` nullable), con conversión validada y bloqueo si hay uso cruzado. |
| Identidad de proveedor Siesa basada solo en NIT (frágil ante corrección de NIT) | No documentado (posterior) | `Proveedor.siesaTerceroRowId` como identidad estable, con matching en cascada (rowId → NIT → crear). |
| Sincronización Siesa síncrona dentro del request HTTP | No documentado (posterior) | `SincronizacionSiesaLog` + ejecución en background, con reconciliación, control de concurrencia y recuperación tras reinicio. |

---

## 2. Genuinamente pendiente — Importaciones (decisiones de negocio, no técnicas)

Todo esto viene sin tocar desde `ARCHITECTURAL_DECISIONS_PENDING.md`. Ninguna requiere código todavía — requieren que alguien de negocio/contabilidad decida:

1. **Máquina de estados de la Orden**: nunca se define cuándo pasa a "Cerrada" (existe el estado, no la transición).
2. **Prorrateo de landed cost por peso/volumen**: hoy 100% por valor FOB; `pesoKg`/`volumenM3` existen en el modelo pero no se usan en ningún cálculo.
3. **Relación Importación ↔ Compra nacional**: ¿una Orden de Compra Internacional puede originarse desde una `SolicitudCompra`, como sí pasa con Facturas?
4. **Relación Importación ↔ Inventario**: no existe módulo de Inventario (ver sección 4), así que el costo unitario landed no alimenta nada hoy — el propio código ya asume un consumidor externo que no está conectado.
5. **Relación Importación ↔ Contabilidad**: mismo vacío — no hay módulo de Contabilidad, y Siesa solo sincroniza en un sentido (Siesa→RicoSoft, solo Proveedores).
6. **TRM manual vs. fuente oficial**: hoy es 100% input manual del usuario.
7. **Proveedor extranjero como texto libre vs. entidad real**: decisión deliberada hasta ahora, pero con implicaciones si se cambia (no encaja igual que el catálogo de Siesa, que es NIT-céntrico y colombiano).
8. **Anticipos a proveedor extranjero**: no existe ningún modelo de pago para `OrdenCompraIntl` (a diferencia de `Pago` sobre `Factura`).
9. **Aranceles preferenciales por TLC**: `certificadoOrigenTlc` existe en el modelo, pero el arancel liquidado sigue siendo 100% manual, sin derivarse de la tarifa base ni del tratado.
10. **Validación de completitud documental antes de liquidar**: hoy `liquidarCosteoImportacion` no exige que el expediente/vistos buenos estén completos.
11. **Recepción parcial de un lote**: el sistema asume que siempre llega la cantidad completa ordenada.
12. **Incidencias** (mercancía dañada, faltante, rechazada en aduana): no existe ninguna rama de excepción — solo el camino feliz o anular la orden completa.
13. **Qué se congela al cerrar una importación**: depende de resolver primero el punto 1.

---

## 3. Genuinamente pendiente — Arquitectura y seguridad transversal

1. **🔴 Aislamiento multi-tenant sin garantía estructural** — sigue siendo el hallazgo más importante de todo el sistema, reconfirmado en la auditoría integral más reciente. Depende 100% de que cada query nueva incluya `tenantId` a mano; no hay middleware de Prisma ni Row-Level Security que lo garantice. Es "una vulnerabilidad a un commit de distancia", no una fuga activa hoy.
2. **Cero tests para la lógica de negocio de Importaciones** (landed cost vive inline en el controller de Express, no es testeable de forma aislada).
3. **Sin capa de servicio/dominio** en 17 de 19 módulos — decisión consciente y consistente, no un descuido, pero sigue siendo la arquitectura real.
4. **`bun.lock` + `package-lock.json`** conviviendo en la raíz, mientras CI usa `npm ci`.
5. **Sin `server/.env.example`** documentando qué variables son obligatorias para levantar el backend.
6. **Dos convenciones de borrado suave sin unificar**: columna `eliminado` (boolean) en unos modelos vs. `estado = "Anulado"` reutilizado en otros (`Pago`).

---

## 4. Confirmado que NO existe (gap funcional, no técnico)

- **Contabilidad**: cero modelos (cuentas, comprobantes, partida doble, centros de costo reales, períodos contables). Solo existe `Factura.centroCostos` como texto libre.
- **Inventario**: cero modelos (productos, bodegas, existencias, movimientos). El "costo unitario landed" de Importaciones no tiene ningún sistema de existencias que lo consuma.

Ambos son decisiones de negocio pendientes (¿viven en RicoSoft o permanecen en Siesa/UnoEE?), no trabajo técnico listo para empezar sin esa definición previa.

---

## 5. Orden sugerido (dependencias reales, no una lista arbitraria)

```
Aislamiento multi-tenant estructural (transversal, prioridad máxima)
       ↓
Documentos de Importaciones: validación de completitud antes de liquidar
(depende de que los endpoints de documentos ya existan — YA RESUELTO,
así que este paso ya se puede evaluar)
       ↓
Decisión de negocio: Importación ↔ Compra nacional / Inventario / Contabilidad
(conversación con el equipo que administra Siesa, no una decisión unilateral)
       ↓
Máquina de estados completa de la Orden (Cerrada) + incidencias/recepción parcial
       ↓
Contabilidad e Inventario, SOLO si la decisión de negocio anterior confirma
que deben vivir en RicoSoft y no en Siesa
```
