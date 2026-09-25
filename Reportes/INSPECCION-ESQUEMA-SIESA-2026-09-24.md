# Inspección de esquema Siesa UnoEE — 2026-09-24

## Alcance y método

Inspección remota de metadatos de SQL Server sobre el esquema `dbo`, mediante
consultas `SELECT` a `INFORMATION_SCHEMA.COLUMNS`. Se consultaron nombres,
tipos, longitudes y precisión; no se consultaron filas de negocio. No se
ejecutaron `INSERT`, `UPDATE` ni `DELETE`.

La base inspeccionada es la configurada en el entorno local de RicoSoft; por
seguridad, este informe no reproduce host, nombre de base, usuario ni datos
de conexión. Los resultados corresponden a ese ambiente y deben verificarse
antes de asumir que otros ambientes UnoEE tienen idéntico diccionario.

## Resultado por área

### Comercial / pedidos y cotizaciones

Tabla real de encabezados: `dbo.t430_cm_pv_docto` (123 columnas).

| Concepto | Campo verificado | Tipo | Observación |
|---|---|---|---|
| Moneda documento | `f430_id_moneda_docto` | `char(3)` | `f430_id_moneda` no existe. `f430_id_moneda_conv` y `f430_id_moneda_local` también existen. |
| Vencimiento cotización | `f430_fecha_vcto_cotizacion` | `datetime` | `f430_fecha_vto` no existe. Este campo es de vencimiento de cotización; no asumir que representa vencimiento de factura. |
| Condición de pago | `f430_id_cond_pago` | `char(3)` | También hay campos derivados de cuotas/días/modo de período. |
| Estado | `f430_ind_estado` | `smallint` | Confirmado a nivel de esquema; semántica de valores requiere catálogo/validación funcional. |
| Descuento global | `f430_tasa_dscto_global_cap` | `decimal(7,4)` | Nombre y tipo confirmados; el significado exacto de `cap` y su aplicación deben cotejarse con UnoEE antes de mapearlo como descuento final. |
| Notas | `f430_notas` | `varchar(2000)` | Confirmado. |
| Bodega encabezado | — | — | No se encontró campo con nombre de bodega en el encabezado consultado. La bodega está en la línea (`f431_rowid_bodega`). |

`dbo.t431_cm_pv_docto_linea` **no existe** en el esquema inspeccionado. La tabla
real de movimientos/líneas es `dbo.t431_cm_pv_movto` (63 columnas):

| Concepto | Campo verificado | Tipo |
|---|---|---|
| Documento padre | `f431_rowid_pv_docto` | `int` |
| Bodega | `f431_rowid_bodega` | `int` |
| Unidad de medida | `f431_id_unidad_medida` | `char(4)` |
| Lista de precios | `f431_id_lista_precio` | `char(3)` |
| Cantidad comprometida | `f431_cant1_comprometida` | `decimal(28,4)` |
| Descuento global línea | `f431_vlr_dscto_global` | `money` |
| Impuesto en valor | `f431_vlr_imp` | `money` |
| Indicador impuesto incluido en precio | `f431_ind_impuesto_precio_venta` | `smallint` |

No se encontró una columna de porcentaje/tasa de impuesto en `t431`. La tabla
relacionada `dbo.t433_cm_pv_movto_imp` contiene `f433_tasa` (`decimal`),
`f433_porcentaje_base` (`decimal`) y referencia de movimiento
`f433_rowid_pv_movto` (`int`). El join y las reglas de cálculo deben verificarse
antes de integrarlo. `dbo.t432_cm_pv_movto_dscto` contiene `f432_tasa` para
descuentos; no confundirlo con impuesto.

### Terceros / clientes

Los nombres solicitados `t015_mm_terceros` y `t200_mm_terceros_clientes` no
existen en este esquema. Se encontraron estas tablas reales:

- `dbo.t200_mm_terceros`: `f200_rowid` (`int`), `f200_nit` (`varchar(25)`),
  `f200_dv_nit` (`char(3)`), `f200_razon_social` (`varchar(100)`),
  `f200_nombres` (`varchar(40)`), `f200_nombre_est` (`varchar(100)`) y
  `f200_rowid_contacto` (`int`).
- `dbo.t015_mm_contactos`: `f015_rowid` (`int`), `f015_direccion1/2/3`
  (`varchar(40)`), `f015_telefono` (`varchar(20)`), `f015_email`
  (`varchar(255)`) y `f015_rowid_dir3` (`int`).
- `dbo.t201_mm_clientes`: `f201_rowid_tercero` (`int`),
  `f201_cupo_credito` (`money`), `f201_dias_gracia` (`smallint`),
  `f201_id_cond_pago` (`char`), `f201_id_vendedor` (`char`),
  `f201_ind_bloqueo_cupo` (`smallint`) y `f201_rowid_contacto` (`int`).

Por tanto, el vendedor **no** está nombrado `f200_id_vendedor` en la tabla
general de terceros: el candidato de asignación de cliente es
`t201_mm_clientes.f201_id_vendedor`. El vencimiento por días disponible en
encabezado comercial es `f430_cond_pago_dias_vcto`; `f201_dias_gracia` no debe
rebautizarse como “días de crédito” sin confirmar su significado funcional.
Correo/dirección/teléfono requieren resolver el contacto; confirmar la
relación exacta y precedencia entre contacto de tercero y contacto de cliente
antes de implementar.

### Inventario y precios

Los nombres solicitados `t121_mc_items_bodega` y `t125_mc_precios` no existen.
Tablas identificadas:

- `dbo.t120_mc_items`: `f120_rowid` (`int`), `f120_referencia` (`char(50)`),
  `f120_descripcion` (`varchar(40)`), `f120_descripcion_corta`
  (`varchar(20)`), `f120_id_unidad_inventario` (`char(4)`) y otros atributos.
  No apareció una columna de marca/línea entre los campos inspeccionados de
  esta tabla; esa clasificación queda pendiente de localizar.
- `dbo.t400_cm_existencia`: existencia por artículo-extensión y bodega:
  `f400_id_cia` (`smallint`), `f400_rowid_item_ext` (`int`),
  `f400_rowid_bodega` (`int`), `f400_cant_existencia_1/2` (`decimal`),
  `f400_cant_comprometida_1/2` (`decimal`),
  `f400_cant_pendiente_salir_1` (`decimal`),
  `f400_cant_pendiente_entrar_1` (`decimal`),
  `f400_costo_prom_uni/tot` (`money`). No se halló un campo explícito llamado
  stock reservado; no equiparar pendiente de salida con reserva sin validar
  la regla de negocio.
- `dbo.t132_mc_items_instalacion`: atributos por instalación/artículo,
  incluyendo `f132_rowid_item_ext` (`int`), `f132_rowid_bodega_venta` (`int`),
  `f132_cant_existencia_1` (`decimal`), `f132_costo_actual`,
  `f132_costo_estandar_acumulado`, `f132_costo_prom_uni` y
  `f132_costo_prom_tot` (`money`). Para saldo por bodega se encontró la tabla
  `t400`, no debe sustituirse por esta existencia de instalación.
- `dbo.t126_mc_items_precios`: `f126_id_cia` (`smallint`),
  `f126_id_lista_precio` (`char`), `f126_rowid_item` y
  `f126_rowid_item_ext` (`int`), `f126_id_unidad_medida` (`char`),
  `f126_precio`, `f126_precio_minimo`, `f126_precio_maximo` y
  `f126_precio_sugerido` (`money`), además de fechas de activación/inactivación.

### Cartera / documentos contables

`dbo.t350_co_docto_contable` existe (60 columnas), pero
`dbo.t351_co_docto_contable_mov` no. La tabla de movimientos real es
`dbo.t351_co_mov_docto`; se encontró además la tabla de saldo abierto
`dbo.t353_co_saldo_abierto`.

- Encabezado: `t350.f350_rowid`, `f350_id_tipo_docto`, `f350_consec_docto`,
  `f350_prefijo`, `f350_fecha`, `f350_rowid_tercero`, `f350_ind_estado`,
  `f350_total_db` y `f350_total_cr`.
- Movimiento: `t351.f351_rowid_docto`, `f351_rowid_tercero`, `f351_fecha`,
  `f351_rowid_auxiliar`; los valores débito/crédito están en la tabla
  relacionada `dbo.t3511_co_mov_docto_rx` como `f3511_valor_debito` y
  `f3511_valor_credito` (también versiones 2 y 3).
- Saldo abierto: `t353.f353_rowid_docto`, `f353_rowid_tercero`,
  `f353_fecha_vcto`, `f353_total_db`, `f353_total_cr`,
  `f353_total_db_pendientes`, `f353_total_cr_pendientes`,
  `f353_fecha_cancelacion` y `f353_ind_estado_pago`.
- Mora: no hay un campo de días de mora en `t353`. Se identificó
  `t3535_co_deterioro_movto.f3535_dias_vencidos` y
  `f3535_vlr_saldo_cartera`, pero son de deterioro/movimientos y no se debe
  tratarlos como cálculo de mora actual sin validación contable. La fecha
  `f353_fecha_vcto` permite calcular días vencidos según fecha de corte y
  reglas aprobadas; no se ejecutó ese cálculo.

## Decisiones técnicas para integraciones

1. Actualizar futuras consultas usando los nombres reales confirmados, sin
   asumir que el nombre funcional de una tabla coincide con el nombre físico.
2. Mantener todos los joins acotados por compañía (`f*_id_cia`) y usar
   identidades técnicas (`rowid`) junto con compañía; validar el join exacto
   tercero/contacto y artículo/extensión antes de producción.
3. En cotizaciones Siesa, usar `f430_id_moneda_docto` y
   `f430_fecha_vcto_cotizacion` si el flujo necesita vencimiento de cotización.
   No referenciar `f430_id_moneda` ni `f430_fecha_vto`.
4. Para compromiso por línea, la evidencia de esquema confirma
   `t431_cm_pv_movto.f431_cant1_comprometida`; validar el estado/tipo de
   documento en `t430` según contrato funcional vigente.
5. Para existencia por bodega, la tabla candidata es `t400_cm_existencia`;
   para precio, `t126_mc_items_precios`; para vencimientos/saldos abiertos,
   `t353_co_saldo_abierto`. Las fórmulas contables y semánticas requieren
   validación funcional adicional.

## Limitaciones

Este reporte certifica nombres y tipos observados en metadatos, no la
semántica contable de cada campo, valores posibles, permisos efectivos del
usuario SQL ni la cardinalidad/validez de los joins. No se consultaron datos,
catálogos de valores, claves foráneas ni vistas de reporte. Marca/Línea de
producto, stock reservado, cálculo de mora vigente y la relación completa de
contactos/vendedor quedan como puntos de investigación antes de implementar.
