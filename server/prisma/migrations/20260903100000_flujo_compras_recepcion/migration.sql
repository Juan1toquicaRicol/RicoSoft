BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Proveedor] ADD [condicionesPago] NVARCHAR(500), [datosPago] NVARCHAR(MAX);

-- AlterTable
ALTER TABLE [dbo].[Factura] ADD [condicionesPago] NVARCHAR(500), [datosPago] NVARCHAR(MAX);

-- AlterTable
ALTER TABLE [dbo].[SolicitudCompra] ADD [recepcionConfirmadaPorId] UNIQUEIDENTIFIER, [recepcionConfirmadaPorNombre] NVARCHAR(255), [recepcionConfirmadaEn] DATETIME2, [recepcionComentario] NVARCHAR(MAX);

-- AddForeignKey
ALTER TABLE [dbo].[SolicitudCompra] ADD CONSTRAINT [SolicitudCompra_recepcionConfirmadaPorId_fkey] FOREIGN KEY ([recepcionConfirmadaPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
