# Modelo Entidad–Relación (MER) lógico — RicoSoft Enterprise

**Fecha:** 2026-10-23
**Fuente:** `server/prisma/schema.prisma` en HEAD `17a48ae`.
**Alcance:** MER lógico de relaciones declaradas por Prisma. No es introspección física del SQL Server del servidor destino y no demuestra que la base desplegada esté alineada.

El schema actual declara 85 modelos. Los diagramas se dividen por dominio para mantener legibilidad. Las líneas hacia Siesa representan referencias externas, no relaciones/FKs Prisma.

## 1. Identidad, tenant y permisos

```mermaid
erDiagram
  TENANT ||--o{ USER : contiene
  TENANT ||--o{ MEMBRESIA : habilita
  USER ||--o{ MEMBRESIA : pertenece
  TENANT ||--o{ ROL : define
  ROL o|--o{ USER : rol_principal
  ROL o|--o{ MEMBRESIA : rol_por_tenant
  DEPARTAMENTO o|--o{ USER : organiza
  DEPARTAMENTO o|--o{ MEMBRESIA : organiza
  TENANT ||--o{ PERMISO : cataloga
  USER ||--o{ PERMISO_USUARIO : recibe_grant_o_revocacion
  TENANT ||--o{ AUDITORIA : registra
  TENANT o|--o{ MODULO : habilita
  DEPARTAMENTO o|--o{ MODULO : agrupa
  TENANT ||--o{ PERFIL_FUNCIONAL : define
  DEPARTAMENTO ||--o{ PERFIL_FUNCIONAL : organiza
  USER ||--o{ USUARIO_PERFIL_FUNCIONAL : recibe
  PERFIL_FUNCIONAL ||--o{ USUARIO_PERFIL_FUNCIONAL : asigna
  TENANT ||--o{ NOTIFICACION : contiene
  USER ||--o{ NOTIFICACION : destinatario
```

**Notas del modelo:**

- `Rol.permisos` es JSON/texto con códigos; no hay tabla puente relacional `RolePermission`.
- `Permiso` es un catálogo tenant-scoped. `PermisoUsuario.permisoId` se guarda como código string y no es FK a `Permiso`; la lógica de permisos es la fuente efectiva.
- `User` conserva `tenantId` principal; `Membresia` aporta tenant alterno, rol, departamento y bandera de superadmin del tenant.
- `Auditoria.usuarioId` intencionalmente no tiene FK a `User` para preservar historial tras eliminar usuarios. Las mutaciones históricas están prohibidas salvo purga aprobada por retención.
- `PerfilFuncional.esJefeDeArea` caracteriza perfil/notificación; no es equivalente a permiso ni crea por sí solo una jerarquía de autorización.

## 2. Comercial, cotización, proforma, pedido y despacho

```mermaid
erDiagram
  TENANT ||--o{ COTIZACION : posee
  COTIZACION ||--|{ COTIZACION_ITEM : contiene
  TENANT ||--o{ PROFORMA : posee
  COTIZACION o|--o{ PROFORMA : origen_opcional
  PROFORMA ||--|{ PROFORMA_ITEM : contiene
  TENANT ||--o{ PEDIDO_COMERCIAL : posee
  COTIZACION o|--o{ PEDIDO_COMERCIAL : referencia
  PROFORMA o|--o| PEDIDO_COMERCIAL : crea_maximo_uno
  PEDIDO_COMERCIAL ||--|{ PEDIDO_COMERCIAL_ITEM : contiene
  TENANT ||--o{ DESPACHO : posee
  DESPACHO ||--o{ DESPACHO_LINEA : contiene
  DESPACHO ||--o{ DESPACHO_NOVEDAD : registra
  PEDIDO_COMERCIAL }o..o{ SIESA_PDV : referencia_externa_por_erpRowId
  DESPACHO }o..|| SIESA_DOCUMENTO : referencia_externa_por_siesaDocRowId
```

`Cotizacion`, `Proforma` y `PedidoComercial` son cabeceras locales con ítems. Los clientes e ítems Siesa se conservan en gran parte como `rowId` y snapshots; Siesa no es FK de Prisma.

**Relación que no debe inventarse:** el schema no declara FK directa `Despacho → PedidoComercial`. El despacho referencia `siesaDocRowId`; el pedido se vincula por `erpRowId` y la vista de compromiso coteja PDV con lectura del ERP. Son rutas de trazabilidad relacionadas por identificador externo, no una relación local confirmada.

**Restricciones relevantes:** `PedidoComercial(tenantId, numero)` es único; la unicidad de ERP y de `proformaId` usa índices únicos filtrados SQL Server (no representables como `@@unique` simple en este schema). Proforma mantiene unicidad `(tenantId, numero)`.

## 3. Compras, facturación y pagos

```mermaid
erDiagram
  TENANT ||--o{ PROVEEDOR : cataloga
  TENANT ||--o{ SOLICITUD_COMPRA : registra
  SOLICITUD_COMPRA ||--o{ COTIZACION_PROVEEDOR : compara
  PROVEEDOR o|--o{ COTIZACION_PROVEEDOR : proveedor_opcional
  TENANT ||--o{ FACTURA : registra
  SOLICITUD_COMPRA o|--o{ FACTURA : origen_opcional
  PROVEEDOR o|--o{ FACTURA : proveedor_opcional
  FACTURA ||--o{ FACTURA_HISTORIAL : traza
  FACTURA ||--o{ PAGO : recibe
  TENANT ||--o{ PAGO : registra
  TENANT ||--o{ SERVICIO_SUSCRIPCION : administra
  SERVICIO_SUSCRIPCION o|--o{ FACTURA : origen_servicio_opcional
  TENANT ||--o{ CREDITO_CLIENTE : administra
  TENANT ||--o{ INDICADOR_CREDITO_CLIENTE : consulta
```

La solicitud puede originar factura (FK opcional `Factura.solicitudCompraId`); una factura tiene historial y pagos. El esquema no constituye un libro contable de doble partida. La contabilidad permanece fuera del alcance de una entidad local hasta que exista decisión y diseño explícitos.

## 4. Importaciones y bandeja documental

```mermaid
erDiagram
  TENANT ||--o{ ORDEN_COMPRA_INTL : posee
  USER o|--o{ ORDEN_COMPRA_INTL : responsable
  ORDEN_COMPRA_INTL ||--|{ ITEM_ORDEN_COMPRA_INTL : contiene
  ORDEN_COMPRA_INTL ||--o{ ORDEN_DOCUMENTO : adjunta
  ORDEN_COMPRA_INTL ||--o{ LOTE_IMPORTACION : embarca
  LOTE_IMPORTACION ||--o{ CONTENEDOR_LOTE : contiene
  LOTE_IMPORTACION ||--o| EXPEDIENTE_ADUANERO : expediente
  EXPEDIENTE_ADUANERO ||--o{ VISTO_BUENO_ADUANERO : requiere
  LOTE_IMPORTACION ||--o{ COSTEO_IMPORTACION_DETALLE : costea
  ITEM_ORDEN_COMPRA_INTL ||--o{ COSTEO_IMPORTACION_DETALLE : prorratea
  ORDEN_COMPRA_INTL ||--o{ IMPORTACION_HISTORIAL : historial
  ORDEN_COMPRA_INTL ||--o{ IMPORTACION_ACTIVIDAD : planifica
  ORDEN_COMPRA_INTL ||--o{ IMPORTACION_NOVEDAD : alerta
  ORDEN_COMPRA_INTL ||--o{ IMPORTACION_PAGO : paga
  TENANT o|--o{ IMPORTACION_CORREO : atribucion_opcional
  IMPORTACION_CORREO ||--o{ CORREO_ADJUNTO : recibe
  CORREO_ADJUNTO ||--o{ IMPORTACION_EXTRACCION : extrae
  IMPORTACION_CORREO ||--o{ IMPORTACION_EXCEPCION : requiere_revision
  TENANT ||--o{ INBOX_ITEM : bandeja
```

`ImportacionCorreo.tenantId` es nullable; la unicidad del correo se declara por `messageId` global. Las excepciones tienen también tenant nullable. Debe conservarse verificación de tenant al asignar proveedor/orden y al mostrar/descargar adjuntos; el MER no basta para probarlo.

## 5. Gestión Humana

```mermaid
erDiagram
  TENANT ||--o{ EMPLEADO : contrata
  TENANT ||--o{ CARGO_COLABORADOR : define
  CARGO_COLABORADOR o|--o{ EMPLEADO : clasifica
  EMPLEADO ||--o| EMPLEADO_DETALLE : perfil_sensible
  EMPLEADO ||--o{ EMPLEADO_FAMILIAR : declara
  EMPLEADO ||--o{ EMPLEADO_ESTUDIO : registra
  EMPLEADO_ESTUDIO o|--o{ EMPLEADO_DOCUMENTO : soporta
  EMPLEADO ||--o{ EMPLEADO_DOCUMENTO : adjunta
  EMPLEADO ||--o{ HISTORIAL_SALARIO : historiza
  EMPLEADO ||--o{ PERMISO_LABORAL : solicita
  EMPLEADO ||--o{ FALTA_STRIKE : registra
  EMPLEADO ||--o{ EMPLEADO_BIOMETRICO : asocia
  FUENTE_BIOMETRICA ||--o{ EMPLEADO_BIOMETRICO : identifica
  FUENTE_BIOMETRICA ||--o{ MARCACION_BIOMETRICA : origina
  TENANT ||--o{ MARCACION_BIOMETRICA : aísla
```

`Empleado.cargoId` es una FK a `CargoColaborador`, pero no es una FK compuesta con `tenantId`; la coherencia tenant-cargo se valida en aplicación. Los detalles/documentos son sensibles y tienen permisos específicos. Las rutas físicas de archivo no deben exponerse ni servirse como estáticos.

## 6. Cobertura del MER y límites

- Conteo `85` corresponde a declaraciones `model` del schema; los diagramas anteriores son dominios principales, no todos los modelos auxiliares.
- Relaciones opcionales, índices filtrados e identificadores Siesa requieren consultar el texto de schema/migración para cardinalidad real.
- Las tablas de Siesa, CrossChex Access y proveedores externos no forman parte del MER SQL Server de RicoSoft.
- Las claves de negocio representadas como strings (estados, permisos JSON, algunos snapshots) no están normalizadas en todos los dominios.
- Para un ERD físico de producción falta introspección de la base real destino; no se hizo porque no hay autorización ni conexión confirmada a una base desechable de ese servidor.
