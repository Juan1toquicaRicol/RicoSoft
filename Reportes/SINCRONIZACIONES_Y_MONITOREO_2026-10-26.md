# Sincronizaciones y monitoreo de RicoSoft — guía de operación

Para: quien administra el servidor. Escrita a partir del código del repositorio (2026-10-26). Es una **revisión del código**:
no se consultó el servidor de producción, así que lo que depende de cómo esté instalado allí aparece como "a confirmar".

---

## 1. Resumen en una tabla

Hay **5 procesos automáticos** (programados, corren solos), **1 proceso manual** (lo inicia una persona) y **1 revisión de salud** de Siesa.

| # | Proceso | ¿Qué hace? | ¿Cuándo corre? | Se habilita con (en `server/.env`) | Necesita |
|---|---|---|---|---|---|
| 1 | **Sincronización biométrica (CrossChex)** | Copia las marcaciones del reloj biométrico a RicoSoft | Cada minuto | `CROSSCHEX_SYNC_ENABLED=true` | CrossChex instalado en el servidor, ruta del `.mdb`, al menos una fuente activa |
| 2 | **Renovación de servicios** | Avisa de servicios/suscripciones que vencen en los próximos 7 días | Una vez al día, 6:00 a. m. | `SERVICIOS_RENOVACION_SYNC_ENABLED=true` | Solo la base de datos |
| 3 | **Ingesta de correos de importaciones** | Lee el buzón de importaciones y guarda los correos nuevos con sus adjuntos | Cada 5 min | `IMPORTACIONES_EMAIL_SYNC_ENABLED=true` | Cuenta de Gmail/Google Workspace configurada |
| 4 | **Procesamiento de correos de importaciones** | Clasifica los correos ya guardados y extrae datos de los adjuntos | Cada 5 min | `IMPORTACIONES_PROCESSING_ENABLED=true` | Que la ingesta (3) esté trayendo correos |
| 5 | **Tracking marítimo** | Actualiza posición, ETA y eventos de embarques en camino | Cada 30 min | `TRACKING_MARITIMO_SYNC_ENABLED=true` | Un proveedor real de tracking (hoy solo existe uno simulado) |
| 6 | **Sincronización de proveedores desde Siesa** | Trae/actualiza los proveedores de Siesa | **Manual**: la inicia una persona | No usa variable | Siesa configurado para el tenant |
| 7 | **Salud de Siesa y VPN** | Comprueba que Siesa responde | Al abrir la pantalla de monitoreo | No usa variable | Siesa configurado |

**Estado decidido para producción** (conversación del 2026-10-26): activos **1 y 2**; apagados **3, 4 y 5**
(falta la cuenta de Gmail y no hay proveedor real de tracking). El proceso 6 es manual y el 7 siempre está disponible.

Los horarios por defecto se pueden cambiar con `..._CRON` (ver la sección 8).

---

## 2. Cómo funciona el "encendido"

- Cada proceso automático se activa solo si su variable vale **exactamente `true`**, sin comillas ni espacios.
  Cualquier otro valor, o que no exista, lo deja apagado.
- Las variables se leen **una sola vez, cuando arranca el servidor**. Cambiar el `.env` sin reiniciar no hace nada.
- Los procesos se programan al arrancar pero **no corren de inmediato**: la primera corrida real es en el siguiente turno del reloj.
- Todos corren **dentro del mismo programa del servidor**. No hay cola ni programa aparte: si el servidor se detiene, se detienen todos.

---

## 3. Qué hace cada proceso, en simple

### 3.1 Sincronización biométrica (CrossChex)
```
Reloj biométrico → CrossChex Standard → archivo CrossChex.mdb → (lectura) → RicoSoft
```
1. Cada minuto, RicoSoft revisa las **fuentes biométricas activas** (se crean en **Gestión Humana → pestaña Biométrico**).
2. Lee del `.mdb` las marcaciones nuevas, desde la última que ya había guardado (`lastProcessedLogId`).
3. Las guarda de a 1000. Si una ya existe, la salta; no se duplica.
4. Cada marcación se liga al empleado si un administrador ya asoció su ID del biométrico. Si no, se guarda igual como **"sin asociar"**.
5. Deja un registro de cada corrida (`COMPLETADO` o `FALLIDO`) que se ve en **Gestión Humana → Biométrico → Sincronizaciones** (ver 4.3).

Reglas importantes:
- **Solo puede haber UNA fuente activa en toda la instalación**, la del tenant dueño del `.mdb`. La ruta del archivo es una sola para todo el servidor;
  con dos fuentes activas, las mismas marcaciones se copiarían a ambos tenants. Ahora el sistema lo **impide**:
  - Crear una fuente, o activar una inactiva, mientras exista otra activa (de cualquier tenant) responde 409 con un mensaje que no revela de quién es la otra.
  - Si por datos antiguos ya hubiera más de una activa, el proceso automático **no sincroniza ninguna**, lo deja en el log y lo marca `FALLIDO` en Monitoreo
    ("Hay N fuentes biométricas activas…"). **El botón "Sincronizar ahora" aplica la misma regla** y responde 409 con ese aviso. La solución es desactivar las sobrantes.
  - Limitación: la comprobación se hace al crear/activar, no con un índice único en la base de datos; dos peticiones simultáneas podrían pasar las dos.
    Ni el proceso automático ni el botón manual sincronizarían mientras haya más de una activa. **Pendiente (requiere migración y aprobación):** un índice único filtrado
    en la base de datos para impedirlo de raíz; antes de crearlo, la consulta de abajo debe devolver como máximo una fila.
  - Verificación manual (solo lectura, la corre el administrador de la base de datos):
    `SELECT nombre, tenantId, activa FROM FuenteBiometrica WHERE activa = 1;` — debe devolver **una fila**.
- **Candado global de instalación.** Mientras cualquier fuente tenga una corrida `EN_CURSO`: (a) no se puede **crear ni activar** otra fuente (409 "Hay una sincronización
  biométrica en curso…"), y (b) ninguna otra fuente puede empezar a sincronizar, ni por el proceso automático ni con el botón (409/omitida "Hay otra sincronización
  biométrica en curso en esta instalación…"). Así no se puede desactivar A y activar B para que B lea el mismo `.mdb` mientras A todavía corre.
  Lo operativo: si necesitas cambiar de fuente, espera a que la corrida termine. Una corrida colgada se libera sola a los 15 minutos tras reiniciar el servidor
  (`CROSSCHEX_SYNC_STALE_MINUTES`). Limitación: estas comprobaciones son de aplicación, no de base de datos; dos peticiones exactamente simultáneas podrían pasar.
- Los vínculos empleado↔biométrico ahora se buscan **por fuente** (antes por tenant y proveedor), así que el mismo ID en dos fuentes ya no puede cruzarse.
- Las marcaciones guardan la hora **tal como la marcó el reloj**, sin zona horaria. No es una hora UTC.
- No calcula jornadas, tardanzas ni horas trabajadas; solo guarda las marcaciones.
- Se puede forzar una sincronización a mano con el botón **Sincronizar ahora** (permiso `BIOMETRICO_SINCRONIZAR`): corre la fuente activa y espera el resultado.

### 3.2 Renovación de servicios
1. Una vez al día revisa los servicios/suscripciones **activos de todos los tenants** que vencen en los **próximos 7 días**.
2. Por cada uno busca a quién avisar usando la **regla de destinatarios** del evento `SERVICIO_RENOVACION_PROXIMA` de ese tenant.
3. **Si el tenant no tiene una regla activa para ese evento, no se avisa a nadie y no es un error.**
4. No repite el aviso: se identifica por servicio y fecha de renovación. Al actualizar la fecha tras renovar, el próximo ciclo genera un aviso nuevo.

### 3.3 Ingesta de correos de importaciones *(apagado en producción)*
Lee el buzón de importaciones (Gmail por cuenta de servicio) y guarda correos y adjuntos, hasta 25 correos y 50 adjuntos por corrida.
No decide nada: solo trae y guarda. El tenant se asigna después, en el procesamiento.

### 3.4 Procesamiento de correos de importaciones *(apagado en producción)*
Toma los correos pendientes (hasta 10 por corrida), los clasifica, busca a qué proveedor y orden pertenecen y extrae datos de los adjuntos.
Un error en un correo lo marca con error y **no detiene a los demás**.

### 3.5 Tracking marítimo *(apagado en producción)*
Actualiza hasta 20 lotes por corrida que estén "En tránsito", "En puerto" o "En inspección". Genera alertas de ETA y de falta de actualización.
**El único proveedor disponible es simulado e inventa datos**, por eso está bloqueado salvo que se active `TRACKING_MARITIMO_PERMITIR_SIMULADO=true`
(solo para pruebas). **No lo actives con embarques reales.**

### 3.6 Sincronización de proveedores desde Siesa (manual)
1. Una persona con permiso `INTEGRACION_SIESA_SINCRONIZAR` la inicia desde **Configuración → Integraciones Siesa**.
2. El sistema responde de inmediato y trabaja en segundo plano (estados `EN_COLA` → `EN_CURSO` → `COMPLETADO` / `FALLIDO` / `CANCELADO`).
3. **Solo una a la vez por empresa.** Si ya hay una en curso, rechaza otra con un aviso.
4. La compañía de Siesa sale del tenant de la sesión; nunca de lo que envíe el navegador.
5. Se puede cancelar mientras corre.
6. Cada corrida deja su historial (leídos, creados, actualizados, desactivados, errores). Este historial **sí persiste** aunque se reinicie el servidor.
7. **Solo lee de Siesa**; RicoSoft nunca escribe en Siesa.
8. Si el servidor se reinicia a mitad de una sincronización, al arrancar la marca como `FALLIDO` (para que no quede bloqueada).

### 3.7 Salud de Siesa y VPN
Comprueba, solo leyendo: conexión al puerto, inicio de sesión, una consulta simple y una lectura de las tablas que usa RicoSoft
(`t200_mm_terceros`, `t120_mc_items`, `t461_cm_docto_factura_venta`, `t430_cm_pv_docto`), y observa la VPN (interfaz de túnel, resolución del nombre,
puerto). **No abre, cierra ni reconecta la VPN.** El resultado se guarda 10 segundos; el botón "Volver a comprobar" lo fuerza. Nunca muestra
contraseñas ni cadenas de conexión.

---

## 4. Dónde se ve el estado

### 4.1 Pantalla de monitoreo
**Configuración → Monitoreo** (`/configuracion/monitoreo`). Requiere el permiso `INTEGRACION_SIESA_VER`. Tiene dos bloques:
- **Siesa y VPN**: estado general `OPERATIVO`, `DEGRADADO`, `CAIDO` o `NO_CONFIGURADO`, con el detalle de cada comprobación.
- **Procesos en background**: una fila por proceso, con estado, última ejecución, última exitosa, última fallida, duración, mensaje del último error y próxima ejecución.
  Se actualiza solo cada 30 segundos (sin vaciar la tabla) y también con el botón de actualizar; muestra la hora de la última actualización.

### 4.2 Qué significa cada estado de un proceso
| Estado | Significado |
|---|---|
| **No configurado** | El proceso está **apagado** (su variable no vale `true`) o nunca se registró. **No es una falla.** |
| **Programado** | Encendido y esperando su próximo turno; todavía no ha corrido desde el último arranque. |
| **En ejecución** | Está corriendo en este momento. |
| **OK** | La última corrida terminó bien. |
| **Fallido** | La última corrida falló. El mensaje muestra el motivo (una línea, sin rutas ni claves). |

En la pantalla aparecen además dos funciones con la etiqueta **"No existe"**: la sincronización automática de catálogos y la cola de notificaciones.
Se muestran a propósito para dejar claro que **no tienen ningún proceso en background**; no están rotas.

### 4.3 Otros lugares donde mirar
| Qué | Dónde |
|---|---|
| Fuentes biométricas (crear, activar/desactivar) y asociaciones empleado↔biométrico | **Gestión Humana → Biométrico → Fuentes y asociaciones** |
| Historial de cada corrida del biométrico (leídas, nuevas, duplicadas, sin empleado, duración, error) y botón **Sincronizar ahora** | **Gestión Humana → Biométrico → Sincronizaciones**. Se actualiza sola cada 30 s y muestra una franja con la última corrida |
| Marcaciones guardadas, con filtro por fechas y "solo sin asociar" | **Gestión Humana → Biométrico → Marcaciones** (la hora se ve tal cual la marcó el reloj) |
| Historial de sincronizaciones de proveedores de Siesa | Configuración → Integraciones Siesa |
| El servidor está vivo | `GET /health` responde `{"status":"ok"}`, sin iniciar sesión |
| Mensajes de cada proceso | La consola/log del servidor. Cada línea empieza con el nombre del proceso, por ejemplo `[crosschex-sync]` |

---

## 5. Qué pasa cuando se reinicia el servidor

- **El estado que muestra la pantalla de procesos programados se borra**: la memoria se reinicia, y todos vuelven a "Programado" hasta su primera corrida.
  Es normal. Lo que sí persiste en la base de datos: el historial del biométrico y el de sincronización de proveedores de Siesa.
- Al arrancar, el servidor **limpia corridas que quedaron colgadas**:
  - Siesa: todo lo que estuviera `EN_CURSO` pasa a `FALLIDO`.
  - Biométrico: lo que lleve `EN_CURSO` más de 15 minutos (configurable con `CROSSCHEX_SYNC_STALE_MINUTES`) pasa a `FALLIDO`.
  - Esto va **antes** de programar los procesos, para que un candado viejo no bloquee la primera corrida.
- Al apagarlo normalmente (Ctrl+C o `SIGTERM`), cierra de forma ordenada: deja de aceptar peticiones y cierra la base de datos y Siesa.

---

## 6. Problemas frecuentes y qué hacer

| Lo que ves | Causa probable | Qué hacer |
|---|---|---|
| Un proceso sale **No configurado** y debería estar activo | La variable no es exactamente `true`, o no se reinició el servidor | Revisa el `.env` de la carpeta `server/` (sin comillas ni espacios) y reinicia. En el arranque debe desaparecer el mensaje "Scheduler deshabilitado…" de ese proceso |
| CrossChex en **Fallido** | Ruta del `.mdb` incorrecta, driver ODBC distinto de Node en 32/64 bits, falta de permisos, o CrossChex no instalado en esa máquina | Lee el mensaje de error. Confirma `CROSSCHEX_MDB_PATH`, `CROSSCHEX_ODBC_DRIVER` y el usuario con que corre el servidor |
| CrossChex en **OK** pero no llegan marcaciones | No hay ninguna fuente biométrica **activa**, o no hay marcaciones nuevas | Revisa las fuentes en Gestión Humana → Biométrico |
| Marcaciones "sin asociar" | Falta asociar el ID del biométrico con el empleado | Un administrador las asocia en Gestión Humana → Biométrico |
| Marcaciones repetidas en dos empresas | Había más de una fuente activa leyendo el mismo `.mdb` (ahora el sistema lo impide al crear/activar) | Deja una sola fuente activa (sección 3.1) |
| CrossChex **Fallido** con "Hay N fuentes biométricas activas…" | Hay más de una fuente activa; el proceso no sincroniza ninguna a propósito | Desactiva las sobrantes en Gestión Humana → Biométrico |
| Siesa **Caído** o **Degradado** | VPN caída, host o puerto inalcanzable, credenciales | Revisa las comprobaciones de la pantalla (conectividad, SQL, VPN); mira primero la VPN |
| La sincronización de proveedores dice "ya hay una en curso" | Hay otra corriendo, o quedó colgada | Espera o cancélala desde la pantalla; si el servidor se reinició, ya se marcó como fallida |
| Renovación en OK pero nadie recibe aviso | El tenant no tiene una regla de destinatarios activa para `SERVICIO_RENOVACION_PROXIMA`, o ningún servicio vence en 7 días | Configura la regla en Configuración (reglas de destinatarios); no es un error del proceso |
| Todo vuelve a "Programado" de golpe | Se reinició el servidor | Normal (sección 5) |

---

## 7. Cosas que conviene saber (limitaciones actuales)

1. **Servidor en modo desarrollo.** El 2026-10-26 se vio que el backend corre con `tsx watch` (modo desarrollo) y el frontend con `vite`, sin PM2 ni servicio de
   Windows. En ese modo cualquier cambio de archivos en `server/src` **reinicia el backend solo** (y borra el estado de los procesos en pantalla), y si cierran la ventana o
   se apaga la máquina todo se detiene sin reiniciarse. Lo documentado en `server/DEPLOY.md` es PM2 con el build compilado; pasar a eso es una decisión de despliegue aparte.
2. **Varias instancias.** El estado de la pantalla es de **un solo proceso**. Si algún día corren dos copias del servidor, cada una mostraría solo lo suyo, y las dos programarían los mismos procesos.
   Los candados de la base de datos protegen la sincronización biométrica y la de Siesa, pero no hay protección equivalente para los otros.
3. **Sincronización de proveedores de Siesa**: no tiene programación automática; solo se hace a demanda.
4. **No hay alertas activas** (correo, WhatsApp, etc.) cuando un proceso falla: el aviso es visual en la pantalla de monitoreo y en el log. Alguien tiene que mirar.
5. **Un fallo antes de registrar la corrida** (por ejemplo, la base de datos caída justo al empezar) puede quedar solo en el log del servidor y no en el historial del biométrico.
6. **Tracking marítimo**: no hay proveedor real; seguirá apagado hasta que se integre uno.
7. **Seguimiento del biométrico:** ya tiene pantallas (sincronizaciones, marcaciones y botón de sincronizar). Siguen sin existir alertas activas fuera de la aplicación (ver punto 4).

---

## 8. Variables de configuración (solo los nombres; los valores van en `server/.env`)

| Proceso | Encender | Horario (cron) | Otros |
|---|---|---|---|
| CrossChex | `CROSSCHEX_SYNC_ENABLED` | `CROSSCHEX_SYNC_CRON` (por defecto cada minuto) | `CROSSCHEX_MDB_PATH`, `CROSSCHEX_ODBC_DRIVER`, `CROSSCHEX_CONNECT_TIMEOUT_SECONDS`, `CROSSCHEX_QUERY_TIMEOUT_MS`, `CROSSCHEX_SYNC_BATCH_SIZE`, `CROSSCHEX_SYNC_STALE_MINUTES` |
| Renovación de servicios | `SERVICIOS_RENOVACION_SYNC_ENABLED` | `SERVICIOS_RENOVACION_SYNC_CRON` (por defecto `0 6 * * *`) | — |
| Ingesta de correos | `IMPORTACIONES_EMAIL_SYNC_ENABLED` | `IMPORTACIONES_EMAIL_SYNC_CRON` (cada 5 min) | `IMPORTACIONES_EMAIL_MAILBOX`, `IMPORTACIONES_EMAIL_SERVICE_ACCOUNT_JSON`, `IMPORTACIONES_MAX_EMAILS_PER_RUN`, `IMPORTACIONES_MAX_ATTACHMENTS_PER_RUN` |
| Procesamiento de correos | `IMPORTACIONES_PROCESSING_ENABLED` | `IMPORTACIONES_PROCESSING_CRON` (cada 5 min) | — |
| Tracking marítimo | `TRACKING_MARITIMO_SYNC_ENABLED` | `TRACKING_MARITIMO_SYNC_CRON` (cada 30 min) | `TRACKING_MARITIMO_PROVIDER`, `TRACKING_MARITIMO_PERMITIR_SIMULADO`, `TRACKING_MARITIMO_DIAS_SIN_ACTUALIZACION`, `TRACKING_MARITIMO_UMBRAL_VARIACION_ETA_DIAS` |

Referencia: `server/.env.example`. **Nunca escribas contraseñas ni claves en este documento ni en el repositorio.**

---

## 9. Lista de revisión rápida (diaria / después de cada reinicio)

1. `GET /health` responde `ok`.
2. En **Configuración → Monitoreo**, bloque **Siesa y VPN**: estado `OPERATIVO`.
3. Bloque **Procesos en background**:
   - CrossChex y Renovación de servicios: `Programado` u `OK` (nunca `Fallido`).
   - Ingesta, Procesamiento y Tracking: `No configurado` (es lo esperado mientras estén apagados).
4. Biométrico: en **Gestión Humana → Biométrico → Sincronizaciones** la última corrida es "Completada" y de hace pocos minutos.
5. Una sola fuente biométrica activa (Gestión Humana → Biométrico → Fuentes y asociaciones).
6. Tras la primera mañana con Renovación activa (después de las 6:00 a. m.): `OK` y los avisos llegan solo a los tenants con regla de destinatarios.

---

## 10. Qué no se verificó

- Cómo está instalado y configurado el servidor de producción (variables reales, procesos que corren, fuentes activas, migraciones aplicadas).
- Que el driver ODBC de Access sea compatible con Node en esa máquina (en el historial del proyecto funcionó una vez, pero no confirma el estado actual).
- Que el reloj biométrico esté alimentando bien a CrossChex.
- Las pantallas nuevas del biométrico (Sincronizaciones y Marcaciones) y el refresco automático de Monitoreo: están implementadas y pasan typecheck, lint, build y las pruebas automáticas,
  pero **no se han visto funcionando en un navegador contra datos reales**.
