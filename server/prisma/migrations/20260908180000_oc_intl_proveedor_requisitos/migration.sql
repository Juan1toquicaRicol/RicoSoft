BEGIN TRY

BEGIN TRAN;

-- AlterTable: FK real al catálogo de Proveedor en la orden de compra
-- internacional — nullable, las órdenes existentes no tienen valor.
ALTER TABLE [dbo].[OrdenCompraIntl] ADD [proveedorId] UNIQUEIDENTIFIER;

CREATE NONCLUSTERED INDEX [OrdenCompraIntl_proveedorId_idx] ON [dbo].[OrdenCompraIntl]([proveedorId]);

ALTER TABLE [dbo].[OrdenCompraIntl] ADD CONSTRAINT [OrdenCompraIntl_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable: requisitos de importación por proveedor (registro de
-- información, no documentos en sí — ver comentario en schema.prisma).
CREATE TABLE [dbo].[RequisitoProveedorImportacion] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [RequisitoProveedorImportacion_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [proveedorId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] NVARCHAR(30) NOT NULL,
    [nombre] NVARCHAR(255) NOT NULL,
    [descripcion] NVARCHAR(MAX),
    [obligatorio] BIT NOT NULL CONSTRAINT [RequisitoProveedorImportacion_obligatorio_df] DEFAULT 1,
    [activo] BIT NOT NULL CONSTRAINT [RequisitoProveedorImportacion_activo_df] DEFAULT 1,
    [orden] INT NOT NULL CONSTRAINT [RequisitoProveedorImportacion_orden_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RequisitoProveedorImportacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [RequisitoProveedorImportacion_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [RequisitoProveedorImportacion_tenantId_proveedorId_idx] ON [dbo].[RequisitoProveedorImportacion]([tenantId], [proveedorId]);
CREATE NONCLUSTERED INDEX [RequisitoProveedorImportacion_tenantId_idx] ON [dbo].[RequisitoProveedorImportacion]([tenantId]);

ALTER TABLE [dbo].[RequisitoProveedorImportacion] ADD CONSTRAINT [RequisitoProveedorImportacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[RequisitoProveedorImportacion] ADD CONSTRAINT [RequisitoProveedorImportacion_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
