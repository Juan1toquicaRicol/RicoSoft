BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Notificacion] ADD [entidadTipo] NVARCHAR(50), [entidadId] NVARCHAR(100);

-- CreateTable
CREATE TABLE [dbo].[ReglaDestinatarios] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ReglaDestinatarios_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [evento] NVARCHAR(100) NOT NULL,
    [activa] BIT NOT NULL CONSTRAINT [ReglaDestinatarios_activa_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ReglaDestinatarios_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ReglaDestinatarios_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ReglaDestinatario] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ReglaDestinatario_id_df] DEFAULT NEWID(),
    [reglaId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] NVARCHAR(30) NOT NULL,
    [usuarioId] UNIQUEIDENTIFIER,
    [perfilId] UNIQUEIDENTIFIER,
    [departamentoId] UNIQUEIDENTIFIER,
    [permisoClave] NVARCHAR(150),
    CONSTRAINT [ReglaDestinatario_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReglaDestinatarios_tenantId_idx] ON [dbo].[ReglaDestinatarios]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReglaDestinatarios_tenantId_evento_idx] ON [dbo].[ReglaDestinatarios]([tenantId], [evento]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReglaDestinatario_reglaId_idx] ON [dbo].[ReglaDestinatario]([reglaId]);

-- AddForeignKey
ALTER TABLE [dbo].[ReglaDestinatarios] ADD CONSTRAINT [ReglaDestinatarios_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReglaDestinatario] ADD CONSTRAINT [ReglaDestinatario_reglaId_fkey] FOREIGN KEY ([reglaId]) REFERENCES [dbo].[ReglaDestinatarios]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
