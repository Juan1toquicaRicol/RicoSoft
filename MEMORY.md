# MEMORY.md — RicoSoft Enterprise

Este archivo contiene memoria técnica y decisiones permanentes del proyecto.
No es un diario de conversaciones. Solo deben registrarse decisiones, reglas,
arquitectura, contratos, integraciones, hallazgos importantes y cambios que deban
sobrevivir a nuevas sesiones de Claude Code.

Última actualización de referencia: 2026-09-22.

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
