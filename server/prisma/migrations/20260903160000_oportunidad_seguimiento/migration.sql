BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[OportunidadSeguimiento] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [OportunidadSeguimiento_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [clienteRowId] INT NOT NULL,
    [clienteNombre] NVARCHAR(255) NOT NULL,
    [itemRowId] INT,
    [itemDescripcion] NVARCHAR(255),
    [accion] NVARCHAR(30) NOT NULL,
    [resultado] NVARCHAR(30) NOT NULL,
    [comentario] NVARCHAR(MAX),
    [proximaAccion] NVARCHAR(255),
    [proximoSeguimientoFecha] DATETIME2,
    [usuarioId] UNIQUEIDENTIFIER NOT NULL,
    [usuario] NVARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OportunidadSeguimiento_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [OportunidadSeguimiento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OportunidadSeguimiento_tenantId_idx] ON [dbo].[OportunidadSeguimiento]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [OportunidadSeguimiento_tenantId_clienteRowId_idx] ON [dbo].[OportunidadSeguimiento]([tenantId], [clienteRowId]);

-- AddForeignKey
ALTER TABLE [dbo].[OportunidadSeguimiento] ADD CONSTRAINT [OportunidadSeguimiento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
