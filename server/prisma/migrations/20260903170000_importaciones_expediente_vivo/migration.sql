BEGIN TRY

BEGIN TRAN;

-- AlterTable: OrdenCompraIntl
ALTER TABLE [dbo].[OrdenCompraIntl] ADD
    [codigo] NVARCHAR(30),
    [fechaEstimadaCierre] DATETIME2,
    [fechaCierre] DATETIME2;

-- AlterTable: ImportacionHistorial (bitácora de mutaciones -> línea de eventos)
ALTER TABLE [dbo].[ImportacionHistorial] ADD
    [origen] NVARCHAR(10) NOT NULL CONSTRAINT [ImportacionHistorial_origen_df] DEFAULT 'Sistema',
    [responsable] NVARCHAR(255),
    [etapa] NVARCHAR(30),
    [evidenciaNombre] NVARCHAR(255),
    [evidenciaRuta] NVARCHAR(500),
    [evidenciaMime] NVARCHAR(100),
    [evidenciaTamano] INT;

-- CreateTable: ImportacionActividad
CREATE TABLE [dbo].[ImportacionActividad] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionActividad_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [loteId] UNIQUEIDENTIFIER,
    [nombre] NVARCHAR(255) NOT NULL,
    [etapa] NVARCHAR(30) NOT NULL,
    [responsableTipo] NVARCHAR(20) NOT NULL,
    [responsableNombre] NVARCHAR(255),
    [fechaPlanificada] DATETIME2,
    [fechaLimite] DATETIME2,
    [fechaReal] DATETIME2,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [ImportacionActividad_estado_df] DEFAULT 'Pendiente',
    [dependeDeId] UNIQUEIDENTIFIER,
    [observacion] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionActividad_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ImportacionActividad_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionActividad_tenantId_ordenCompraId_idx] ON [dbo].[ImportacionActividad]([tenantId], [ordenCompraId]);
CREATE NONCLUSTERED INDEX [ImportacionActividad_tenantId_estado_idx] ON [dbo].[ImportacionActividad]([tenantId], [estado]);

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionActividad] ADD CONSTRAINT [ImportacionActividad_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ImportacionActividad] ADD CONSTRAINT [ImportacionActividad_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ImportacionActividad] ADD CONSTRAINT [ImportacionActividad_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ImportacionActividad] ADD CONSTRAINT [ImportacionActividad_dependeDeId_fkey] FOREIGN KEY ([dependeDeId]) REFERENCES [dbo].[ImportacionActividad]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable: ImportacionNovedad
CREATE TABLE [dbo].[ImportacionNovedad] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionNovedad_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] NVARCHAR(30) NOT NULL,
    [descripcion] NVARCHAR(MAX) NOT NULL,
    [origen] NVARCHAR(20) NOT NULL CONSTRAINT [ImportacionNovedad_origen_df] DEFAULT 'PorDeterminar',
    [responsable] NVARCHAR(255),
    [prioridad] NVARCHAR(10) NOT NULL CONSTRAINT [ImportacionNovedad_prioridad_df] DEFAULT 'Media',
    [impacto] NVARCHAR(MAX),
    [fechaDeteccion] DATETIME2 NOT NULL CONSTRAINT [ImportacionNovedad_fechaDeteccion_df] DEFAULT CURRENT_TIMESTAMP,
    [fechaLimite] DATETIME2,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [ImportacionNovedad_estado_df] DEFAULT 'Abierta',
    [accionRequerida] NVARCHAR(500),
    [responsableResolucionId] UNIQUEIDENTIFIER,
    [responsableResolucionNombre] NVARCHAR(255),
    [fechaResolucion] DATETIME2,
    [evidenciaNombre] NVARCHAR(255),
    [evidenciaRuta] NVARCHAR(500),
    [evidenciaMime] NVARCHAR(100),
    [evidenciaTamano] INT,
    [automatica] BIT NOT NULL CONSTRAINT [ImportacionNovedad_automatica_df] DEFAULT 0,
    [reglaOrigen] NVARCHAR(100),
    [creadoPorId] UNIQUEIDENTIFIER,
    [creadoPorNombre] NVARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionNovedad_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionNovedad_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionNovedad_tenantId_ordenCompraId_idx] ON [dbo].[ImportacionNovedad]([tenantId], [ordenCompraId]);
CREATE NONCLUSTERED INDEX [ImportacionNovedad_tenantId_estado_idx] ON [dbo].[ImportacionNovedad]([tenantId], [estado]);
CREATE UNIQUE NONCLUSTERED INDEX [ImportacionNovedad_ordenCompraId_reglaOrigen_key] ON [dbo].[ImportacionNovedad]([ordenCompraId], [reglaOrigen]) WHERE [reglaOrigen] IS NOT NULL;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionNovedad] ADD CONSTRAINT [ImportacionNovedad_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ImportacionNovedad] ADD CONSTRAINT [ImportacionNovedad_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- CreateTable: ImportacionPago
CREATE TABLE [dbo].[ImportacionPago] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionPago_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [concepto] NVARCHAR(255) NOT NULL,
    [valor] DECIMAL(18,2) NOT NULL,
    [moneda] NVARCHAR(3) NOT NULL CONSTRAINT [ImportacionPago_moneda_df] DEFAULT 'COP',
    [fechaVencimiento] DATETIME2,
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [ImportacionPago_estado_df] DEFAULT 'Pendiente',
    [fechaPago] DATETIME2,
    [responsableId] UNIQUEIDENTIFIER,
    [responsableNombre] NVARCHAR(255),
    [comprobanteNombre] NVARCHAR(255),
    [comprobanteRuta] NVARCHAR(500),
    [comprobanteMime] NVARCHAR(100),
    [comprobanteTamano] INT,
    [observaciones] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionPago_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionPago_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionPago_tenantId_ordenCompraId_idx] ON [dbo].[ImportacionPago]([tenantId], [ordenCompraId]);
CREATE NONCLUSTERED INDEX [ImportacionPago_tenantId_estado_idx] ON [dbo].[ImportacionPago]([tenantId], [estado]);

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionPago] ADD CONSTRAINT [ImportacionPago_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ImportacionPago] ADD CONSTRAINT [ImportacionPago_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
