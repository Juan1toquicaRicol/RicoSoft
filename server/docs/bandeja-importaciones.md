# Bandeja Inteligente de Importaciones

## 1. Qué es

Ingesta y clasificación automática de correos del buzón central de
Comercio Exterior, con extracción de datos clave, matching contra
proveedores/órdenes de compra existentes y verificación de requisitos —
sin reemplazar el juicio humano en decisiones críticas (ver §6).

## 2. Buzón V1

**`importaciones@ricol.com.co` es el único buzón que usa la Bandeja en
V1.** Es un buzón central compartido por todos los tenants del
despliegue (Comercio Exterior, Logística, Gerencia tienen acceso humano
directo desde Gmail además de lo que el sistema procesa). No hay un
buzón por tenant — el sistema determina a qué tenant pertenece un correo
recién después de identificar al proveedor remitente (ver §5).

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
| `IMPORTACIONES_EMAIL_MAILBOX` | — | Buzón a impersonar (`importaciones@ricol.com.co`). |
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
   buscando en **todos los tenants** (NIT exacto → email exacto →
   dominio → nombre normalizado). Recién ahí se conoce el `tenantId`
   (el del proveedor encontrado) y se actualiza el correo.
3. Si no se identifica un proveedor único, se crea una
   `ImportacionExcepcion` con `tenantId: null` y el correo queda
   visible solo en el triage cross-tenant
   (`GET /importaciones/bandeja/sin-asignar`), exclusivo de
   superadmin, para asignación manual.

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
- Todas las rutas de `/api/importaciones/bandeja` exigen JWT y el
  permiso puntual (`importaciones.correos_ver/procesar/resolver/configurar`),
  excepto el triage cross-tenant (`/sin-asignar*`), exclusivo de
  superadmin porque cruza tenants por diseño.
- `Auditoria` registra únicamente acciones humanas (resolver excepción,
  reprocesar, asignar proveedor manualmente) — nunca eventos
  automáticos del job, que usan el propio `estadoProcesamiento`/
  `ultimoError`/provenance como registro técnico
  (`Auditoria.usuarioId` es `NOT NULL`, no puede representar un evento
  sin usuario).

## 10. Configuración operativa

`GET /api/importaciones/bandeja/configuracion` (permiso
`importaciones.correos_configurar`) expone únicamente el estado
(habilitado/deshabilitado, buzón con máscara) — nunca el JSON de la
cuenta de servicio ni ningún secreto. Los jobs (`iniciarSchedulerIngestaCorreos`/
`iniciarSchedulerProcesamientoCorreos`) se registran en `src/index.ts`
junto a los demás schedulers existentes (Siesa, servicios de renovación)
y respetan el mismo patrón `noOverlap: true` + flag de entorno.
