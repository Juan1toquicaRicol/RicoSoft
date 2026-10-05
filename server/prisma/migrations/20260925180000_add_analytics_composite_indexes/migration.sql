BEGIN TRY

BEGIN TRAN;

-- Índices compuestos para las agregaciones del dashboard/analítica
-- (groupBy/count/aggregate por tenant + eliminado + estado). Solo añade
-- índices: no modifica ni elimina los existentes ni toca datos.

-- CreateIndex
CREATE NONCLUSTERED INDEX [Factura_tenantId_eliminado_estado_idx] ON [dbo].[Factura]([tenantId], [eliminado], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SolicitudCompra_tenantId_eliminado_estado_idx] ON [dbo].[SolicitudCompra]([tenantId], [eliminado], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditoCliente_tenantId_eliminado_estado_idx] ON [dbo].[CreditoCliente]([tenantId], [eliminado], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioSuscripcion_tenantId_eliminado_estado_idx] ON [dbo].[ServicioSuscripcion]([tenantId], [eliminado], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Proforma_tenantId_estado_idx] ON [dbo].[Proforma]([tenantId], [estado]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
