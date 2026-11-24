BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ItemOrdenCompraIntl] ADD [itemRowId] INT,
[siesaCiaId] INT;

-- CreateTable
CREATE TABLE [dbo].[ImportacionAsignacionEmbarque] (
    [loteId] UNIQUEIDENTIFIER NOT NULL,
    [itemId] UNIQUEIDENTIFIER NOT NULL,
    [cantidad] DECIMAL(18,4) NOT NULL,
    [recibida] DECIMAL(18,4) NOT NULL,
    [conciliada] DECIMAL(18,4) NOT NULL,
    [documentoSiesa] NVARCHAR(255),
    [fechaDisponibilidad] CHAR(10),
    [evidenciaFecha] NVARCHAR(255),
    [actualizadoEn] DATETIME2 NOT NULL,
    CONSTRAINT [ImportacionAsignacionEmbarque_pkey] PRIMARY KEY CLUSTERED ([loteId],[itemId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionAsignacionEmbarque_itemId_idx] ON [dbo].[ImportacionAsignacionEmbarque]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemOrdenCompraIntl_siesaCiaId_itemRowId_idx] ON [dbo].[ItemOrdenCompraIntl]([siesaCiaId], [itemRowId]);

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionAsignacionEmbarque] ADD CONSTRAINT [ImportacionAsignacionEmbarque_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionAsignacionEmbarque] ADD CONSTRAINT [ImportacionAsignacionEmbarque_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[ItemOrdenCompraIntl]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
