BEGIN TRY

BEGIN TRAN;

-- AlterTable: Proforma — retención de IVA (nueva, desactivada por defecto
-- para no cambiar el comportamiento de proformas ya creadas).
ALTER TABLE [dbo].[Proforma] ADD [aplicaRetencionIva] BIT NOT NULL CONSTRAINT [Proforma_aplicaRetencionIva_df] DEFAULT 0;
ALTER TABLE [dbo].[Proforma] ADD [retencionIvaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [Proforma_retencionIvaPct_df] DEFAULT 15;

-- AlterTable: ProformaItem — bodega real de Siesa (bodegaRowId), conservando
-- el nombre ya resuelto en la columna existente [bodega].
ALTER TABLE [dbo].[ProformaItem] ADD [bodegaRowId] INT NULL;

-- CreateTable
CREATE TABLE [dbo].[ConfiguracionComercial] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [retencionFuentePct] DECIMAL(5,2) NOT NULL CONSTRAINT [ConfiguracionComercial_retencionFuentePct_df] DEFAULT 2.5,
    [retencionIvaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [ConfiguracionComercial_retencionIvaPct_df] DEFAULT 15,
    [retencionIcaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [ConfiguracionComercial_retencionIcaPct_df] DEFAULT 0.7,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ConfiguracionComercial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ConfiguracionComercial_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ConfiguracionComercial_tenantId_key] UNIQUE ([tenantId])
);

-- AddForeignKey
ALTER TABLE [dbo].[ConfiguracionComercial] ADD CONSTRAINT [ConfiguracionComercial_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
