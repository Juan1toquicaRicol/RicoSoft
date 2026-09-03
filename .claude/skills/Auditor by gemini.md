# Skill: Auditoría Integral Fullstack (React + Express + Prisma + SQL Server)

Cuando se te pida "auditar la aplicación" o "ejecutar audit", debes revisar el código fuente siguiendo este protocolo y generar un informe detallado.

## Comandos de Diagnóstico Inicial
Ejecuta los siguientes comandos antes de analizar el código:
1. `npm audit --json` (revisa vulnerabilidades de dependencias).
2. `npx prisma validate` (valida la integridad del esquema de Prisma).

## Protocolo de Inspección de Código

### 1. Base de Datos y ORM (Prisma & SQL Server)
* **Revisar `prisma/schema.prisma`:**
  * Identificar modelos sin `@index` en campos clave usados en filtros (`WHERE`), ordenamiento o relaciones (`@relation`).
  * Buscar campos `String` que puedan requerir mapeos explícitos a tipos optimizados de SQL Server (evitar el uso indiscriminado de `NVARCHAR(MAX)`).
* **Revisar consultas Prisma en la API (`/src` o `/server`):**
  * Detectar patrón N+1 (consultas dentro de bucles `for`, `map`, `forEach`).
  * Validar que la instancia de `PrismaClient` sea un Singleton para prevenir el agotamiento del pool de conexiones.

### 2. Backend (Node.js & Express)
* **Seguridad:**
  * Verificar uso de `helmet` y configuración de `cors`.
  * Buscar endpoints sin middleware de autenticación/autorización (JWT/RBAC).
  * Confirmar que exista un middleware de `rate-limiting` para endpoints críticos (`/auth`, `/login`).
  * Validar sanitización de entradas (`req.body`, `req.params`) mediante esquemas (Zod/Joi).
* **Manejo de Errores y Logs:**
  * Verificar que el middleware de errores capture excepciones asíncronas y no exponga *stack traces* o errores nativos de SQL Server en producción.

### 3. Frontend (React & Tailwind CSS)
* **Rendimiento e Higiene de Componentes:**
  * Buscar renderizados ineficientes o faltas de *Code Splitting* (`React.lazy` en rutas principales).
  * Validar uso de `TanStack Query` o gestión centralizada de estado en lugar de múltiples `useEffect` realizando `fetch`.
* **Tailwind CSS:**
  * Detectar cadenas dinámicas de clases (ej. ``bg-${color}-500``) que rompan el *purging* de Tailwind.
  * Verificar el uso de `tailwind-merge` o `clsx` en componentes UI reutilizables.

## Formato del Salida del Reporte
Genera un informe final con el siguiente formato:
1. **Resumen Ejecutivo:** Puntuación de salud del código (1-10) y principales riesgos.
2. **Vulnerabilidades Críticas / Seguridad:** Lista de hallazgos con archivo y línea de código.
3. **Cuellos de Botella de Rendimiento:** Lista de consultas N+1 o problemas de renderizado/bundle.
4. **Acciones Correctivas Recomendadas:** Código corregido sugerido para los 3 problemas más graves.