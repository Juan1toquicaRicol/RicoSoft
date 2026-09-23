-- Índice único FILTRADO sobre Cotizacion(tenantId, erpRowId).
--
-- Mismo criterio que 20260922100000_pedido_comercial_erp_row_id_filtered_unique:
-- un @@unique([tenantId, erpRowId]) plano generaría un UNIQUE sin filtro y
-- SQL Server trata NULL como valor comparable, así que la segunda cotización
-- sin vincular (erpRowId NULL) de un mismo tenant ya lo violaría. El filtro
-- WHERE erpRowId IS NOT NULL deja libres a las no vinculadas y garantiza que
-- un mismo CDV de Siesa no se vincule a dos cotizaciones del mismo tenant.
--
-- Puramente aditiva. Falla (y revierte) si ya existen duplicados
-- (tenantId, erpRowId) no nulos: se verifica primero con un mensaje claro.

BEGIN TRY

BEGIN TRAN;

IF EXISTS (
    SELECT 1 FROM [dbo].[Cotizacion]
    WHERE [erpRowId] IS NOT NULL
    GROUP BY [tenantId], [erpRowId]
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51000, 'Existen cotizaciones duplicadas por (tenantId, erpRowId); depurarlas antes de crear el índice único.', 1;
END;

CREATE UNIQUE NONCLUSTERED INDEX [Cotizacion_tenantId_erpRowId_filtered_uq]
ON [dbo].[Cotizacion] ([tenantId], [erpRowId])
WHERE [erpRowId] IS NOT NULL;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
