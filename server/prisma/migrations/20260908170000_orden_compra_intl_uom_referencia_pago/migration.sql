BEGIN TRY

BEGIN TRAN;

-- AlterTable: forma de pago de la Orden de Compra Internacional (nullable,
-- las órdenes existentes no tienen valor).
ALTER TABLE [dbo].[OrdenCompraIntl] ADD [formaPago] NVARCHAR(50);

-- AlterTable: referencia/código interno + unidad de medida por ítem
-- (ambas nullable por el mismo motivo).
ALTER TABLE [dbo].[ItemOrdenCompraIntl] ADD [referencia] NVARCHAR(100), [unidadMedida] NVARCHAR(20);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
