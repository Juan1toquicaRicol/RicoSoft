BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[ImportacionCorreo] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionCorreo_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [messageId] VARCHAR(255) NOT NULL,
    [remitente] VARCHAR(320) NOT NULL,
    [destinatarios] NVARCHAR(MAX) NOT NULL,
    [asunto] NVARCHAR(500) NOT NULL,
    [fechaRecibido] DATETIME2 NOT NULL,
    [cuerpoTexto] NVARCHAR(MAX),
    [estadoProcesamiento] VARCHAR(30) NOT NULL CONSTRAINT [ImportacionCorreo_estadoProcesamiento_df] DEFAULT 'PENDIENTE',
    [clasificacion] VARCHAR(30),
    [proveedorId] UNIQUEIDENTIFIER,
    [ordenCompraId] UNIQUEIDENTIFIER,
    [ultimoError] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionCorreo_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ImportacionCorreo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ImportacionCorreo_tenantId_messageId_key] UNIQUE NONCLUSTERED ([tenantId], [messageId])
);

-- CreateTable
CREATE TABLE [dbo].[ImportacionCorreoAdjunto] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionCorreoAdjunto_id_df] DEFAULT NEWID(),
    [correoId] UNIQUEIDENTIFIER NOT NULL,
    [nombreOriginal] NVARCHAR(255) NOT NULL,
    [mimeType] VARCHAR(150) NOT NULL,
    [tamano] INT NOT NULL,
    [ruta] VARCHAR(500) NOT NULL,
    [hashSha256] CHAR(64) NOT NULL,
    [textoExtraido] NVARCHAR(MAX),
    [estadoExtraccion] VARCHAR(20) NOT NULL CONSTRAINT [ImportacionCorreoAdjunto_estadoExtraccion_df] DEFAULT 'PENDIENTE',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionCorreoAdjunto_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionCorreoAdjunto_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ImportacionCorreoAdjunto_correoId_hashSha256_key] UNIQUE NONCLUSTERED ([correoId], [hashSha256])
);

-- CreateTable
CREATE TABLE [dbo].[ImportacionExtraccion] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionExtraccion_id_df] DEFAULT NEWID(),
    [adjuntoId] UNIQUEIDENTIFIER NOT NULL,
    [campo] VARCHAR(100) NOT NULL,
    [valorExtraido] NVARCHAR(MAX) NOT NULL,
    [pagina] INT,
    [motorUsado] VARCHAR(50) NOT NULL,
    [confianza] DECIMAL(5,4),
    [evidencia] NVARCHAR(MAX),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionExtraccion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionExtraccion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ImportacionExcepcion] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionExcepcion_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [correoId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(40) NOT NULL,
    [descripcion] NVARCHAR(MAX) NOT NULL,
    [candidatos] NVARCHAR(MAX),
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [ImportacionExcepcion_estado_df] DEFAULT 'ABIERTA',
    [resueltoPorId] UNIQUEIDENTIFIER,
    [resueltoEn] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ImportacionExcepcion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionExcepcion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionCorreo_tenantId_estadoProcesamiento_idx] ON [dbo].[ImportacionCorreo]([tenantId], [estadoProcesamiento]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionCorreo_tenantId_proveedorId_idx] ON [dbo].[ImportacionCorreo]([tenantId], [proveedorId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionCorreo_tenantId_ordenCompraId_idx] ON [dbo].[ImportacionCorreo]([tenantId], [ordenCompraId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionCorreo_tenantId_fechaRecibido_idx] ON [dbo].[ImportacionCorreo]([tenantId], [fechaRecibido]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionCorreoAdjunto_correoId_idx] ON [dbo].[ImportacionCorreoAdjunto]([correoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionExtraccion_adjuntoId_idx] ON [dbo].[ImportacionExtraccion]([adjuntoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionExtraccion_adjuntoId_campo_idx] ON [dbo].[ImportacionExtraccion]([adjuntoId], [campo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionExcepcion_tenantId_estado_idx] ON [dbo].[ImportacionExcepcion]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionExcepcion_correoId_idx] ON [dbo].[ImportacionExcepcion]([correoId]);

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreo] ADD CONSTRAINT [ImportacionCorreo_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreo] ADD CONSTRAINT [ImportacionCorreo_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreo] ADD CONSTRAINT [ImportacionCorreo_ordenCompraId_fkey] FOREIGN KEY ([ordenCompraId]) REFERENCES [dbo].[OrdenCompraIntl]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreoAdjunto] ADD CONSTRAINT [ImportacionCorreoAdjunto_correoId_fkey] FOREIGN KEY ([correoId]) REFERENCES [dbo].[ImportacionCorreo]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExtraccion] ADD CONSTRAINT [ImportacionExtraccion_adjuntoId_fkey] FOREIGN KEY ([adjuntoId]) REFERENCES [dbo].[ImportacionCorreoAdjunto]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] ADD CONSTRAINT [ImportacionExcepcion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] ADD CONSTRAINT [ImportacionExcepcion_correoId_fkey] FOREIGN KEY ([correoId]) REFERENCES [dbo].[ImportacionCorreo]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionExcepcion] ADD CONSTRAINT [ImportacionExcepcion_resueltoPorId_fkey] FOREIGN KEY ([resueltoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
