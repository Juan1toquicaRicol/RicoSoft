-- Backfill del permiso comercial.proformas.aceptar (auditoría RBAC 2026-09).
--
-- POST /proformas/:id/aceptar pasó a exigir comercial.proformas.aceptar (antes
-- bastaba proformas.gestionar). Para que las cuentas operativas no queden
-- bloqueadas tras el despliegue, se otorga el permiso nuevo a TODO rol que ya
-- tenga proformas.gestionar (o su alias legado proformas.manipular). No hay
-- roles por defecto en el seed con esos permisos: los roles son filas por
-- tenant (Rol.permisos = arreglo JSON en texto), por eso el backfill es de
-- datos. La fila del catálogo Permiso la siembra en runtime
-- asegurarCatalogoSembrado().
--
-- Idempotente (no vuelve a agregarlo si ya está) y solo AGREGA: no quita ni
-- reordena ningún permiso existente. Un administrador puede retirarlo después
-- desde Configuración > Roles.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[Rol]
SET [permisos] = LEFT(
      RTRIM(CAST([permisos] AS NVARCHAR(MAX))),
      LEN(RTRIM(CAST([permisos] AS NVARCHAR(MAX)))) - 1
    ) + N',"comercial.proformas.aceptar"]'
WHERE (
      [permisos] LIKE N'%"proformas.gestionar"%'
      OR [permisos] LIKE N'%"proformas.manipular"%'
    )
  AND [permisos] NOT LIKE N'%"comercial.proformas.aceptar"%'
  AND RIGHT(RTRIM(CAST([permisos] AS NVARCHAR(MAX))), 1) = N']';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
