BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Permiso] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [codigo] VARCHAR(150) NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [descripcion] TEXT,
    [modulo] VARCHAR(100) NOT NULL,
    [esSistema] BIT NOT NULL CONSTRAINT [Permiso_esSistema_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [Permiso_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Permiso_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Permiso_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permiso_tenantId_codigo_key] UNIQUE NONCLUSTERED ([tenantId], [codigo])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Permiso_tenantId_idx] ON [dbo].[Permiso]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[Permiso] ADD CONSTRAINT [Permiso_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
