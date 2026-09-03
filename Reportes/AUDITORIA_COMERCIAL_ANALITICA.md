# Auditoría — Comercial / Analítica Comercial (RicoSoft)

Fecha: 2026-09-03
Alcance: SOLO AUDITORÍA (lectura de código, backend + frontend + Prisma +
Siesa + permisos + tests). No se modificó ningún archivo del repositorio
salvo la creación de este documento. Precede a la implementación P0 descrita
en el mismo hilo de trabajo.

Convenciones: ✅ CONFIRMADO · 🟡 INFERIDO · 🔴 NO EXISTE · ⚠️ PENDIENTE DE NEGOCIO

---

## 1. Estado actual de Comercial

🔴 No existe un módulo "Comercial" como tal. Lo que cumple esa función hoy
está repartido en dos módulos con propósitos distintos:

- **`/analitica`** (BI): dashboard con evolución mensual de ventas, top
  clientes/productos/vendedores, márgenes, histórico paginado de documentos.
  Todo vía Siesa en vivo.
- **`/ventas`**: "Centro Operativo Comercial" — NO es BI, es operación diaria
  (¿puedo vender esto?, productos en riesgo de quiebre, clientes en riesgo).
  El propio texto de la UI dirige explícitamente a `/analitica` para
  tendencias/márgenes.

Ambos son funcionales con datos reales, no placeholders. El problema no es
que falte código — es que "Comercial" hoy es dos cosas separadas que un
usuario de negocio esperaría ver juntas.

## 2. Mapa de datos reales disponibles

✅ Todo sale de Siesa **en vivo** (consulta SQL directa, no sincronizado a
RicoSoft — a diferencia de Proveedores, que sí se copia). Fuente:
`t461_cm_docto_factura_venta` (encabezado, 85.661 docs), `v470_ventas`
(detalle línea, 800.936 filas), `t200_mm_terceros` (cliente y vendedor —
ambos son "terceros"), `t120_mc_items` (producto).

| Dato | Disponibilidad |
|---|---|
| Cliente, producto, vendedor, fecha | ✅ confirmado, con rowid estable |
| Kilos | ✅ pero solo confiable si `unidad_medida = 'KG'` |
| Valor de venta | ✅ definido como bruto − descuento, **sin IVA** (decisión de negocio ya tomada, no una omisión) |
| Costo/margen | ✅ pero **solo a nivel de línea de detalle**, no de encabezado |
| Número de documento de venta | ⚠️ no existe consecutivo formateado en Siesa, solo rowid interno + texto libre de referencia |
| Ciudad/geografía del cliente | 🔴 no consultado en ningún lado del código — ni confirmado que exista en Siesa ni descartado |

## 3. Fuentes de cada KPI

| KPI pedido | Fuente real | Viable hoy |
|---|---|---|
| Venta total, variación | `t461` agregado | ✅ ya implementado |
| Margen % | `v470_utilidad_prom` / `v470_costo_prom_tot` | ✅ pero solo agregable desde detalle, no desde encabezado |
| Kilos | `v470_cant_base` filtrado por KG | ✅ ya implementado |
| Ticket promedio | venta total / # documentos | 🟡 no implementado, calculable con lo ya disponible |
| Tendencias / comparativo período anterior | `t461` por mes | ✅ ya implementado (serie mensual) |
| Pareto de clientes | agregación de `t461`+`t200` | 🟡 no implementado, dato base ya disponible |
| Drill-down KPI → documento Siesa | rowid de `t461` | ✅ ya existe el histórico paginado con ese detalle |

## 4. Endpoints y consultas existentes

- `GET /api/analitica/ventas` — serie mensual, top 5 clientes/mes, top 10
  productos por kilos+margen, top 5 clientes por margen.
- `GET /api/analitica/ventas/vendedores` — ranking hoy/ayer/7d/mes, detalle
  por hora, top 10 por margen.
- `GET /api/analitica/ventas/historico` — histórico paginado (drill-down a
  documento).
- `GET /api/ventas/*` — disponibilidad de stock, centro de riesgo, contexto
  de producto (costo/margen/top clientes).

Todos con `GROUP BY`/`SUM` en SQL Server (no traen detalle a Node salvo el
histórico paginado, tope 100/página). Hallazgo menor: `resumen-gerencial`
tiene un bloque `ventas: { disponible: false }` hardcodeado que contradice al
resto del archivo — código muerto de una versión anterior a que
`obtenerVentasGerencial` existiera.

## 5. Qué sobra / qué falta

**Sobra:** nada que duplique Siesa — el diseño ya evita eso deliberadamente.

**Falta:**
- Filtro global reutilizable (fecha/vendedor/cliente/producto/línea) — hoy
  cada endpoint tiene sus propios parámetros ad-hoc.
- Ticket promedio, Pareto de clientes — triviales sobre datos ya disponibles.
- Tests automatizados para `siesa-ventas.service.ts` y para los endpoints de
  `/analitica/ventas*` — hoy solo "verificados en vivo" por comentario.
- Limpieza del bloque muerto `ventas: {disponible:false}`.

## 6. Riesgos técnicos y de negocio

- **Sin caché**: cada carga del dashboard dispara múltiples roundtrips en
  vivo por VPN a Siesa. Pool `max: 5` — riesgo de saturación con varios
  usuarios concurrentes.
- **Margen solo a nivel de línea**: cualquier KPI de margen a nivel de
  documento/cliente/vendedor es una agregación derivada.
- **Documento de venta sin consecutivo formateado**: drill-down usa rowid
  interno, no un número de factura legible para negocio.
- **Valor de venta sin IVA**: correcto para margen, pero puede parecer que
  "no cuadra" contra un reporte contable con IVA si no se aclara en la UI.
- **Geografía de clientes**: no descartado ni confirmado — no asumir.

## 7-12. Arquitectura, diseño, KPIs, roadmap, tests, decisión final

Ver desarrollo completo de estas secciones en la conversación de trabajo del
2026-09-03 (sesión de auditoría previa a la implementación P0). Resumen de la
decisión final:

**Implementar (P0):** unificación de filtros globales entre
`/analitica/ventas*`, Ticket promedio, Pareto de clientes, caché corta en
memoria (30-60s) por tenant+filtros, limpieza del código muerto
`ventas:{disponible:false}`, tests de agregaciones/filtros/margen/ticket/
Pareto/aislamiento de tenant/permisos/drill-down.

**NO implementar sin evidencia real:** Contabilidad, Cash Flow real, EBITDA,
OTIF (cero fuente de datos), mapa geográfico (pendiente de verificar contra
Siesa), Inventario/Compras (ya son módulos separados, no se tocan), ninguna
escritura hacia Siesa (solo lectura, en todos los casos).
