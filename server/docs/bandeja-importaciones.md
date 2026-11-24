# Bandeja Inteligente de Importaciones

## 1. Qué es

Ingesta y clasificación automática de correos del buzón central de
Comercio Exterior, con extracción de datos clave, matching contra
proveedores/órdenes de compra existentes y verificación de requisitos —
sin reemplazar el juicio humano en decisiones críticas (ver §6).

## 2. Buzón V1

La Bandeja usa un buzón central por instalación. Sistemas administra el
piloto en producción con `departamento.sistemas@ricol.com.co` y la
etiqueta `RicoSoft-Piloto-Importaciones`. El buzón definitivo de operación
queda por confirmar con Comercio Exterior.

## 3. Autenticación con Google Workspace

Mecanismo oficial de Google para acceso backend sin credenciales
personales: **cuenta de servicio + Domain-Wide Delegation**.

1. Crear una cuenta de servicio en Google Cloud (mismo proyecto que
   administra el Workspace) y generar su clave JSON.
2. Habilitar Domain-Wide Delegation para esa cuenta de servicio.
3. En el Admin Console de Workspace → Seguridad → Control de acceso a
   la API → Delegación en todo el dominio: autorizar el **Client ID**
   de la cuenta de servicio para el scope
   `https://www.googleapis.com/auth/gmail.readonly`.
4. El JSON completo de la cuenta de servicio se coloca en la variable
   de entorno `IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON` (nunca como
   archivo en el repo).

No se almacena ninguna contraseña de usuario, no hay scraping de
navegador ni dependencia de una sesión personal de Gmail — ver
`src/integrations/email/google-workspace-email-provider.ts`.

## 4. Variables de entorno

| Variable | Default | Propósito |
|---|---|---|
| `IMPORTACIONES_EMAIL_SYNC_ENABLED` | `false` (cualquier valor distinto de `"true"`) | Activa el job de ingesta. **Debe quedar apagado en desarrollo/tests.** |
| `IMPORTACIONES_EMAIL_MAILBOX` | — | Buzón central autorizado para la instalación. |
| `IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON` | — | JSON completo de la cuenta de servicio, como string. Secreto — nunca en el repo. |
| `IMPORTACIONES_MAX_EMAILS_PER_RUN` | `25` | Tope de correos listados por corrida de ingesta. |
| `IMPORTACIONES_MAX_ATTACHMENTS_PER_RUN` | `50` | Tope de adjuntos descargados por corrida. |
| `IMPORTACIONES_PROCESSING_ENABLED` | `false` | Activa el job de procesamiento (clasificación/extracción/matching). **Debe quedar apagado en desarrollo/tests.** |
| `IMPORTACIONES_EMAIL_SYNC_CRON` | `*/5 * * * *` | Frecuencia del job de ingesta. |
| `IMPORTACIONES_PROCESSING_CRON` | `*/5 * * * *` | Frecuencia del job de procesamiento. |

## 5. Arquitectura: tenant desconocido al ingerir

Un correo llega al buzón central sin saber a qué tenant pertenece.
`ImportacionCorreo.tenantId` es **nullable** por esto — el único modelo
tenant-scoped de la aplicación con esta excepción además de
`OrdenCompraIntl`. El flujo:

1. **Ingesta** (`importaciones-bandeja-ingesta.job.ts`): guarda el
   correo y sus adjuntos con `tenantId: null`. La idempotencia es por
   `messageId` (Message-ID RFC 5322), sin tenant en la clave única —
   nunca se sabe a cuál tenant pertenece antes de identificarlo.
2. **Procesamiento** (`importaciones-bandeja-procesamiento.job.ts`):
   clasifica el correo, extrae datos, e identifica al proveedor
   usando el correo exacto del remitente en el catálogo de proveedores.
   El dominio, la razón social y el identificador fiscal del adjunto
   aportan candidatos para revisión. Una discrepancia de identidad
   detectada impide la asociación automática. Con remitente exacto, la
   discrepancia se evalúa solo contra los proveedores de la empresa de ese
   proveedor (`hayConflictoIdentidadProveedor`).
3. Si el proveedor no se identifica de forma única, el correo queda en
   `REQUIERE_REVISION` con la excepción `PROVEEDOR_NO_IDENTIFICADO`.
   El correo sigue sin empresa y queda fuera de las bandejas de empresa.
   Las rutas `/api/importaciones/bandeja/sin-asignar*` devuelven 403.

`ImportacionCorreo` e `ImportacionExcepcion` están explícitamente
excluidos de `MODELOS_TENANT_SCOPED` en `tenant-prisma.ts` — el
controlador aplica el filtro de tenant manualmente en cada consulta.

## 6. Qué automatiza y qué no

La automatización **lee, interpreta, relaciona y propone**. Nunca
decide sola sobre algo financiero o crítico. Están explícitamente
prohibidas de forma automática: cambiar proveedor/precio/cantidad/
moneda/incoterm de una orden, aprobar compras, crear proveedores,
modificar maestros de Siesa, eliminar documentos, enviar correos,
negociar, o cualquier acción de valor. Cuando la automatización no
puede resolver algo con certeza (proveedor ambiguo, orden ambigua,
requisito faltante), crea una `ImportacionExcepcion` y notifica — la
resolución siempre la hace una persona desde
`POST /importaciones/bandeja/correos/:id/excepciones/:excepcionId/resolver`.

## 7. Extracción de documentos

Orden determinístico: **parser de texto (regex) → futuro OCR → futuro
IA**. V1 solo implementa el primero
(`RegexDocumentExtractionProvider`), sobre PDFs con capa de texto y
texto plano. Un PDF escaneado (sin capa de texto) no lanza error — solo
no encuentra campos y el correo termina en `REQUIERE_REVISION` con
`ultimoError` vacío y ninguna extracción, señal clara para revisión
manual (V1 no tiene OCR).

Cada dato extraído (`ImportacionExtraccion`) guarda: `campo`,
`valorExtraido`, `pagina`, `motorUsado`, `confianza` y `evidencia` (el
fragmento de texto de donde salió) — trazabilidad completa sin
necesitar IA.

`EmailProvider` y `DocumentExtractionProvider` son interfaces
(`src/integrations/email/email-provider.ts`,
`src/integrations/document-extraction/extraction-provider.ts`)
deliberadamente desacopladas de Gmail/regex — swappable en el futuro
(otro proveedor de correo, extracción con IA) sin tocar el resto del
pipeline.

## 8. IA

**No hay IA conectada en V1.** Toda clasificación/extracción es
determinística (reglas regex). Si en el futuro se conecta un proveedor
de IA, debe implementar `DocumentExtractionProvider` y respetar las
restricciones de privacidad ya documentadas en el audit técnico previo
(no enviar credenciales/datos financieros sin anonimizar, revisar
retención de datos del proveedor de IA, etc.) antes de habilitarse.

## 9. Seguridad y multi-tenant

- Nunca se confía en `tenantId` de `req.body`/`params` para
  autorización — el tenant del usuario autenticado
  (`req.user!.tenantId`) es la única fuente de verdad en cada consulta.
- Los adjuntos se sirven solo tras validar que el correo dueño
  pertenece al tenant del usuario (`obtenerAdjuntoBandeja`) — nunca
  hay una URL pública permanente, siempre streaming autenticado.
- La Bandeja valida JWT y el permiso correspondiente. El acceso a correos
  sin empresa está denegado, incluso para superadministradores de empresa.
- La auditoría registra acciones humanas como la resolución de excepciones
  y los cambios de configuración. El procesamiento automático registra su
  resultado mediante el estado del correo y las excepciones.
- Vincular una orden (`SELECCIONAR_ORDEN`) registra
  `IMPORTACION_EXCEPCION_RESUELTA` e `IMPORTACION_CORREO_ORDEN_VINCULADA`
  en la misma transacción que el vínculo. Crear una orden desde el correo
  registra el vínculo en la transacción que reserva el `IMP`.

## 10. Configuración operativa

`GET /api/importaciones/bandeja/configuracion` (permiso
`importaciones.correos_configurar`) expone únicamente el estado
(habilitado/deshabilitado, buzón con máscara) — nunca el JSON de la
cuenta de servicio ni ningún secreto. Los jobs (`iniciarSchedulerIngestaCorreos`/
`iniciarSchedulerProcesamientoCorreos`) se registran en `src/index.ts`
junto a los demás schedulers existentes (Siesa, servicios de renovación)
y respetan el mismo patrón `noOverlap: true` + flag de entorno.


## Panel de Sistemas y piloto con etiqueta

Configuración → Monitoreo → Correo de Importaciones permite probar la conexión,
seleccionar una etiqueta de usuario de Gmail, ajustar frecuencia y límites y
pausar o activar la lectura y el procesamiento. Sistemas crea la etiqueta en Gmail
y la aplica a los mensajes de prueba. El panel obtiene su ID al probar la conexión.

Aplicar la migración de configuración. En el servidor, definir el buzón autorizado
y la credencial de lectura existentes, IMPORTACIONES_SISTEMAS_TENANT_ID (UUID de la
empresa administradora) e IMPORTACIONES_SISTEMAS_USUARIOS (UUID de los operadores
designados separados por comas). El operador debe iniciar sesión en esa empresa
con el permiso importaciones.correos_configurar. La clave se aprovisiona fuera de la interfaz.

El piloto inicia pausado. Los ajustes guardados son globales a la instalación.
Al guardar, el proceso atiende el cambio y los demás procesos vuelven a leer la
configuración cada 30 segundos. El filtro de Gmail usa el ID de etiqueta y permite
incorporar mensajes antiguos recién etiquetados. El procesamiento del piloto toma
los correos pendientes ingresados con la etiqueta seleccionada.


## Evidencia del piloto

- En SQL Server local se verificó la ingesta de un correo y su adjunto y
  la deduplicación al repetir la ingesta. Ricol no tiene un ambiente de
  pruebas consolidado.
- En producción se verificaron la conexión de Gmail, la ingesta acotada por
  etiqueta y el procesamiento de un remitente interno. El PDF simulado
  `PO-26112401` produjo referencia de compra, Incoterm FOB, moneda USD,
  origen Vietnam, ETD y ETA. El correo conservó una excepción abierta por
  proveedor desconocido y quedó sin empresa, proveedor ni orden.
- Un ejercicio local con órdenes ficticias mostró que, al fallar la
  comparación con el consecutivo interno, el comparador devuelve la única
  orden abierta del proveedor o un resultado ambiguo si hay varias.
  La asociación positiva con un correo autorizado de proveedor sigue pendiente.

## Plan de implementación

El vínculo manual, la creación desde correo y las sugerencias quedan
implementados en el checkout local. El despliegue del piloto sigue
acotado a la etiqueta. El acceso a correos sin empresa y la ampliación
del piloto quedan pendientes.

### 1. Vincular a una orden existente

- En el detalle del correo, agregar el selector por consecutivo `IMP`
  para la excepción de orden no identificada. Reutilizar `SELECCIONAR_ORDEN`
  y el permiso de resolución existente.
- Buscar solo órdenes elegibles de la empresa activa y del proveedor
  confirmado. Validar los mismos límites al guardar. Registrar actor,
  correo, orden y resolución mediante la auditoría existente. Conservar el
  vínculo confirmado al reprocesar.
- Aceptación: una selección válida queda trazada. Una orden de otra empresa
  o proveedor se rechaza. Dos acciones simultáneas conservan un solo vínculo.

### 2. Crear una orden desde el correo

- Abrir `/importaciones/nueva` desde la Bandeja y cargar por ID el
  correo de origen dentro de la empresa activa. Reutilizar el formulario y
  el flujo de alta existentes. Mostrar como sugerencias editables el
  proveedor confirmado y los campos extraídos compatibles.
- Exigir autorización para consultar el correo, crear la orden y vincularla.
  En el guardado, volver a validar correo, proveedor y empresa. Crear la orden,
  asignar el `IMP`, vincular el correo y registrar la auditoría en una sola
  transacción. Hacer el vínculo condicional para evitar una segunda orden al
  reintentar o guardar en paralelo.
- Aceptación: guardar produce una orden y deja el vínculo al correo.
  Cancelar conserva el correo disponible. Un error de vínculo revierte la
  creación y su consecutivo.

### 3. Sugerir proveedores y resolver casos pendientes

- Reutilizar la normalización y el catálogo actuales. Incorporar el
  identificador fiscal y la razón social cuando puedan extraerse con
  evidencia del correo o adjunto. Evaluar correo exacto e identificador
  exacto como señales fuertes. Usar dominio y similitud del nombre como
  candidatos para confirmación humana. Mostrar la evidencia y los conflictos.
- Para correos con empresa conocida, consultar candidatos dentro de esa
  empresa. El acceso a correos sin empresa sigue diferido. Antes de
  habilitarlo, acordar quién puede ver esos correos, el alcance por empresa
  y la forma de asignar el futuro permiso en RicoSoft.
- Aceptación: Hanotech se sugiere en la simulación con el PDF del
  carbonato y se espera confirmación. Verificar nombres parecidos,
  remitentes compartidos y señales contradictorias.
- Cuando el documento trae una referencia explícita que difiere o
  resulta ambigua, la Bandeja deja el correo en revisión. Comercio
  Exterior aún debe definir cómo registrar la referencia externa en la orden.

### 4. Validar el flujo completo antes de ampliar el piloto

Validar con Comercio Exterior una orden conocida y una creada desde la
Bandeja. Luego recorrer expediente, embarque, recepción y liquidación.
Ejecutar regresiones con datos ficticios en una base local desechable o
en CI y mantener las pruebas en producción limitadas a mensajes
controlados por la etiqueta.


### Evidencia de la implementación local

- En navegador, una cuenta ficticia vinculó un correo de prueba a
  `IMP-2026-001`. Otro correo abrió el formulario con Hanotech,
  Vietnam, USD e Incoterm CIF precargados y quedó vinculado a la orden
  `IMP-2026-002` al guardarla. Ambos vínculos se comprobaron en SQL
  Server local desechable.
- La suite de integración cubre autorización, aislamiento entre empresas,
  vínculos y altas concurrentes, auditoría y sugerencias con evidencia.
- Una prueba determinista fuerza el fallo del vínculo después de crear la
  orden y reservar el `IMP` dentro de la transacción. Comprueba que se
  revierten la orden, el consecutivo y la auditoría, y que el reintento
  recibe el mismo `IMP`.
- Otra prueba registra el mismo proveedor en dos empresas. Con remitente
  exacto de una de ellas, el registro de la otra no bloquea el correo ni
  aparece entre sus candidatos.
- Los dos PDF ficticios de Hanotech devolvieron razón social, PO, Incoterm,
  moneda, origen, ETD y ETA al pasarlos por el extractor real.
- Pendiente: validar la extracción con PDF reales de proveedores cuando
  existan muestras autorizadas.


### Disponibilidad comercial de importaciones

En el detalle de la orden, vincula el ítem de Siesa. El formulario de creación
también conserva el vínculo cuando seleccionas un resultado compatible. Los
ítems históricos mantienen su referencia y se vinculan desde el detalle.

En cada embarque, abre **Cantidades y disponibilidad del embarque**. Registra
la cantidad asignada en la misma unidad del inventario Siesa. La suma de los
embarques no puede exceder lo comprado. Registra la recepción parcial cuando
ocurra. Para informar cuánto se registró en Siesa, indica el documento de
ingreso. La conciliación es manual y requiere permiso de recepción.

En **Ventas → ¿Puedo vender esto?**, el disponible libre se calcula con
existencia y compromisos de Siesa. Los ingresos de importación aparecen por
embarque, con las cantidades por recibir y recibidas pendientes de registrar.
Una fecha prevista de venta requiere fuente. Una ETA de puerto se muestra
por separado. Los ingresos conciliados se excluyen de la proyección.

Antes de arrancar este código, aplica la migración
`20261124180000_disponibilidad_importaciones` y regenera Prisma Client.
