BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ClasificacionFuncionalItem] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ClasificacionFuncionalItem_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [codigo] NVARCHAR(50) NOT NULL,
    [nombre] NVARCHAR(100) NOT NULL,
    [descripcion] NVARCHAR(500),
    [activo] BIT NOT NULL CONSTRAINT [ClasificacionFuncionalItem_activo_df] DEFAULT 1,
    [orden] INT NOT NULL CONSTRAINT [ClasificacionFuncionalItem_orden_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ClasificacionFuncionalItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ClasificacionFuncionalItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [ClasificacionFuncionalItem_tenantId_codigo_key] ON [dbo].[ClasificacionFuncionalItem]([tenantId], [codigo]);
CREATE NONCLUSTERED INDEX [ClasificacionFuncionalItem_tenantId_activo_idx] ON [dbo].[ClasificacionFuncionalItem]([tenantId], [activo]);

-- AddForeignKey
ALTER TABLE [dbo].[ClasificacionFuncionalItem] ADD CONSTRAINT [ClasificacionFuncionalItem_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE [dbo].[ItemClasificacionAsignada] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ItemClasificacionAsignada_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [itemRowId] INT NOT NULL,
    [clasificacionId] UNIQUEIDENTIFIER NOT NULL,
    [asignadoPorId] UNIQUEIDENTIFIER,
    [asignadoPorNombre] NVARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ItemClasificacionAsignada_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ItemClasificacionAsignada_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [ItemClasificacionAsignada_tenantId_itemRowId_clasificacionId_key] ON [dbo].[ItemClasificacionAsignada]([tenantId], [itemRowId], [clasificacionId]);
CREATE NONCLUSTERED INDEX [ItemClasificacionAsignada_tenantId_itemRowId_idx] ON [dbo].[ItemClasificacionAsignada]([tenantId], [itemRowId]);
CREATE NONCLUSTERED INDEX [ItemClasificacionAsignada_tenantId_clasificacionId_idx] ON [dbo].[ItemClasificacionAsignada]([tenantId], [clasificacionId]);

-- AddForeignKey
ALTER TABLE [dbo].[ItemClasificacionAsignada] ADD CONSTRAINT [ItemClasificacionAsignada_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ItemClasificacionAsignada] ADD CONSTRAINT [ItemClasificacionAsignada_clasificacionId_fkey] FOREIGN KEY ([clasificacionId]) REFERENCES [dbo].[ClasificacionFuncionalItem]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
