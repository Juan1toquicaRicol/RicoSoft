BEGIN TRY

BEGIN TRAN;

-- Departamento, Rol y Modulo pasan a permitir tenantId = NULL, que
-- representa alcance GENERAL (visible/usable por todos los tenants, un
-- único registro). Es un cambio puramente aditivo: todos los registros
-- existentes ya tienen tenantId con un valor concreto, así que su
-- comportamiento actual (exclusivos de su empresa) NO cambia — nada se
-- convierte automáticamente en GENERAL.
--
-- SQL Server no permite ALTER COLUMN sobre una columna que participa en un
-- índice/constraint sin soltarlo primero, así que cada índice que toca
-- tenantId se suelta y se vuelve a crear idéntico alrededor del ALTER.
-- Las FK (Departamento_tenantId_fkey, Rol_tenantId_fkey, Modulo_tenantId_fkey)
-- no se tocan: una FK en SQL Server no valida una columna en NULL contra la
-- tabla referenciada, así que toleran la nueva nulabilidad sin cambios.

DROP INDEX [Departamento_tenantId_idx] ON [dbo].[Departamento];
ALTER TABLE [dbo].[Departamento] ALTER COLUMN [tenantId] UNIQUEIDENTIFIER NULL;
CREATE NONCLUSTERED INDEX [Departamento_tenantId_idx] ON [dbo].[Departamento]([tenantId]);

DROP INDEX [Rol_tenantId_idx] ON [dbo].[Rol];
ALTER TABLE [dbo].[Rol] ALTER COLUMN [tenantId] UNIQUEIDENTIFIER NULL;
CREATE NONCLUSTERED INDEX [Rol_tenantId_idx] ON [dbo].[Rol]([tenantId]);

DROP INDEX [Modulo_tenantId_idx] ON [dbo].[Modulo];
ALTER TABLE [dbo].[Modulo] DROP CONSTRAINT [Modulo_tenantId_clave_key];
ALTER TABLE [dbo].[Modulo] ALTER COLUMN [tenantId] UNIQUEIDENTIFIER NULL;
CREATE NONCLUSTERED INDEX [Modulo_tenantId_idx] ON [dbo].[Modulo]([tenantId]);
-- Índice compuesto normal (no filtrado): SQL Server compara la tupla
-- completa, así que solo permite UN módulo general por clave (NULL, clave)
-- a la vez que sigue permitiendo esa misma clave una vez por tenant.
ALTER TABLE [dbo].[Modulo] ADD CONSTRAINT [Modulo_tenantId_clave_key] UNIQUE NONCLUSTERED ([tenantId], [clave]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
