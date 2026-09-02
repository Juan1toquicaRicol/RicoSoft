# RicoSoft Enterprise — Reporte de Consolidación de Arquitectura

Fecha: 2026-08-31
Alcance: seguridad, autorización, empresas, administración global, integración Compras↔Facturación↔Contabilidad, Importaciones (parcial) y UI/UX (parcial).

## 1. Estado inicial

Al comenzar, el sistema ya tenía una base sólida: JWT + multi-tenant con `Tenant`/`Membresia`, superacceso de "Sistemas" vía `Departamento.esSistemas`, dominio corporativo por tenant, Importaciones ~70-75% construido con una suite de integración multi-tenant real, y un sistema de componentes shadcn maduro. La auditoría inicial (Fase A) confirmó que gran parte de lo que parecía "pendiente" en el prompt original ya estaba resuelto en el código real.

## 2. Arquitectura encontrada

- Backend: Express 4 + TypeScript + Prisma 5 + SQL Server (`saas_dev`), módulos por dominio bajo `server/src/modules/*`.
- Frontend: React 19 + TanStack Router + Tailwind, componentes en `src/components/ui`.
- Aislamiento multi-tenant: manual pero consistente (`req.user.tenantId` calculado server-side en cada request vía `loadSessionUser`), sin middleware genérico de Prisma ni RLS — riesgo estructural ya documentado, no introducido por este trabajo.
- Permisos: catálogo `PERMISOS_SISTEMA` hardcodeado en dos archivos (backend/frontend) sincronizados por test; roles con permisos en JSON (`Rol.permisos`).

## 3. Cambios realizados — Autenticación y empresas

- **Cambio de empresa en vivo** (`POST /api/auth/switch-tenant`, `GET /api/auth/tenants-accesibles`): antes solo existía selección de tenant en el login; ahora hay selector en el menú principal ("Estás en: X") que cambia de contexto sin cerrar sesión, revalidando membresía en el backend y auditando como `CAMBIO_EMPRESA` (no `LOGIN`).
- `SessionUser` ahora incluye `tenantNombre` (backend y frontend).
- Cubierto con test de integración real (`auth.integration.test.ts`): selección múltiple, cambio válido, rechazo cross-tenant, auditoría.

## 4. Cambios de Sistemas

Sin cambios — ya estaba correctamente implementado (`Departamento.esSistemas` → bypass total en `calcularPermisosEfectivos`/`calcularPermisosEfectivosMembresia`), verificado, no tocado.

## 5. Cambios de permisos — Permisos dinámicos desde Administración Global

Se implementó el catálogo dinámico pedido en el prompt original:

- Modelo `Permiso` (tenant-scoped: código, nombre, descripción, módulo, `esSistema`, activo). Se siembra perezosamente por tenant desde `PERMISOS_SISTEMA` en el primer acceso (sin migración de datos masiva).
- CRUD real en `Configuración > Permisos` (antes era una tabla estática de solo lectura): crear, editar nombre/descripción/módulo, activar/desactivar, eliminar (solo los no-sistema y no asignados a ningún rol).
- `Configuración > Roles` ahora arma la matriz de permisos asignables desde este catálogo real, no desde la constante hardcodeada — un permiso nuevo aparece ahí sin deploy.
- `roles.controller.ts` valida los permisos a asignar contra el catálogo real del tenant (sistema + personalizados activos), no solo contra la constante.

**Limitación honesta, documentada en el propio schema**: un permiso creado aquí queda asignable a un rol y se calcula en `user.permisos`, pero **no hace cumplir nada por sí solo** — solo tiene efecto real una vez que algún endpoint del backend llama `requirePermission("ese.codigo")`. Esto es un catálogo/registro administrable, no un motor de autorización genérico por recurso; construir eso último sería un cambio arquitectónico mucho mayor, fuera de alcance de lo pedido.

Cubierto con test de integración real: siembra sin duplicados (SQL Server no soporta `skipDuplicates`, se manejó explícitamente), creación/validación de formato, asignación a rol, bloqueo de eliminación en uso, aislamiento cross-tenant.

## 6. Cambios de Compras (sesión anterior, ya commiteados en `d35ad9c`)

- Modelo `CotizacionProveedor` + regla de exactamente 3 cotizaciones + cuadro comparativo + selección de ganadora, validado en backend y bloqueado en UI.
- `Proveedor.departamentoId`: catálogo de proveedores segmentable por departamento (null = general, visible en todas partes — retrocompatible).
- Cotizaciones ahora pueden elegirse del catálogo de proveedores (filtrado por departamento) o cargarse manualmente.

## 7. Cambios de Facturación

- `Factura` vinculada a una `SolicitudCompra` ya Aprobada/Comprada se aprueba automáticamente y la SC pasa a `Facturada`, todo en una sola `$transaction` (nunca queda a medias). Una factura sin SC sigue funcionando igual que antes.
- **Nuevo — trazabilidad completa** expuesta en `GET /facturas/:id` y en el detalle de factura (sección "Origen de la Compra"): Factura → SC → cotización ganadora (proveedor, valor, tiempo de entrega) → quién aprobó la SC y cuándo. Antes solo se podía ver el `id`/`item` de la SC.

## 8. Cambios de Contabilidad

No existe un módulo de Contabilidad propio (la contabilidad real vive en Siesa/UnoEE, integración de solo lectura). Lo que sí se hizo fue exponer la cadena de trazabilidad completa (punto 7) que un futuro módulo contable, o un asiento manual hacia Siesa, necesitaría como insumo. **No se inventó un modelo de cuentas/comprobantes** — decisión deliberada, consistente con la instrucción explícita de no inventar lo que no existe.

## 9. Cambios de Importaciones

- Se corrigieron dos bugs reales en la suite de integración existente (orden de `deleteMany` en `afterAll` violaba FKs de `Auditoria`/`Notificacion` — uno de los dos bugs era preexistente, no introducido en esta sesión). Con esto, **las 3 (ahora 4, con auth) suites de integración corren realmente contra SQL Server y pasan** (20/20), no quedan como `skip`.
- Se aplicó formalmente la migración baseline `20260828140000_importaciones_baseline` a `saas_dev` vía `prisma migrate resolve --applied` (las tablas ya existían por un `db push` previo sin historial; no se re-ejecutó DDL). Confirmado sin pérdida de datos.
- **No se integró Importaciones con Compras/Facturación/Siesa** (Fase F del prompt). Se evaluó: hoy `OrdenCompraIntl` no tiene ninguna relación con `SolicitudCompra`, `Factura` ni el catálogo `Proveedor` (usa `proveedorExtranjero` como texto libre). Construir esa integración con el mismo rigor que Compras (modelo, migración, transacciones atómicas, tests reales) es un trabajo del mismo tamaño que la Fase C de Compras — se decidió no improvisar una versión superficial sobre un módulo que ya tiene datos reales. Recomendación concreta: agregar `OrdenCompraIntl.solicitudCompraId` (opcional) y `proveedorId` referenciando el catálogo, siguiendo exactamente el patrón ya usado en `Factura`.

## 10. Cambios de UI/UX

Se tocaron solo las pantallas que cada feature necesitaba (cuadro comparativo de cotizaciones, selector de empresa, catálogo de permisos, trazabilidad de factura, dashboard). **No se hizo la auditoría sistemática global** (formularios/tablas/estados vacíos en el resto de la app) pedida en la Fase G — es un trabajo de alcance abierto que requeriría su propia sesión dedicada pantalla por pantalla.

Sí se completó el **Dashboard con métricas accionables** (Fase 14 del prompt): se agregó la sección "Importaciones" (lotes en tránsito, nacionalizados, pendientes de documentación DIM) al endpoint `/analitica/dashboard`, que ya traía Facturas/Solicitudes/Créditos con datos reales (no era mock, contrario a lo que se pensó inicialmente).

## 11. Migraciones

Todas hechas a mano (sin `db push`), aplicadas a `saas_dev` con tu autorización explícita en cada tanda:

| Migración | Contenido | Estado |
|---|---|---|
| `20260828140000_importaciones_baseline` | Baseline de 5 tablas de Importaciones ya existentes | Aplicada (`resolve --applied`) |
| `20260827200000_fix_tenant_siesacia_id_filtered_unique` | Fix constraint | Aplicada |
| `20260828150000_cotizacion_proveedor` | Tabla `CotizacionProveedor` | Aplicada |
| `20260828160000_proveedor_departamento` | `Proveedor.departamentoId` | Aplicada |
| `20260828170000_cotizacion_proveedor_catalogo` | `CotizacionProveedor.proveedorId` | Aplicada |
| `20260828180000_permiso_catalogo` | Tabla `Permiso` | Aplicada |

`prisma migrate status` confirma: *"Database schema is up to date"*. Ninguna migración eliminó datos; se verificaron conteos antes/después.

## 12. Tests

- **Backend unitario**: 20/20 (`npm test`, sin DB real).
- **Frontend unitario**: 9/9 (`npm test`).
- **Integración con SQL Server real** (antes nunca ejecutada — bloqueada localmente por falta de Docker; se descubrió que no hacía falta, `saas_dev` es una SQL Server real accesible): **20/20**, corriendo `npm run test:integration` con `RUN_DB_INTEGRATION_TESTS=true`. Cubre: aislamiento cross-tenant de Importaciones (9), flujo completo de 3 cotizaciones + factura atómica (4), cambio de empresa (2), catálogo dinámico de permisos (3), fix de constraint Siesa (2).
- Se corrigieron 2 bugs reales de `afterAll` (uno preexistente) que hacían fallar la limpieza de datos de prueba por violación de FK.

**No cubierto**: no hay test para el selector de empresa en el `AppShell` (solo el backend), ni para la UI de permisos/roles (solo backend). Es UI de administración de bajo tráfico, se priorizó cobertura de backend/seguridad.

## 13. Resultados

Typecheck limpio en frontend y backend (los 2 únicos errores de TS que aparecen en `facturas.index.tsx:693,705` son preexistentes, confirmados contra el commit anterior, no relacionados con este trabajo). Lint limpio salvo el patrón `catch (err: any)` ya usado en todo el proyecto (no es una desviación introducida).

## 14. Riesgos

- **C1 (heredado, no resuelto)**: aislamiento multi-tenant sigue siendo disciplina manual de código, sin enforcement estructural (Prisma middleware/RLS). Sigue siendo "una vulnerabilidad a un commit de distancia".
- **Nuevo, menor**: un permiso personalizado creado en el catálogo dinámico es asignable a roles pero no se hace cumplir en ningún endpoint hasta que un desarrollador lo cablee explícitamente — riesgo de confusión para un administrador que asuma que "crear el permiso" ya lo activa. Mitigado con el mensaje explícito en la propia UI de Permisos.
- Auditoría sigue duplicada (`prisma.auditoria.create()`) en ~18 controllers en vez de un helper único — deuda técnica conocida, no se tocó (riesgo de refactor amplio innecesario, fuera de lo pedido explícitamente).

## 15. Compatibilidad

Todos los cambios son aditivos: campos nuevos opcionales, tablas nuevas, ninguna columna ni tabla existente se modificó de forma destructiva. Facturas/Solicitudes/Proveedores/Roles sin los campos nuevos siguen funcionando exactamente igual (verificado con test explícito de "factura independiente sigue funcionando").

## 16. Archivos modificados (sesión actual, sin commitear)

```
server/prisma/schema.prisma
server/prisma/migrations/20260828180000_permiso_catalogo/
server/src/app.ts
server/src/modules/analitica/analitica.controller.ts
server/src/modules/facturas/facturas.controller.ts
server/src/modules/importaciones/importaciones.integration.test.ts   (fix bug preexistente)
server/src/modules/roles/roles.controller.ts
server/src/modules/solicitudes/compras-cotizaciones.integration.test.ts (fix cleanup)
server/src/modules/auth/auth.integration.test.ts   (nuevo)
server/src/modules/permisos/   (nuevo módulo completo)
src/hooks/use-dashboard.ts
src/hooks/use-permisos.ts   (nuevo)
src/lib/data.ts
src/routes/configuracion.permisos.tsx   (reescrito: de estático a CRUD real)
src/routes/configuracion.roles.tsx
src/routes/facturas.$id.tsx
src/routes/index.tsx
```

La tanda anterior (Compras/Proveedores/Selector de empresa) ya está commiteada en `d35ad9c "FIX: tablas"` — no se toca de nuevo aquí.

## 17. Cambios preexistentes preservados

Nada se eliminó. `Comprado`, el flujo de Importaciones existente, `EMPRESAS` (RC/FL/GR, el filtro de negocio no relacionado con Tenant), y toda la lógica de auditoría/notificaciones previa siguen intactas.

## 18. Estado de Git

- Rama: `master`, sincronizada con `origin/master`.
- Commit previo del usuario: `d35ad9c "FIX: tablas"` (incluye todo el trabajo de Compras/Proveedores/Selector de empresa de la sesión anterior).
- Working tree actual: 13 archivos modificados + 4 nuevos (permisos dinámicos, trazabilidad, dashboard, fixes de integración), **sin commitear** — a la espera de tu revisión, como pediste.

---

**Pendiente explícitamente fuera de esta entrega** (para decidir prioridad):
1. Integración real Importaciones ↔ Compras/Facturación/Siesa (Fase F) — diseño recomendado en sección 9.
2. Auditoría UI/UX sistemática de toda la app (Fase G).
3. Centralización del helper de auditoría (`registrarAuditoria()` único vs. 18 duplicados).
