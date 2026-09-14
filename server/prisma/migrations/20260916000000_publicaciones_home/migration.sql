BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Publicacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER,
    [categoria] VARCHAR(20) NOT NULL,
    [tipo] VARCHAR(50) NOT NULL,
    [titulo] VARCHAR(255) NOT NULL,
    [contenido] NVARCHAR(max) NOT NULL,
    [fechaPublicacion] DATETIME2 NOT NULL CONSTRAINT [Publicacion_fechaPublicacion_df] DEFAULT CURRENT_TIMESTAMP,
    [fechaVencimiento] DATETIME2,
    [fechaEvento] DATETIME2,
    [activo] BIT NOT NULL CONSTRAINT [Publicacion_activo_df] DEFAULT 1,
    [autorId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Publicacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Publicacion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Publicacion_tenantId_categoria_activo_idx] ON [dbo].[Publicacion]([tenantId], [categoria], [activo]);

-- AddForeignKey
ALTER TABLE [dbo].[Publicacion] ADD CONSTRAINT [Publicacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Publicacion] ADD CONSTRAINT [Publicacion_autorId_fkey] FOREIGN KEY ([autorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
