BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[SolicitudCompra] ADD [cotizacionMime] VARCHAR(100),
[cotizacionNombre] VARCHAR(255),
[cotizacionRuta] VARCHAR(500),
[cotizacionSubidoEn] DATETIME2,
[cotizacionSubidoPorNombre] VARCHAR(255),
[cotizacionTamano] INT,
[solicitanteId] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[SolicitudCompra] ADD CONSTRAINT [SolicitudCompra_solicitanteId_fkey] FOREIGN KEY ([solicitanteId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

