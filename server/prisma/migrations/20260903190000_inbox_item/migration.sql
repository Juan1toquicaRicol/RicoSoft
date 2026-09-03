BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[InboxItem] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [InboxItem_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] NVARCHAR(50) NOT NULL,
    [categoria] NVARCHAR(20) NOT NULL,
    [sourceModule] NVARCHAR(50) NOT NULL,
    [sourceEntityTipo] NVARCHAR(50) NOT NULL,
    [sourceEntityId] NVARCHAR(100) NOT NULL,
    [titulo] NVARCHAR(255) NOT NULL,
    [descripcion] NVARCHAR(500),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [InboxItem_status_df] DEFAULT 'PENDIENTE',
    [prioridad] NVARCHAR(10) NOT NULL CONSTRAINT [InboxItem_prioridad_df] DEFAULT 'MEDIA',
    [asignadoUsuarioId] UNIQUEIDENTIFIER,
    [asignadoPermiso] NVARCHAR(100),
    [enlace] NVARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [InboxItem_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [dueAt] DATETIME2,
    [resolvedAt] DATETIME2,
    [resolvedByUsuarioId] UNIQUEIDENTIFIER,
    CONSTRAINT [InboxItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [InboxItem_tenantId_sourceModule_sourceEntityId_tipo_key] ON [dbo].[InboxItem]([tenantId], [sourceModule], [sourceEntityId], [tipo]);
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_asignadoUsuarioId_status_idx] ON [dbo].[InboxItem]([tenantId], [asignadoUsuarioId], [status]);
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_asignadoPermiso_status_idx] ON [dbo].[InboxItem]([tenantId], [asignadoPermiso], [status]);
CREATE NONCLUSTERED INDEX [InboxItem_tenantId_status_prioridad_idx] ON [dbo].[InboxItem]([tenantId], [status], [prioridad]);

-- AddForeignKey
ALTER TABLE [dbo].[InboxItem] ADD CONSTRAINT [InboxItem_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[InboxItem] ADD CONSTRAINT [InboxItem_asignadoUsuarioId_fkey] FOREIGN KEY ([asignadoUsuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[InboxItem] ADD CONSTRAINT [InboxItem_resolvedByUsuarioId_fkey] FOREIGN KEY ([resolvedByUsuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
