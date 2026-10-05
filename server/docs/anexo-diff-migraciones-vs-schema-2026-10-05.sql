-- ANEXO DE DOCUMENTACION — NO EJECUTAR NI APLICAR EN NINGUN ENTORNO.
-- Salida literal de: prisma migrate diff --from-url <BD recien migrada con las 66 migraciones>
--                                         --to-schema-datamodel prisma/schema.prisma --script
-- Generada el 2026-10-05 contra la BD desechable ricosoft_it_novedades_20261005 (antes de aplicar la
-- propuesta). Describe TODO lo que difiere; la mayoria es ruido y aplicarlo tal cual DESTRUIRIA indices
-- unicos filtrados y cambiaria tipos/acciones de FK. Ver PROPUESTA-migracion-alineacion-schema-2026-10-05.md.

BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[CatalogoValor] DROP CONSTRAINT [CatalogoValor_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ConfiguracionComercial] DROP CONSTRAINT [ConfiguracionComercial_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ContenedorLote] DROP CONSTRAINT [FK_ContenedorLote_LoteImportacion];

-- DropForeignKey
ALTER TABLE [dbo].[CotizacionProveedor] DROP CONSTRAINT [CotizacionProveedor_solicitudCompraId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Departamento] DROP CONSTRAINT [Departamento_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionActividad] DROP CONSTRAINT [ImportacionActividad_ordenCompraId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionCorreoAdjunto] DROP CONSTRAINT [ImportacionCorreoAdjunto_correoId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] DROP CONSTRAINT [ImportacionExcepcion_correoId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionExtraccion] DROP CONSTRAINT [ImportacionExtraccion_adjuntoId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionNovedad] DROP CONSTRAINT [ImportacionNovedad_ordenCompraId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionPago] DROP CONSTRAINT [ImportacionPago_ordenCompraId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[IndicadorCreditoCliente] DROP CONSTRAINT [IndicadorCreditoCliente_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Membresia] DROP CONSTRAINT [Membresia_userId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Modulo] DROP CONSTRAINT [Modulo_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[OportunidadSeguimiento] DROP CONSTRAINT [OportunidadSeguimiento_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[PlantillaNotificacion] DROP CONSTRAINT [PlantillaNotificacion_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ReglaDestinatario] DROP CONSTRAINT [ReglaDestinatario_reglaId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ReglaDestinatarios] DROP CONSTRAINT [ReglaDestinatarios_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[RequisitoProveedorImportacion] DROP CONSTRAINT [RequisitoProveedorImportacion_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Rol] DROP CONSTRAINT [Rol_tenantId_fkey];

-- DropIndex
ALTER TABLE [dbo].[CatalogoValor] DROP CONSTRAINT [CatalogoValor_tipo_clave_tenantId_key];

-- DropIndex
ALTER TABLE [dbo].[CatalogoValor] DROP CONSTRAINT [CatalogoValor_tipo_clave_tenantId_key];

-- DropIndex
DROP INDEX [CatalogoValor_tipo_tenantId_activo_idx] ON [dbo].[CatalogoValor];

-- DropIndex
DROP INDEX [ClasificacionFuncionalItem_tenantId_codigo_key] ON [dbo].[ClasificacionFuncionalItem];

-- DropIndex
DROP INDEX [ContenedorLote_loteId_numero_key] ON [dbo].[ContenedorLote];

-- DropIndex
ALTER TABLE [dbo].[Factura] DROP CONSTRAINT [Factura_tenantId_empresaId_numero_key];

-- DropIndex
DROP INDEX [ImportacionActividad_tenantId_estado_idx] ON [dbo].[ImportacionActividad];

-- DropIndex
DROP INDEX [ImportacionNovedad_tenantId_estado_idx] ON [dbo].[ImportacionNovedad];

-- DropIndex
DROP INDEX [ImportacionPago_tenantId_estado_idx] ON [dbo].[ImportacionPago];

-- DropIndex
DROP INDEX [InboxItem_tenantId_asignadoPermiso_status_idx] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_asignadoPermiso_status_idx] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_asignadoUsuarioId_status_idx] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_status_prioridad_idx] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [InboxItem_tenantId_status_prioridad_idx] ON [dbo].[InboxItem];

-- DropIndex
DROP INDEX [Objetivo_tenantId_nivel_vendedorSiesaRowId_idx] ON [dbo].[Objetivo];

-- DropIndex
ALTER TABLE [dbo].[PerfilFuncional] DROP CONSTRAINT [PerfilFuncional_tenantId_departamentoId_nombre_key];

-- DropIndex
ALTER TABLE [dbo].[PlantillaNotificacion] DROP CONSTRAINT [PlantillaNotificacion_tipoEvento_tenantId_key];

-- DropIndex
DROP INDEX [ReglaDestinatarios_tenantId_evento_idx] ON [dbo].[ReglaDestinatarios];

-- AlterTable
ALTER TABLE [dbo].[AnalisisGuardado] ALTER COLUMN [nombre] VARCHAR(150) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[CatalogoValor] ALTER COLUMN [tipo] VARCHAR(60) NOT NULL;
ALTER TABLE [dbo].[CatalogoValor] ALTER COLUMN [clave] VARCHAR(100) NOT NULL;
ALTER TABLE [dbo].[CatalogoValor] ALTER COLUMN [etiqueta] VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[ClasificacionFuncionalItem] DROP CONSTRAINT [ClasificacionFuncionalItem_id_df];
ALTER TABLE [dbo].[ClasificacionFuncionalItem] ALTER COLUMN [codigo] VARCHAR(50) NOT NULL;
ALTER TABLE [dbo].[ClasificacionFuncionalItem] ALTER COLUMN [nombre] VARCHAR(100) NOT NULL;
ALTER TABLE [dbo].[ClasificacionFuncionalItem] ALTER COLUMN [descripcion] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[ContenedorLote] DROP CONSTRAINT [DF_ContenedorLote_id];
EXEC SP_RENAME N'dbo.PK_ContenedorLote', N'ContenedorLote_pkey';
ALTER TABLE [dbo].[ContenedorLote] ALTER COLUMN [numero] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[ContenedorLote] ALTER COLUMN [ultimoEvento] VARCHAR(30) NULL;
ALTER TABLE [dbo].[ContenedorLote] ALTER COLUMN [eventosJson] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[EmpleadoBiometrico] DROP CONSTRAINT [EmpleadoBiometrico_id_df];

-- AlterTable
ALTER TABLE [dbo].[Factura] ALTER COLUMN [condicionesPago] VARCHAR(500) NULL;
ALTER TABLE [dbo].[Factura] ALTER COLUMN [datosPago] TEXT NULL;
ALTER TABLE [dbo].[Factura] ADD [solicitudCompraId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[FuenteBiometrica] DROP CONSTRAINT [FuenteBiometrica_id_df];

-- AlterTable
ALTER TABLE [dbo].[ImportacionActividad] DROP CONSTRAINT [ImportacionActividad_id_df];
ALTER TABLE [dbo].[ImportacionActividad] ALTER COLUMN [nombre] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[ImportacionActividad] ALTER COLUMN [etapa] VARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[ImportacionActividad] ALTER COLUMN [responsableTipo] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[ImportacionActividad] ALTER COLUMN [responsableNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionActividad] ALTER COLUMN [estado] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[ImportacionActividad] ALTER COLUMN [observacion] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionCorreo] DROP CONSTRAINT [ImportacionCorreo_id_df];
ALTER TABLE [dbo].[ImportacionCorreo] ALTER COLUMN [destinatarios] TEXT NOT NULL;
ALTER TABLE [dbo].[ImportacionCorreo] ALTER COLUMN [asunto] VARCHAR(500) NOT NULL;
ALTER TABLE [dbo].[ImportacionCorreo] ALTER COLUMN [cuerpoTexto] TEXT NULL;
ALTER TABLE [dbo].[ImportacionCorreo] ALTER COLUMN [ultimoError] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionCorreoAdjunto] DROP CONSTRAINT [ImportacionCorreoAdjunto_id_df];
ALTER TABLE [dbo].[ImportacionCorreoAdjunto] ALTER COLUMN [nombreOriginal] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[ImportacionCorreoAdjunto] ALTER COLUMN [textoExtraido] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionExcepcion] DROP CONSTRAINT [ImportacionExcepcion_id_df];
ALTER TABLE [dbo].[ImportacionExcepcion] ALTER COLUMN [descripcion] TEXT NOT NULL;
ALTER TABLE [dbo].[ImportacionExcepcion] ALTER COLUMN [candidatos] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionExtraccion] DROP CONSTRAINT [ImportacionExtraccion_id_df];
ALTER TABLE [dbo].[ImportacionExtraccion] ALTER COLUMN [valorExtraido] TEXT NOT NULL;
ALTER TABLE [dbo].[ImportacionExtraccion] ALTER COLUMN [evidencia] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionHistorial] ALTER COLUMN [origen] VARCHAR(10) NOT NULL;
ALTER TABLE [dbo].[ImportacionHistorial] ALTER COLUMN [responsable] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionHistorial] ALTER COLUMN [etapa] VARCHAR(30) NULL;
ALTER TABLE [dbo].[ImportacionHistorial] ALTER COLUMN [evidenciaNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionHistorial] ALTER COLUMN [evidenciaRuta] VARCHAR(500) NULL;
ALTER TABLE [dbo].[ImportacionHistorial] ALTER COLUMN [evidenciaMime] VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionNovedad] DROP CONSTRAINT [ImportacionNovedad_id_df];
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [tipo] VARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [descripcion] TEXT NOT NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [origen] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [responsable] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [prioridad] VARCHAR(10) NOT NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [impacto] TEXT NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [estado] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [accionRequerida] VARCHAR(500) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [responsableResolucionNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [evidenciaNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [evidenciaRuta] VARCHAR(500) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [evidenciaMime] VARCHAR(100) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [reglaOrigen] VARCHAR(100) NULL;
ALTER TABLE [dbo].[ImportacionNovedad] ALTER COLUMN [creadoPorNombre] VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE [dbo].[ImportacionPago] DROP CONSTRAINT [ImportacionPago_id_df];
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [concepto] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [moneda] VARCHAR(3) NOT NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [estado] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [responsableNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [comprobanteNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [comprobanteRuta] VARCHAR(500) NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [comprobanteMime] VARCHAR(100) NULL;
ALTER TABLE [dbo].[ImportacionPago] ALTER COLUMN [observaciones] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[InboxItem] DROP CONSTRAINT [InboxItem_id_df];
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [tipo] VARCHAR(50) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [categoria] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [sourceModule] VARCHAR(50) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [sourceEntityTipo] VARCHAR(50) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [sourceEntityId] VARCHAR(100) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [titulo] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [descripcion] VARCHAR(500) NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [status] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [prioridad] VARCHAR(10) NOT NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [asignadoPermiso] VARCHAR(100) NULL;
ALTER TABLE [dbo].[InboxItem] ALTER COLUMN [enlace] VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE [dbo].[ItemClasificacionAsignada] DROP CONSTRAINT [ItemClasificacionAsignada_id_df];
ALTER TABLE [dbo].[ItemClasificacionAsignada] ALTER COLUMN [asignadoPorNombre] VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE [dbo].[ItemOrdenCompraIntl] ALTER COLUMN [referencia] VARCHAR(100) NULL;
ALTER TABLE [dbo].[ItemOrdenCompraIntl] ALTER COLUMN [unidadMedida] VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE [dbo].[LoteImportacion] DROP CONSTRAINT [DF_LoteImportacion_estadoTracking];
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [booking] VARCHAR(100) NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [forwarder] VARCHAR(255) NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [buqueNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [buqueImo] VARCHAR(20) NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [buqueMmsi] VARCHAR(20) NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [estadoTracking] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [proveedorTracking] VARCHAR(50) NULL;
ALTER TABLE [dbo].[LoteImportacion] ALTER COLUMN [ultimoErrorTracking] TEXT NULL;
ALTER TABLE [dbo].[LoteImportacion] ADD CONSTRAINT [LoteImportacion_estadoTracking_df] DEFAULT 'PENDIENTE' FOR [estadoTracking];

-- AlterTable
ALTER TABLE [dbo].[MarcacionBiometrica] DROP CONSTRAINT [MarcacionBiometrica_id_df];

-- AlterTable
ALTER TABLE [dbo].[Notificacion] ALTER COLUMN [entidadTipo] VARCHAR(50) NULL;
ALTER TABLE [dbo].[Notificacion] ALTER COLUMN [entidadId] VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE [dbo].[Objetivo] DROP CONSTRAINT [Objetivo_id_df];
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [nivel] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [vendedorSiesaNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [tipoPeriodo] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [tipoMetaInventario] VARCHAR(20) NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [descripcion] TEXT NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [estado] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [creadoPorNombre] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[Objetivo] ALTER COLUMN [asignadoPorNombre] VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE [dbo].[OportunidadSeguimiento] DROP CONSTRAINT [OportunidadSeguimiento_id_df];
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [clienteNombre] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [itemDescripcion] VARCHAR(255) NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [accion] VARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [resultado] VARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [comentario] TEXT NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [proximaAccion] VARCHAR(255) NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [usuario] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ALTER COLUMN [compromisoCompletadoPor] VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE [dbo].[OrdenCompraIntl] ALTER COLUMN [codigo] VARCHAR(30) NULL;
ALTER TABLE [dbo].[OrdenCompraIntl] ALTER COLUMN [formaPago] VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE [dbo].[PerfilFuncional] DROP CONSTRAINT [PerfilFuncional_id_df];
ALTER TABLE [dbo].[PerfilFuncional] ALTER COLUMN [nombre] VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[PlantillaNotificacion] ALTER COLUMN [tipoEvento] VARCHAR(100) NOT NULL;
ALTER TABLE [dbo].[PlantillaNotificacion] ALTER COLUMN [titulo] VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [clienteNombre] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [clienteNit] VARCHAR(50) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [contacto] VARCHAR(255) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [direccion] VARCHAR(500) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [ciudad] VARCHAR(255) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [telefono] VARCHAR(50) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [formaPago] VARCHAR(100) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [vendedorNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [ocNumero] VARCHAR(100) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [documentoAlterno] VARCHAR(100) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [remisiones] VARCHAR(100) NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [moneda] VARCHAR(20) NOT NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [observaciones] TEXT NULL;
ALTER TABLE [dbo].[Proforma] ALTER COLUMN [creadoPorNombre] VARCHAR(255) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[ProformaItem] ALTER COLUMN [referencia] VARCHAR(100) NULL;
ALTER TABLE [dbo].[ProformaItem] ALTER COLUMN [descripcion] VARCHAR(500) NOT NULL;
ALTER TABLE [dbo].[ProformaItem] ALTER COLUMN [bodega] VARCHAR(20) NULL;
ALTER TABLE [dbo].[ProformaItem] ALTER COLUMN [unidadMedida] VARCHAR(20) NULL;

-- AlterTable
ALTER TABLE [dbo].[Proveedor] ALTER COLUMN [condicionesPago] VARCHAR(500) NULL;
ALTER TABLE [dbo].[Proveedor] ALTER COLUMN [datosPago] TEXT NULL;
ALTER TABLE [dbo].[Proveedor] ALTER COLUMN [materialesHabituales] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[ReglaDestinatario] DROP CONSTRAINT [ReglaDestinatario_id_df];
ALTER TABLE [dbo].[ReglaDestinatario] ALTER COLUMN [tipo] VARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[ReglaDestinatario] ALTER COLUMN [permisoClave] VARCHAR(150) NULL;

-- AlterTable
ALTER TABLE [dbo].[ReglaDestinatarios] DROP CONSTRAINT [ReglaDestinatarios_id_df];
ALTER TABLE [dbo].[ReglaDestinatarios] ALTER COLUMN [evento] VARCHAR(100) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[RequisitoProveedorImportacion] DROP CONSTRAINT [RequisitoProveedorImportacion_id_df];
ALTER TABLE [dbo].[RequisitoProveedorImportacion] ALTER COLUMN [tipo] VARCHAR(30) NOT NULL;
ALTER TABLE [dbo].[RequisitoProveedorImportacion] ALTER COLUMN [nombre] VARCHAR(255) NOT NULL;
ALTER TABLE [dbo].[RequisitoProveedorImportacion] ALTER COLUMN [descripcion] TEXT NULL;

-- AlterTable
ALTER TABLE [dbo].[SincronizacionBiometricoLog] DROP CONSTRAINT [SincronizacionBiometricoLog_id_df];

-- AlterTable
ALTER TABLE [dbo].[SolicitudCompra] ALTER COLUMN [recepcionConfirmadaPorNombre] VARCHAR(255) NULL;
ALTER TABLE [dbo].[SolicitudCompra] ALTER COLUMN [recepcionComentario] TEXT NULL;
ALTER TABLE [dbo].[SolicitudCompra] ADD [proveedor] VARCHAR(255),
[proveedorId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[UsuarioPerfilFuncional] DROP CONSTRAINT [UsuarioPerfilFuncional_id_df];

-- CreateIndex
ALTER TABLE [dbo].[PerfilFuncional] ADD CONSTRAINT [PerfilFuncional_tenantId_departamentoId_nombre_key] UNIQUE NONCLUSTERED ([tenantId], [departamentoId], [nombre]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReglaDestinatarios_tenantId_evento_idx] ON [dbo].[ReglaDestinatarios]([tenantId], [evento]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CatalogoValor_tipo_tenantId_activo_idx] ON [dbo].[CatalogoValor]([tipo], [tenantId], [activo]);

-- CreateIndex
ALTER TABLE [dbo].[CatalogoValor] ADD CONSTRAINT [CatalogoValor_tipo_clave_tenantId_key] UNIQUE NONCLUSTERED ([tipo], [clave], [tenantId]);

-- CreateIndex
ALTER TABLE [dbo].[CatalogoValor] ADD CONSTRAINT [CatalogoValor_tipo_clave_tenantId_key] UNIQUE NONCLUSTERED ([tipo], [clave], [tenantId]);

-- CreateIndex
ALTER TABLE [dbo].[PlantillaNotificacion] ADD CONSTRAINT [PlantillaNotificacion_tipoEvento_tenantId_key] UNIQUE NONCLUSTERED ([tipoEvento], [tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Objetivo_tenantId_nivel_vendedorSiesaRowId_idx] ON [dbo].[Objetivo]([tenantId], [nivel], [vendedorSiesaRowId]);

-- CreateIndex
ALTER TABLE [dbo].[ContenedorLote] ADD CONSTRAINT [ContenedorLote_loteId_numero_key] UNIQUE NONCLUSTERED ([loteId], [numero]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionActividad_tenantId_estado_idx] ON [dbo].[ImportacionActividad]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionNovedad_tenantId_estado_idx] ON [dbo].[ImportacionNovedad]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionPago_tenantId_estado_idx] ON [dbo].[ImportacionPago]([tenantId], [estado]);

-- CreateIndex
ALTER TABLE [dbo].[ClasificacionFuncionalItem] ADD CONSTRAINT [ClasificacionFuncionalItem_tenantId_codigo_key] UNIQUE NONCLUSTERED ([tenantId], [codigo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_asignadoUsuarioId_status_idx] ON [dbo].[InboxItem]([tenantId], [asignadoUsuarioId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_asignadoPermiso_status_idx] ON [dbo].[InboxItem]([tenantId], [asignadoPermiso], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_asignadoPermiso_status_idx] ON [dbo].[InboxItem]([tenantId], [asignadoPermiso], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_status_prioridad_idx] ON [dbo].[InboxItem]([tenantId], [status], [prioridad]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_status_prioridad_idx] ON [dbo].[InboxItem]([tenantId], [status], [prioridad]);

-- CreateIndex
ALTER TABLE [dbo].[InboxItem] ADD CONSTRAINT [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] UNIQUE NONCLUSTERED ([tenantId], [sourceModule], [sourceEntityId], [tipo]);

-- CreateIndex
ALTER TABLE [dbo].[InboxItem] ADD CONSTRAINT [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] UNIQUE NONCLUSTERED ([tenantId], [sourceModule], [sourceEntityId], [tipo]);

-- CreateIndex
ALTER TABLE [dbo].[InboxItem] ADD CONSTRAINT [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] UNIQUE NONCLUSTERED ([tenantId], [sourceModule], [sourceEntityId], [tipo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Factura_tenantId_empresaId_numero_idx] ON [dbo].[Factura]([tenantId], [empresaId], [numero]);

-- CreateIndex
ALTER TABLE [dbo].[ImportacionNovedad] ADD CONSTRAINT [ImportacionNovedad_ordenCompraId_reglaOrigen_key] UNIQUE NONCLUSTERED ([ordenCompraId], [reglaOrigen]);

-- CreateIndex
ALTER TABLE [dbo].[Tenant] ADD CONSTRAINT [Tenant_siesaCiaId_key] UNIQUE NONCLUSTERED ([siesaCiaId]);

-- CreateIndex
ALTER TABLE [dbo].[Tenant] ADD CONSTRAINT [Tenant_dominioCorporativo_key] UNIQUE NONCLUSTERED ([dominioCorporativo]);

-- AddForeignKey
ALTER TABLE [dbo].[Rol] ADD CONSTRAINT [Rol_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Membresia] ADD CONSTRAINT [Membresia_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Departamento] ADD CONSTRAINT [Departamento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Modulo] ADD CONSTRAINT [Modulo_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_solicitudCompraId_fkey] FOREIGN KEY ([solicitudCompraId]) REFERENCES [dbo].[SolicitudCompra]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SolicitudCompra] ADD CONSTRAINT [SolicitudCompra_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CotizacionProveedor] ADD CONSTRAINT [CotizacionProveedor_solicitudCompraId_fkey] FOREIGN KEY ([solicitudCompraId]) REFERENCES [dbo].[SolicitudCompra]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ReglaDestinatarios] ADD CONSTRAINT [ReglaDestinatarios_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ReglaDestinatario] ADD CONSTRAINT [ReglaDestinatario_reglaId_fkey] FOREIGN KEY ([reglaId]) REFERENCES [dbo].[ReglaDestinatarios]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[IndicadorCreditoCliente] ADD CONSTRAINT [IndicadorCreditoCliente_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ConfiguracionComercial] ADD CONSTRAINT [ConfiguracionComercial_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CatalogoValor] ADD CONSTRAINT [CatalogoValor_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PlantillaNotificacion] ADD CONSTRAINT [PlantillaNotificacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[OportunidadSeguimiento] ADD CONSTRAINT [OportunidadSeguimiento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[RequisitoProveedorImportacion] ADD CONSTRAINT [RequisitoProveedorImportacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreoAdjunto] ADD CONSTRAINT [ImportacionCorreoAdjunto_correoId_fkey] FOREIGN KEY ([correoId]) REFERENCES [dbo].[ImportacionCorreo]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExtraccion] ADD CONSTRAINT [ImportacionExtraccion_adjuntoId_fkey] FOREIGN KEY ([adjuntoId]) REFERENCES [dbo].[ImportacionCorreoAdjunto]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] ADD CONSTRAINT [ImportacionExcepcion_correoId_fkey] FOREIGN KEY ([correoId]) REFERENCES [dbo].[ImportacionCorreo]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ContenedorLote] ADD CONSTRAINT [ContenedorLote_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionActividad] ADD CONSTRAINT [ImportacionActividad_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionNovedad] ADD CONSTRAINT [ImportacionNovedad_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionPago] ADD CONSTRAINT [ImportacionPago_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

