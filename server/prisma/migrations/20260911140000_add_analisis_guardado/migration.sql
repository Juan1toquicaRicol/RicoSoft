BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[AnalisisGuardado] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [usuarioId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] NVARCHAR(150) NOT NULL,
    [configuracion] NVARCHAR(4000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AnalisisGuardado_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [AnalisisGuardado_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AnalisisGuardado_tenantId_usuarioId_idx] ON [dbo].[AnalisisGuardado]([tenantId], [usuarioId]);

-- AddForeignKey
ALTER TABLE [dbo].[AnalisisGuardado] ADD CONSTRAINT [AnalisisGuardado_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AnalisisGuardado] ADD CONSTRAINT [AnalisisGuardado_usuarioId_fkey] FOREIGN KEY ([usuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
