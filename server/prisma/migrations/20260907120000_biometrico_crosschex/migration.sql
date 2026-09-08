BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[FuenteBiometrica] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [FuenteBiometrica_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(50) NOT NULL,
    [proveedor] VARCHAR(30) NOT NULL CONSTRAINT [FuenteBiometrica_proveedor_df] DEFAULT 'anviz',
    [lastProcessedLogId] INT NOT NULL CONSTRAINT [FuenteBiometrica_lastProcessedLogId_df] DEFAULT 0,
    [activa] BIT NOT NULL CONSTRAINT [FuenteBiometrica_activa_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FuenteBiometrica_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [FuenteBiometrica_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FuenteBiometrica_nombre_key] UNIQUE NONCLUSTERED ([nombre])
);

-- CreateTable
CREATE TABLE [dbo].[EmpleadoBiometrico] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [EmpleadoBiometrico_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [proveedor] VARCHAR(30) NOT NULL CONSTRAINT [EmpleadoBiometrico_proveedor_df] DEFAULT 'anviz',
    [externalUserId] VARCHAR(50) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [EmpleadoBiometrico_activo_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmpleadoBiometrico_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [EmpleadoBiometrico_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EmpleadoBiometrico_tenantId_proveedor_externalUserId_key] UNIQUE NONCLUSTERED ([tenantId],[proveedor],[externalUserId]),
    CONSTRAINT [EmpleadoBiometrico_tenantId_empleadoId_proveedor_key] UNIQUE NONCLUSTERED ([tenantId],[empleadoId],[proveedor])
);

-- CreateTable
CREATE TABLE [dbo].[MarcacionBiometrica] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [MarcacionBiometrica_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [fuenteId] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER,
    [empresaId] VARCHAR(10),
    [externalLogId] VARCHAR(50) NOT NULL,
    [externalUserId] VARCHAR(50) NOT NULL,
    [horaMarcacion] DATETIME2 NOT NULL,
    [fecha] DATE NOT NULL,
    [checkType] INT NOT NULL,
    [tipoMarcacion] VARCHAR(30) NOT NULL,
    [dispositivoId] VARCHAR(50),
    [workType] INT,
    [attFlag] INT,
    [checked] BIT,
    [exported] BIT,
    [openDoorFlag] BIT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [MarcacionBiometrica_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [MarcacionBiometrica_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [MarcacionBiometrica_fuenteId_externalLogId_key] UNIQUE NONCLUSTERED ([fuenteId],[externalLogId])
);

-- CreateTable
CREATE TABLE [dbo].[SincronizacionBiometricoLog] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [SincronizacionBiometricoLog_id_df] DEFAULT NEWID(),
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [fuenteId] UNIQUEIDENTIFIER NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [SincronizacionBiometricoLog_estado_df] DEFAULT 'EN_CURSO',
    [iniciadoEn] DATETIME2 NOT NULL CONSTRAINT [SincronizacionBiometricoLog_iniciadoEn_df] DEFAULT CURRENT_TIMESTAMP,
    [finalizadoEn] DATETIME2,
    [logIdDesde] INT NOT NULL,
    [logIdHasta] INT,
    [leidos] INT NOT NULL CONSTRAINT [SincronizacionBiometricoLog_leidos_df] DEFAULT 0,
    [insertados] INT NOT NULL CONSTRAINT [SincronizacionBiometricoLog_insertados_df] DEFAULT 0,
    [duplicados] INT NOT NULL CONSTRAINT [SincronizacionBiometricoLog_duplicados_df] DEFAULT 0,
    [sinEmpleado] INT NOT NULL CONSTRAINT [SincronizacionBiometricoLog_sinEmpleado_df] DEFAULT 0,
    [erroresCount] INT NOT NULL CONSTRAINT [SincronizacionBiometricoLog_erroresCount_df] DEFAULT 0,
    [mensajeError] TEXT,
    CONSTRAINT [SincronizacionBiometricoLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FuenteBiometrica_tenantId_idx] ON [dbo].[FuenteBiometrica]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoBiometrico_tenantId_idx] ON [dbo].[EmpleadoBiometrico]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MarcacionBiometrica_tenantId_fecha_idx] ON [dbo].[MarcacionBiometrica]([tenantId], [fecha]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MarcacionBiometrica_empleadoId_fecha_idx] ON [dbo].[MarcacionBiometrica]([empleadoId], [fecha]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [MarcacionBiometrica_externalUserId_horaMarcacion_idx] ON [dbo].[MarcacionBiometrica]([externalUserId], [horaMarcacion]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SincronizacionBiometricoLog_tenantId_fuenteId_estado_idx] ON [dbo].[SincronizacionBiometricoLog]([tenantId], [fuenteId], [estado]);

-- CreateIndex (filtered unique — no representable en schema.prisma, ver
-- comentario en el modelo SincronizacionBiometricoLog). Garantiza a nivel de
-- base de datos que no exista más de una sincronización EN_CURSO por
-- fuenteId, cerrando la condición de carrera entre dos corridas concurrentes
-- del scheduler.
CREATE UNIQUE NONCLUSTERED INDEX [SincronizacionBiometricoLog_fuenteId_en_curso_uq]
ON [dbo].[SincronizacionBiometricoLog]([fuenteId])
WHERE ([estado] = 'EN_CURSO');

-- AddForeignKey
ALTER TABLE [dbo].[FuenteBiometrica] ADD CONSTRAINT [FuenteBiometrica_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoBiometrico] ADD CONSTRAINT [EmpleadoBiometrico_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoBiometrico] ADD CONSTRAINT [EmpleadoBiometrico_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MarcacionBiometrica] ADD CONSTRAINT [MarcacionBiometrica_fuenteId_fkey] FOREIGN KEY ([fuenteId]) REFERENCES [dbo].[FuenteBiometrica]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MarcacionBiometrica] ADD CONSTRAINT [MarcacionBiometrica_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[MarcacionBiometrica] ADD CONSTRAINT [MarcacionBiometrica_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SincronizacionBiometricoLog] ADD CONSTRAINT [SincronizacionBiometricoLog_fuenteId_fkey] FOREIGN KEY ([fuenteId]) REFERENCES [dbo].[FuenteBiometrica]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SincronizacionBiometricoLog] ADD CONSTRAINT [SincronizacionBiometricoLog_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
