# Despliegue en producción (Windows + PM2)

Este backend corre en una PC/laptop de oficina Windows (no hay datacenter ni
Kubernetes). El proceso se administra con [PM2](https://pmc.pm/) en vez de
Docker/systemd. El Dockerfile del repo sigue existiendo pero es opcional en
este contexto.

Requisitos previos en la máquina donde corre el backend:

- Node.js >= 20 instalado.
- Conectividad de red hacia la base de datos SQL Server interna y hacia
  Siesa (`SIESA_DB_HOST`) — vía LAN de oficina o Tailscale, según desde
  dónde se conecte esta máquina. **Verifica esto antes de arrancar**: si la
  base de datos o Siesa no son alcanzables, el servidor fallará al iniciar
  o al primer intento de sincronización.
- `server/.env` configurado con todas las variables reales (ver
  `server/.env.example` como referencia de qué variables existen).

## 1. Instalar PM2 (una sola vez, global en esta máquina)

```powershell
npm install -g pm2
```

## 2. Instalar el arranque automático con Windows (una sola vez)

Para que PM2 (y por lo tanto el backend) arranque solo cuando la máquina
reinicia o se enciende:

```powershell
npm install -g pm2-windows-startup
pm2-startup install
```

Esto registra un servicio de arranque de Windows que ejecuta `pm2 resurrect`
al iniciar sesión, restaurando los procesos que PM2 tenía corriendo (ver
paso 5, `pm2 save`).

## 3. Compilar el backend

Desde `server/`:

```powershell
npm install
npm run build
```

Esto genera `dist/` a partir de `src/` (vía `tsc`).

## 4. Arrancar con PM2

Desde `server/` (el `ecosystem.config.js` ya apunta a `dist/index.js`):

```powershell
pm2 start ecosystem.config.js
```

## 5. Guardar la lista de procesos para que sobreviva a un reinicio

```powershell
pm2 save
```

Esto es necesario además del paso 2: `pm2-startup` restaura la lista
guardada con `pm2 save`, así que después de cualquier `pm2 start`/`pm2
delete` nuevo, vuelve a correr `pm2 save`.

## Operación diaria

- **Ver logs en vivo**: `pm2 logs ricosoft-backend` (o `pm2 logs` para
  todos los procesos). Los logs también quedan en archivo en
  `server/logs/ricosoft-backend-out.log` y
  `server/logs/ricosoft-backend-error.log`.
- **Reiniciar** (por ejemplo tras desplegar código nuevo):
  ```powershell
  npm run build
  pm2 restart ricosoft-backend
  ```
- **Ver estado**: `pm2 status` o `pm2 show ricosoft-backend`.
- **Detener**: `pm2 stop ricosoft-backend`.
- **Aplicar migraciones de Prisma antes de reiniciar** (si hay migraciones
  nuevas pendientes):
  ```powershell
  npm run db:migrate:deploy
  ```

## Notas

- El backend maneja `SIGTERM`/`SIGINT` (ver `src/index.ts`) para cerrar
  ordenadamente: deja de aceptar conexiones HTTP nuevas, cierra la conexión
  de Prisma y el pool de Siesa, y luego termina el proceso. `pm2 restart` /
  `pm2 stop` envían esa señal, así que el reinicio no debería dejar
  conexiones a medio abrir.
- PM2 reinicia automáticamente el proceso si crashea (`autorestart: true`
  en `ecosystem.config.js`), con un tope de reintentos para no entrar en un
  loop infinito si algo de fondo está roto (por ejemplo, la base de datos
  inalcanzable).
