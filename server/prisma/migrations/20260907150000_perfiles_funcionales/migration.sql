BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[PerfilFuncional] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [PerfilFuncional_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [departamentoId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] NVARCHAR(255) NOT NULL,
    [esJefeDeArea] BIT NOT NULL CONSTRAINT [PerfilFuncional_esJefeDeArea_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [PerfilFuncional_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PerfilFuncional_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PerfilFuncional_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[UsuarioPerfilFuncional] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [UsuarioPerfilFuncional_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [perfilId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [UsuarioPerfilFuncional_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [UsuarioPerfilFuncional_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PerfilFuncional_tenantId_idx] ON [dbo].[PerfilFuncional]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PerfilFuncional_departamentoId_idx] ON [dbo].[PerfilFuncional]([departamentoId]);

-- CreateIndex
ALTER TABLE [dbo].[PerfilFuncional] ADD CONSTRAINT [PerfilFuncional_tenantId_departamentoId_nombre_key] UNIQUE NONCLUSTERED ([tenantId], [departamentoId], [nombre]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UsuarioPerfilFuncional_tenantId_idx] ON [dbo].[UsuarioPerfilFuncional]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UsuarioPerfilFuncional_perfilId_idx] ON [dbo].[UsuarioPerfilFuncional]([perfilId]);

-- CreateIndex
ALTER TABLE [dbo].[UsuarioPerfilFuncional] ADD CONSTRAINT [UsuarioPerfilFuncional_userId_perfilId_key] UNIQUE NONCLUSTERED ([userId], [perfilId]);

-- AddForeignKey
ALTER TABLE [dbo].[PerfilFuncional] ADD CONSTRAINT [PerfilFuncional_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PerfilFuncional] ADD CONSTRAINT [PerfilFuncional_departamentoId_fkey] FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UsuarioPerfilFuncional] ADD CONSTRAINT [UsuarioPerfilFuncional_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[UsuarioPerfilFuncional] ADD CONSTRAINT [UsuarioPerfilFuncional_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UsuarioPerfilFuncional] ADD CONSTRAINT [UsuarioPerfilFuncional_perfilId_fkey] FOREIGN KEY ([perfilId]) REFERENCES [dbo].[PerfilFuncional]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
