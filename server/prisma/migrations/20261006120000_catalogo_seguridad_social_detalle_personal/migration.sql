-- Catálogo por tenant de EPS/ARL/fondos de pensiones + datos personales adicionales en EmpleadoDetalle.
-- Aditiva: tabla nueva y columnas NULL-ables; no modifica datos existentes ni la migración 20261006100000.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[EmpleadoDetalle] ADD [ciudadResidencia] VARCHAR(100),
[departamentoResidencia] VARCHAR(100),
[fechaExpedicionDocumento] DATE,
[fechaNacimiento] DATE,
[fondoPensiones] VARCHAR(150),
[lugarNacimiento] VARCHAR(150);

-- CreateTable
CREATE TABLE [dbo].[CatalogoSeguridadSocial] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(20) NOT NULL,
    [nombre] VARCHAR(150) NOT NULL,
    [nombreNormalizado] VARCHAR(150) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [CatalogoSeguridadSocial_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CatalogoSeguridadSocial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CatalogoSeguridadSocial_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CatalogoSeguridadSocial_tenantId_tipo_nombreNormalizado_key] UNIQUE NONCLUSTERED ([tenantId],[tipo],[nombreNormalizado])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CatalogoSeguridadSocial_tenantId_tipo_idx] ON [dbo].[CatalogoSeguridadSocial]([tenantId], [tipo]);

-- AddForeignKey
ALTER TABLE [dbo].[CatalogoSeguridadSocial] ADD CONSTRAINT [CatalogoSeguridadSocial_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

