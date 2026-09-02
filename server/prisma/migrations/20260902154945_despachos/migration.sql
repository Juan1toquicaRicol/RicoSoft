BEGIN TRY

BEGIN TRAN;

-- CreateTable: Control de Despachos — se origina SIEMPRE desde un
-- documento de venta real de Siesa (siesaDocRowId); cliente/dirección/
-- bodega/vehículo/conductor son texto libre (sin maestros propios
-- todavía). RicoSoft nunca escribe de vuelta a Siesa: este es seguimiento
-- logístico 100% nativo.
CREATE TABLE [dbo].[Despacho] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [siesaDocRowId] INT NOT NULL,
    [siesaDocReferencia] VARCHAR(100),
    [clienteNombre] VARCHAR(255) NOT NULL,
    [clienteNit] VARCHAR(50),
    [direccionEntrega] VARCHAR(500),
    [contactoEntrega] VARCHAR(255),
    [telefonoContacto] VARCHAR(50),
    [bodegaRowId] INT,
    [bodegaNombre] VARCHAR(255),
    [valorPedido] DECIMAL(18,2) NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [Despacho_estado_df] DEFAULT 'RECIBIDO',
    [vehiculoPlaca] VARCHAR(20),
    [vehiculoTipo] VARCHAR(50),
    [conductorNombre] VARCHAR(255),
    [conductorTelefono] VARCHAR(50),
    [fechaCargue] DATETIME2,
    [fechaDespacho] DATETIME2,
    [fechaEntregaEstimada] DATETIME2,
    [fechaEntregaReal] DATETIME2,
    [recibidoPor] VARCHAR(255),
    [responsableId] UNIQUEIDENTIFIER NOT NULL,
    [responsable] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Despacho_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [actualizadoEn] DATETIME2 NOT NULL,
    CONSTRAINT [Despacho_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DespachoLinea] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [despachoId] UNIQUEIDENTIFIER NOT NULL,
    [itemRowId] INT NOT NULL,
    [descripcion] VARCHAR(255),
    [referencia] VARCHAR(255),
    [unidadMedida] VARCHAR(50),
    [cantidadSolicitada] DECIMAL(18,4) NOT NULL,
    [cantidadPreparada] DECIMAL(18,4),
    [cantidadDespachada] DECIMAL(18,4),
    [cantidadEntregada] DECIMAL(18,4),
    [observacion] VARCHAR(500),
    CONSTRAINT [DespachoLinea_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DespachoNovedad] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [despachoId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(30) NOT NULL,
    [descripcion] VARCHAR(500) NOT NULL,
    [estado] VARCHAR(10) NOT NULL CONSTRAINT [DespachoNovedad_estado_df] DEFAULT 'ABIERTA',
    [usuarioId] UNIQUEIDENTIFIER NOT NULL,
    [usuario] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DespachoNovedad_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [resueltaPorId] UNIQUEIDENTIFIER,
    [resueltaPor] VARCHAR(255),
    [fechaResolucion] DATETIME2,
    [observacionResolucion] VARCHAR(500),
    CONSTRAINT [DespachoNovedad_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [Despacho_tenantId_estado_idx] ON [dbo].[Despacho]([tenantId], [estado]);
CREATE NONCLUSTERED INDEX [Despacho_tenantId_siesaDocRowId_idx] ON [dbo].[Despacho]([tenantId], [siesaDocRowId]);
CREATE NONCLUSTERED INDEX [DespachoLinea_despachoId_idx] ON [dbo].[DespachoLinea]([despachoId]);
CREATE NONCLUSTERED INDEX [DespachoNovedad_despachoId_idx] ON [dbo].[DespachoNovedad]([despachoId]);

-- AddForeignKey
ALTER TABLE [dbo].[Despacho] ADD CONSTRAINT [Despacho_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[DespachoLinea] ADD CONSTRAINT [DespachoLinea_despachoId_fkey] FOREIGN KEY ([despachoId]) REFERENCES [dbo].[Despacho]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[DespachoNovedad] ADD CONSTRAINT [DespachoNovedad_despachoId_fkey] FOREIGN KEY ([despachoId]) REFERENCES [dbo].[Despacho]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRAN;
    END;
    THROW

END CATCH
