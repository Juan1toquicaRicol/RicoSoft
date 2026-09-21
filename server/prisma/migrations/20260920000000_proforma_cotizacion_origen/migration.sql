BEGIN TRY

BEGIN TRAN;

-- Vinculación opcional entre Proforma y su cotización de origen (CRM/Siesa).
-- Todos los campos son nullable / con default: no destructivo, proformas ya
-- existentes quedan con estado = 'activa' y las columnas de cotización en NULL.
ALTER TABLE [dbo].[Proforma] ADD [estado] VARCHAR(20) NOT NULL CONSTRAINT [Proforma_estado_df] DEFAULT 'activa';
ALTER TABLE [dbo].[Proforma] ADD [cotizacionOrigen] VARCHAR(30) NULL;
ALTER TABLE [dbo].[Proforma] ADD [cotizacionIdExterno] VARCHAR(50) NULL;
ALTER TABLE [dbo].[Proforma] ADD [cotizacionNumero] VARCHAR(50) NULL;
ALTER TABLE [dbo].[Proforma] ADD [erpDocumentoNumero] VARCHAR(50) NULL;

CREATE INDEX [Proforma_tenantId_cotizacionIdExterno_idx] ON [dbo].[Proforma]([tenantId], [cotizacionIdExterno]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
