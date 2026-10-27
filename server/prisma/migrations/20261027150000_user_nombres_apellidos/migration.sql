-- User: nombres y apellidos como columnas independientes y OPCIONALES.
-- 100% aditiva: dos columnas nullable en [dbo].[User]. No toca datos, índices ni la columna
-- [nombre] (sigue siendo el nombre completo). Las cuentas existentes quedan con NULL en ambas
-- (pendientes de completar): NO se separa ningún nombre automáticamente.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [apellidos] VARCHAR(255),
[nombres] VARCHAR(255);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
