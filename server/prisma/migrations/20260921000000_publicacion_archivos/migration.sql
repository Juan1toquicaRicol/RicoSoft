BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[PublicacionArchivo] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [publicacionId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(20) NOT NULL,
    [nombreOriginal] VARCHAR(255) NOT NULL,
    [mime] VARCHAR(100) NOT NULL,
    [tamano] INT NOT NULL,
    [ruta] VARCHAR(500) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PublicacionArchivo_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PublicacionArchivo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PublicacionArchivo_publicacionId_idx] ON [dbo].[PublicacionArchivo]([publicacionId]);

-- AddForeignKey
ALTER TABLE [dbo].[PublicacionArchivo] ADD CONSTRAINT [PublicacionArchivo_publicacionId_fkey] FOREIGN KEY ([publicacionId]) REFERENCES [dbo].[Publicacion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
