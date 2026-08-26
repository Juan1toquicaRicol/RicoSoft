BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Membresia] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [rolId] UNIQUEIDENTIFIER,
    [isSuperadmin] BIT NOT NULL CONSTRAINT [Membresia_isSuperadmin_df] DEFAULT 0,
    [departamentoId] UNIQUEIDENTIFIER,
    [activo] BIT NOT NULL CONSTRAINT [Membresia_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Membresia_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Membresia_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Membresia_userId_tenantId_key] UNIQUE NONCLUSTERED ([userId], [tenantId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Membresia_tenantId_idx] ON [dbo].[Membresia]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[Membresia] ADD CONSTRAINT [Membresia_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Membresia] ADD CONSTRAINT [Membresia_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Membresia] ADD CONSTRAINT [Membresia_rolId_fkey] FOREIGN KEY ([rolId]) REFERENCES [dbo].[Rol]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Membresia] ADD CONSTRAINT [Membresia_departamentoId_fkey] FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
