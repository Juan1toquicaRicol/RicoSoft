# MODULE_DEPENDENCIES.md — RicoSoft Enterprise

Dependencias reales entre módulos, basadas en relaciones de Prisma (`schema.prisma`) y en referencias cruzadas de código (imports, `include`, validaciones de existencia). No se documentan dependencias hipotéticas.

---

## Mapa de dependencias (Usuarios / Tenants / Compras / Proveedores / Inventario / Facturación / Contabilidad / Documentos / Importaciones)

```text
Tenant (raíz)
  ├─ User ──────────────┬── Rol (permisos JSON)
  │                      ├── PermisoUsuario (override directo)
  │                      ├── Membresia ──→ Tenant adicional + Rol propio de ese tenant
  │                      ├── Departamento (esSistemas = bypass total)
  │                      └── Colaborador (ficha RRHH, opcional)
  │
  ├─ Proveedor (catálogo maestro) ←── sincronizado desde Siesa (solo NIT+nombre, solo lectura allá)
  │     ├── referenciado por: SolicitudCompra, Factura, ServicioSuscripcion, Contrato
  │     └── NO referenciado por: OrdenCompraIntl (Importaciones usa "proveedorExtranjero" como texto libre, NO el catálogo Proveedor)
  │
  ├─ Compras (flujo secuencial)
  │     SolicitudCompra ──(opcional)──→ Factura ──(1:N)──→ Pago
  │     · SolicitudCompra.proveedorId → Proveedor (opcional)
  │     · Factura.proveedorId → Proveedor (opcional), .servicioId → ServicioSuscripcion, .contratoId → Contrato,
  │       .solicitudCompraId → SolicitudCompra (opcional)
  │     · Pago.facturaId → Factura (obligatorio)
  │
  ├─ Servicios / Contratos
  │     Contrato ──1:N──→ ServicioSuscripcion ──1:N──→ Factura
  │
  ├─ Documentos (adjunto único por registro, NO tabla independiente)
  │     Factura.archivo*, SolicitudCompra.cotizacion*, Pago.comprobante*
  │     → almacenados en disco bajo uploads/<carpeta>/<id>/, servidos solo vía endpoint autenticado
  │     → Importaciones define columnas equivalentes en ExpedienteAduanero/VistoBuenoAduanero
  │        PERO sin el middleware de subida ni el endpoint que las llene (ver IMPORTACIONES_IMPACT_ANALYSIS.md)
  │
  ├─ Importaciones (subsistema propio, parcialmente independiente de Compras)
  │     OrdenCompraIntl ──1:N──→ ItemOrdenCompraIntl ──(opcional)──→ ClasificacionArancelariaMatriz (catálogo GLOBAL, sin tenantId)
  │     OrdenCompraIntl ──1:N──→ LoteImportacion ──1:1──→ ExpedienteAduanero ──1:N──→ VistoBuenoAduanero
  │     LoteImportacion ──1:N──→ CosteoImportacionDetalle ──→ ItemOrdenCompraIntl (por ítem, no por lote completo)
  │     OrdenCompraIntl ──1:N──→ ImportacionHistorial
  │     · NO tiene relación de FK con SolicitudCompra, Factura ni Pago — es un flujo de compra
  │       INDEPENDIENTE del flujo de Compras nacional (ver "Vacío" abajo)
  │
  ├─ Inventario → NO EXISTE ACTUALMENTE como módulo/tabla local
  │     · El costo unitario que calcula CosteoImportacionDetalle (costoUnitarioCop) está pensado como
  │       "costo de referencia para el inventario" (comentario explícito en el código), pero no hay
  │       ninguna tabla de stock/existencias/kardex que lo consuma — el dato queda huérfano de un
  │       sistema de inventario propio.
  │     · Inventario real, si existe, vive en Siesa/UnoEE (fuera de este repo).
  │
  ├─ Contabilidad → NO EXISTE ACTUALMENTE como módulo/tabla local
  │     · No hay cuentas contables, comprobantes, centros de costo, ni asientos automáticos en el schema.
  │     · Contabilidad real vive en Siesa/UnoEE (fuera de este repo, integración hoy es UNIDIRECCIONAL
  │       de solo lectura: Siesa → RicoSoft, solo para Proveedor).
  │
  ├─ Gestión Humana (dominio separado, comparte Tenant/Departamento, sin cruce con Compras/Importaciones)
  │     Empleado ──1:N──→ HistorialSalario, PermisoLaboral, FaltaStrike
  │
  ├─ Analítica / Reglas / Créditos (consumidores de lectura, no fuentes de dependencia)
  │     Analitica lee: Factura, SolicitudCompra, ServicioSuscripcion, CreditoCliente, ProyeccionMensual
  │     ReglaEnrutamiento: entidad aislada (condiciones/acciones en JSON texto), sin FK a otras tablas
  │     CreditoCliente: entidad aislada, sin FK a Proveedor/Factura
  │
  └─ Auditoria / Notificacion (transversales, referencian User+Tenant, sin dependencias de negocio)
```

---

## Dependencias explícitas por módulo (import/relación real en código)

| Módulo | Depende de (lectura/validación) | Es dependido por |
|---|---|---|
| **Usuarios** | Tenant, Rol, Departamento, Colaborador | Prácticamente todos los módulos (responsable/creador/actor) |
| **Tenants** | — (raíz) | Todos |
| **Roles** | Tenant | Usuarios, Membresias |
| **Departamentos** | Tenant | Usuarios, Modulos, Membresias |
| **Modulos** (sidebar) | Tenant, Departamento | Frontend `app-shell.tsx` |
| **Proveedores** | Tenant | SolicitudCompra, Factura, ServicioSuscripcion, Contrato; escrito por `integraciones-siesa` |
| **Solicitudes (Compras)** | Tenant, User (solicitante/resolutor), Proveedor | Factura (opcional, vía `solicitudCompraId`) |
| **Facturas** | Tenant, Proveedor, ServicioSuscripcion, Contrato, SolicitudCompra, User (responsable) | Pago, FacturaHistorial, Analítica |
| **Pagos** | Factura, User (registrador) | (hoja del árbol — nadie depende de Pago) |
| **Servicios** | Tenant, Proveedor, Contrato, User | Factura |
| **Contratos** | Tenant, Proveedor, User | ServicioSuscripcion, Factura |
| **Reglas** | Tenant | (aislado — sin consumidores identificados en el schema) |
| **Créditos** | Tenant | Analítica |
| **Gestión Humana** | Tenant, Departamento | (aislado del resto del negocio de compras) |
| **Importaciones** | Tenant, User (responsable/liquidador), ClasificacionArancelariaMatriz (catálogo global) | Nadie — ninguna otra tabla tiene FK hacia `OrdenCompraIntl`/`LoteImportacion` |
| **Integraciones-Siesa** | Tenant (`siesaCiaId`) | Escribe en Proveedor; lee de BD externa Siesa/UnoEE |
| **Membresias** | User, Tenant, Rol, Departamento | Autenticación (`loadSessionUser`, `listarTenantsAccesibles`) |
| **Auditoría** | Tenant, User | Ninguno la consume programáticamente (solo lectura vía UI) |
| **Notificaciones** | Tenant, User | Ninguno la consume programáticamente (solo lectura vía UI) |
| **Analítica** | Factura, SolicitudCompra, ServicioSuscripcion, CreditoCliente, ProyeccionMensual (todo de solo lectura) | — |

---

## Vacío estructural relevante para Importaciones V1

**`OrdenCompraIntl` NO tiene ninguna relación de base de datos con `SolicitudCompra`, `Factura` ni `Pago`.** Es un subsistema de compras completamente paralelo al de "Compras nacional" (`Solicitudes → Facturas → Pagos`), con su propio ciclo de vida, su propio historial (`ImportacionHistorial` en vez de `FacturaHistorial`), y sin punto de integración con Contabilidad (que de todas formas no existe localmente).

Esto significa, en términos concretos:
- Una Orden de Compra Internacional **no genera una `Factura` interna** cuando llega el momento de pagar al proveedor extranjero — no hay ningún flujo de "registrar el pago de la importación" comparable al de `Pagos` sobre `Factura`.
- El costo landed calculado en `CosteoImportacionDetalle` no se refleja en ninguna tabla de Inventario (porque no existe) ni se contabiliza en ninguna tabla de Contabilidad (porque no existe) — hoy es un número que vive y muere dentro del módulo de Importaciones, visible solo ahí.
- Esto no es necesariamente un defecto: puede ser una decisión correcta si Contabilidad/Inventario reales viven en Siesa y ese cruce se resuelve por fuera de RicoSoft (vía una futura sincronización Importaciones→Siesa, hoy inexistente — la sincronización actual es unidireccional Siesa→RicoSoft y solo para Proveedores). Pero es una decisión que **debe tomarse explícitamente**, no asumirse — ver `ARCHITECTURAL_DECISIONS_PENDING.md`.
