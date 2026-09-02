BEGIN TRY

BEGIN TRAN;

-- CreateTable: umbrales del módulo Producción & Planeación, configurables
-- por tenant (Parte 16 del plan) en vez de constantes fijas en el código.
-- Una fila por tenant como máximo (tenantId es único); si no existe, el
-- backend usa los valores por defecto documentados en lib/inventario-siesa.ts.
CREATE TABLE [dbo].[ConfiguracionInventario] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [diasVendible] INT NOT NULL CONSTRAINT [ConfiguracionInventario_diasVendible_df] DEFAULT 60,
    [diasExceso] INT NOT NULL CONSTRAINT [ConfiguracionInventario_diasExceso_df] DEFAULT 180,
    [diasRupturaCobertura] INT NOT NULL CONSTRAINT [ConfiguracionInventario_diasRupturaCobertura_df] DEFAULT 15,
    [diasSobreCobertura] INT NOT NULL CONSTRAINT [ConfiguracionInventario_diasSobreCobertura_df] DEFAULT 180,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ConfiguracionInventario_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ConfiguracionInventario_tenantId_key] UNIQUE NONCLUSTERED ([tenantId])
);

-- AddForeignKey
ALTER TABLE [dbo].[ConfiguracionInventario] ADD CONSTRAINT [ConfiguracionInventario_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRAN;
    END;
    THROW

END CATCH
