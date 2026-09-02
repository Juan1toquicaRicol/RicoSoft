BEGIN TRY

BEGIN TRAN;

-- AlterTable: aditivo, nullable, no afecta ninguna fila existente por sí solo.
ALTER TABLE [dbo].[Modulo] ADD [permisoClave] VARCHAR(150);

-- Backfill determinístico por clave, para que los módulos ya existentes
-- (creados por asegurarCatalogoDefecto antes de esta columna) queden
-- correctamente filtrados por permiso de inmediato, sin depender de que se
-- vuelvan a crear. Mapeo verificado 1:1 contra el requirePermission real de
-- cada endpoint (*.routes.ts) — no es una suposición.
-- "dashboard" y "bandeja" quedan NULL a propósito: visibles para cualquier
-- usuario autenticado, igual que hoy.
--
-- Se ejecuta con EXEC(dynamic SQL) porque, dentro del mismo batch en el que
-- se agregó la columna, SQL Server resuelve los nombres al analizar el
-- batch completo — no ve [permisoClave] como válido todavía aunque el ADD
-- ya se haya ejecutado antes en el mismo batch. Mismo patrón ya usado en
-- 20260827200000_fix_tenant_siesacia_id_filtered_unique.
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''facturas.ver'' WHERE [clave] = ''facturas''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''solicitudes.ver'' WHERE [clave] = ''solicitudes-compra''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''solicitudes.ver'' WHERE [clave] = ''historia-compras''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''servicios.ver'' WHERE [clave] = ''servicios''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''contratos.ver'' WHERE [clave] = ''contratos''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''reglas.ver'' WHERE [clave] = ''reglas''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''creditos.ver'' WHERE [clave] = ''creditos''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''empleados.ver'' WHERE [clave] = ''gestion-humana''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''analitica.ver'' WHERE [clave] = ''analitica''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''analitica.ver'' WHERE [clave] = ''proyeccion''');
EXEC('UPDATE [dbo].[Modulo] SET [permisoClave] = ''importaciones.ver'' WHERE [clave] = ''importaciones''');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
