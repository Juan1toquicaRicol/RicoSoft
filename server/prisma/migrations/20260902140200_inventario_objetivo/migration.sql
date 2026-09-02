BEGIN TRY

BEGIN TRAN;

-- AlterTable: inventario objetivo configurable (Fase 6) — cobertura deseada
-- en días + factor de seguridad, en vez de valores fijos en el código.
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [coberturaObjetivoDias] INT NOT NULL CONSTRAINT [ConfiguracionInventario_coberturaObjetivoDias_df] DEFAULT 45;
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [factorSeguridad] FLOAT(53) NOT NULL CONSTRAINT [ConfiguracionInventario_factorSeguridad_df] DEFAULT 1.0;

COMMIT TRAN;

END TRY
BEGIN CATCH

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRAN;
    END;
    THROW

END CATCH
