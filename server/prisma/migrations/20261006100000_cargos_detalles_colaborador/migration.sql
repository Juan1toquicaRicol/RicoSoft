-- Catálogo de cargos por tenant + detalles/soportes del colaborador (Gestión Humana).
-- Aditiva: tablas nuevas y dos cambios no destructivos en Empleado:
--   * correo pasa a NULL-able (cargos que no exigen correo corporativo); los datos existentes no se tocan.
--   * cargoId nullable (colaboradores históricos quedan sin cargo del catálogo; Empleado.cargo texto se conserva).
-- Unicidad de cargos: (tenantId, nombreNormalizado) en base de datos (evita duplicados concurrentes).
-- Sin backfill de roles: los permisos nuevos (cargos.*, empleados.detalles_*, empleados.documentos_*,
-- empleados.editar) NO se otorgan automáticamente — datos sensibles, se asignan desde Configuración > Roles.
BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Empleado] ALTER COLUMN [correo] VARCHAR(255) NULL;
ALTER TABLE [dbo].[Empleado] ADD [cargoId] UNIQUEIDENTIFIER;

-- CreateTable
CREATE TABLE [dbo].[CargoColaborador] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [nombreNormalizado] VARCHAR(255) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [CargoColaborador_activo_df] DEFAULT 1,
    [correoCorporativoRequerido] BIT NOT NULL CONSTRAINT [CargoColaborador_correoCorporativoRequerido_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CargoColaborador_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CargoColaborador_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CargoColaborador_tenantId_nombreNormalizado_key] UNIQUE NONCLUSTERED ([tenantId],[nombreNormalizado])
);

-- CreateTable
CREATE TABLE [dbo].[EmpleadoDetalle] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [eps] VARCHAR(150),
    [arl] VARCHAR(150),
    [direccion] VARCHAR(255),
    [telefonoPrincipal] VARCHAR(30),
    [telefonoSecundario] VARCHAR(30),
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [EmpleadoDetalle_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [EmpleadoDetalle_empleadoId_key] UNIQUE NONCLUSTERED ([empleadoId])
);

-- CreateTable
CREATE TABLE [dbo].[EmpleadoFamiliar] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [parentesco] VARCHAR(50) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmpleadoFamiliar_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EmpleadoFamiliar_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[EmpleadoEstudio] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [titulo] VARCHAR(255) NOT NULL,
    [institucion] VARCHAR(255),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmpleadoEstudio_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EmpleadoEstudio_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[EmpleadoDocumento] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(30) NOT NULL,
    [estudioId] UNIQUEIDENTIFIER,
    [archivoNombre] VARCHAR(255) NOT NULL,
    [archivoRuta] VARCHAR(500) NOT NULL,
    [archivoMime] VARCHAR(100) NOT NULL,
    [archivoTamano] INT NOT NULL,
    [subidoPorId] UNIQUEIDENTIFIER,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [EmpleadoDocumento_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [EmpleadoDocumento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CargoColaborador_tenantId_idx] ON [dbo].[CargoColaborador]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoDetalle_tenantId_idx] ON [dbo].[EmpleadoDetalle]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoFamiliar_tenantId_idx] ON [dbo].[EmpleadoFamiliar]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoFamiliar_empleadoId_idx] ON [dbo].[EmpleadoFamiliar]([empleadoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoEstudio_tenantId_idx] ON [dbo].[EmpleadoEstudio]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoEstudio_empleadoId_idx] ON [dbo].[EmpleadoEstudio]([empleadoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoDocumento_tenantId_idx] ON [dbo].[EmpleadoDocumento]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoDocumento_empleadoId_idx] ON [dbo].[EmpleadoDocumento]([empleadoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [EmpleadoDocumento_estudioId_idx] ON [dbo].[EmpleadoDocumento]([estudioId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Empleado_cargoId_idx] ON [dbo].[Empleado]([cargoId]);

-- AddForeignKey
ALTER TABLE [dbo].[Empleado] ADD CONSTRAINT [Empleado_cargoId_fkey] FOREIGN KEY ([cargoId]) REFERENCES [dbo].[CargoColaborador]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CargoColaborador] ADD CONSTRAINT [CargoColaborador_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoDetalle] ADD CONSTRAINT [EmpleadoDetalle_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoDetalle] ADD CONSTRAINT [EmpleadoDetalle_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoFamiliar] ADD CONSTRAINT [EmpleadoFamiliar_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoFamiliar] ADD CONSTRAINT [EmpleadoFamiliar_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoEstudio] ADD CONSTRAINT [EmpleadoEstudio_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoEstudio] ADD CONSTRAINT [EmpleadoEstudio_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoDocumento] ADD CONSTRAINT [EmpleadoDocumento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoDocumento] ADD CONSTRAINT [EmpleadoDocumento_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[EmpleadoDocumento] ADD CONSTRAINT [EmpleadoDocumento_estudioId_fkey] FOREIGN KEY ([estudioId]) REFERENCES [dbo].[EmpleadoEstudio]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

