# DATABASE_ARCHITECTURE.md — RicoSoft Enterprise

Basado en lectura completa de `server/prisma/schema.prisma` (SQL Server, Prisma 5). Todos los IDs son `UniqueIdentifier` (GUID) generados con `@default(uuid())`. No hay tablas fuera de este archivo (no hay SQL crudo de creación de esquema en ningún otro lugar del repo).

---

## Inventario de tablas (28 modelos)

### Núcleo multi-tenant / identidad
| Modelo | PK | FKs relevantes | Notas |
|---|---|---|---|
| `Tenant` | id | — | `subdomain` único, `dominioCorporativo` único (nullable), `siesaCiaId` único (nullable), `activo` bool. Raíz de todo el aislamiento multi-tenant. |
| `User` | id | `tenantId`→Tenant, `colaboradorId`→Colaborador, `departamentoId`→Departamento, `rolId`→Rol | `email` **único globalmente** (no por tenant, decisión deliberada). `tokenVersion` para invalidar JWT. `isSuperadmin` bool por-usuario (tenant "hogar"). Índices: `[tenantId, activo]`, `[tenantId, email]`. |
| `Rol` | id | `tenantId`→Tenant | `permisos` es un `String` (JSON serializado como texto, no una tabla relacional de permisos). `esSistema` protege roles base de edición/borrado. |
| `PermisoUsuario` | id | `userId`→User | Permiso directo (concedido/revocado) que se superpone al rol. Ligado al usuario, **no** a una Membresia. |
| `Membresia` | id | `userId`→User, `tenantId`→Tenant, `rolId`→Rol, `departamentoId`→Departamento | `@@unique([userId, tenantId])`. Acceso a un tenant adicional al "hogar". `isSuperadmin`/rol independientes por tenant. |
| `Departamento` | id | `tenantId`→Tenant | `esSistemas` bool → bypass total de permisos para sus usuarios. |
| `Modulo` | id | `tenantId`→Tenant, `departamentoId`→Departamento | Catálogo de módulos del sidebar. `@@unique([tenantId, clave])`. |
| `Colaborador` | id | `tenantId`→Tenant, `departamentoId`→Departamento | Vínculo legado entre `User` y ficha de RRHH (`numero_empleado`). |

### Auditoría / trazabilidad / notificaciones
| Modelo | PK | FKs | Notas |
|---|---|---|---|
| `Auditoria` | id | `tenantId`→Tenant, `usuarioId`→User | `entidadTipo`/`entidadId` genéricos + `datosAnteriores`/`datosNuevos` (JSON texto, diff de campos, no el registro completo). |
| `Notificacion` | id | `tenantId`→Tenant, `usuarioId`→User | In-app únicamente, no email/push. Índices `[tenantId, usuarioId, leida]`, `[usuarioId, createdAt]`. |

### Proveedores / terceros
| Modelo | PK | FKs | Notas |
|---|---|---|---|
| `Proveedor` | id | `tenantId`→Tenant | Catálogo maestro **compartido** por Facturas, Contratos y Servicios. `@@unique([tenantId, nit])`. Es el único destino de escritura de la sincronización con Siesa (solo NIT + nombre hoy). |

### Compras (solicitudes → facturas → pagos)
| Modelo | PK | FKs | Notas |
|---|---|---|---|
| `SolicitudCompra` | id | `tenantId`, `solicitanteId`→User, `resueltoPorId`→User, `proveedorId`→Proveedor | Estado libre en texto (`Pendiente`/`Aprobada`/`Rechazada`/`Comprado`, sin enum de BD). Adjunto de cotización único (columnas `cotizacion*`). `eliminado` bool. |
| `Factura` | id | `tenantId`, `proveedorId`→Proveedor, `servicioId`→ServicioSuscripcion, `contratoId`→Contrato, `solicitudCompraId`→SolicitudCompra, `responsableId`→User | `moneda` string (default "COP"), `estado` string libre. Adjunto de factura único (columnas `archivo*`). `eliminado` bool. Índice único lógico (no de BD, ver comentario en schema) sobre `[tenantId, empresaId, numero]` entre facturas activas — validado en el controlador, no en la BD, porque una constraint de BD no distinguiría `eliminado=true` de `false`. |
| `FacturaHistorial` | id | `facturaId`→Factura (Cascade) | Línea de tiempo de acciones + comentarios libres (mismo patrón que `ImportacionHistorial`). |
| `Pago` | id | `tenantId`, `facturaId`→Factura, `registradoPorId`→User | Pagos parciales soportados; `estado` (`Confirmado`/`Anulado`) — **el único modelo que usa un campo `estado` como equivalente de soft-delete en vez de un booleano `eliminado`.** Comprobante único (columnas `comprobante*`). |

### Servicios / contratos / reglas
| Modelo | PK | FKs | Notas |
|---|---|---|---|
| `ServicioSuscripcion` | id | `tenantId`, `proveedorId`→Proveedor, `contratoId`→Contrato, `responsableId`→User | Recurrencia (`periodicidad`, `diaVencimiento`, `fechaRenovacion`). `eliminado` bool. |
| `Contrato` | id | `tenantId`, `proveedorId`→Proveedor, `responsableId`→User | `eliminado` bool. |
| `ReglaEnrutamiento` | id | `tenantId` | Motor de reglas de enrutamiento de facturas; `condiciones`/`acciones` como texto (JSON serializado, sin schema de BD tipado). |
| `CreditoCliente` | id | `tenantId` | Cupo/saldo de crédito de cliente. `eliminado` bool. |
| `ProyeccionMensual` | id | `tenantId` | `@@unique([tenantId, mes, anio])`. |

### Gestión Humana
| Modelo | PK | FKs | Notas |
|---|---|---|---|
| `Empleado` | id | `tenantId` | `eliminado` bool. |
| `HistorialSalario` | id | `empleadoId`→Empleado (Cascade) | Append-only, cada cambio de salario agrega fila (nunca sobrescribe). |
| `PermisoLaboral` | id | `tenantId`, `empleadoId`→Empleado | Permiso de ausencia laboral (no confundir con `PermisoUsuario`/`PERMISOS_SISTEMA` — nombre compartido, dominio distinto). |
| `FaltaStrike` | id | `tenantId`, `empleadoId`→Empleado | Falta disciplinaria. |

### Importaciones (ya implementado — ver detalle en IMPORTACIONES_IMPACT_ANALYSIS.md)
| Modelo | PK | FKs | Notas |
|---|---|---|---|
| `ClasificacionArancelariaMatriz` | id | — (**NO tiene `tenantId`**) | Catálogo técnico global deliberado (subpartida arancelaria de 10 dígitos, arancel base, es igual para cualquier tenant del grupo) — comentario explícito en el schema justificando la ausencia de `tenantId` aquí. |
| `OrdenCompraIntl` | id | `tenantId`, `responsableId`→User | Acuerdo comercial (Incoterm, moneda, TRM pactada). `estado`: Borrador/Confirmada/Cerrada/Anulada. `eliminado` bool. |
| `ItemOrdenCompraIntl` | id | `ordenCompraId`→OrdenCompraIntl (Cascade), `subpartidaArancelariaId`→ClasificacionArancelariaMatriz | Línea de producto; base para costeo por unidad. |
| `LoteImportacion` | id | `tenantId`, `ordenCompraId`→OrdenCompraIntl | Embarque físico (BL/AWB + contenedor). Estado de tránsito independiente del estado de la orden. |
| `ExpedienteAduanero` | id | `tenantId`, `loteId`→LoteImportacion (**único**, 1:1) | DIM + factura comercial + certificado de origen (cada uno "archivo único", mismo patrón que `Factura.archivo*`). **Sin endpoint backend que lo escriba** (ver IMPORTACIONES_IMPACT_ANALYSIS.md). |
| `VistoBuenoAduanero` | id | `expedienteId`→ExpedienteAduanero (Cascade) | INVIMA/ICA/otros, plural por expediente. **Sin endpoint backend que lo escriba.** |
| `CosteoImportacionDetalle` | id | `tenantId`, `loteId`→LoteImportacion, `itemId`→ItemOrdenCompraIntl, `liquidadoPorId`→User | Landed cost NIC 2 por ítem. `esProvisional` distingue estimado (al recibir en planta) vs. definitivo (al liquidar) — **nunca se sobrescribe, se agrega fila nueva**, igual patrón que `Pago` nunca borra. Incluye diferencia en cambio NIC 21 (`diferenciaCambioCop`). |
| `ImportacionHistorial` | id | `ordenCompraId`→OrdenCompraIntl (Cascade) | Mismo patrón que `FacturaHistorial`. |

---

## MULTI-TENANCY: mecanismo real

**Mecanismo**: columna explícita `tenantId: String @db.UniqueIdentifier` en cada tabla tenant-scoped, filtrada **manualmente en cada query Prisma dentro de cada controlador** (`where: { tenantId: req.user.tenantId, ... }`). `req.user.tenantId` se resuelve en `authenticateJWT` → `loadSessionUser()` (`server/src/lib/permissions.ts`) a partir del claim `tenantId` del JWT (o el tenant "hogar" del usuario si el JWT no lo trae).

**NO es**: un esquema separado por tenant, una base de datos separada por tenant, Row-Level Security a nivel de SQL Server, ni un middleware global de Prisma (`$use`/`$extends`) que inyecte `tenantId` automáticamente en cada query. **Es 100% disciplina manual a nivel de aplicación.**

### Verificación exhaustiva (confirmado por auditoría de código, módulo por módulo)

Se revisaron los 19 módulos backend y **cero** queries sobre un modelo tenant-scoped omiten el filtro `tenantId` — incluyendo `update`/`delete`, que en todos los casos observados hacen primero un `findFirst({ id, tenantId })` de verificación de propiedad antes de mutar por PK. Excepciones **intencionales y correctas**:

- `User.email` (`findUnique({ where: { email } })`) — la columna es única globalmente por diseño; se usa solo para chequeo de existencia (409), nunca expone el registro de otro tenant al llamador.
- `Notificacion` — se filtra por `usuarioId`, no por `tenantId` (correcto: es un recurso estrictamente personal, ya acotado por ser del usuario autenticado).
- `Membresia` (módulo `membresias`) — cruza tenants **por diseño** (dar acceso a otra empresa), gateado por `requireSuperadmin` + un chequeo adicional explícito: el usuario objetivo debe ser nativo del tenant del superadmin que llama (`usuario.tenantId === req.user.tenantId`), lo que cierra el hueco de que un superadmin de un tenant pudiera auto-otorgarse acceso a cualquier otro tenant vía un usuario ajeno.
- `ClasificacionArancelariaMatriz` — catálogo global sin `tenantId`, documentado explícitamente en el schema como decisión deliberada.
- Siesa sync — cruza dos bases de datos (interna vía Prisma, externa vía `mssql`), filtrando explícitamente por `f202_id_cia` (`ciaId`, derivado de `Tenant.siesaCiaId`, nunca del body de la petición) para no mezclar compañías de Siesa entre sí.

### Riesgo estructural (clasificado CRÍTICO en SECURITY_AUDIT.md)

El aislamiento multi-tenant es **hoy correcto en el código existente**, pero **no está garantizado por ningún mecanismo estructural** (ni de framework, ni de base de datos). Cualquier query nueva que un desarrollador agregue en el futuro (por ejemplo, los endpoints que faltan de `ExpedienteAduanero`/`VistoBuenoAduanero` para Importaciones) depende enteramente de que esa persona recuerde escribir `tenantId` en el `where`. No hay pruebas automatizadas que lo detecten si se omite (ver FASE 14 en `ARCHITECTURE_AUDIT.md`), ni un middleware de Prisma que lo fuerce. Este es el hallazgo de mayor severidad latente de todo el sistema.

---

## Convenciones de borrado e integridad

- **Soft-delete vía booleano `eliminado`**: `Factura`, `SolicitudCompra`, `ServicioSuscripcion`, `Contrato`, `CreditoCliente`, `Empleado`, `OrdenCompraIntl`.
- **Soft-delete vía campo `estado`**: `Pago` (`estado = "Anulado"`, nunca se borra ni se usa `eliminado`).
- **Sin soft-delete (no diseñado todavía)**: `LoteImportacion`, `ExpedienteAduanero`, `VistoBuenoAduanero`, `CosteoImportacionDetalle` — la anulación solo existe a nivel de `OrdenCompraIntl` completa; no hay forma de "anular" un lote individual sin anular toda la orden.
- **Unicidad "solo entre registros activos"**: `Factura` (`[tenantId, empresaId, numero]`) y `OrdenCompraIntl` (`[tenantId, numeroOrden]`) documentan explícitamente en el schema por qué la unicidad NO es una constraint de base de datos (bloquearía reusar un número tras un borrado lógico) sino una validación en el controlador antes de crear.
- **Cascade delete real** solo en relaciones "hijo existencial" (el hijo no tiene sentido sin el padre): `PermisoUsuario`→User, `Membresia`→User, `FacturaHistorial`→Factura, `ImportacionHistorial`→OrdenCompraIntl, `ItemOrdenCompraIntl`→OrdenCompraIntl, `VistoBuenoAduanero`→ExpedienteAduanero, `HistorialSalario`→Empleado.
- **`onDelete: NoAction`** es el default en casi todas las demás relaciones (evita borrados en cascada accidentales entre entidades de negocio independientes; SQL Server además exige `NoAction` en varias de estas para evitar ciclos de cascada múltiples).

---

## Catálogo global vs. catálogo por tenant — patrón a replicar en futuras extensiones

`ClasificacionArancelariaMatriz` es el único ejemplo actual de "catálogo técnico compartido entre todos los tenants del grupo, sin `tenantId`". Cualquier futura tabla de referencia verdaderamente universal (por ejemplo, un catálogo de países, monedas ISO, o puertos, si se decide formalizar — ver ARCHITECTURAL_DECISIONS_PENDING.md) debería seguir este mismo patrón en vez de duplicarse por tenant.
