BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Tenant] ADD [dominioCorporativo] VARCHAR(255);
ALTER TABLE [dbo].[Tenant] ADD [activo] BIT NOT NULL CONSTRAINT [Tenant_activo_df] DEFAULT 1;

-- CreateIndex
-- Índice único FILTRADO (no una constraint UNIQUE normal): SQL Server trata
-- múltiples NULL como valores duplicados en una UNIQUE constraint estándar,
-- y varios tenants (p. ej. el demo) legítimamente no tienen dominio asignado.
-- Se crea con EXEC(dynamic SQL) porque, dentro del mismo batch en el que se
-- agregó la columna con ALTER TABLE, SQL Server no permite referenciarla en
-- otra sentencia sin forzar resolución de nombres diferida.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [Tenant_dominioCorporativo_key] ON [dbo].[Tenant]([dominioCorporativo]) WHERE [dominioCorporativo] IS NOT NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
