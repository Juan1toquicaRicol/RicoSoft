-- Verificación del correo en el autoregistro (código de 6 dígitos).
-- 100% aditiva: dos columnas nuevas en [dbo].[User] (BIT NOT NULL con DEFAULT 0, y una
-- DATETIME2 nullable) y una tabla nueva [dbo].[CodigoVerificacionCorreo]. No toca datos,
-- índices ni columnas existentes. Las cuentas existentes quedan con
-- emailVerificacionPendiente = 0 y emailVerificadoAt = NULL: no se les exige verificación.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[User] ADD [emailVerificacionPendiente] BIT NOT NULL CONSTRAINT [User_emailVerificacionPendiente_df] DEFAULT 0,
[emailVerificadoAt] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[CodigoVerificacionCorreo] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [codigoHash] VARCHAR(64) NOT NULL,
    [expiraEn] DATETIME2 NOT NULL,
    [intentos] INT NOT NULL CONSTRAINT [CodigoVerificacionCorreo_intentos_df] DEFAULT 0,
    [usadoEn] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CodigoVerificacionCorreo_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CodigoVerificacionCorreo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CodigoVerificacionCorreo_userId_createdAt_idx] ON [dbo].[CodigoVerificacionCorreo]([userId], [createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[CodigoVerificacionCorreo] ADD CONSTRAINT [CodigoVerificacionCorreo_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
