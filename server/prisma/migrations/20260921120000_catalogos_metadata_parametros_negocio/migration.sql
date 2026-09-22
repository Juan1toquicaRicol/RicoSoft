BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[ConfiguracionInventario] ADD [diasMaximosMora] INT NOT NULL CONSTRAINT [ConfiguracionInventario_diasMaximosMora_df] DEFAULT 30,
[diasValidezOferta] INT NOT NULL CONSTRAINT [ConfiguracionInventario_diasValidezOferta_df] DEFAULT 15,
[margenMinimoVentaPct] DECIMAL(5,2) NOT NULL CONSTRAINT [ConfiguracionInventario_margenMinimoVentaPct_df] DEFAULT 0,
[montoMinimoCotizaciones] DECIMAL(18,2) NOT NULL CONSTRAINT [ConfiguracionInventario_montoMinimoCotizaciones_df] DEFAULT 0,
[porcentajeMaximoUsoCupo] DECIMAL(5,2) NOT NULL CONSTRAINT [ConfiguracionInventario_porcentajeMaximoUsoCupo_df] DEFAULT 100,
[toleranciaMermaPesajePct] DECIMAL(5,2) NOT NULL CONSTRAINT [ConfiguracionInventario_toleranciaMermaPesajePct_df] DEFAULT 0.5;

-- AlterTable
ALTER TABLE [dbo].[CatalogoValor] ADD [descripcion] NVARCHAR(500),
[metadata] NVARCHAR(max);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

