BEGIN TRY

BEGIN TRAN;

-- Módulo Comercial → Gestión Comercial (fase local, sin integración Siesa
-- todavía). Migración puramente ADITIVA: agrega 4 tablas nuevas y una
-- columna nullable (Proforma.cotizacionId) — no elimina ni modifica
-- ninguna columna/tabla existente, no rompe Proformas ni Facturas.

-- AlterTable: relación interna opcional Proforma -> Cotizacion, además de
-- (nunca en reemplazo de) las columnas externas cotizacionOrigen /
-- cotizacionIdExterno / cotizacionNumero / erpDocumentoNumero ya existentes.
ALTER TABLE [dbo].[Proforma] ADD [cotizacionId] UNIQUEIDENTIFIER;

-- CreateTable
CREATE TABLE [dbo].[Cotizacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [numero] INT NOT NULL,
    [clienteRowId] INT NOT NULL,
    [clienteNombre] VARCHAR(255) NOT NULL,
    [clienteNit] VARCHAR(50),
    [contacto] VARCHAR(255),
    [direccion] VARCHAR(500),
    [ciudad] VARCHAR(255),
    [telefono] VARCHAR(50),
    [vendedorNombre] VARCHAR(255),
    [fecha] DATETIME2 NOT NULL CONSTRAINT [Cotizacion_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [fechaVencimiento] DATETIME2,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [Cotizacion_estado_df] DEFAULT 'BORRADOR',
    [moneda] VARCHAR(20) NOT NULL CONSTRAINT [Cotizacion_moneda_df] DEFAULT 'PESOS',
    [observaciones] TEXT,
    [erpTipoDocumento] VARCHAR(10),
    [erpRowId] INT,
    [erpNumero] VARCHAR(50),
    [erpFechaSincronizacion] DATETIME2,
    [erpEstadoSincronizacion] VARCHAR(20),
    [creadoPorId] UNIQUEIDENTIFIER,
    [creadoPorNombre] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Cotizacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Cotizacion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Cotizacion_tenantId_numero_key] UNIQUE NONCLUSTERED ([tenantId],[numero])
);

-- CreateTable
CREATE TABLE [dbo].[CotizacionItem] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [cotizacionId] UNIQUEIDENTIFIER NOT NULL,
    [orden] INT NOT NULL,
    [itemRowId] INT,
    [referencia] VARCHAR(100),
    [descripcion] VARCHAR(500) NOT NULL,
    [bodegaRowId] INT,
    [bodega] VARCHAR(20),
    [unidadMedida] VARCHAR(20),
    [cantidad] DECIMAL(18,4) NOT NULL,
    [precioUnitario] DECIMAL(18,2) NOT NULL,
    [descuentoPct] DECIMAL(5,2) NOT NULL CONSTRAINT [CotizacionItem_descuentoPct_df] DEFAULT 0,
    [ivaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [CotizacionItem_ivaPct_df] DEFAULT 19,
    CONSTRAINT [CotizacionItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PedidoComercial] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [numero] INT NOT NULL,
    [cotizacionId] UNIQUEIDENTIFIER,
    [proformaId] UNIQUEIDENTIFIER,
    [clienteRowId] INT NOT NULL,
    [clienteNombre] VARCHAR(255) NOT NULL,
    [clienteNit] VARCHAR(50),
    [vendedorNombre] VARCHAR(255),
    [fecha] DATETIME2 NOT NULL CONSTRAINT [PedidoComercial_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [PedidoComercial_estado_df] DEFAULT 'BORRADOR',
    [moneda] VARCHAR(20) NOT NULL CONSTRAINT [PedidoComercial_moneda_df] DEFAULT 'PESOS',
    [observaciones] TEXT,
    [erpTipoDocumento] VARCHAR(10),
    [erpRowId] INT,
    [erpNumero] VARCHAR(50),
    [erpFechaSincronizacion] DATETIME2,
    [erpEstadoSincronizacion] VARCHAR(20),
    [creadoPorId] UNIQUEIDENTIFIER,
    [creadoPorNombre] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PedidoComercial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PedidoComercial_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PedidoComercial_tenantId_numero_key] UNIQUE NONCLUSTERED ([tenantId],[numero])
);

-- CreateTable
CREATE TABLE [dbo].[PedidoComercialItem] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [pedidoId] UNIQUEIDENTIFIER NOT NULL,
    [orden] INT NOT NULL,
    [itemRowId] INT,
    [referencia] VARCHAR(100),
    [descripcion] VARCHAR(500) NOT NULL,
    [bodegaRowId] INT,
    [bodega] VARCHAR(20),
    [unidadMedida] VARCHAR(20),
    [cantidad] DECIMAL(18,4) NOT NULL,
    [precioUnitario] DECIMAL(18,2) NOT NULL,
    [descuentoPct] DECIMAL(5,2) NOT NULL CONSTRAINT [PedidoComercialItem_descuentoPct_df] DEFAULT 0,
    [ivaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [PedidoComercialItem_ivaPct_df] DEFAULT 19,
    CONSTRAINT [PedidoComercialItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Cotizacion_tenantId_clienteRowId_idx] ON [dbo].[Cotizacion]([tenantId], [clienteRowId]);
CREATE NONCLUSTERED INDEX [Cotizacion_tenantId_estado_idx] ON [dbo].[Cotizacion]([tenantId], [estado]);
CREATE NONCLUSTERED INDEX [Cotizacion_tenantId_fecha_idx] ON [dbo].[Cotizacion]([tenantId], [fecha]);
CREATE NONCLUSTERED INDEX [CotizacionItem_cotizacionId_idx] ON [dbo].[CotizacionItem]([cotizacionId]);
CREATE NONCLUSTERED INDEX [PedidoComercial_tenantId_clienteRowId_idx] ON [dbo].[PedidoComercial]([tenantId], [clienteRowId]);
CREATE NONCLUSTERED INDEX [PedidoComercial_tenantId_estado_idx] ON [dbo].[PedidoComercial]([tenantId], [estado]);
CREATE NONCLUSTERED INDEX [PedidoComercial_tenantId_fecha_idx] ON [dbo].[PedidoComercial]([tenantId], [fecha]);
CREATE NONCLUSTERED INDEX [PedidoComercial_cotizacionId_idx] ON [dbo].[PedidoComercial]([cotizacionId]);
CREATE NONCLUSTERED INDEX [PedidoComercial_proformaId_idx] ON [dbo].[PedidoComercial]([proformaId]);
CREATE NONCLUSTERED INDEX [PedidoComercialItem_pedidoId_idx] ON [dbo].[PedidoComercialItem]([pedidoId]);
CREATE NONCLUSTERED INDEX [Proforma_tenantId_cotizacionId_idx] ON [dbo].[Proforma]([tenantId], [cotizacionId]);

-- AddForeignKey
ALTER TABLE [dbo].[Proforma] ADD CONSTRAINT [Proforma_cotizacionId_fkey] FOREIGN KEY ([cotizacionId]) REFERENCES [dbo].[Cotizacion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[Cotizacion] ADD CONSTRAINT [Cotizacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[Cotizacion] ADD CONSTRAINT [Cotizacion_creadoPorId_fkey] FOREIGN KEY ([creadoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[CotizacionItem] ADD CONSTRAINT [CotizacionItem_cotizacionId_fkey] FOREIGN KEY ([cotizacionId]) REFERENCES [dbo].[Cotizacion]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[PedidoComercial] ADD CONSTRAINT [PedidoComercial_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[PedidoComercial] ADD CONSTRAINT [PedidoComercial_cotizacionId_fkey] FOREIGN KEY ([cotizacionId]) REFERENCES [dbo].[Cotizacion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[PedidoComercial] ADD CONSTRAINT [PedidoComercial_proformaId_fkey] FOREIGN KEY ([proformaId]) REFERENCES [dbo].[Proforma]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[PedidoComercial] ADD CONSTRAINT [PedidoComercial_creadoPorId_fkey] FOREIGN KEY ([creadoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[PedidoComercialItem] ADD CONSTRAINT [PedidoComercialItem_pedidoId_fkey] FOREIGN KEY ([pedidoId]) REFERENCES [dbo].[PedidoComercial]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
