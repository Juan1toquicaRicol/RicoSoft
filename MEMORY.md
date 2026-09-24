# MEMORY.md — RicoSoft Enterprise

Este archivo contiene memoria técnica y decisiones permanentes del proyecto.
No es un diario de conversaciones. Solo deben registrarse decisiones, reglas,
arquitectura, contratos, integraciones, hallazgos importantes y cambios que deban
sobrevivir a nuevas sesiones de Claude Code.

Última actualización de referencia: 2026-09-23.

## 1. Identidad del proyecto

Proyecto: RicoSoft Enterprise (V1.0)
Organización: Grupo Ricol
Tipo: ERP/SaaS multiempresa y multi-tenant.

Objetivo: administrar en una sola plataforma procesos administrativos, financieros,
operativos, comerciales, inventarios, compras, importaciones, contabilidad, RRHH,
integraciones y otras áreas empresariales.

Principios permanentes:

- Seguridad primero.
- Aislamiento multi-tenant.
- Reutilización antes que duplicación.
- Cambios incrementales.
- Compatibilidad con lo existente.
- Trazabilidad.
- Calidad verificable.
- Valor empresarial.
- No inventar requisitos.

## 2. Responsabilidad de Claude Code

Claude Code es copiloto de arquitectura/implementación, no autoridad autónoma de
producto.

Debe investigar primero, proponer cuando haya ambigüedad y ejecutar únicamente dentro
del alcance aprobado.

El responsable del proyecto toma las decisiones funcionales y arquitectónicas que
cambien reglas, contratos o arquitectura.

## 3. Autenticación y sesiones

Arquitectura vigente conocida:

- Email + contraseña.
- bcrypt.
- JWT.
- tokenVersion para invalidar sesiones después de cambios de contraseña.
- Usuarios con tenant principal.
- Membresías para acceso adicional a otros tenants.
- Selección de tenant antes del token final cuando el usuario tiene más de un tenant.
- /auth/me y SessionContext.
- Rate limiting en endpoints sensibles.
- Route guard con cache local existente.

JWT conocido:

{sub, tv, tenantId}

No crear una segunda capa de autenticación.

## 4. Multi-tenancy

User.tenantId representa el tenant principal.

Membresia representa acceso adicional y puede tener rol propio, isSuperadmin y activo.

Todo acceso a datos empresariales debe estar limitado al tenant autenticado.

Hallazgo histórico crítico: el módulo de notificaciones tuvo consultas que filtraban
solo por usuarioId y no por tenantId, permitiendo potencialmente exposición entre
tenants para usuarios con múltiples membresías. Este caso debe considerarse patrón
de regresión: toda consulta similar debe revisar tenantId explícitamente.

## 5. Permisos

Existe catálogo canónico jerárquico:

src/.../catalogo-permisos.ts

El catálogo ha tenido 124 códigos y dependencias derivadas mediante exigeVer.

No inventar permisos.

La autorización debe reutilizar helpers existentes.

En Comercial, gestionar implica ver cuando así lo define el catálogo.

Reglas conocidas:

- Proforma: cotizaciones.gestionar + proformas.gestionar en el endpoint correspondiente.
- Crear pedido desde proforma: proformas.ver + pedidos_comerciales.gestionar.
- PEDIDOS_COMERCIALES_GESTIONAR controla la vinculación ERP del PedidoComercial.
- PEDIDOS_COMERCIALES_CONFIRMAR controla el paso a LISTO_PARA_ERP.
- PERMISOS_LEGACY existe para compatibilidad donde todavía sea necesario.

El área Sistemas debe disponer de "Configuración y administración" para usuarios,
permisos, roles y datos de usuarios según el diseño funcional existente.

## 6. PedidoComercial ↔ SIESA

PedidoComercial ya contiene:

- erpTipoDocumento
- erpRowId
- erpNumero
- erpFechaSincronizacion
- erpEstadoSincronizacion

SIESA PDV:

t430_cm_pv_docto.f430_rowid = identidad técnica del documento PDV.

Endpoint aprobado:

POST /api/comercial/pedidos/:id/asignar-erp

Body:

{ "erpRowId": number }

Solo permite vincular cuando el PedidoComercial está en:

LISTO_PARA_ERP

La vinculación:

- resuelve siesaCiaId desde el tenant autenticado;
- lee el PDV desde SIESA;
- valida que exista;
- valida que el cliente del PDV corresponda al cliente del pedido;
- no cambia el estado comercial;
- permite idempotencia cuando se vuelve a vincular el mismo rowId;
- rechaza un rowId diferente si ya existe vínculo;
- usa índice único filtrado SQL Server para tenantId + erpRowId cuando erpRowId no es NULL;
- actualiza documento + auditoría dentro de una transacción;
- no escribe en SIESA.

Estados de integración conocidos:

NO_VINCULADO
VINCULADO
ERROR_VINCULACION

Estado comercial:

BORRADOR -> CONFIRMADO -> LISTO_PARA_ERP -> ANULADO

No inventar SINCRONIZADO/ERROR_SINCRONIZACION como estados comerciales.

## 7. SIESA: identidades verificadas

Identidades conocidas de UnoEE:

- t200_mm_terceros.f200_rowid: tercero.
- t201: relación tercero/compañía.
- t430_cm_pv_docto.f430_rowid: documento PDV.
- t431_cm_pv_movto.f431_rowid: línea PDV.
- t460: remisión.
- t470: movimientos/remisión.
- t461: facturas.

Datos de crédito conocidos:

- t201.f201_cupo_credito.
- t9896: snapshot.
- t353: saldo vivo.

No asumir que estos datos significan exactamente lo mismo en otra consulta sin verificar
la consulta y el contexto de compañía.

## 8. Proveedores SIESA

Sincronización existente:

POST /api/integraciones/siesa/proveedores/sincronizar

Permiso:

integracion_siesa.sincronizar

Proveedor tiene unicidad:

[tenantId, nit]

Conteos históricos auditados:

- Ricol: 2.952.
- Flexipack: 2.383.
- Green Solutions: 496.
- Total SIESA sincronizado: 5.831.
- Demo manual: 6.

Compañías conocidas:

- UnoEE_Ricol_Real -> id_cia 1.
- Flexipack -> id_cia 2.
- Green -> id_cia 3.

El sync históricamente fue síncrono, sin progreso/cancelación/reintento/auditoría
completa. No asumir que esas limitaciones siguen intactas sin auditar el código actual.

## 9. Proformas corporativas

El formato corporativo se resuelve por tenant.

Empresas contempladas:

- Ricol.
- Flexipack.
- Green Solutions.

Existe lógica compartida para:

- LogoEmpresa.
- POSICION_Y_LOGO_EMPRESA.
- Encabezados corporativos.
- Resolver encabezado según tenant.

Ricol debe conservar su formato.

Flexipack y Green no deben recibir automáticamente datos de Ricol.

Los campos corporativos sin información real deben ocultarse; no inventar teléfonos,
direcciones, correos, ICA, régimen fiscal u otros datos.

## 10. Green Solutions: plocks y paquetes

Regla vigente:

cantidad solicitada
-> 1% desperdicio de construcción
-> paquetes completos de 32
-> cantidad documentada.

Constantes aprobadas:

PLOCKS_POR_PAQUETE = 32
DESPERDICIO_CONSTRUCCION_PCT = 0.01

Fórmula:

cantidadConDesperdicio = cantidadSolicitada * 1.01
paquetes = Math.ceil(cantidadConDesperdicio / 32)
cantidadDocumentada = paquetes * 32

Ejemplos aprobados:

1 -> 1.01 -> 1 -> 32
31 -> 31.31 -> 1 -> 32
32 -> 32.32 -> 2 -> 64
64 -> 64.64 -> 3 -> 96
1000 -> 1010 -> 32 -> 1024
1025 -> 1035.25 -> 33 -> 1056
2000 -> 2020 -> 64 -> 2048

La regla es exclusiva de Green Solutions.

Ricol y Flexipack no deben cambiar por esta regla.

En Green, la cantidad económica debe ser consistente con la cantidad documentada según
la implementación vigente.

## 11. CrossChex

Contexto conocido:

- Windows 11.
- CrossChex Standard.
- Base MDB:
  C:\Program Files (x86)\Anviz\CrossChex Standard\DB\CrossChex.mdb
- ODBC Access 64-bit funcionó.
- Tablas conocidas:
  Checkinout, Userinfo, UserFinger.

Se prefiere integración directa al MDB si es estable y compatible con la arquitectura,
en lugar de introducir API/agent innecesario.

No asumir que todos los usuarios de CrossChex son empleados que marcan asistencia;
existen gerentes, jefes y coordinadores sin marcaciones.

## 12. Auditoría y seguridad histórica

Auditoría previa del sistema encontró:

- backend grande y modular;
- frontend con múltiples rutas;
- Prisma/SQL Server;
- buen baseline de helmet, CORS de producción, rate limiting, bcrypt y validaciones;
- JWT almacenado en localStorage como deuda de seguridad;
- ausencia de CSP explícita como deuda;
- dependencias con vulnerabilidades reportadas que deben revisarse periódicamente;
- logs console.log en backend;
- falta histórica de request-id/logging estructurado;
- algunos archivos muy grandes;
- pruebas agregadas con comportamiento intermitente;
- módulos con cobertura pendiente.

Estos puntos son contexto de auditoría, no autorización para modificar todo de una vez.
Cada deuda debe abordarse incrementalmente.

## 13. Migraciones

Una migración reciente agregó metadatos de catálogos y parámetros de negocio de forma
aditiva.

PedidoComercial utiliza un índice único filtrado de SQL Server para:

tenantId + erpRowId

solo cuando erpRowId IS NOT NULL.

No sustituir esta solución por @@unique de Prisma sin verificar semántica SQL Server:
los NULL y los índices únicos requieren tratamiento específico.

## 14. Estado de calidad conocido

En el trabajo reciente se alcanzaron, según los reportes de implementación:

- Backend: 627 tests pasando en una etapa de validación previa.
- Luego, con el trabajo de PedidoComercial: 629 pasando y 45 skipped en una ejecución
  amplia reportada.
- Frontend: suites pasando en las validaciones recientes.
- TypeScript y build limpios en los cambios recientes.
- Prisma validate/generate ejecutados con éxito tras resolver un EPERM de Windows.

Estos números son históricos. Antes de declarar estado actual, ejecutar la suite real.

## 15. Decisiones permanentes de trabajo

1. Auditar antes de implementar.
2. Cambiar lo mínimo necesario.
3. No duplicar funcionalidades.
4. Mantener aislamiento tenant.
5. No inventar datos.
6. No inventar estados, permisos, endpoints o tablas.
7. Separar estado de negocio de estado de integración.
8. Mantener trazabilidad.
9. Probar backend y frontend según el alcance.
10. Documentar decisiones permanentes aquí.
11. No hacer cambios destructivos sin autorización.
12. No hacer commits/push/operaciones Git destructivas sin autorización.

## 16. Registro de decisiones

### 2026-09-22 — Gobernanza de Claude Code
Se establecen tres archivos raíz:

- AGENTS.md: reglas permanentes.
- MEMORY.md: memoria de decisiones.
- SKILL.md: procedimientos repetibles.

AGENTS.md debe referenciar los otros dos y Claude debe consultarlos antes de tareas
relevantes.

### 2026-09-22 — PedidoComercial ERP
Se aprobó vinculación de PedidoComercial con PDV SIESA existente por f430_rowid,
sin escritura en SIESA y sin cambiar el estado comercial al vincular.

### 2026-09-22 — Proforma Green
Se aprobó el cálculo:

solicitado + 1% desperdicio -> paquetes de 32 -> cantidad documentada.

La regla aplica solo a Green Solutions.

### 2026-09-22 — Proformas corporativas
Se aprobó resolución del encabezado corporativo por tenant para Ricol, Flexipack y
Green Solutions, evitando herencia accidental de datos de Ricol.

### 2026-09-22 — Consecutivo de Proforma/Cotización
Decisión: el número interno (numero) de Proforma y Cotización se calcula siempre
como MAX(numero)+1 dentro del tenant autenticado, calculado fresco contra la base
de datos en el momento de crear (dentro de la misma transacción de escritura), no
a partir de un valor cacheado en frontend. Si el usuario edita explícitamente el
número mediante el botón "Editar" del diálogo (hoy solo expuesto en el diálogo de
Proforma; el backend de Cotización también lo admite pero su diálogo actual no
tiene ese botón), el backend respeta el valor recibido tal cual.

Verificado en el código (sin modificar nada) el 2026-09-22:
- server/src/modules/proformas/proformas.controller.ts: crearProforma usa
  `numeroSolicitado ?? (await siguienteNumeroProforma(tx, tenantId))`, y
  siguienteNumeroProforma consulta `tx.proforma.findFirst({ where: { tenantId },
  orderBy: { numero: "desc" } })` fresco dentro de la transacción.
- server/src/modules/comercial/cotizaciones.controller.ts: crearCotizacion sigue
  exactamente el mismo patrón con siguienteNumeroCotizacion.
- src/components/proforma-dialog.tsx: el campo "Número de proforma" está
  bloqueado (disabled/readOnly) por defecto y muestra el sugerido de
  GET /proformas/siguiente-numero; el botón "Editar" (ícono Pencil) alterna
  `editandoNumero` y habilita el input; el valor que quede ahí se envía tal
  cual en `numero` al crear, sin importar si fue editado o no.
- Prisma: Proforma, Cotizacion y PedidoComercial tienen `@@unique([tenantId,
  numero])` — la unicidad y el aislamiento por tenant están garantizados a
  nivel de base de datos, no solo por la consulta MAX().
- Confirmado también con la suite de integración real
  (proformas.integration.test.ts, describe "Consecutivo"): número manual
  respetado, duplicado del mismo tenant → 409, mismo número en tenants
  distintos no colisiona, creaciones concurrentes sin número manual nunca
  terminan en el mismo consecutivo.

Motivo: evitar que dos empresas/tenants interfieran entre sí en su numeración, y
permitir una corrección manual deliberada (p. ej. continuar una numeración legada)
sin que eso rompa el cálculo automático de la siguiente proforma/cotización.

Impacto: cualquier proforma o cotización nueva sin edición manual siempre continúa
el consecutivo real más alto de su propio tenant; una edición manual se vuelve la
nueva base para el siguiente cálculo automático, sin necesidad de un contador
separado.

Restricciones: no remover el botón "Editar" ni el fallback automático sin una
decisión explícita. No inferir número de otro tenant. No asumir que Cotización
tiene el mismo botón de edición en su diálogo — hoy no lo tiene, aunque el backend
lo soporte.

### 2026-09-23 — Hardening Fase 1-2 (unicidad, gate CI, resiliencia Siesa)
Decisión:
- **Cotizacion.erpRowId**: unicidad por tenant con índice único FILTRADO
  `Cotizacion_tenantId_erpRowId_filtered_uq` (WHERE erpRowId IS NOT NULL), por SQL
  manual — NO `@@unique` (SQL Server trata NULL como comparable; la 2ª cotización sin
  vincular ya lo violaría). Misma técnica que PedidoComercial. `asignarErpCotizacion`:
  mismo erpRowId ya vinculado → 200 idempotente (sin Siesa ni auditoría duplicada);
  erpRowId distinto o CDV ya usado por otra cotización del tenant → 409; P2002 → 409;
  update condicional (`erpRowId IS NULL`) + auditoría en UNA `$transaction`;
  cotización de otro tenant → 404 (nunca revela existencia ajena).
- **Despacho**: `@@unique([tenantId, siesaDocRowId])` plano (campo NOT NULL). `crearDespacho`
  crea despacho+líneas+auditoría en una `$transaction` (cliente base `prisma`, no
  `tenantPrisma`, fijando tenantId); P2002 bajo carrera → 409, nunca 500. El
  `findFirst` previo es solo atajo, no la garantía.
- **Gate de integración obligatorio en CI**: job `backend-integration` (SQL Server
  efímero) corre `npm run test:integration:ci` = `--maxWorkers=1 --no-file-parallelism`
  (evita deadlocks P2034/P2028) + reporte JSON; `test:integration:gate`
  (scripts/verificar-integracion-sin-omisiones.mjs) falla con 0 tests, fallos u
  omitidos (`describe.skipIf(!RUN)` dejaría todo verde sin ejecutar). Job `CI gate`
  exige success de frontend/backend/integración; debe ser *required check* en main
  (ajuste manual en GitHub).
- **Pool Siesa** (config/siesa.ts): un fallo de transporte o timeout de CONEXIÓN
  invalida el pool (`invalidarSiesaPool`: descarta la instancia memoizada y cierra
  best-effort) para reconectar en la siguiente petición; también ante evento `error`
  del pool (sin listener tumbaría el proceso) o `connected=false`. Un error tardío de
  un pool viejo no invalida al nuevo. Se instrumenta `request().query/batch/execute`
  desde getSiesaPool, así los servicios siesa-*.service.ts no cambian.
- **Timeout de conexión ≠ timeout de consulta**: `connectionTimeout` 15 s vs
  `requestTimeout` 60 s. mssql usa ETIMEOUT para ambos: `ConnectionError`→invalida pool;
  `RequestError`→NO invalida (el pool está sano).
- **502 uniforme**: solo errores MARCADOS como de Siesa (Symbol `ricosoft.siesa.error`,
  `marcarErrorSiesa`, aplicado a errores de conexión y de query del cliente Siesa) se
  traducen en el manejador global a 502 con mensaje fijo. Un ECONNRESET/ETIMEDOUT de
  otra librería sigue siendo 500 genérico, nunca "Siesa no disponible".
Motivo: cerrar carreras de integridad y hacer verificable/estable la CI.
Restricciones: no usar `@@unique` sobre columnas nullable en SQL Server; no bajar el
paralelismo del gate ni permitir tests omitidos; no clasificar errores de red por
código sin la marca de origen Siesa.

### 2026-09-23 — Consecutivo MONOTÓNICO de Proforma en ConfiguracionComercial (inicio 3890)
Decisión: regla de negocio confirmada — el valor histórico inicial sigue siendo 3890.
`ConfiguracionComercial.siguienteConsecutivoProforma Int @default(3890)` es un contador
por tenant que NUNCA retrocede. Siguiente número efectivo =
max(contador, MAX(Proforma.numero)+1), calculado solo en
server/src/modules/proformas/proformas-consecutivo.ts (siguienteNumeroProforma), con
ambas consultas acotadas a `where: { tenantId }`; lo usan GET /proformas/siguiente-numero,
GET/PUT configuracion-comercial (informativos) y la creación automática. Esto REEMPLAZA la
regla del 2026-09-22 (MAX+1 puro) y la de un commit intermedio (piso solo si no hay
proformas): un manual bajo (p. ej. 5) ya NO mueve la secuencia, sigue 3890.
- crearProforma: en la misma $transaction llama avanzarContadorProforma →
  UPDATE condicional `contador < numero+1` (atómico, jamás baja; manual menor no lo toca;
  crea la fila si el tenant no tiene). Reintenta (máx. 8) ante P2002 de número AUTOMÁTICO,
  P2002 de la fila ConfiguracionComercial (carrera benigna) y P2034; manual duplicado → 409.
- GET configuracion-comercial devuelve `siguienteConsecutivoProforma` = siguiente EFECTIVO.
  PUT lo acepta opcional (sin él, contador intacto): valor < efectivo vigente → 400; solo
  sube (UPDATE condicional). Update + Auditoría (CONFIGURACION_COMERCIAL_ACTUALIZADA con
  datosAnteriores/datosNuevos) en una $transaction: si la auditoría falla, todo revierte.
- Frontend: campo "Siguiente consecutivo de Proforma" (min 3890) en
  configuracion.negocio.tsx > ConfiguracionComercialSection, muestra el 400 inline y exige
  el permiso configuracion.editar (solo lectura sin él).
- actualizarProforma (editar el número de un borrador) no avanza el contador; el MAX(numero)
  del cálculo evita igualmente reusar un número.
Restricciones: no calcular el consecutivo fuera del helper; no bajar el contador (ni por
PUT ni por números manuales); migración 20260923140000 (aditiva, default 3890).

### 2026-09-23 — Trazabilidad de Compromiso de Inventario Siesa en Pedidos Comerciales
Decisión (dictamen Lead Architect): el Comprometido de Inventario NO se traslada ni
elimina: sigue en /inventario/comprometidos, ahora rotulado "Comprometido en Siesa".
Gestión Comercial → Pedidos gana trazabilidad de SOLO LECTURA vinculando
`PedidoComercial.erpRowId = t430_cm_pv_docto.f430_rowid` (documento PDV).
- Servicio: server/src/modules/comercial/pedidos-compromiso.service.ts. Une ÚNICAMENTE por
  erpRowId = f430_rowid (+ f430_id_cia = cia del tenant y f430_id_tipo_docto = 'PDV'); nunca
  por número visible ni cliente. Las Proformas jamás cuentan como comprometidas (no se
  consultan). Siesa se lee EN LOTE (1 consulta por cada 500 pedidos vinculados, `IN` con
  parámetros; sin N+1). siesaCiaId sale solo del Tenant autenticado (resolverCiaSiesa);
  ciaId/tenantId del querystring se ignoran. Todo acotado por tenantId.
- DTO por pedido: separa estadoComercial (RicoSoft), estadoSincronizacion (NO_VINCULADO si
  no hay erpRowId) y `siesa.estadoOperativo` (determinarEstadoPedidoVentaSiesa sobre flags
  reales), más cantidades pedida/comprometida/remisionada/facturada. `compromiso` ∈
  SIN_VINCULO_ERP | SIESA_NO_ENCONTRADO | NO_COMPROMETIDO (cant. comprometida = 0) |
  COMPROMETIDO (> 0).
- Endpoints (permiso pedidos_comerciales.ver): GET /comercial/pedidos/:id/compromiso-inventario
  (404 si es de otro tenant; 400 si el tenant no tiene siesaCiaId y hay vínculo; 502 con mensaje
  fijo si Siesa falla) y GET /comercial/pedidos?incluirCompromiso=true (enriquece la página en
  un solo lote; si Siesa falla el listado responde 200 con compromisoDisponible=false).
- Frontend: panel "Compromiso de Inventario" (components/panel-compromiso-inventario.tsx,
  textos en lib/compromiso-inventario.ts) en comercial.pedidos.$id.tsx: "Sin vínculo ERP",
  "No comprometido" y enlace a /inventario/comprometidos?pedido=<PDV> (solo con analitica.ver).
Restricciones: no unir por número/cliente; no contar proformas; no consultar Siesa por pedido;
no aceptar ciaId/tenantId del cliente; RicoSoft nunca escribe hacia Siesa.

### 2026-09-24 — Máquina de estados de Proforma y consecutivo de Pedido Comercial
Decisión (dictamen Lead Architect):
- **Proforma.estado** (String VARCHAR(20), default "ENVIADA"): ENVIADA → ACEPTADA →
  PEDIDO_CREADO; ANULADA desde ENVIADA/ACEPTADA. Sustituye a "activa"/"anulada" (la migración
  20260924100000 convierte los datos; además pasa a PEDIDO_CREADO las "activa" que ya tenían
  pedido). PEDIDO_CREADO y ANULADA son INMUTABLES: no admiten edición (PATCH), vincular ERP,
  aceptar ni anular → 409. Fuente única: modules/proformas/proformas-estados.ts (espejo front:
  src/lib/proforma-estados.ts). Las reglas "cotización ya tiene proforma activa" ahora son
  `estado != ANULADA` (una PEDIDO_CREADO sigue bloqueando otra proforma de la misma cotización).
- **POST /api/proformas/:id/aceptar** (PROFORMAS_GESTIONAR): solo ENVIADA → ACEPTADA; UPDATE
  condicional + auditoría PROFORMA_ACEPTADA (antes/después) en una $transaction (dos aceptaciones
  simultáneas: un 200, un 409). anular también es condicional y transaccional.
- **POST /api/comercial/proformas/:id/pedido**: solo con proforma ACEPTADA (si no, 409). En UNA
  $transaction: crea el pedido, pasa la proforma a PEDIDO_CREADO con `updateMany WHERE estado =
  'ACEPTADA'` (count 0 → rollback + 409), avanza el contador y audita. Máximo UN pedido por
  proforma: índice único FILTRADO `PedidoComercial_tenantId_proformaId_filtered_uq` (WHERE
  proformaId IS NOT NULL, SQL manual como los de erpRowId; NO @@unique); su P2002 → 409.
- **Consecutivo de pedido**: `ConfiguracionComercial.siguienteConsecutivoPedidoComercial Int
  @default(1)`, monotónico por tenant. Siguiente = max(contador, MAX(PedidoComercial.numero)+1)
  (modules/comercial/pedidos-consecutivo.ts), avance por UPDATE condicional dentro de la
  transacción de creación; reintenta P2002 de número/fila del contador y P2034 (máx. 5).
- Handlers con $transaction deben capturar errores (Express 4 no maneja rechazos async: sin
  try/catch la petición se cuelga). aceptar/anular ya devuelven 500 controlado.
- Frontend: Gestión Comercial ya no muestra las columnas "Documento relacionado" ni "ERP";
  detalle de proforma: "Aceptar Proforma" solo en ENVIADA, "Crear Pedido" solo en ACEPTADA, sin
  acciones en PEDIDO_CREADO/ANULADA; "Nuevo pedido" lista proformas ACEPTADA.
Restricciones: no reintroducir "activa"/"anulada"; no permitir crear pedido fuera de ACEPTADA; no
declarar @@unique sobre proformaId (NULLs); la transición a PEDIDO_CREADO siempre condicional.

### 2026-09-24 — Gestión Comercial: pestaña Pedidos con "Estado del Pedido UnoEE"
Decisión (sustituye la pestaña "Comprometido en Siesa" del mismo día): NO existe pestaña aparte;
todo vive en la pestaña **Pedidos** de Gestión Comercial (`/comercial/gestion?tab=pedidos`).
- **Bandeja de Pedidos**: GET /comercial/documentos?tipo=pedido&incluirCompromiso=true enriquece
  SOLO la página con el estado en Siesa (una consulta en lote; si Siesa falla, 200 con
  compromisoDisponible=false y se muestra el estado comercial). Por fila: con PDV vinculado →
  estado operativo UnoEE (Comprometido / No comprometido / Facturado / Retenido...,
  `etiquetaEstadoUnoee`); sin documento ERP → "Pendiente de envío a ERP"
  (src/lib/estado-pedido-bandeja.ts).
- **Detalle de pedido**: GET /comercial/pedidos/:id/estado-unoee (permiso pedidos_comerciales.ver;
  pedidos-estado-unoee.service.ts). Caso A (vinculado): cabecera {consecutivo PDV-########, estado,
  valorTotal, descuentos, impuestos} + ítems {referencia, itemRowId, descripción, cantidad, precio
  unitario, subtotal, descuentos, estado, cantidad remisionada, cantidad pendiente}. Caso B (sin
  erpRowId): banner rojo "⚠️ El pedido no ha sido enviado", sin consultar Siesa. Misma regla de
  unión (solo erpRowId = f430_rowid, cia del tenant, tipo 'PDV'). Mapeo de importes (verificar
  contra un PDV real en UnoEE): valorTotal = Σ f431_vlr_neto; descuentos = Σ (dscto_linea +
  dscto_global); impuestos = Σ f431_vlr_imp; subtotal de ítem = cantidad × precio unitario base.
- Inventario: la tarjeta "Comprometido en Siesa" se mantiene y enlaza a la pestaña Pedidos (solo
  con pedidos_comerciales.ver); `/inventario/comprometidos` solo redirige. Se retiraron la tabla
  global por ítem/PDV y el panel "Compromiso de Inventario" anterior.
Restricciones: no volver a crear pestaña independiente; no unir por número visible ni cliente.

### 2026-09-24 — Semáforo OFICIAL de estado operativo (design system)
Decisión (dictamen de auditoría visual): el flujo comercial y la integración ERP Siesa usan UN
semáforo de cinco tonos, definido como tokens en src/styles.css (`--estado-<tono>-bg|fg|border`,
expuestos a Tailwind como `bg-estado-<tono>-bg`, `text-estado-<tono>-fg`, `border-estado-<tono>-border`):
| Tono | Fondo / Texto | Uso |
|---|---|---|
| success | #ECFDF3 / #166534 | Comprometido, Facturado/Remisionado, Aprobado, Aceptada, Pedido creado |
| warning | #FFFAEB / #92400E | Pendiente de envío a ERP, Retenido, Backorder, Pendiente de aprobación, Enviada |
| danger  | #FEF3F2 / #B42318 | Error, "El pedido no ha sido enviado", No encontrado en Siesa, Anulada |
| info    | #EFF6FF / #1D4ED8 | Vinculado, Parcialmente remisionado/facturado |
| neutral | #F1F5F9 / #475569 | Sin vínculo, No comprometido, estados sin semántica |
- Fuente única del mapeo estado→tono: src/lib/estado-tono.ts (`tonoDeEstado`); `EstadoBadge`
  (components/ui/badge.tsx) y las variantes `success|warning|danger|info|neutral` de `Badge` lo usan.
  Ninguna vista define colores de estado por su cuenta (nada de `bg-amber-50` suelto).
- Reemplaza la regla anterior "los estados no se codifican por color". Las ACCIONES (botones,
  `--success/--destructive/--warning`) siguen monocromas: los tokens de estado son adicionales.
  El color nunca es el único canal: ícono + texto.
- Accesibilidad: cada par bg/fg cumple WCAG AA (≥ 4.5:1) — lo verifica src/lib/contraste.test.ts
  leyendo styles.css. Texto secundario: slate-500 (AA) — NO usar slate-400 para texto (2.5:1).
- Tablas: `<Table density="compact">` (cabecera h-9, celdas px-3 py-1.5 text-xs) para bandejas y
  detalle de ítems; `numeric` en TableHead/TableCell (text-right + tabular-nums); estados de
  carga/error/vacío con `TableMessageRow` y `EstadoCarga`/`EmptyState` (ui/empty-state.tsx).
  Default "normal" = densidad histórica (las tablas existentes no cambian).
Restricciones: un estado nuevo se registra en estado-tono.ts (no en la vista); no modificar los
hex del semáforo sin actualizar contraste.test.ts y esta entrada.

## 17. Cómo mantener esta memoria

Añadir una entrada cuando exista:

- una decisión arquitectónica;
- una regla de negocio aprobada;
- un contrato API importante;
- una decisión de seguridad;
- una integración externa confirmada;
- una migración relevante;
- una corrección de un bug crítico;
- una restricción que deba evitar regresiones.

No registrar:

- cada archivo tocado;
- cada test ejecutado;
- conversaciones triviales;
- hipótesis no confirmadas;
- información temporal sin valor futuro.

Formato recomendado:

### YYYY-MM-DD — Título
Decisión:
Motivo:
Impacto:
Restricciones:
