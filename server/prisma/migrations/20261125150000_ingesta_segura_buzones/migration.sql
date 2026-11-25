BEGIN TRY
    BEGIN TRAN;

    ALTER TABLE [dbo].[ImportacionCorreo] ADD
        [ingestaCompleta] BIT NOT NULL CONSTRAINT [ImportacionCorreo_ingestaCompleta_df] DEFAULT 1,
        [reprocesoHistorico] BIT NOT NULL CONSTRAINT [ImportacionCorreo_reprocesoHistorico_df] DEFAULT 0;

    CREATE TABLE [dbo].[ImportacionMensajeOmitido] (
        [buzonId] UNIQUEIDENTIFIER NOT NULL,
        [gmailId] VARCHAR(128) NOT NULL,
        [detectadoEn] DATETIME2 NOT NULL CONSTRAINT [ImportacionMensajeOmitido_detectadoEn_df] DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT [ImportacionMensajeOmitido_pkey] PRIMARY KEY CLUSTERED ([buzonId], [gmailId]),
        CONSTRAINT [ImportacionMensajeOmitido_buzonId_fkey] FOREIGN KEY ([buzonId])
            REFERENCES [dbo].[BuzonImportaciones]([id]) ON DELETE CASCADE ON UPDATE NO ACTION
    );

    COMMIT TRAN;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    THROW;
END CATCH;
