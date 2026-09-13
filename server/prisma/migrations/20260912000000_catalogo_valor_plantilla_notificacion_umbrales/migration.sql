BEGIN TRY

BEGIN TRAN;

-- AlterTable: nuevos umbrales de negocio en ConfiguracionInventario (defaults == valores hoy hardcodeados)
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [umbralVariabilidadAltaDemanda] FLOAT NOT NULL CONSTRAINT [ConfiguracionInventario_umbralVariabilidadAltaDemanda_df] DEFAULT 0.75;
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [umbralPerdidaRotacionDemanda] FLOAT NOT NULL CONSTRAINT [ConfiguracionInventario_umbralPerdidaRotacionDemanda_df] DEFAULT 0.5;
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [umbralTendenciaFuertePctDemanda] FLOAT NOT NULL CONSTRAINT [ConfiguracionInventario_umbralTendenciaFuertePctDemanda_df] DEFAULT 20;
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [umbralAlertaTrmPct] FLOAT NOT NULL CONSTRAINT [ConfiguracionInventario_umbralAlertaTrmPct_df] DEFAULT 2;
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [plazoCreditoDiasDefecto] INT NOT NULL CONSTRAINT [ConfiguracionInventario_plazoCreditoDiasDefecto_df] DEFAULT 30;
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [minimoCotizacionesSolicitud] INT NOT NULL CONSTRAINT [ConfiguracionInventario_minimoCotizacionesSolicitud_df] DEFAULT 3;

-- CreateTable
CREATE TABLE [dbo].[CatalogoValor] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tipo] NVARCHAR(60) NOT NULL,
    [clave] NVARCHAR(100) NOT NULL,
    [etiqueta] NVARCHAR(255) NOT NULL,
    [orden] INT NOT NULL CONSTRAINT [CatalogoValor_orden_df] DEFAULT 0,
    [activo] BIT NOT NULL CONSTRAINT [CatalogoValor_activo_df] DEFAULT 1,
    [tenantId] UNIQUEIDENTIFIER NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CatalogoValor_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CatalogoValor_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CatalogoValor_tipo_clave_tenantId_key] UNIQUE ([tipo], [clave], [tenantId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CatalogoValor_tipo_tenantId_activo_idx] ON [dbo].[CatalogoValor]([tipo], [tenantId], [activo]);

-- AddForeignKey
ALTER TABLE [dbo].[CatalogoValor] ADD CONSTRAINT [CatalogoValor_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE [dbo].[PlantillaNotificacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NULL,
    [tipoEvento] NVARCHAR(100) NOT NULL,
    [titulo] NVARCHAR(255) NOT NULL,
    [mensaje] NVARCHAR(MAX) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [PlantillaNotificacion_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PlantillaNotificacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PlantillaNotificacion_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PlantillaNotificacion_tipoEvento_tenantId_key] UNIQUE ([tipoEvento], [tenantId])
);

-- AddForeignKey
ALTER TABLE [dbo].[PlantillaNotificacion] ADD CONSTRAINT [PlantillaNotificacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
