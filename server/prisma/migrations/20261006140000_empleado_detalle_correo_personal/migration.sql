-- Correo personal opcional del colaborador (EmpleadoDetalle). Aditiva: columna NULL-able.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[EmpleadoDetalle] ADD [correoPersonal] VARCHAR(255);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

