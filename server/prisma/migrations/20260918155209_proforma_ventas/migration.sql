BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Proforma] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [numero] INT NOT NULL,
    [clienteRowId] INT NOT NULL,
    [clienteNombre] NVARCHAR(255) NOT NULL,
    [clienteNit] NVARCHAR(50) NULL,
    [contacto] NVARCHAR(255) NULL,
    [direccion] NVARCHAR(500) NULL,
    [ciudad] NVARCHAR(255) NULL,
    [telefono] NVARCHAR(50) NULL,
    [formaPago] NVARCHAR(100) NULL,
    [fechaVencimiento] DATETIME2 NULL,
    [vendedorNombre] NVARCHAR(255) NULL,
    [ocNumero] NVARCHAR(100) NULL,
    [documentoAlterno] NVARCHAR(100) NULL,
    [remisiones] NVARCHAR(100) NULL,
    [moneda] NVARCHAR(20) NOT NULL CONSTRAINT [Proforma_moneda_df] DEFAULT 'PESOS',
    [observaciones] NVARCHAR(max) NULL,
    [aplicaRetencion] BIT NOT NULL CONSTRAINT [Proforma_aplicaRetencion_df] DEFAULT 0,
    [retencionPct] DECIMAL(5,2) NOT NULL CONSTRAINT [Proforma_retencionPct_df] DEFAULT 2.5,
    [aplicaIca] BIT NOT NULL CONSTRAINT [Proforma_aplicaIca_df] DEFAULT 0,
    [icaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [Proforma_icaPct_df] DEFAULT 0.7,
    [creadoPorId] UNIQUEIDENTIFIER NULL,
    [creadoPorNombre] NVARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Proforma_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Proforma_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Proforma_tenantId_numero_key] UNIQUE ([tenantId], [numero])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Proforma_tenantId_clienteRowId_idx] ON [dbo].[Proforma]([tenantId], [clienteRowId]);

-- AddForeignKey
ALTER TABLE [dbo].[Proforma] ADD CONSTRAINT [Proforma_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Proforma] ADD CONSTRAINT [Proforma_creadoPorId_fkey] FOREIGN KEY ([creadoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE [dbo].[ProformaItem] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [proformaId] UNIQUEIDENTIFIER NOT NULL,
    [orden] INT NOT NULL,
    [itemRowId] INT NULL,
    [referencia] NVARCHAR(100) NULL,
    [descripcion] NVARCHAR(500) NOT NULL,
    [bodega] NVARCHAR(20) NULL,
    [unidadMedida] NVARCHAR(20) NULL,
    [cantidad] DECIMAL(18,4) NOT NULL,
    [precioUnitario] DECIMAL(18,2) NOT NULL,
    [descuentoPct] DECIMAL(5,2) NOT NULL CONSTRAINT [ProformaItem_descuentoPct_df] DEFAULT 0,
    [ivaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [ProformaItem_ivaPct_df] DEFAULT 19,
    CONSTRAINT [ProformaItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProformaItem_proformaId_idx] ON [dbo].[ProformaItem]([proformaId]);

-- AddForeignKey
ALTER TABLE [dbo].[ProformaItem] ADD CONSTRAINT [ProformaItem_proformaId_fkey] FOREIGN KEY ([proformaId]) REFERENCES [dbo].[Proforma]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
