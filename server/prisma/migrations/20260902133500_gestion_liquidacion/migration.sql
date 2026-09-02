BEGIN TRY

BEGIN TRAN;

-- CreateTable: gestión interna de liquidación (Fase G) — registro de la
-- decisión empresarial, nunca un ajuste real de inventario en Siesa.
CREATE TABLE [dbo].[GestionLiquidacion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [itemRowId] INT NOT NULL,
    [descripcion] VARCHAR(255),
    [referencia] VARCHAR(255),
    [cantidadExistente] DECIMAL(18,4) NOT NULL,
    [valorTotal] DECIMAL(18,2) NOT NULL,
    [score] INT NOT NULL,
    [categoria] VARCHAR(10) NOT NULL,
    [motivo] VARCHAR(500) NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [GestionLiquidacion_estado_df] DEFAULT 'PENDIENTE',
    [responsableId] UNIQUEIDENTIFIER NOT NULL,
    [responsable] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GestionLiquidacion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [actualizadoEn] DATETIME2 NOT NULL,
    CONSTRAINT [GestionLiquidacion_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [GestionLiquidacion_tenantId_idx] ON [dbo].[GestionLiquidacion]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[GestionLiquidacion] ADD CONSTRAINT [GestionLiquidacion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRAN;
    END;
    THROW

END CATCH
