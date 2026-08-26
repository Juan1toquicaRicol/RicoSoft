BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Auditoria] ADD [datosAnteriores] TEXT,
[datosNuevos] TEXT,
[entidadId] VARCHAR(100),
[entidadTipo] VARCHAR(50);

-- CreateTable
CREATE TABLE [dbo].[Notificacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [usuarioId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(50) NOT NULL,
    [titulo] VARCHAR(255) NOT NULL,
    [mensaje] TEXT NOT NULL,
    [enlace] VARCHAR(500),
    [leida] BIT NOT NULL CONSTRAINT [Notificacion_leida_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Notificacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Notificacion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notificacion_tenantId_usuarioId_leida_idx] ON [dbo].[Notificacion]([tenantId], [usuarioId], [leida]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Notificacion_usuarioId_createdAt_idx] ON [dbo].[Notificacion]([usuarioId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[Notificacion] ADD CONSTRAINT [Notificacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Notificacion] ADD CONSTRAINT [Notificacion_usuarioId_fkey] FOREIGN KEY ([usuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

