BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[Factura] DROP CONSTRAINT [Factura_contratoId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[ServicioSuscripcion] DROP CONSTRAINT [ServicioSuscripcion_contratoId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Contrato] DROP CONSTRAINT [Contrato_tenantId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Contrato] DROP CONSTRAINT [Contrato_proveedorId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[Contrato] DROP CONSTRAINT [Contrato_responsableId_fkey];

-- AlterTable
ALTER TABLE [dbo].[Factura] DROP COLUMN [contratoId], [contrato];

-- AlterTable
ALTER TABLE [dbo].[ServicioSuscripcion] DROP COLUMN [contratoId];

-- DropTable
DROP TABLE [dbo].[Contrato];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
