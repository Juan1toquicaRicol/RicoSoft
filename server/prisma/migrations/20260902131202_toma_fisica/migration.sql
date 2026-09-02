BEGIN TRY

BEGIN TRAN;

-- CreateTable: toma física mensual (Etapa I) — modelo nativo de RicoSoft,
-- no existe equivalente en Siesa (se buscó y no hay tablas de conteo
-- físico/ajuste de inventario). bodegaRowId referencia una bodega real de
-- Siesa (t150_mc_bodegas), verificada en vivo, pero la toma física en sí
-- vive únicamente en RicoSoft — nunca se escribe de vuelta a Siesa.
CREATE TABLE [dbo].[TomaFisica] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [bodegaRowId] INT NOT NULL,
    [bodegaNombre] VARCHAR(255) NOT NULL,
    [fecha] DATETIME2 NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [TomaFisica_estado_df] DEFAULT 'Abierta',
    [responsableId] UNIQUEIDENTIFIER NOT NULL,
    [responsable] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TomaFisica_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [cerradaEn] DATETIME2,
    CONSTRAINT [TomaFisica_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[TomaFisicaLinea] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tomaFisicaId] UNIQUEIDENTIFIER NOT NULL,
    [itemRowId] INT NOT NULL,
    [descripcion] VARCHAR(255),
    [referencia] VARCHAR(255),
    [stockSistema] DECIMAL(18,4) NOT NULL,
    [conteoFisico] DECIMAL(18,4),
    [valorUnitario] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [TomaFisicaLinea_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [TomaFisica_tenantId_idx] ON [dbo].[TomaFisica]([tenantId]);
CREATE NONCLUSTERED INDEX [TomaFisicaLinea_tomaFisicaId_idx] ON [dbo].[TomaFisicaLinea]([tomaFisicaId]);

-- AddForeignKey
ALTER TABLE [dbo].[TomaFisica] ADD CONSTRAINT [TomaFisica_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[TomaFisicaLinea] ADD CONSTRAINT [TomaFisicaLinea_tomaFisicaId_fkey] FOREIGN KEY ([tomaFisicaId]) REFERENCES [dbo].[TomaFisica]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRAN;
    END;
    THROW

END CATCH
