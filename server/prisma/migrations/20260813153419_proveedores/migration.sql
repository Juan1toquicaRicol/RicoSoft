BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Contrato] ADD [proveedorId] UNIQUEIDENTIFIER;

-- AlterTable
ALTER TABLE [dbo].[Factura] ADD [proveedorId] UNIQUEIDENTIFIER;

-- CreateTable
CREATE TABLE [dbo].[Proveedor] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [nit] VARCHAR(50) NOT NULL,
    [contacto] VARCHAR(255),
    [telefono] VARCHAR(50),
    [email] VARCHAR(255),
    [activo] BIT NOT NULL CONSTRAINT [Proveedor_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Proveedor_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Proveedor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Proveedor_tenantId_nit_key] UNIQUE NONCLUSTERED ([tenantId],[nit])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Proveedor_tenantId_idx] ON [dbo].[Proveedor]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[Proveedor] ADD CONSTRAINT [Proveedor_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

