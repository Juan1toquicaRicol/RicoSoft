-- Índice único FILTRADO sobre PedidoComercial(tenantId, erpRowId).
--
-- No se declara como @@unique en schema.prisma a propósito: Prisma Schema
-- Language no puede expresar un índice único filtrado (WHERE erpRowId IS NOT
-- NULL) para SQL Server en la versión instalada (5.22) — un @@unique([tenantId,
-- erpRowId]) generaría un UNIQUE CONSTRAINT sin filtro, y SQL Server trata
-- NULL como un valor comparable dentro de un índice único compuesto (a
-- diferencia de PostgreSQL): como tenantId es constante por tenant y erpRowId
-- es NULL en todo pedido aún no vinculado, el SEGUNDO pedido sin vincular de
-- cualquier tenant ya rompería un @@unique plano. Ver comentario junto a los
-- campos erp* en schema.prisma.
--
-- Verificado antes de crear esta migración que ningún índice con este nombre
-- existe ya en el resto de prisma/migrations/*/migration.sql (grep sin
-- resultados). Verificado también que PedidoComercial no tiene filas hoy
-- (0 registros, 0 con erpRowId IS NOT NULL) — no hay duplicados que puedan
-- bloquear esta migración.
--
-- Puramente aditiva: no toca ninguna columna ni fila existente.

BEGIN TRY

BEGIN TRAN;

CREATE UNIQUE NONCLUSTERED INDEX [PedidoComercial_tenantId_erpRowId_filtered_uq]
ON [dbo].[PedidoComercial] ([tenantId], [erpRowId])
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
