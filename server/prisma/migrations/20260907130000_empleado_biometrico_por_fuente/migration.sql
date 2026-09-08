BEGIN TRY

BEGIN TRAN;

-- DropIndex
ALTER TABLE [dbo].[EmpleadoBiometrico] DROP CONSTRAINT [EmpleadoBiometrico_tenantId_empleadoId_proveedor_key];

-- DropIndex
ALTER TABLE [dbo].[EmpleadoBiometrico] DROP CONSTRAINT [EmpleadoBiometrico_tenantId_proveedor_externalUserId_key];

-- AlterTable
-- Sin DEFAULT porque EmpleadoBiometrico está vacía en todos los entornos
-- donde se ha aplicado hasta ahora (Fase 6 recién se construyó, ninguna
-- asociación real fue creada todavía). Si esta migración se aplica alguna
-- vez sobre una tabla con filas existentes, esta sentencia fallará y habrá
-- que backfillear fuenteId antes.
ALTER TABLE [dbo].[EmpleadoBiometrico] ADD [fuenteId] UNIQUEIDENTIFIER NOT NULL;

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoBiometrico_fuenteId_idx] ON [dbo].[EmpleadoBiometrico]([fuenteId]);

-- CreateIndex
ALTER TABLE [dbo].[EmpleadoBiometrico] ADD CONSTRAINT [EmpleadoBiometrico_tenantId_fuenteId_externalUserId_key] UNIQUE NONCLUSTERED ([tenantId], [fuenteId], [externalUserId]);

-- CreateIndex
ALTER TABLE [dbo].[EmpleadoBiometrico] ADD CONSTRAINT [EmpleadoBiometrico_tenantId_empleadoId_fuenteId_key] UNIQUE NONCLUSTERED ([tenantId], [empleadoId], [fuenteId]);

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoBiometrico] ADD CONSTRAINT [EmpleadoBiometrico_fuenteId_fkey] FOREIGN KEY ([fuenteId]) REFERENCES [dbo].[FuenteBiometrica]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
