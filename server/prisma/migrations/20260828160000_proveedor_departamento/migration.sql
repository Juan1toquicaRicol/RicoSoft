BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Proveedor] ADD [departamentoId] UNIQUEIDENTIFIER;

-- CreateIndex
CREATE NONCLUSTERED INDEX [Proveedor_tenantId_departamentoId_idx] ON [dbo].[Proveedor]([tenantId], [departamentoId]);

-- AddForeignKey
ALTER TABLE [dbo].[Proveedor] ADD CONSTRAINT [Proveedor_departamentoId_fkey] FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
