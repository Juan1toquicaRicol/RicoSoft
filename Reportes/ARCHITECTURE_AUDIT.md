# ARCHITECTURE_AUDIT.md — RicoSoft Enterprise

Auditoría técnica de solo lectura. Ningún archivo de código fue modificado para producir este documento. Toda afirmación está respaldada por lectura directa del código fuente en `c:\Users\admin\Downloads\RicoSoft\RicoSoft` (commit de referencia: working tree sobre `164a2d5`).

Convención usada en todo el documento: **EXISTE** = confirmado en código. **NO EXISTE ACTUALMENTE** = buscado explícitamente y ausente. Nunca se mezcla con "debería existir".

---

## STACK TECNOLÓGICO REAL

### Backend (`server/`)
- **Runtime**: Node.js >= 20 (declarado en `engines` de `server/package.json`).
- **Framework HTTP**: Express 4.19.2.
- **Lenguaje**: TypeScript 5.5.3, compilado con `tsc` (`npm run build`), ejecutado en dev con `tsx watch`.
- **ORM**: Prisma 5.x (`@prisma/client` ^5.0.0, `prisma` ^5.0.0 como devDependency).
- **Motor de base de datos**: SQL Server (`provider = "sqlserver"` en `server/prisma/schema.prisma`), vía `DATABASE_URL`.
- **Autenticación**: `jsonwebtoken` (JWT propio, sin proveedor externo tipo Auth0/Clerk), `bcryptjs` para hashing de contraseñas.
- **Validación**: `zod` ^3.25.76, aplicada vía middleware propio (`validarBody`).
- **Seguridad HTTP**: `helmet`, `cors` (con lista blanca de orígenes obligatoria en producción), `express-rate-limit` (aplicado solo a `/api/auth/*`).
- **Subida de archivos**: `multer`, almacenamiento en disco local (no cloud storage).
- **Conexión externa**: `mssql` (paquete separado de Prisma) para una segunda base de datos SQL Server: Siesa/UnoEE, accedida de solo lectura sobre un túnel OpenVPN.
- **Testing**: `vitest` + `supertest`.
- **Package manager**: npm (`npm ci` en CI, `package-lock.json` presente en `server/`).

### Frontend (raíz del repo)
- **Framework**: React 19.2, sobre **TanStack Start** 1.168 (SSR/file-based routing) + **TanStack Router** 1.170 (enrutamiento basado en archivos, `src/routes/*.tsx`) + **TanStack Router Plugin** (generación de árbol de rutas).
- **Data fetching**: `@tanstack/react-query` ^5.101.1 está declarado como dependencia, pero **el patrón real observado en las páginas migradas (facturas, importaciones) es hooks manuales (`useState`/`useEffect` + `fetch` envuelto en `fetchAuth`/`fetchAuthUpload`/`fetchAuthBlob`) con `refresh()` explícito tras cada mutación — no uso de `useQuery`/`useMutation`.** Esto es una discrepancia entre lo instalado y lo efectivamente usado; ver DEUDA TÉCNICA.
- **UI**: Tailwind CSS v4 + shadcn/ui (primitivas Radix: dialog, dropdown, select, tabs, etc.), `lucide-react` para iconos, `recharts` para gráficas, `sonner` para toasts, `react-hook-form` + `@hookform/resolvers` (zod) para formularios.
- **Bundler**: Vite 8.
- **Testing**: `vitest` (sin `jsdom`/`@testing-library`, ver FASE 14).
- **Package manager**: **ambigüedad real** — `bun.lock` y `package-lock.json` coexisten en la raíz del repo, pero CI usa `npm ci`. Ver DEUDA TÉCNICA.

### Infraestructura / operación
- No hay Dockerfile, docker-compose, ni configuración de contenedores en el repo.
- No hay IaC (Terraform, Pulumi, etc.).
- Despliegue: **manual/fuera de banda** — no hay ningún workflow de despliegue en `.github/workflows/` (solo existe `ci.yml`, ver FASE 14/CI-CD).
- Multi-empresa real: Ricol, Flexipack de Colombia y Green Solutions, identificadas por dominio de correo corporativo (`ricol.com.co`, `flexipackdecolombia.com`, `greesolutions.com.co`) y por `Tenant.siesaCiaId` para la integración con Siesa.

---

## ARQUITECTURA

**Patrón real: monolito modular por dominio de negocio ("module-per-folder"), sin capas de dominio/aplicación explícitas.**

No es Clean Architecture, no es Hexagonal, no es CQRS, no es un MVC clásico (no hay "Vistas" en el backend — es una API pura). Es, con precisión:

```
Request
  → Express Router (module.routes.ts)
  → authenticateJWT (JWT válido + tokenVersion vigente + tenant activo)
  → requirePermission(clave) | requireSuperadmin   [autorización]
  → validarBody(zodSchema)                          [forma del payload]
  → Controller (module.controller.ts)               [lógica de negocio INLINE + acceso a datos INLINE]
  → prisma.<model>.findMany/create/update/delete     [Prisma Client directo, sin repositorio]
  → serializar*() función local                      [reshape manual a JSON de respuesta]
  → Response
```

- **Capas reales**: Router → Middleware (auth/validación/upload) → Controller. **No existe capa de "servicio" ni "repositorio" separada** en la gran mayoría de módulos: el controlador llama a `prisma.<modelo>` directamente. Las únicas excepciones con un archivo `.service.ts` dedicado son `auth.service.ts` (login/registro/emisión de JWT) y `siesa-sync.service.ts` (sincronización externa) — es decir, servicio se usa solo cuando hay lógica que no encaja limpiamente en un controlador HTTP, no como capa universal.
- **DTOs**: no existen como clases/tipos formales de transferencia; los esquemas `zod` (`*.schemas.ts`) cumplen esa función de validación de entrada, y funciones `serializar*()` locales a cada controlador cumplen la función de shape de salida (por ejemplo `serializarOrden`, `serializarLote`, `serializarCosteo` en `importaciones.controller.ts`).
- **Entidades/Modelos**: son directamente los modelos Prisma (`schema.prisma`), no hay un mapeo a entidades de dominio independientes del ORM.
- **Middlewares transversales**: `auth.middleware.ts` (autenticación + autorización), `validate.middleware.ts` (validación de forma), `upload.middleware.ts` (una factory `crearUploadArchivo(carpeta)` reutilizada por facturas/solicitudes/pagos — NO por importaciones, ver IMPORTACIONES_IMPACT_ANALYSIS.md).
- **Comunicación frontend/backend**: REST puro sobre JSON, autenticación por `Authorization: Bearer <JWT>`, sin GraphQL, sin tRPC, sin WebSockets/SSE (las "notificaciones casi en tiempo real" mencionadas en commits recientes son *polling*, no push real — confirmado: `usePollingFacturas` en el frontend de facturas).
- **Frontend**: cada archivo de ruta (`src/routes/X.tsx`) es simultáneamente contenedor de datos y presentación (no hay separación contenedor/presentacional formal); la lógica de fetching vive en hooks por dominio (`src/hooks/use-*.ts`).

### Violaciones arquitectónicas identificadas (documentadas, no corregidas)

| # | Problema | Ubicación | Impacto | Severidad |
|---|---|---|---|---|
| 1 | Lógica de negocio compleja (prorrateo de landed cost NIC 2/NIC 21) vive inline dentro de un handler Express, no en una función de dominio testeable de forma aislada. | `server/src/modules/importaciones/importaciones.controller.ts` (`liquidarCosteoImportacion`, `recibirPreCompraPlanta`) | No se puede unit-testear el cálculo de costeo sin levantar Express + una request/response falsos; cualquier test real requeriría mockear `req`/`res`. Coincide con que **no hay ningún test para este módulo** (ver FASE 14). | Media |
| 2 | Catálogo de permisos (`PERMISOS_SISTEMA`) duplicado literal en dos archivos independientes (`server/src/lib/permissions.ts` y `src/lib/auth-permissions.ts`), sin fuente única de verdad compartida entre frontend/backend. | Ambos archivos | Mitigado por un test de "drift guard" (`permisos-sync.test.ts`) que falla si divergen — pero solo se detecta si alguien corre los tests antes de mergear; no hay generación automática desde un solo origen. | Baja (mitigada por test) |
| 3 | Ausencia total de capa repositorio/servicio en 17 de los 19 módulos: el controlador HTTP conoce el esquema Prisma completo y construye `where`/`include` a mano en cada función. | Todo `server/src/modules/*/*.controller.ts` excepto `auth` y `integraciones-siesa` | Cambios en el modelo de datos requieren tocar N controladores; no es un bug hoy (el código es consistente), pero escala mal si el equipo crece. Es una decisión de simplicidad deliberada y consistente en todo el proyecto, no un descuido puntual. | Baja (consistente, no aleatoria) |
| 4 | Package manager ambiguo en la raíz: `bun.lock` **y** `package-lock.json` coexisten, pero CI usa `npm ci`. | raíz del repo | Riesgo de que un desarrollador instale con `bun install` localmente y genere un árbol de dependencias distinto al que usa CI/producción, sin que nada lo detecte. | Baja |
| 5 | `@tanstack/react-query` está instalado pero el patrón de fetching real en las páginas migradas no lo usa (hooks manuales `useState`/`useEffect`). | `src/hooks/use-facturas.ts`, `src/hooks/use-importaciones.ts`, etc. | No es un bug — el patrón manual funciona — pero es una dependencia con intención arquitectónica no materializada; cualquier módulo nuevo (incluida la extensión de Importaciones) debe decidir explícitamente cuál patrón seguir, porque conviven ambos. | Baja |
| 6 | Dos convenciones distintas de "borrado suave" coexisten sin unificar: columna booleana `eliminado` (Factura, SolicitudCompra, ServicioSuscripcion, Contrato, CreditoCliente, Empleado, OrdenCompraIntl) vs. campo `estado` reutilizado como marca de anulación (`Pago.estado = "Anulado"`). | `schema.prisma` | Ambas cumplen la misma función de trazabilidad (nunca borrar físicamente), pero un desarrollador nuevo debe aprender cuál aplica a cada tabla; no hay convención documentada que las unifique. | Baja |

---

## FRONTEND

- **Routing**: basado en archivos vía TanStack Router (`src/routes/*.tsx`); `__root.tsx` es el layout raíz.
- **Sidebar**: `src/components/app-shell.tsx`. **No es una lista estática** — se construye dinámicamente desde `GET /api/modulos/menu` (tabla `Modulo`, agrupada por `Departamento`), con un mapeo fijo string→ícono Lucide (`ICONOS_MODULO`) que **ya incluye `"Ship"` para Importaciones**, confirmando que el módulo ya está dado de alta en la tabla `Modulo` de al menos un tenant. Debajo de los módulos dinámicos se agregan dos secciones estáticas no derivadas de `Modulo`: "Mi cuenta" (siempre visible) y "Administración Global" (visible solo si `canAccessAdmin(user)`), cuyos enlaces internos se ocultan individualmente según `hasPermission(user, PERMISO_X)`.
- **Permisos en frontend**: `src/lib/session.ts` expone `hasPermission(user, permiso) = user.activo && (user.isSuperadmin || user.permisos.includes(permiso))` — un simple chequeo sobre el array plano `permisos: string[]` que devuelve `GET /api/auth/me`. No hay un hook `use-permisos` dedicado; el objeto `user` viene de `src/lib/session-context.tsx` (`useSession()`).
- **Guard de rutas**: `src/lib/route-guards.ts` define `requirePermisoGuard(permiso)` para usar en `beforeLoad` de una ruta — pero es **client-side only** (no-op en SSR: `if (typeof window === "undefined") return`), pensado como atajo instantáneo para clics en el sidebar, no como enforcement real. El enforcement real ocurre después de la hidratación, releyendo `/auth/me`. **Las rutas `/importaciones` e `/importaciones/$id` NO usan `requirePermisoGuard` en absoluto** — su única protección es ocultar botones de acción vía `hasPermission()` dentro del componente; cualquier usuario autenticado que conozca la URL puede *ver* la pantalla, aunque no pueda operar sobre ella (los endpoints del backend sí están protegidos con `requirePermission(IMPORTACIONES_VER)`, así que el listado devolvería 403 igualmente vía la llamada a la API — pero la UI misma no redirige antes de intentarlo).
- **Componentes UI compartidos**: `Table`, `Badge`/`EstadoBadge` (colores de estado), `EmptyState`, `StatCard`, `Alert` — kit consistente usado en los módulos ya migrados (facturas, solicitudes, importaciones list). `StatCard` se usa hoy solo en el dashboard (`src/routes/index.tsx`); el detalle de Importaciones usa `<div className="panel">` crudo para sus 4 tarjetas de KPI en vez de `StatCard` — inconsistencia menor, no bloqueante.
- **Patrón de archivos adjuntos** (referencia, en Facturas): input file oculto + subida vía hook (`subirArchivoFactura`) + descarga/preview vía `fetchAuthBlob` → `URL.createObjectURL` renderizado en `<iframe>` (PDF) o `<img>`. **Este patrón NO existe todavía para documentos de Importaciones** (DIM, factura comercial, certificado de origen, vistos buenos) — ver IMPORTACIONES_IMPACT_ANALYSIS.md.
- **Moneda**: un solo helper `money(value, moneda = "COP")` en `src/lib/data.ts`, basado en `Intl.NumberFormat("es-CO", { style: "currency", currency: moneda })` — ya es agnóstico de moneda (acepta cualquier código ISO), usado hoy tanto para COP como para USD en Importaciones. TRM se formatea aparte con `.toLocaleString("es-CO")` (correcto: es una tasa, no un monto).

---

## BACKEND — flujo de una petición típica

Ejemplo real, `POST /api/importaciones/lotes/:id/liquidar-costeo`:

1. Express enruta a `importaciones.routes.ts`.
2. `authenticateJWT` — valida firma JWT, `tokenVersion` vigente contra BD, tenant activo; adjunta `req.user: SessionUser`.
3. `requirePermission(PERMISOS_SISTEMA.IMPORTACIONES_LIQUIDAR)` — 403 si no lo tiene (superadmin y departamento "Sistemas" tienen bypass total).
4. `validarBody(liquidarCosteoImportacionSchema)` — zod valida forma numérica de TRM/CIF/arancel/IVA/etc.
5. Controlador `liquidarCosteoImportacion`: `findFirst({ id, tenantId })` para confirmar propiedad tenant, valida estado del lote, prorratea costos por ítem según participación FOB, escribe en una **transacción Prisma** (`$transaction`) que crea filas `CosteoImportacionDetalle`, actualiza `LoteImportacion.estado` y agrega una entrada a `ImportacionHistorial` — todo o nada.
6. Respuesta serializada vía `serializarLote()`.

Este patrón (auth → permiso → validación → tenant-check → transacción → historial) se repite de forma consistente en los 19 módulos auditados.

---

## TESTING

Inventario completo (7 archivos de test en todo el repo, todos unitarios sobre funciones puras — ninguno de integración, ninguno E2E, ninguno de componente):

| Archivo | Cubre |
|---|---|
| `server/src/app.test.ts` | `/health` 200; endpoints sin token → 401; token inválido → 403; ruta desconocida → 404. **Nunca prueba con un JWT válido real.** |
| `server/src/lib/dominios.test.ts` | `esDominioCorporativoValido()` |
| `server/src/lib/password.test.ts` | `validarPasswordSegura()` |
| `server/src/lib/permisos-sync.test.ts` | Que el catálogo de permisos backend/frontend no diverja |
| `server/src/lib/permissions.test.ts` | `parseRolPermisos()` |
| `src/lib/dominios.test.ts` | Copia frontend del mismo validador de dominio |
| `src/lib/session.test.ts` | `hasPermission()`/`canAccessAdmin()` sobre objetos `SessionUser` simulados |

**NO EXISTE ACTUALMENTE**: ningún test que verifique aislamiento multi-tenant, ningún test de autorización sobre un endpoint real vía `supertest` con un JWT válido, ningún test de componente/ruta React (no hay `jsdom`/`@testing-library` instalado en ninguno de los dos `package.json`). Los 24 archivos `.controller.ts`/`.service.ts` bajo `server/src/modules/` — incluidos `facturas`, `solicitudes` (compras), `importaciones` y `auth` — tienen **cero** cobertura de su lógica de negocio real.

---

## CI/CD

**EXISTE**: un único workflow, `.github/workflows/ci.yml`, disparado en `push`/`pull_request` a `main`/`master`, con dos jobs paralelos (`frontend`, `backend`) que corren `npm ci` → lint → typecheck (`tsc --noEmit`) → `vitest run` → build. El job backend corre `prisma generate` contra un `DATABASE_URL` placeholder (`sqlserver://localhost:1433;...`) que **nunca se conecta realmente** — ningún test hace una query real, así que basta con que Prisma pueda leer el `schema.prisma`.

**NO EXISTE ACTUALMENTE**:
- Ningún paso de `prisma migrate deploy` (ni siquiera existe un script `migrate` en `server/package.json`) — las migraciones nunca se validan contra una base real en CI.
- Ningún workflow de despliegue (build de imagen, publicación de artefacto, deploy a servidor). El despliegue es manual/fuera de banda.
- Gating de PR por checks obligatorios — eso depende de una configuración de branch protection en GitHub que no es parte del repo, no se puede confirmar desde el código.

---

## VARIABLES DE ENTORNO Y CONFIGURACIÓN

| Variable | Dónde se usa | Propósito |
|---|---|---|
| `DATABASE_URL` | `server/prisma/schema.prisma` (Prisma) | Conexión SQL Server interna |
| `JWT_SECRET` | `auth.middleware.ts`, `auth.service.ts`, `usuarios.controller.ts` | Firma/verificación de JWT. **El proceso rehúsa arrancar si falta** (`server/src/index.ts` lanza error explícito) — sin fallback hardcodeado. |
| `PORT` | `server/src/index.ts` | Puerto HTTP (default 4000) |
| `CORS_ORIGIN` | `server/src/app.ts` | Lista blanca de orígenes; **obligatoria y sin fallback en producción** (lanza error si falta); en desarrollo, si falta, permite cualquier origen. |
| `SIESA_DB_HOST/PORT/NAME/USER/PASSWORD` | `server/src/config/siesa.ts` | Conexión de solo lectura a Siesa/UnoEE sobre túnel VPN. Lanza error explícito si falta cualquiera — sin fallback. |
| `VITE_API_URL` (frontend, opcional) | `src/config/api.ts` | URL fija del backend; si se omite, se autodetecta por `window.location.hostname` (permite acceso por LAN). |

**Hallazgos de configuración**:
- **NO EXISTE** `server/.env.example` — no hay plantilla documentada de qué variables necesita un entorno nuevo.
- `server/.env.local` contiene variables (`DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_ENCRYPT`) que **no se referencian en ningún punto de `server/src`** — configuración muerta/heredada, candidata a limpieza (bajo riesgo, no es un problema de seguridad ya que `server/src/index.ts` solo carga `.env` vía `dotenv/config`, no `.env.local`).
- Todos los `.env*` están correctamente ignorados por git (`.gitignore`), y hay un commit histórico (`cc941cd`) dedicado a dejar de trackear archivos `.env` con secretos.

---

## DEUDA TÉCNICA (resumen ejecutivo)

1. Cero cobertura de test para multi-tenancy, autorización real y lógica de negocio de compras/facturas/importaciones/auth (ALTA prioridad — ver SECURITY_AUDIT.md).
2. Migración `20260826215604_tenant_dominio_activo` sin commitear en git, mientras `schema.prisma` (que sí está commiteado) ya asume que existe — riesgo de divergencia de esquema en cualquier otro clon/despliegue.
3. Ausencia de mecanismo estructural (middleware Prisma / Row-Level Security) que garantice el filtro por `tenantId` — depende 100% de disciplina manual en cada query nueva. Hoy el código es consistente (confirmado módulo por módulo), pero no hay red de seguridad si alguien lo olvida en una query nueva.
4. Sin capa de servicio/dominio para lógica de negocio compleja (landed cost de Importaciones vive en el controlador).
5. Ambigüedad de package manager en la raíz (bun.lock + package-lock.json).
6. Sin `server/.env.example`, sin `migration_lock.toml`, con variables de entorno muertas en `.env.local`.
7. Documentos aduaneros de Importaciones (`ExpedienteAduanero`, `VistoBuenoAduanero`) modelados en base de datos y serializados en las respuestas, pero **sin ningún endpoint backend que los cree/edite/permita subir archivo**, y sin UI que los muestre — ver IMPORTACIONES_IMPACT_ANALYSIS.md.

Ver `SECURITY_AUDIT.md` para la clasificación de severidad completa y `ARCHITECTURAL_DECISIONS_PENDING.md` para las decisiones que se derivan de estos puntos.
