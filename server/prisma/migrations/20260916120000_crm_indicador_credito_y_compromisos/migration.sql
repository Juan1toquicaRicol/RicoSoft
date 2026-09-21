BEGIN TRY

BEGIN TRAN;

-- AlterTable: compromisos sobre un seguimiento comercial (CRM 360) — createdAt
-- sigue siendo "cuándo se registró el evento"; estos campos nuevos son
-- "cuándo se completó el compromiso", que es distinto.
ALTER TABLE [dbo].[OportunidadSeguimiento] ADD [compromisoCompletado] BIT NOT NULL CONSTRAINT [OportunidadSeguimiento_compromisoCompletado_df] DEFAULT 0;
ALTER TABLE [dbo].[OportunidadSeguimiento] ADD [compromisoCompletadoEn] DATETIME2 NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ADD [compromisoCompletadoPorId] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[OportunidadSeguimiento] ADD [compromisoCompletadoPor] NVARCHAR(255) NULL;

-- CreateTable
CREATE TABLE [dbo].[IndicadorCreditoCliente] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [clienteRowId] INT NOT NULL,
    [cupoCredito] DECIMAL(18,2) NOT NULL,
    [disponible] DECIMAL(18,2) NOT NULL,
    [carteraCorriente] DECIMAL(18,2) NOT NULL,
    [carteraVencida] DECIMAL(18,2) NOT NULL,
    [diasPromedioVencido] INT NULL,
    [diasPromedioPago] INT NULL,
    [bloquearCupo] BIT NOT NULL CONSTRAINT [IndicadorCreditoCliente_bloquearCupo_df] DEFAULT 0,
    [bloquearMora] BIT NOT NULL CONSTRAINT [IndicadorCreditoCliente_bloquearMora_df] DEFAULT 0,
    [bloquear] BIT NOT NULL CONSTRAINT [IndicadorCreditoCliente_bloquear_df] DEFAULT 0,
    [origenDato] VARCHAR(30) NOT NULL CONSTRAINT [IndicadorCreditoCliente_origenDato_df] DEFAULT 'T9896_SNAPSHOT',
    [actualizadoEn] DATETIME2 NOT NULL CONSTRAINT [IndicadorCreditoCliente_actualizadoEn_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [IndicadorCreditoCliente_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [IndicadorCreditoCliente_tenantId_clienteRowId_key] UNIQUE ([tenantId], [clienteRowId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [IndicadorCreditoCliente_tenantId_idx] ON [dbo].[IndicadorCreditoCliente]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[IndicadorCreditoCliente] ADD CONSTRAINT [IndicadorCreditoCliente_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
