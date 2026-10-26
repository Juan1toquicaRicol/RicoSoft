-- Importaciones: hitos reales de lote, documentos de lote (B/L-AWB, COA, otros) y método de prorrateo.
-- 100% aditiva: dos tablas nuevas y UNA columna nullable en CosteoImportacionDetalle. No toca datos,
-- índices ni columnas existentes. Las liquidaciones históricas quedan con metodoProrrateoGastos = NULL
-- (todas se prorratearon por participación FOB).
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[CosteoImportacionDetalle] ADD [metodoProrrateoGastos] VARCHAR(10);

-- CreateTable
CREATE TABLE [dbo].[LoteImportacionHito] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [loteId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(30) NOT NULL,
    [fecha] DATETIME2 NOT NULL,
    [origen] VARCHAR(20) NOT NULL,
    [nota] VARCHAR(500),
    [registradoPorId] UNIQUEIDENTIFIER,
    [registradoPorNombre] VARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoteImportacionHito_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [LoteImportacionHito_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LoteImportacionHito_loteId_tipo_key] UNIQUE NONCLUSTERED ([loteId],[tipo])
);

-- CreateTable
CREATE TABLE [dbo].[LoteImportacionDocumento] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [loteId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(30) NOT NULL,
    [nombreOriginal] VARCHAR(255) NOT NULL,
    [mime] VARCHAR(100) NOT NULL,
    [tamano] INT NOT NULL,
    [ruta] VARCHAR(500) NOT NULL,
    [subidoPorId] UNIQUEIDENTIFIER,
    [subidoPorNombre] VARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoteImportacionDocumento_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LoteImportacionDocumento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoteImportacionHito_tenantId_tipo_idx] ON [dbo].[LoteImportacionHito]([tenantId], [tipo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoteImportacionDocumento_tenantId_loteId_idx] ON [dbo].[LoteImportacionDocumento]([tenantId], [loteId]);

-- AddForeignKey
ALTER TABLE [dbo].[LoteImportacionHito] ADD CONSTRAINT [LoteImportacionHito_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LoteImportacionHito] ADD CONSTRAINT [LoteImportacionHito_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LoteImportacionDocumento] ADD CONSTRAINT [LoteImportacionDocumento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LoteImportacionDocumento] ADD CONSTRAINT [LoteImportacionDocumento_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

