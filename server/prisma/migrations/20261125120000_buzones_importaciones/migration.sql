-- Buzones múltiples de la Bandeja de Importaciones (aditiva: no borra ni modifica datos existentes).

-- CreateTable
CREATE TABLE [dbo].[BuzonImportaciones] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [BuzonImportaciones_id_df] DEFAULT NEWID(),
    [direccion] VARCHAR(320) NOT NULL,
    [etiquetaId] VARCHAR(128),
    [etiquetaNombre] VARCHAR(255),
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [BuzonImportaciones_estado_df] DEFAULT 'REGISTRADO',
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [responsableUsuarioId] UNIQUEIDENTIFIER,
    [registradoPorId] UNIQUEIDENTIFIER NOT NULL,
    [aprobadoPorId] UNIQUEIDENTIFIER,
    [correosPorCiclo] INT NOT NULL CONSTRAINT [BuzonImportaciones_correosPorCiclo_df] DEFAULT 25,
    [adjuntosPorCiclo] INT NOT NULL CONSTRAINT [BuzonImportaciones_adjuntosPorCiclo_df] DEFAULT 50,
    [timeoutSegundos] INT NOT NULL CONSTRAINT [BuzonImportaciones_timeoutSegundos_df] DEFAULT 120,
    [ultimaEjecucion] DATETIME2,
    [ultimoError] VARCHAR(500),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [BuzonImportaciones_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [BuzonImportaciones_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [BuzonImportaciones_direccion_key] UNIQUE NONCLUSTERED ([direccion])
);

-- CreateTable
CREATE TABLE [dbo].[ImportacionCorreoOrigen] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ImportacionCorreoOrigen_id_df] DEFAULT NEWID(),
    [correoId] UNIQUEIDENTIFIER NOT NULL,
    [buzonId] UNIQUEIDENTIFIER NOT NULL,
    [gmailId] VARCHAR(128),
    [etiquetaId] VARCHAR(128),
    [detectadoEn] DATETIME2 NOT NULL CONSTRAINT [ImportacionCorreoOrigen_detectadoEn_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ImportacionCorreoOrigen_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ImportacionCorreoOrigen_correoId_buzonId_key] UNIQUE NONCLUSTERED ([correoId], [buzonId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ImportacionCorreoOrigen_buzonId_idx] ON [dbo].[ImportacionCorreoOrigen]([buzonId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [BuzonImportaciones_tenantId_estado_idx] ON [dbo].[BuzonImportaciones]([tenantId], [estado]);

-- AddForeignKey
ALTER TABLE [dbo].[BuzonImportaciones] ADD CONSTRAINT [BuzonImportaciones_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: responsable del correo (nullable; los correos anteriores quedan sin responsable)
ALTER TABLE [dbo].[ImportacionCorreo] ADD [responsableUsuarioId] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[BuzonImportaciones] ADD CONSTRAINT [BuzonImportaciones_responsableUsuarioId_fkey] FOREIGN KEY ([responsableUsuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreo] ADD CONSTRAINT [ImportacionCorreo_responsableUsuarioId_fkey] FOREIGN KEY ([responsableUsuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreoOrigen] ADD CONSTRAINT [ImportacionCorreoOrigen_correoId_fkey] FOREIGN KEY ([correoId]) REFERENCES [dbo].[ImportacionCorreo]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ImportacionCorreoOrigen] ADD CONSTRAINT [ImportacionCorreoOrigen_buzonId_fkey] FOREIGN KEY ([buzonId]) REFERENCES [dbo].[BuzonImportaciones]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
