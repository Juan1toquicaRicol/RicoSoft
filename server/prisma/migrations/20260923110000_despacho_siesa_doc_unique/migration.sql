-- Unicidad de Despacho(tenantId, siesaDocRowId): un documento de venta de
-- Siesa origina a lo sumo UN despacho por tenant. Antes solo se comprobaba
-- con un findFirst previo (carrera real bajo concurrencia). siesaDocRowId es
-- NOT NULL, así que aquí SÍ aplica un @@unique plano (sin filtro).
--
-- Reemplaza al índice no único Despacho_tenantId_siesaDocRowId_idx (el
-- índice único cubre las mismas consultas). Falla (y revierte) si ya existen
-- duplicados: se verifica primero con un mensaje claro.

BEGIN TRY

BEGIN TRAN;

IF EXISTS (
    SELECT 1 FROM [dbo].[Despacho]
    GROUP BY [tenantId], [siesaDocRowId]
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51000, 'Existen despachos duplicados por (tenantId, siesaDocRowId); depurarlos antes de crear el índice único.', 1;
END;

DROP INDEX [Despacho_tenantId_siesaDocRowId_idx] ON [dbo].[Despacho];

CREATE UNIQUE NONCLUSTERED INDEX [Despacho_tenantId_siesaDocRowId_key] ON [dbo].[Despacho]([tenantId], [siesaDocRowId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
