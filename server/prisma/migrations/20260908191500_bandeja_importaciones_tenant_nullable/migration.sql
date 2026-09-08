BEGIN TRY

BEGIN TRAN;

-- Corrección de diseño de la migración anterior (20260908190000), aplicada
-- en el mismo día antes de que estas tablas tuvieran ningún dato real: con
-- un único buzón central compartido por varios tenants, el tenant de un
-- correo NO se conoce en el momento de la ingesta — solo tras identificar
-- el proveedor. tenantId debe ser nullable, y la idempotencia real es por
-- messageId solo (único en todo el buzón, independiente del tenant al que
-- se termine atribuyendo). Ver comentario completo en schema.prisma sobre
-- ImportacionCorreo/ImportacionExcepcion.

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionCorreo] DROP CONSTRAINT [ImportacionCorreo_tenantId_fkey];

-- DropConstraint (unique constraint, no un índice suelto)
ALTER TABLE [dbo].[ImportacionCorreo] DROP CONSTRAINT [ImportacionCorreo_tenantId_messageId_key];

-- AlterColumn
ALTER TABLE [dbo].[ImportacionCorreo] ALTER COLUMN [tenantId] UNIQUEIDENTIFIER NULL;

-- CreateIndex (unique, solo messageId)
CREATE UNIQUE NONCLUSTERED INDEX [ImportacionCorreo_messageId_key] ON [dbo].[ImportacionCorreo]([messageId]);

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreo] ADD CONSTRAINT [ImportacionCorreo_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- DropForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] DROP CONSTRAINT [ImportacionExcepcion_tenantId_fkey];

-- AlterColumn
ALTER TABLE [dbo].[ImportacionExcepcion] ALTER COLUMN [tenantId] UNIQUEIDENTIFIER NULL;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] ADD CONSTRAINT [ImportacionExcepcion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
