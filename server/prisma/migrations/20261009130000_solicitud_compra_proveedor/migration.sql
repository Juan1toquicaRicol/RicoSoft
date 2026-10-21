BEGIN TRY

BEGIN TRAN;

-- SolicitudCompra ya expone estos campos en schema.prisma, pero faltaban
-- en la cadena de migraciones desde 0_init.
ALTER TABLE [dbo].[SolicitudCompra]
ADD [proveedor] VARCHAR(255),
    [proveedorId] UNIQUEIDENTIFIER;

ALTER TABLE [dbo].[SolicitudCompra]
ADD CONSTRAINT [SolicitudCompra_proveedorId_fkey]
FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id])
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
