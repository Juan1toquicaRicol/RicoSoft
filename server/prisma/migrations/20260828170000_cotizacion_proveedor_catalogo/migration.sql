BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[CotizacionProveedor] ADD [proveedorId] UNIQUEIDENTIFIER;

-- CreateIndex
CREATE NONCLUSTERED INDEX [CotizacionProveedor_proveedorId_idx] ON [dbo].[CotizacionProveedor]([proveedorId]);

-- AddForeignKey
ALTER TABLE [dbo].[CotizacionProveedor] ADD CONSTRAINT [CotizacionProveedor_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
