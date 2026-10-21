-- Tipo de contrato del colaborador (nombre del catálogo, tipo TIPO_CONTRATO). Aditiva: columna NULL-able.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Empleado] ADD [tipoContrato] VARCHAR(150);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

