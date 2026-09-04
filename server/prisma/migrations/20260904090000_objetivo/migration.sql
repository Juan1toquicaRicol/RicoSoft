BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Objetivo] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [Objetivo_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nivel] NVARCHAR(20) NOT NULL,
    [vendedorSiesaRowId] INT,
    [vendedorSiesaNombre] NVARCHAR(255),
    [tipoPeriodo] NVARCHAR(20) NOT NULL,
    [fechaInicio] DATE NOT NULL,
    [fechaFin] DATE NOT NULL,
    [anio] INT NOT NULL,
    [metaValor] DECIMAL(18,2),
    [metaVolumenKg] DECIMAL(18,3),
    [metaInventario] DECIMAL(18,3),
    [tipoMetaInventario] NVARCHAR(20),
    [descripcion] NVARCHAR(MAX),
    [estado] NVARCHAR(20) NOT NULL CONSTRAINT [Objetivo_estado_df] DEFAULT 'ACTIVO',
    [eliminado] BIT NOT NULL CONSTRAINT [Objetivo_eliminado_df] DEFAULT 0,
    [creadoPorId] UNIQUEIDENTIFIER NOT NULL,
    [creadoPorNombre] NVARCHAR(255) NOT NULL,
    [asignadoPorId] UNIQUEIDENTIFIER,
    [asignadoPorNombre] NVARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Objetivo_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Objetivo_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Objetivo_tenantId_fechaInicio_fechaFin_idx] ON [dbo].[Objetivo]([tenantId], [fechaInicio], [fechaFin]);
CREATE NONCLUSTERED INDEX [Objetivo_tenantId_nivel_vendedorSiesaRowId_idx] ON [dbo].[Objetivo]([tenantId], [nivel], [vendedorSiesaRowId]);
CREATE NONCLUSTERED INDEX [Objetivo_tenantId_anio_idx] ON [dbo].[Objetivo]([tenantId], [anio]);

-- AddForeignKey
ALTER TABLE [dbo].[Objetivo] ADD CONSTRAINT [Objetivo_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
