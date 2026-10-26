# Runbook de despliegue — Importaciones en PC-RC-SV (PREPARADO, NO EJECUTADO)

**Estado:** borrador para revisión del director. **No se ejecutó ningún paso.** No despliegues sin autorización
explícita. Complementa `server/DEPLOY.md` (Windows + PM2), que es la guía operativa vigente.

Lo que **no** pude verificar en el repositorio (marcado para que lo confirme quien administre el servidor):
configuración `/Ricosoft` del proxy/IIS, certificados HTTPS, ruta exacta de `server/.env` en el servidor, nombre de la
base de producción, existencia de respaldos programados. **NO VERIFICADO EN EL REPOSITORIO.**

## 0. Precondiciones (no avanzar si alguna falla)

1. Decisión del director: GO para el paso de despliegue (el dictamen actual es **NO-GO para producción**).
2. Gate global de integración en verde contra QA (hoy NO lo está: ver informe, sección I).
3. Credenciales de QA rotadas (hallazgo S-1 y decisión D-10 del registro de decisiones) y `server/.env` del servidor sin cambios de secretos en el repositorio.
4. Ventana de mantenimiento acordada y usuarios avisados.

## 1. Respaldo (obligatorio, antes de tocar nada)

1. Respaldo completo de la base de producción (`BACKUP DATABASE … WITH CHECKSUM`) hecho por el administrador de BD.
2. `RESTORE VERIFYONLY` del respaldo y registro de su ubicación y hora.
3. Copia de `server/dist`, `ecosystem.config.js`, `server/.env` y de las carpetas de `uploads/` (expedientes, vistos buenos,
   órdenes, **lotes-importacion** — carpeta nueva que se crea al primer uso).
4. Anotar el commit/artefacto actualmente desplegado (para volver a él).

## 2. Rollback — preparar y PROBAR en una copia antes del día de despliegue

La migración `20261026120000_importaciones_hitos_documentos_prorrateo` es **100 % aditiva**: 2 tablas nuevas
(`LoteImportacionHito`, `LoteImportacionDocumento`) y 1 columna nullable (`CosteoImportacionDetalle.metodoProrrateoGastos`).
El código anterior ignora lo añadido, así que **revertir el código no exige revertir la base**.

- Rollback de aplicación (primero): reinstalar el artefacto anterior (`pm2 restart ricosoft-backend`). Las tablas nuevas quedan sin uso.
- Rollback de datos (solo si el director lo decide): restaurar el respaldo de la sección 1 en una base nueva, validar, y
  recién entonces repuntar. **No** se escribió un script de `DROP` para evitar un borrado accidental; si se quiere, debe
  redactarse y probarse en una copia restaurada, revisado por el administrador de BD.
- **Prueba obligatoria de rollback:** restaurar el respaldo en una base de ensayo, aplicar la migración, revertir el código
  y confirmar que la aplicación anterior funciona. Hasta que esa prueba exista, el rollback NO está probado.

## 3. Migración

1. Con el artefacto nuevo ya compilado y **sin** reiniciar el servicio, ejecutar `npm run db:migrate:status` contra la base objetivo y confirmar que solo falta esta migración.
2. `npm run db:migrate:deploy` (login con permiso DDL; no usar el login de pruebas).
3. Repetir `db:migrate:status`: sin pendientes. Registrar la salida (sin credenciales).

## 4. Despliegue de la aplicación

1. `server/`: `npm install` (solo si cambió `package.json`; no se añadieron dependencias), `npm run build`.
2. Frontend: `npm run build` y publicar el artefacto con el mecanismo vigente de la oficina (**NO VERIFICADO**).
3. `pm2 restart ricosoft-backend`, `pm2 save`, revisar `pm2 logs` sin errores de arranque.
4. Confirmar la configuración bajo `/Ricosoft` y HTTPS con certificado válido (**NO VERIFICADO**; lo confirma TI).

## 5. Smoke tests (con un tenant de prueba, nunca datos reales de otro tenant)

- Inicio de sesión y `/auth/me`; cambio de tenant no muestra datos del anterior.
- Importaciones: abrir una orden, registrar un hito (llegada a puerto), adjuntar y descargar un B/L; confirmar el evento "Documento descargado" en el historial.
- Una orden anulada rechaza (400) cambios de estado, embarque, expediente y liquidación.
- Liquidación con método FOB; PESO/VOLUMEN responden 400 ("no está aprobado").
- Analítica: abre sin errores y muestra exclusiones con motivo.
- Usuario sin permiso `importaciones.gestionar_transito` recibe 403 al registrar hitos o subir documentos.

## 6. UAT

Con Comercio exterior y Contabilidad: recorrer una importación real de prueba (orden → embarque → llegada → recepción
→ liquidación) en un tenant de ensayo y firmar el acta. Las decisiones D-1…D-11 del registro canónico (`IMPORTACIONES_REGISTRO_DECISIONES_2026-10-26.md`) que sigan abiertas deben quedar listadas en el acta.

## 7. Cierre

Registrar hora de inicio/fin, resultado de cada smoke test, versión desplegada y quién autorizó. Actualizar `MEMORY.md`
solo con decisiones permanentes aprobadas.
