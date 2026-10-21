BEGIN TRY

BEGIN TRAN;

-- Factura.solicitudCompraId ya existe en schema.prisma (relación solicitudCompraRel)
-- pero ninguna migración anterior lo creó.
ALTER TABLE [dbo].[Factura] ADD [solicitudCompraId] UNIQUEIDENTIFIER;

ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_solicitudCompraId_fkey]
FOREIGN KEY ([solicitudCompraId]) REFERENCES [dbo].[SolicitudCompra]([id])
ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW;

END CATCH
