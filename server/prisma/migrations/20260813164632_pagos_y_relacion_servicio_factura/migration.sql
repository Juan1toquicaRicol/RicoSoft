BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Factura] ADD [contratoId] UNIQUEIDENTIFIER,
[servicioId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[ServicioSuscripcion] ADD [contratoId] UNIQUEIDENTIFIER,
[descripcion] TEXT,
[diaVencimiento] INT,
[fechaFin] DATETIME2,
[fechaInicio] DATETIME2,
[observaciones] TEXT;

-- CreateTable
CREATE TABLE [dbo].[Pago] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [facturaId] UNIQUEIDENTIFIER NOT NULL,
    [fecha] DATETIME2 NOT NULL CONSTRAINT [Pago_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [valor] DECIMAL(18,2) NOT NULL,
    [metodoPago] VARCHAR(50) NOT NULL,
    [referencia] VARCHAR(255),
    [comprobanteNombre] VARCHAR(255),
    [comprobanteRuta] VARCHAR(500),
    [comprobanteMime] VARCHAR(100),
    [comprobanteTamano] INT,
    [registradoPorId] UNIQUEIDENTIFIER NOT NULL,
    [registradoPorNombre] VARCHAR(255) NOT NULL,
    [observaciones] TEXT,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [Pago_estado_df] DEFAULT 'Confirmado',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Pago_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Pago_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Pago_tenantId_idx] ON [dbo].[Pago]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Pago_facturaId_idx] ON [dbo].[Pago]([facturaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Factura_tenantId_servicioId_idx] ON [dbo].[Factura]([tenantId], [servicioId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Factura_tenantId_estado_idx] ON [dbo].[Factura]([tenantId], [estado]);

-- AddForeignKey
ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_servicioId_fkey] FOREIGN KEY ([servicioId]) REFERENCES [dbo].[ServicioSuscripcion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_contratoId_fkey] FOREIGN KEY ([contratoId]) REFERENCES [dbo].[Contrato]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pago] ADD CONSTRAINT [Pago_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pago] ADD CONSTRAINT [Pago_facturaId_fkey] FOREIGN KEY ([facturaId]) REFERENCES [dbo].[Factura]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Pago] ADD CONSTRAINT [Pago_registradoPorId_fkey] FOREIGN KEY ([registradoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioSuscripcion] ADD CONSTRAINT [ServicioSuscripcion_contratoId_fkey] FOREIGN KEY ([contratoId]) REFERENCES [dbo].[Contrato]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

