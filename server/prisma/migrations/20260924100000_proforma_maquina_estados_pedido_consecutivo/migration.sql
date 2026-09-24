-- 1) Máquina de estados de Proforma: ENVIADA -> ACEPTADA -> PEDIDO_CREADO | ANULADA.
--    'estado' sigue siendo VARCHAR(20); cambia el default y se migran los datos.
-- 2) Índice único FILTRADO: máximo un PedidoComercial por Proforma (por tenant).
-- 3) Contador monotónico del consecutivo de PedidoComercial por tenant.
--
-- Aditiva salvo la conversión de valores de Proforma.estado. Falla (y revierte)
-- si ya hay proformas con más de un pedido (se verifica antes con mensaje claro).

BEGIN TRY

BEGIN TRAN;

-- ── Proforma.estado ─────────────────────────────────────────────────────────
ALTER TABLE [dbo].[Proforma] DROP CONSTRAINT [Proforma_estado_df];
ALTER TABLE [dbo].[Proforma] ADD CONSTRAINT [Proforma_estado_df] DEFAULT 'ENVIADA' FOR [estado];

UPDATE [dbo].[Proforma] SET [estado] = 'ENVIADA' WHERE [estado] = 'activa';
UPDATE [dbo].[Proforma] SET [estado] = 'ANULADA' WHERE [estado] = 'anulada';

-- Una proforma "activa" que YA originó un pedido no puede quedar ENVIADA (se
-- podría aceptar y generar un segundo pedido): pasa a PEDIDO_CREADO.
UPDATE p SET p.[estado] = 'PEDIDO_CREADO'
FROM [dbo].[Proforma] p
WHERE p.[estado] = 'ENVIADA'
  AND EXISTS (SELECT 1 FROM [dbo].[PedidoComercial] pc WHERE pc.[proformaId] = p.[id]);

-- ── Máximo un PedidoComercial por Proforma ──────────────────────────────────
IF EXISTS (
    SELECT 1 FROM [dbo].[PedidoComercial]
    WHERE [proformaId] IS NOT NULL
    GROUP BY [tenantId], [proformaId]
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51000, 'Existen proformas con mas de un PedidoComercial; depurarlas antes de crear el indice unico.', 1;
END;

CREATE UNIQUE NONCLUSTERED INDEX [PedidoComercial_tenantId_proformaId_filtered_uq]
ON [dbo].[PedidoComercial] ([tenantId], [proformaId])
WHERE [proformaId] IS NOT NULL;

-- ── Contador monotónico de PedidoComercial ──────────────────────────────────
ALTER TABLE [dbo].[ConfiguracionComercial] ADD [siguienteConsecutivoPedidoComercial] INT NOT NULL
CONSTRAINT [ConfiguracionComercial_siguienteConsecutivoPedidoComercial_df] DEFAULT 1;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
