BEGIN TRY

BEGIN TRAN;

-- CreateTable: plan de producción con estados (Etapa J) — modelo nativo de
-- RicoSoft, seguimiento interno de avance, nunca se escribe de vuelta a Siesa.
CREATE TABLE [dbo].[PlanProduccion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [itemRowId] INT NOT NULL,
    [descripcion] VARCHAR(255),
    [referencia] VARCHAR(255),
    [unidadMedida] VARCHAR(50),
    [cantidadPlaneada] DECIMAL(18,4) NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [PlanProduccion_estado_df] DEFAULT 'Planificada',
    [fechaPlaneada] DATETIME2 NOT NULL,
    [responsableId] UNIQUEIDENTIFIER NOT NULL,
    [responsable] VARCHAR(255) NOT NULL,
    [notas] VARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PlanProduccion_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [actualizadoEn] DATETIME2 NOT NULL,
    CONSTRAINT [PlanProduccion_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE NONCLUSTERED INDEX [PlanProduccion_tenantId_idx] ON [dbo].[PlanProduccion]([tenantId]);

-- AddForeignKey
ALTER TABLE [dbo].[PlanProduccion] ADD CONSTRAINT [PlanProduccion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRAN;
    END;
    THROW

END CATCH
