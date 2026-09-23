-- Contador monotónico del consecutivo de Proforma por tenant (default 3890 = valor histórico).
-- Aditiva: filas existentes toman el default; el siguiente efectivo sigue siendo
-- max(contador, MAX(Proforma.numero)+1), así que no se puede repetir un número ya usado.
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[ConfiguracionComercial] ADD [siguienteConsecutivoProforma] INT NOT NULL
CONSTRAINT [ConfiguracionComercial_siguienteConsecutivoProforma_df] DEFAULT 3890;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
