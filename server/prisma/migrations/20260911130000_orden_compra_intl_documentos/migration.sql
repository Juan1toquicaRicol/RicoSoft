-- CreateTable
CREATE TABLE [dbo].[OrdenCompraIntlDocumento] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [ordenCompraId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(30) NOT NULL,
    [nombreOriginal] VARCHAR(255) NOT NULL,
    [mime] VARCHAR(100) NOT NULL,
    [tamano] INT NOT NULL,
    [ruta] VARCHAR(500) NOT NULL,
    [subidoPorNombre] VARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OrdenCompraIntlDocumento_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [OrdenCompraIntlDocumento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OrdenCompraIntlDocumento_tenantId_ordenCompraId_idx] ON [dbo].[OrdenCompraIntlDocumento]([tenantId], [ordenCompraId]);

-- AddForeignKey
ALTER TABLE [dbo].[OrdenCompraIntlDocumento] ADD CONSTRAINT [OrdenCompraIntlDocumento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrdenCompraIntlDocumento] ADD CONSTRAINT [OrdenCompraIntlDocumento_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
