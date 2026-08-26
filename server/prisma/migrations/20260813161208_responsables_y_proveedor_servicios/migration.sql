BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Contrato] ADD [responsableId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[Factura] ADD [responsableId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[ServicioSuscripcion] ADD [proveedorId] UNIQUEIDENTIFIER,
[responsableId] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_responsableId_fkey] FOREIGN KEY ([responsableId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioSuscripcion] ADD CONSTRAINT [ServicioSuscripcion_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioSuscripcion] ADD CONSTRAINT [ServicioSuscripcion_responsableId_fkey] FOREIGN KEY ([responsableId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_responsableId_fkey] FOREIGN KEY ([responsableId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

