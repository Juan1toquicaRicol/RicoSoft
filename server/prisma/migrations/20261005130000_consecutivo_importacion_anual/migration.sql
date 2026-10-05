-- Contador anual del consecutivo de órdenes internacionales (IMP-<año>-<n>) por tenant.
-- Aditiva: tabla nueva, sin tocar OrdenCompraIntl ni sus códigos/numeroOrden históricos.
-- El siguiente efectivo sigue siendo max(contador, MAX(consecutivo de códigos existentes del año)+1),
-- así que un número ya usado (incluido el de una orden anulada) no puede repetirse.
BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ConsecutivoImportacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [anio] INT NOT NULL,
    [siguienteConsecutivo] INT NOT NULL CONSTRAINT [ConsecutivoImportacion_siguienteConsecutivo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ConsecutivoImportacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ConsecutivoImportacion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ConsecutivoImportacion_tenantId_anio_key] UNIQUE NONCLUSTERED ([tenantId],[anio])
);

-- AddForeignKey
ALTER TABLE [dbo].[ConsecutivoImportacion] ADD CONSTRAINT [ConsecutivoImportacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
