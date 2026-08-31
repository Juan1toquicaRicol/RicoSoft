BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[CotizacionProveedor] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [solicitudCompraId] UNIQUEIDENTIFIER NOT NULL,
    [proveedorNombre] VARCHAR(255) NOT NULL,
    [proveedorNit] VARCHAR(50) NOT NULL,
    [valorTotalCOP] DECIMAL(18,2) NOT NULL,
    [tiempoEntregaDias] INT NOT NULL,
    [esGanadora] BIT NOT NULL CONSTRAINT [CotizacionProveedor_esGanadora_df] DEFAULT 0,
    [archivoNombre] VARCHAR(255) NOT NULL,
    [archivoRuta] VARCHAR(500) NOT NULL,
    [archivoMime] VARCHAR(100) NOT NULL,
    [archivoTamano] INT NOT NULL,
    [subidoPorId] UNIQUEIDENTIFIER NOT NULL,
    [subidoPorNombre] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CotizacionProveedor_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CotizacionProveedor_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CotizacionProveedor_tenantId_idx] ON [dbo].[CotizacionProveedor]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CotizacionProveedor_solicitudCompraId_idx] ON [dbo].[CotizacionProveedor]([solicitudCompraId]);

-- AddForeignKey
ALTER TABLE [dbo].[CotizacionProveedor] ADD CONSTRAINT [CotizacionProveedor_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CotizacionProveedor] ADD CONSTRAINT [CotizacionProveedor_solicitudCompraId_fkey] FOREIGN KEY ([solicitudCompraId]) REFERENCES [dbo].[SolicitudCompra]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CotizacionProveedor] ADD CONSTRAINT [CotizacionProveedor_subidoPorId_fkey] FOREIGN KEY ([subidoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
