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

Cadena real de datos (verificada 2026-11-20):

reloj Anviz (TCP/IP en la LAN, configurado en la tabla FingerClient del MDB)
-> CrossChex Standard (aplicación de escritorio) -> CrossChex.mdb -> RicoSoft (ODBC, cada minuto).

- RicoSoft NO se comunica con el reloj. Si CrossChex Standard está cerrado, o abierto
  sin "control en tiempo real" activo para el dispositivo, las marcaciones se quedan en
  el reloj y RicoSoft reporta corridas COMPLETADO con 0 leídas (no es un fallo de RicoSoft).
- CrossChex no está en el inicio automático de Windows; tras cada reinicio (actualizaciones
  de Windows) hay que abrirlo y activar el tiempo real. Antes del 2026-11-20 las descargas
  eran manuales (tabla OPLog: "Descargar nuevos registros"), por eso llegaban en ráfagas
  con días de retraso.
- Mientras CrossChex descarga del reloj puede bloquear el MDB en exclusiva unos minutos;
  RicoSoft registra FALLIDO ("bloqueado exclusivamente") y se recupera solo.
- Las marcaciones pueden llegar al MDB días después de su CheckTime y fuera de orden
  cronológico; por eso el cursor es Logid y nunca CheckTime. Los Logid tienen huecos
  (~36 %), compatibles con descargas repetidas de "todos los registros".
- Catálogo oficial del MDB (tabla Status): 0=Entrada, 1=Salida, 2=Break, 3=FueraTiempo.
  En el uso real, 3 se marca al final de los turnos. El mapper de RicoSoft sigue mapeando
  1 como "OTRO"; cualquier cambio de interpretación requiere decisión explícita.
- Decisión 2026-11-20: el responsable NO quiere una alerta automática por "sin
  marcaciones nuevas"; no implementarla sin nueva solicitud.

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

### 2026-09-24 — Auditoría de seguridad y RBAC (P1/P2)
Decisión:
- **Autorregistro**: la cuenta nace `activo=false` (pendiente de aprobación de un administrador);
  no puede iniciar sesión hasta ser activada. Revierte el comportamiento "ACTIVA de una" del commit
  0f41bc7. Mensaje del registro (backend y login.tsx) alineado.
- **Errores en rutas de auth**: `AuthError` (auth.service.ts) = error controlado con mensaje para el
  usuario; cualquier otra excepción (Prisma/infra) → log interno + 500 genérico
  ("No fue posible procesar la autenticación. Por favor, intente más tarde."). Aplica a registro,
  login, seleccionar tenant y cambiar de empresa. Todo `throw` nuevo en auth.service debe ser AuthError.
- **Notificaciones**: `marcarLeida` = un solo `updateMany where { id, usuarioId, tenantId }` (count 0 → 404).
- **Analítica**: `GET /api/analitica/dashboard` exige `analitica.ver` (antes solo sesión); cada sección
  del resumen sigue filtrada por el "ver" de su módulo. analitica.test.ts verifica además que ninguna
  ruta del router quede sin permiso.
- **Permiso `comercial.proformas.aceptar`** (3 segmentos, PERMISOS_SISTEMA.PROFORMAS_ACEPTAR, backend y
  frontend): exigido por `POST /proformas/:id/aceptar` (proformas.gestionar ya NO basta). El catálogo lo
  resuelve en la sección "Aceptación de proformas" del módulo Comercial (`SeccionDef.verDe` permite que
  dependa de `proformas.ver`). Crear el pedido desde una proforma ACEPTADA conserva sus permisos actuales.
  DESPLIEGUE: los roles existentes NO lo tienen; un administrador debe otorgarlo a quien acepte proformas.
- **Config. de negocio**: la pantalla es accesible para quien EDITE alguna sección
  (`inventario.configurar` o `configuracion.editar`, src/lib/config-negocio-permisos.ts, usado por el guard,
  el menú y la página) y cada sección se muestra según su permiso. Backend: GET /inventario/configuracion
  acepta analitica.ver O inventario.configurar; GET /proformas/configuracion-comercial acepta
  proformas.ver O configuracion.editar (quien edita puede leer).
Restricciones: no exponer error.message crudo en rutas públicas; permisos nuevos de acción se declaran en
los dos catálogos (backend/frontend) y en catalogo-permisos.ts.

### 2026-09-24 — Ingesta de Cotizaciones desde Siesa CRM (CDV → Cotizacion)
Decisión:
- Fuente: t430_cm_pv_docto con f430_id_tipo_docto = 'CDV' (+ t431 líneas, t120 ítem), compañía = siesaCiaId
  del tenant; identidad = f430_rowid (`Cotizacion.erpRowId`, índice único filtrado por tenant). Lectura en
  lote (encabezados + líneas de a 500), servicio en modules/comercial/cotizaciones-siesa.service.ts.
- **Columnas reales de Siesa** (Reportes/INSPECCION-ESQUEMA-SIESA-2026-09-24.md + verificación en vivo del
  SQL): t430 → `f430_id_moneda_docto` (NO existe f430_id_moneda), `f430_fecha_vcto_cotizacion` (NO existe
  f430_fecha_vto; si viene NULL → fecha + 15 días, `vencimientoEstimado`), `f430_id_cond_pago` (+ descripción
  t208), `f430_tasa_dscto_global_cap` (expuesta en el DTO pero NO aplicada: semántica "cap" sin validar con
  UnoEE); t431_cm_pv_movto (t431_cm_pv_docto_linea NO existe) → `f431_id_unidad_medida`,
  `f431_id_lista_precio`, `f431_rowid_bodega`; IVA = `t433_cm_pv_movto_imp.f433_tasa` (porcentaje 16/19, base
  100, un impuesto por línea CDV; join por f433_rowid_pv_movto = f431_rowid + f433_id_cia, agregado con SUM).
  Moneda vacía → 'COP'. Las CDV reales están en la compañía 1 (Ricol); la 3 (Green) no tiene.
- Endpoint `POST /api/comercial/cotizaciones/siesa/sincronizar` (asyncHandler + cotizaciones.gestionar),
  body `{ desde?, limite? (1-200), guardar? }`. Sin `guardar` solo SIMULA. Con `guardar: true`, cada documento
  en su PROPIA $transaction (cotización + ítems + Auditoría COTIZACION_SIESA_CREADA/ACTUALIZADA): NUEVA →
  crea BORRADOR (numero = consecutivo interno de RicoSoft, `erpNumero` = "COT-CDV-<consec Siesa, mín. 5 dígitos>" (decisión 2026-09-25; antes COT-<consec>),
  erpTipoDocumento CDV, VINCULADO); YA_VINCULADA → se actualiza SOLO si sigue en BORRADOR (UPDATE condicional)
  y se reemplazan los ítems; otro estado → omitida. Un error de un documento no revierte los demás;
  la carrera entre sincronizaciones (P2002 del índice por erpRowId) se reporta como omitida.
- `lib/async-handler.ts` (asyncHandler): obligatorio en handlers async nuevos (Express 4 no maneja rechazos).
- UI: botón "Sincronizar desde Siesa CRM" (solo cotizaciones.gestionar) en la pestaña Cotizaciones de Gestión
  Comercial; diálogo con `desde`, "Simular" y "Sincronizar y guardar", resumen Nuevas creadas / Ya vinculadas.
Restricciones: no aceptar ciaId/tenantId del cliente; no pisar cotizaciones que ya no son BORRADOR; RicoSoft
nunca escribe hacia Siesa.

### 2026-09-25 — Auditoría inmutable (ISO 27001 A.12.4)
Decisión: se eliminó la FK `Auditoria_usuarioId_fkey` (migración `20260925150000_rbac_auditoria_inmutable_fk`,
que además crea el índice `Auditoria_usuarioId_idx`) y la relación Prisma `Auditoria.usuario` /
`User.auditoriasHechas`. `Auditoria.usuarioId` queda como columna sin FK. `eliminarUsuario` ya no hace
`auditoria.updateMany`, y el evento `USUARIO_ELIMINADO` se escribe DENTRO de la misma `$transaction` que el borrado
(si falla la auditoría, se revierte todo).
Motivo: impedir la mutación indirecta de filas históricas (antes, borrar un usuario forzaba
`UPDATE Auditoria SET usuarioId = NULL`).
Impacto: el actor (vigente o eliminado) se resuelve EN LECTURA con `adjuntarActores` (`server/src/lib/auditoria-usuarios.ts`):
usuario vigente o, si fue eliminado, el snapshot `{nombre,email}` de su evento `USUARIO_ELIMINADO` (mismo tenant).
Todo lector de Auditoria que necesite el nombre del actor debe usarlo (ya no existe `include: { usuario }`).
`scripts/purgar-auditoria.ts` es solo CLI: exige `--dry-run` previo (vigencia 24 h) antes de `--confirm` y anexa a
`server/logs/purga-auditoria.log` (hash encadenado); ningún controlador HTTP lo invoca.
Restricciones: queda PROHIBIDA cualquier mutación (`UPDATE`/`DELETE`) sobre la tabla `Auditoria` desde código de
aplicación; la única excepción es la purga por retención del script anterior. Solo `INSERT`.

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

### 2026-09-28 — Endurecimiento de Bandeja de Importaciones y Tracking Marítimo
Decisión: (1) El tracking marítimo con proveedor `mock` queda bloqueado (ciclo periódico y "Sincronizar ahora" → 409) salvo `TRACKING_MARITIMO_PERMITIR_SIMULADO=true`. (2) La ingesta trae los mensajes más antiguos primero, pagina Gmail, aplica `IMPORTACIONES_MAX_ATTACHMENTS_PER_RUN` por corrida sin truncar correos y deja en ERROR (con detalle) el correo cuyo adjunto no se pudo descargar. (3) El procesamiento respeta proveedor/orden fijados por una persona y reprocesar es idempotente (reemplaza extracciones y excepciones ABIERTAS). (4) Un adjunto con error de extracción genera excepción `OTRO` y el correo no queda RESUELTO. (5) `pdf-text.ts` copia el Buffer a un `Uint8Array` propio (pdf.js ignora `byteOffset`).
Motivo: auditoría del módulo (2026-09-28): riesgo de datos simulados registrados como reales, pérdida silenciosa de adjuntos/correos y estados que dejaban correos detenidos.
Impacto: server/src/modules/importaciones/*, integrations/email, integrations/maritime-tracking, integrations/document-extraction.
Restricciones: PENDIENTES sin decisión — triage `/sin-asignar` sigue usando `isSuperadmin` de sesión (que puede venir de una membresía de tenant); requisitos cumplidos por clasificación de asunto/archivo; búsqueda de producto usa el número de orden; consecutivos `IMP-año-n` sin restricción única; aprobación previa a pagos.

### 2026-10-05 — Importaciones: novedades automáticas, triage y atomicidad (implementación acotada aprobada por Codex)
Decisión: (1) Una novedad AUTOMÁTICA representa la condición observada y solo la resuelve el SISTEMA cuando la condición deja de cumplirse: `resolverNovedadImportacion` responde 409 para `automatica=true` y la UI oculta el botón Resolver. Su ciclo de vida vive en un solo helper (`importaciones-novedades-automaticas.ts`, usado por el motor de seguimiento y el job de tracking): una fila por (orden, regla); condición vigente y fila Resuelta → se REABRE, sin importar quién la resolvió. Una fila heredada resuelta manualmente con la condición vigente NO se suprime: se vuelve a mostrar y el evento `Novedad automática reabierta` registra solo datos ciertos de la fila anterior (id de la novedad, `responsableResolucionId`, nombre y fecha) e indica que el comentario original permanece en el evento `Novedad resuelta` del historial de la orden, que nunca se borra (no se copia por proximidad temporal: ese evento no guarda el id de la novedad). Cada resolución/reapertura automática se escribe en `ImportacionHistorial` en la misma transacción; cambios condicionales (`updateMany`) y P2002 de carrera tolerado. (2) Toda alerta automática (actividad vencida/bloqueada, variación de ETA, falta de actualización) nace con `origen = PorDeterminar`; el responsable de la actividad es contexto, nunca causa; el proveedor de datos de tracking no se asigna como responsable. (3) Rutas `/api/importaciones/bandeja/sin-asignar*` DENEGADAS (403) para todos: `isSuperadmin` es por tenant (usuario hogar o Membresia), no identidad de plataforma; los correos sin tenant quedan en REQUIERE_REVISION hasta que se apruebe una identidad de plataforma. (4) Se eliminó la búsqueda de productos SIESA con el número de orden (no hay matching de producto). (5) Atómicos: crear lote + historial + actividades (+ confirmar orden), crear novedad + historial, cambio de estado/embarque del lote + historial. (6) Con tracking `mock` habilitado explícitamente, novedad/historial/notificación/inbox llevan el prefijo `[SIMULADO]`; el bloqueo por defecto se mantiene.
Motivo: auditoría 2026-10-05 (GET del detalle devolvía 500 al resolver a mano una novedad automática vigente; atribución automática sin evidencia; triage cross-tenant por flag de tenant).
Restricciones: no volver a crear una novedad automática si ya existe la fila de su regla; no suprimir una novedad automática vigente por resolución manual; no atribuir causa en alertas; no reactivar `/sin-asignar` con `requireSuperadmin`. Pendientes sin decisión de negocio: flujo explícito para declarar una alerta automática "no aplicable" (lo definirá Comercio Exterior; hasta entonces no existe); identidad de plataforma para el triage; sincronización dentro del GET; requisitos por evidencia real; fechas originales; consecutivos concurrentes; correcciones post-cierre; aprobación de pagos; reglas de cierre.

### 2026-10-05 — Importaciones: consecutivo anual IMP-año-n asignado en el servidor (implementación solicitada)
Decisión: (1) `codigo` y `numeroOrden` de una orden internacional nueva son SIEMPRE el mismo valor `IMP-<año>-<n>` (n con mínimo 3 dígitos), asignado en el servidor DENTRO de la transacción que crea la orden; un `numeroOrden`/`codigo` enviado por el cliente se ignora. Serie por tenant y por AÑO calendario de Colombia (`America/Bogota`, no UTC); al cambiar de año empieza una serie nueva en 1. (2) Tabla `ConsecutivoImportacion (tenantId, anio, siguienteConsecutivo)` con `@@unique(tenantId, anio)` y FK a Tenant `ON DELETE CASCADE` (migración aditiva `20261005130000_consecutivo_importacion_anual`; NO es la migración de alineación de Compras, que sigue solo como propuesta en `server/docs/`). Siguiente efectivo = max(contador, MAX(consecutivo de `codigo`/`numeroOrden` del año, incluidas órdenes anuladas y eliminadas) + 1): un número usado nunca se reutiliza y el mínimo se calcula desde los códigos existentes (tras IMP-2026-009 → ≥ IMP-2026-010). Código única fuente: `modules/importaciones/importaciones-consecutivo.ts`. (3) Concurrencia: compare-and-set sobre la fila del contador (`UPDATE … WHERE siguienteConsecutivo = <leído>`); perder la carrera (count 0), el P2002 de la primera creación de la fila y P2034 reintentan la transacción completa (máx. 10; después 409). (4) Configuración de negocio: `GET /importaciones/consecutivo` (importaciones.crear O configuracion.editar; es un ESTIMADO, no reserva) y `PUT /importaciones/consecutivo` (configuracion.editar; solo hacia arriba; 400 si es inferior al efectivo; actualización + `Auditoria` CONSECUTIVO_IMPORTACION_ACTUALIZADO en una transacción). (5) «Responsable de la importación»: solo usuarios ACTIVOS con permiso efectivo de crear o gestionar (importaciones.crear o importaciones.gestionar_transito, con sus prerrequisitos) en el tenant activo, calculado con el mismo cálculo de la sesión (rol, permisos directos con revocación, rol inactivo, superadmin, membresías) vía `listarUsuariosConAlgunConjuntoDePermisos` (lib/permissions.ts); la API valida la misma condición al recibir `responsableId` (400 si existe pero no es elegible; 404 si no existe en el tenant). (6) UI: el número se muestra como estimado, no editable, "se confirma al guardar"; tras crear se muestra el número devuelto por la API; listado/detalle no imprimen `numeroOrden` si es igual a `codigo`; se eliminó el panel «Preparación de la orden» (se conservan validación y diálogo de verificación final).
Motivo: la generación anterior (`count()+1`) podía duplicar códigos bajo concurrencia y `numeroOrden` era libre.
Restricciones: no volver a aceptar `numeroOrden` del cliente; no calcular el consecutivo fuera de `importaciones-consecutivo.ts`; no reutilizar números de órdenes anuladas; no editar identificadores históricos. Pendiente de decisión de negocio: la Bandeja Inteligente identifica la orden por `numeroOrden contains <PO del proveedor>`; con numeración IMP ese cruce ya no funciona para órdenes nuevas (cae a "una única orden abierta del proveedor" o excepción ORDEN_NO_IDENTIFICADA) — hace falta un campo propio para la PO del proveedor. Sin índice único de BD sobre `OrdenCompraIntl.codigo/numeroOrden` (puede haber duplicados históricos por el método anterior): la unicidad la garantiza el contador.

### 2026-10-06 — Gestión Humana: catálogo de cargos y "Detalles" del colaborador
Decisión: (1) "Colaborador" en Gestión Humana = modelo `Empleado` (no `Colaborador`, que es de usuarios/departamento). Catálogo `CargoColaborador` por tenant (tenantId NOT NULL, sin cargos GENERALES), `@@unique(tenantId, nombreNormalizado)` (sin tildes/mayúsculas/espacios; el nombre visible se conserva), flags `activo` y `correoCorporativoRequerido` (default true). Nunca se borra: se desactiva. `Empleado.cargoId` nullable + `Empleado.cargo` texto se conserva como snapshot (renombrar un cargo NO reescribe el texto histórico). Departamento (`Empleado.area`) sigue en su flujo, sin vincularse al cargo. (2) `Empleado.correo` pasó a NULL-able. Regla única en `server/src/lib/cargos.ts` (espejo de UI en `src/lib/cargos.ts`): cargo con correo requerido, o sin cargo del catálogo (histórico) → obligatorio; cargo opcional → vacío = null; si se diligencia siempre debe ser corporativo. Se revalida al crear y en `PATCH /gestion-humana/empleados/:id` (cargoId/correo); un cargo inactivo no se puede asignar a nuevos ni cambiar hacia él, pero se conserva si ya lo tenía. `cargoId` es opcional al crear (sin cargo = regla histórica). (3) Detalles: `EmpleadoDetalle` (EPS, ARL, dirección, 2 teléfonos; todo opcional), `EmpleadoFamiliar` (solo nombre y parentesco), `EmpleadoEstudio` (título, institución), `EmpleadoDocumento` (CERTIFICADO_BANCARIO único por colaborador | SOPORTE_ESTUDIO). Sin datos bancarios ni de terceros más allá de lo anterior (agregar cualquier otro requiere aprobación). (4) Soportes: reutilizan `crearUploadArchivo` (PDF/PNG/JPG/WEBP, 10 MB, magic bytes, temp → `moverArchivoDefinitivo` solo tras validar tenant) en `uploads/empleados-documentos/<empleadoId>/`; descarga solo por `GET /empleados/:id/documentos/:documentoId/archivo` (attachment, nosniff, no-store, auditada ANTES de entregar; `archivoRuta` nunca sale al cliente). (5) Permisos nuevos (no se otorgan por backfill: son datos sensibles): `cargos.ver`, `cargos.gestionar` (sección "cargos", exigeVer), `empleados.editar`, `empleados.detalles_ver`, `empleados.detalles_editar`, `empleados.documentos_ver`, `empleados.documentos_gestionar`; las rutas de detalles exigen además `empleados.ver` (`requireAllPermissions`). `/cargos/opciones` (solo activos) acepta empleados.crear|editar o cargos.ver. (6) Auditoría en la misma `$transaction`; solo nombres de campos/tipo de documento, nunca valores ni nombres de archivo.
Motivo: requerimiento de Gestión Humana (cargos con correo configurable, detalles y soportes del colaborador).
Impacto: migración aditiva `20261006100000_cargos_detalles_colaborador`; `server/src/modules/gestion-humana/{cargos,empleado-detalles,empleados}.controller.ts`; `src/components/gestion-humana/*`.
Restricciones: no volver a hacer obligatorio el correo por defecto en cargos opcionales; no exponer rutas de archivos ni servirlos estáticamente; no eliminar cargos físicamente. PENDIENTES sin decisión: confirmación legal/retención de datos de salud y bancarios (Ley 1581/2012) — no se afirma cumplimiento automático; FK compuesta tenant-cargo (hoy la coherencia de tenant la impone la aplicación); la migración y las pruebas de integración no se ejecutaron contra una BD desechable (no hay una configurada).

### 2026-10-28 — Gate de integración en CI: catálogos, dobles de SIESA y sincronizador
Decisión: (1) El job `backend-integration` ejecuta `npm run catalogos:sincronizar` tras `prisma migrate deploy`: los catálogos GENERALES (CatalogoValor con tenantId null: INCOTERM, METODO_PAGO, MONEDA, PAIS_ORIGEN, FORMA_PAGO...) no los crea ninguna migración, y sin ellos la creación de órdenes y pagos responde 400. (2) `inventario-comprometidos.integration.test.ts` usa un doble de `config/siesa` (vi.mock) y su propio tenant con siesaCiaId ficticio; ninguna prueba de CI se conecta a SIESA real. (3) `auth-register.integration.test.ts` reutiliza el tenant `ricol.com.co` si existe y, si no, lo crea y lo borra solo si lo creó. (4) `sincronizarCatalogosGenerales` excluye por id la fila canónica recién creada al desactivar duplicados heredados: con la collation por defecto de SQL Server (sin distinguir mayúsculas) `Transferencia`/`TRANSFERENCIA` y `Cheque`/`CHEQUE` son la misma clave y la sincronización apagaba la fila que acababa de crear (pagos 400).
Motivo: PR #1 — Backend integration fallaba con 44 pruebas falladas y 52 omitidas; el gate anti-omisión se mantiene sin cambios.
Impacto: .github/workflows/ci.yml, server/src/lib/catalogos-generales.ts, pruebas de integración de auth, facturas-siesa e inventario.
Restricciones: no desactivar ni debilitar el gate; la limpieza de Auditoria en pruebas se acota al tenantId de los tenants creados por esa prueba, nunca global. PENDIENTES sin verificar: filas METODO_PAGO TRANSFERENCIA/CHEQUE en bases reales (QA/producción) donde el sincronizador corrió antes del arreglo; handlers de importaciones devuelven 400/500 (no 404) ante un id que no es UUID.

### 2026-11-18 — Verificación del correo en el autoregistro (código de 6 dígitos)
Decisión: (1) Alcance: solo el AUTOREGISTRO; el login, JWT, tokenVersion y selección de empresa no cambian (no hay 2FA en el login). (2) Al registrarse se envía un código de 6 dígitos al correo; la cuenta nace inactiva como antes y con `User.emailVerificacionPendiente=true` hasta escribirlo (`emailVerificadoAt` guarda cuándo). (3) Con la verificación activa, un administrador NO puede activar una cuenta con el correo sin verificar (409 en `cambiarEstadoUsuario`); desactivar no se bloquea. (4) Si alguien se registra con un correo que ya tiene un registro pendiente de verificar, se responde 409 y el frontend pasa a la pantalla del código para escribirlo o pedir otro; no se sobrescribe la cuenta. (5) Código: solo se guarda HMAC-SHA256 (secreto JWT_SECRET) en `CodigoVerificacionCorreo`, vence a los 10 min, un solo uso, máx. 5 intentos (contados atómicamente), solo vale el más reciente, reenvío cada 60 s; mensajes genéricos que no revelan si un correo existe. (6) Interruptor `REGISTRO_VERIFICACION_CORREO_ENABLED` (por defecto false = registro idéntico al anterior); encendido sin proveedor de correo, el registro se rechaza (503) ANTES de crear la cuenta. (7) Auditoría: `USUARIO_CORREO_VERIFICADO` y `USUARIO_CORREO_VERIFICACION_FALLIDA` (módulo "Usuarios y seguridad"). (8) CAMBIO decidido por el responsable tras la primera prueba real (2026-11-18): verificar el correo con el código ACTIVA la cuenta automáticamente (sustituye la aprobación del administrador para el autoregistro con la verificación activa). Sigue naciendo con rol USER y cero permisos, así que no accede a nada hasta que se le asigne un rol; se audita `USUARIO_ACTIVADO` además de `USUARIO_CORREO_VERIFICADO`. Riesgo aceptado por el responsable: un buzón compartido (info@, logistica@, admin@) o de un exempleado cuyo correo siga vivo puede autoactivarse. Con el interruptor apagado el registro sigue pendiente de aprobación manual. Las cuentas verificadas ANTES de este cambio quedaron inactivas y las activa un administrador.
Motivo: requerimiento del responsable del proyecto (verificar que el correo con el que se registra es real).
Impacto: migración aditiva `20261118120000_verificacion_correo_registro`; `server/src/lib/correo-saliente.ts`; `server/src/modules/auth/{auth.errors,verificacion-correo.service,auth.service,auth.controller,auth.routes,auth.schemas}.ts`; `server/src/modules/usuarios/usuarios.controller.ts`; `src/routes/login.tsx`.
Restricciones: no encender el interruptor sin un proveedor de correo saliente registrado; no registrar el código en logs ni auditoría. Proveedor de envío DECIDIDO (2026-11-18): Gmail API con gmail.send vía cuenta de servicio con Domain-Wide Delegation (`server/src/integrations/email/google-workspace-correo-saliente.ts`), con credencial APARTE de la de lectura de la Bandeja de Importaciones (gmail.readonly). Se registra al arrancar en `index.ts` si existen CORREO_SALIENTE_MAILBOX y CORREO_SALIENTE_SERVICE_ACCOUNT_JSON (CORREO_SALIENTE_FROM = remitente visible). Remitente definido por el responsable: no-reply@ricol.com.co (alias) sobre el buzón principal departamento.sistemas@ricol.com.co; proyecto de Google Cloud valid-dragon-510015-b6, cuenta de servicio ricosoft-correo-saliente. PENDIENTES: que un administrador de Workspace autorice el Client ID de esa cuenta para gmail.send (Delegación en todo el dominio) y cargar las variables en el .env del servidor; el envío real NO está probado. Migración generada pero NO aplicada a ninguna base. Si el administrador cambia el correo de un usuario (`cambiarEmailUsuario`), no se pide verificar el correo nuevo (fuera de alcance).
