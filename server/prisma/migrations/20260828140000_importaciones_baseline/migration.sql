BEGIN TRY

BEGIN TRAN;

-- Baseline retroactivo del módulo de Importaciones: estas 8 tablas ya existen
-- en la base de datos de desarrollo (creadas ahí vía `prisma db push`, nunca
-- capturadas como migración — ver IMPORTACIONES_SCHEMA_RECONCILIATION.md).
-- Este DDL fue verificado columna por columna, índice por índice y FK por FK
-- contra la estructura real de esa base (INFORMATION_SCHEMA + sys.indexes +
-- sys.foreign_keys), no reconstruido solo desde schema.prisma. En una base
-- nueva (CI, un clon nuevo del repo), esta migración crea las 8 tablas desde
-- cero. Sobre una base donde ya existen (como la de desarrollo), NO debe
-- ejecutarse este SQL — se reconcilia con `prisma migrate resolve --applied
-- 20260828140000_importaciones_baseline`, que registra la migración como ya
-- aplicada sin tocar los objetos ni los datos existentes (ver
-- IMPORTACIONES_MIGRATION_PLAN.md).

-- CreateTable
CREATE TABLE [dbo].[ClasificacionArancelariaMatriz] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [subpartida] VARCHAR(10) NOT NULL,
    [descripcion] VARCHAR(500) NOT NULL,
    [tarifaArancelariaBase] DECIMAL(9,4) NOT NULL,
    [requiereInvima] BIT NOT NULL CONSTRAINT [ClasificacionArancelariaMatriz_requiereInvima_df] DEFAULT 0,
    [requiereIca] BIT NOT NULL CONSTRAINT [ClasificacionArancelariaMatriz_requiereIca_df] DEFAULT 0,
    [decretoReferencia] VARCHAR(50),
    [activo] BIT NOT NULL CONSTRAINT [ClasificacionArancelariaMatriz_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ClasificacionArancelariaMatriz_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ClasificacionArancelariaMatriz_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ClasificacionArancelariaMatriz_subpartida_key] UNIQUE NONCLUSTERED ([subpartida])
);

-- CreateTable
CREATE TABLE [dbo].[OrdenCompraIntl] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [numeroOrden] VARCHAR(50) NOT NULL,
    [incoterm] VARCHAR(10) NOT NULL,
    [proveedorExtranjero] VARCHAR(255) NOT NULL,
    [paisOrigen] VARCHAR(100) NOT NULL,
    [moneda] VARCHAR(3) NOT NULL,
    [trmPactada] DECIMAL(18,4) NOT NULL,
    [valorEstimadoTotal] DECIMAL(18,2) NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [OrdenCompraIntl_estado_df] DEFAULT 'Borrador',
    [responsableId] UNIQUEIDENTIFIER,
    [observaciones] TEXT,
    [eliminado] BIT NOT NULL CONSTRAINT [OrdenCompraIntl_eliminado_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OrdenCompraIntl_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [OrdenCompraIntl_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ItemOrdenCompraIntl] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [descripcion] VARCHAR(255) NOT NULL,
    [subpartidaArancelariaId] UNIQUEIDENTIFIER,
    [cantidad] DECIMAL(18,4) NOT NULL,
    [pesoKg] DECIMAL(18,4),
    [volumenM3] DECIMAL(18,4),
    [valorUnitarioFob] DECIMAL(18,4) NOT NULL,
    CONSTRAINT [ItemOrdenCompraIntl_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[LoteImportacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [blAwb] VARCHAR(100) NOT NULL,
    [contenedor] VARCHAR(50),
    [precinto] VARCHAR(50),
    [puertoOrigen] VARCHAR(100) NOT NULL,
    [puertoDestino] VARCHAR(100) NOT NULL,
    [naviera] VARCHAR(255),
    [fechaEmbarque] DATETIME2,
    [fechaLlegadaEstimada] DATETIME2,
    [fechaLlegadaReal] DATETIME2,
    [estado] VARCHAR(30) NOT NULL CONSTRAINT [LoteImportacion_estado_df] DEFAULT 'En tránsito',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LoteImportacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LoteImportacion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ExpedienteAduanero] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [loteId] UNIQUEIDENTIFIER NOT NULL,
    [numeroDIM] VARCHAR(50),
    [fechaDIM] DATETIME2,
    [dimNombre] VARCHAR(255),
    [dimRuta] VARCHAR(500),
    [dimMime] VARCHAR(100),
    [dimTamano] INT,
    [facturaComercialNombre] VARCHAR(255),
    [facturaComercialRuta] VARCHAR(500),
    [facturaComercialMime] VARCHAR(100),
    [facturaComercialTamano] INT,
    [certificadoOrigenTlc] VARCHAR(100),
    [certificadoOrigenNombre] VARCHAR(255),
    [certificadoOrigenRuta] VARCHAR(500),
    [certificadoOrigenMime] VARCHAR(100),
    [certificadoOrigenTamano] INT,
    [fechaLevante] DATETIME2,
    [estado] VARCHAR(30) NOT NULL CONSTRAINT [ExpedienteAduanero_estado_df] DEFAULT 'En trámite',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExpedienteAduanero_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ExpedienteAduanero_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ExpedienteAduanero_loteId_key] UNIQUE NONCLUSTERED ([loteId])
);

-- CreateTable
CREATE TABLE [dbo].[VistoBuenoAduanero] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [expedienteId] UNIQUEIDENTIFIER NOT NULL,
    [entidad] VARCHAR(50) NOT NULL,
    [numero] VARCHAR(50),
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [VistoBuenoAduanero_estado_df] DEFAULT 'Pendiente',
    [archivoNombre] VARCHAR(255),
    [archivoRuta] VARCHAR(500),
    [archivoMime] VARCHAR(100),
    [archivoTamano] INT,
    [fecha] DATETIME2,
    CONSTRAINT [VistoBuenoAduanero_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CosteoImportacionDetalle] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [loteId] UNIQUEIDENTIFIER NOT NULL,
    [itemId] UNIQUEIDENTIFIER NOT NULL,
    [valorCifUsd] DECIMAL(18,2) NOT NULL,
    [trmLiquidacion] DECIMAL(18,4) NOT NULL,
    [valorCifCop] DECIMAL(18,2) NOT NULL,
    [arancelCop] DECIMAL(18,2) NOT NULL,
    [ivaTotalCop] DECIMAL(18,2) NOT NULL,
    [ivaDescontableCop] DECIMAL(18,2) NOT NULL CONSTRAINT [CosteoImportacionDetalle_ivaDescontableCop_df] DEFAULT 0,
    [ivaCapitalizableCop] DECIMAL(18,2) NOT NULL CONSTRAINT [CosteoImportacionDetalle_ivaCapitalizableCop_df] DEFAULT 0,
    [fletesNacionalesCop] DECIMAL(18,2) NOT NULL CONSTRAINT [CosteoImportacionDetalle_fletesNacionalesCop_df] DEFAULT 0,
    [agenciamientoCop] DECIMAL(18,2) NOT NULL CONSTRAINT [CosteoImportacionDetalle_agenciamientoCop_df] DEFAULT 0,
    [otrosCostosCop] DECIMAL(18,2) NOT NULL CONSTRAINT [CosteoImportacionDetalle_otrosCostosCop_df] DEFAULT 0,
    [diferenciaCambioCop] DECIMAL(18,2) NOT NULL CONSTRAINT [CosteoImportacionDetalle_diferenciaCambioCop_df] DEFAULT 0,
    [cantidad] DECIMAL(18,4) NOT NULL,
    [costoTotalCop] DECIMAL(18,2) NOT NULL,
    [costoUnitarioCop] DECIMAL(18,4) NOT NULL,
    [esProvisional] BIT NOT NULL CONSTRAINT [CosteoImportacionDetalle_esProvisional_df] DEFAULT 1,
    [fechaLiquidacion] DATETIME2 NOT NULL CONSTRAINT [CosteoImportacionDetalle_fechaLiquidacion_df] DEFAULT CURRENT_TIMESTAMP,
    [liquidadoPorId] UNIQUEIDENTIFIER,
    CONSTRAINT [CosteoImportacionDetalle_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ImportacionHistorial] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [actor] VARCHAR(255) NOT NULL,
    [accion] VARCHAR(255) NOT NULL,
    [detalle] TEXT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionHistorial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionHistorial_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ClasificacionArancelariaMatriz_activo_idx] ON [dbo].[ClasificacionArancelariaMatriz]([activo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrdenCompraIntl_tenantId_numeroOrden_idx] ON [dbo].[OrdenCompraIntl]([tenantId], [numeroOrden]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrdenCompraIntl_tenantId_estado_idx] ON [dbo].[OrdenCompraIntl]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ItemOrdenCompraIntl_ordenCompraId_idx] ON [dbo].[ItemOrdenCompraIntl]([ordenCompraId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoteImportacion_tenantId_estado_idx] ON [dbo].[LoteImportacion]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LoteImportacion_ordenCompraId_idx] ON [dbo].[LoteImportacion]([ordenCompraId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ExpedienteAduanero_tenantId_estado_idx] ON [dbo].[ExpedienteAduanero]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [VistoBuenoAduanero_expedienteId_idx] ON [dbo].[VistoBuenoAduanero]([expedienteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CosteoImportacionDetalle_tenantId_loteId_idx] ON [dbo].[CosteoImportacionDetalle]([tenantId], [loteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CosteoImportacionDetalle_itemId_idx] ON [dbo].[CosteoImportacionDetalle]([itemId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionHistorial_ordenCompraId_idx] ON [dbo].[ImportacionHistorial]([ordenCompraId]);

-- AddForeignKey
ALTER TABLE [dbo].[OrdenCompraIntl] ADD CONSTRAINT [OrdenCompraIntl_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[OrdenCompraIntl] ADD CONSTRAINT [OrdenCompraIntl_responsableId_fkey] FOREIGN KEY ([responsableId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ItemOrdenCompraIntl] ADD CONSTRAINT [ItemOrdenCompraIntl_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ItemOrdenCompraIntl] ADD CONSTRAINT [ItemOrdenCompraIntl_subpartidaArancelariaId_fkey] FOREIGN KEY ([subpartidaArancelariaId]) REFERENCES [dbo].[ClasificacionArancelariaMatriz]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LoteImportacion] ADD CONSTRAINT [LoteImportacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LoteImportacion] ADD CONSTRAINT [LoteImportacion_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ExpedienteAduanero] ADD CONSTRAINT [ExpedienteAduanero_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ExpedienteAduanero] ADD CONSTRAINT [ExpedienteAduanero_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[VistoBuenoAduanero] ADD CONSTRAINT [VistoBuenoAduanero_expedienteId_fkey] FOREIGN KEY ([expedienteId]) REFERENCES [dbo].[ExpedienteAduanero]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CosteoImportacionDetalle] ADD CONSTRAINT [CosteoImportacionDetalle_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CosteoImportacionDetalle] ADD CONSTRAINT [CosteoImportacionDetalle_loteId_fkey] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CosteoImportacionDetalle] ADD CONSTRAINT [CosteoImportacionDetalle_itemId_fkey] FOREIGN KEY ([itemId]) REFERENCES [dbo].[ItemOrdenCompraIntl]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CosteoImportacionDetalle] ADD CONSTRAINT [CosteoImportacionDetalle_liquidadoPorId_fkey] FOREIGN KEY ([liquidadoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionHistorial] ADD CONSTRAINT [ImportacionHistorial_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
