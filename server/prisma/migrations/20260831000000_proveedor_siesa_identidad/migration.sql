BEGIN TRY

BEGIN TRAN;

-- AlterTable: Proveedor (todas las columnas aditivas, con default o
-- nullable, no afectan las 5.837 filas existentes)
ALTER TABLE [dbo].[Proveedor] ADD [siesaTerceroRowId] INT;
ALTER TABLE [dbo].[Proveedor] ADD [origen] VARCHAR(20) NOT NULL CONSTRAINT [Proveedor_origen_df] DEFAULT 'MANUAL';
ALTER TABLE [dbo].[Proveedor] ADD [ultimaSincronizacion] DATETIME2;
ALTER TABLE [dbo].[Proveedor] ADD [nombreEditadoManualmente] BIT NOT NULL CONSTRAINT [Proveedor_nombreEditadoManualmente_df] DEFAULT 0;

-- CreateIndex
CREATE NONCLUSTERED INDEX [Proveedor_tenantId_siesaTerceroRowId_idx] ON [dbo].[Proveedor]([tenantId], [siesaTerceroRowId]);

-- CreateTable
CREATE TABLE [dbo].[SincronizacionSiesaLog] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ciaId] INT NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [SincronizacionSiesaLog_estado_df] DEFAULT 'EN_COLA',
    [iniciadoPorId] UNIQUEIDENTIFIER NOT NULL,
    [iniciadoEn] DATETIME2 NOT NULL CONSTRAINT [SincronizacionSiesaLog_iniciadoEn_df] DEFAULT CURRENT_TIMESTAMP,
    [finalizadoEn] DATETIME2,
    [leidos] INT NOT NULL CONSTRAINT [SincronizacionSiesaLog_leidos_df] DEFAULT 0,
    [creados] INT NOT NULL CONSTRAINT [SincronizacionSiesaLog_creados_df] DEFAULT 0,
    [actualizados] INT NOT NULL CONSTRAINT [SincronizacionSiesaLog_actualizados_df] DEFAULT 0,
    [desactivados] INT NOT NULL CONSTRAINT [SincronizacionSiesaLog_desactivados_df] DEFAULT 0,
    [sinCambios] INT NOT NULL CONSTRAINT [SincronizacionSiesaLog_sinCambios_df] DEFAULT 0,
    [erroresCount] INT NOT NULL CONSTRAINT [SincronizacionSiesaLog_erroresCount_df] DEFAULT 0,
    [errores] TEXT,
    [mensajeError] TEXT,
    [cancelacionSolicitada] BIT NOT NULL CONSTRAINT [SincronizacionSiesaLog_cancelacionSolicitada_df] DEFAULT 0,
    CONSTRAINT [SincronizacionSiesaLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SincronizacionSiesaLog_tenantId_estado_idx] ON [dbo].[SincronizacionSiesaLog]([tenantId], [estado]);
CREATE NONCLUSTERED INDEX [SincronizacionSiesaLog_tenantId_iniciadoEn_idx] ON [dbo].[SincronizacionSiesaLog]([tenantId], [iniciadoEn]);

-- AddForeignKey
ALTER TABLE [dbo].[SincronizacionSiesaLog] ADD CONSTRAINT [SincronizacionSiesaLog_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[SincronizacionSiesaLog] ADD CONSTRAINT [SincronizacionSiesaLog_iniciadoPorId_fkey] FOREIGN KEY ([iniciadoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
