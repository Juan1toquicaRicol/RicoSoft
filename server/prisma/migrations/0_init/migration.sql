BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Tenant] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [subdomain] VARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Tenant_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Tenant_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Tenant_subdomain_key] UNIQUE NONCLUSTERED ([subdomain])
);

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [email] VARCHAR(255) NOT NULL,
    [passwordHash] TEXT NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [telefono] VARCHAR(50),
    [rol] VARCHAR(50) CONSTRAINT [User_rol_df] DEFAULT 'COLABORADOR',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [activo] BIT NOT NULL CONSTRAINT [User_activo_df] DEFAULT 1,
    [colaboradorId] UNIQUEIDENTIFIER,
    [departamentoId] UNIQUEIDENTIFIER,
    [isSuperadmin] BIT NOT NULL CONSTRAINT [User_isSuperadmin_df] DEFAULT 0,
    [lastLoginAt] DATETIME2,
    [rolId] UNIQUEIDENTIFIER,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Rol] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(100) NOT NULL,
    [descripcion] VARCHAR(255),
    [esSistema] BIT NOT NULL CONSTRAINT [Rol_esSistema_df] DEFAULT 0,
    [permisos] TEXT NOT NULL CONSTRAINT [Rol_permisos_df] DEFAULT '[]',
    CONSTRAINT [Rol_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PermisoUsuario] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [permisoId] VARCHAR(100) NOT NULL,
    [concedido] BIT NOT NULL,
    CONSTRAINT [PermisoUsuario_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Auditoria] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [usuarioId] UNIQUEIDENTIFIER NOT NULL,
    [usuarioAfectado] VARCHAR(255),
    [accion] VARCHAR(100) NOT NULL,
    [detalle] TEXT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Auditoria_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Auditoria_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Departamento] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [activo] BIT NOT NULL CONSTRAINT [Departamento_activo_df] DEFAULT 1,
    [esSistemas] BIT NOT NULL CONSTRAINT [Departamento_esSistemas_df] DEFAULT 0,
    CONSTRAINT [Departamento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Modulo] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [clave] VARCHAR(100) NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [ruta] VARCHAR(255) NOT NULL,
    [icono] VARCHAR(50) NOT NULL,
    [departamentoId] UNIQUEIDENTIFIER,
    [activo] BIT NOT NULL CONSTRAINT [Modulo_activo_df] DEFAULT 1,
    [orden] INT NOT NULL CONSTRAINT [Modulo_orden_df] DEFAULT 0,
    CONSTRAINT [Modulo_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Modulo_tenantId_clave_key] UNIQUE NONCLUSTERED ([tenantId],[clave])
);

-- CreateTable
CREATE TABLE [dbo].[Colaborador] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [departamentoId] UNIQUEIDENTIFIER,
    [numero_empleado] VARCHAR(50) NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [apellido] VARCHAR(255) NOT NULL,
    CONSTRAINT [Colaborador_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Factura] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [numero] VARCHAR(50) NOT NULL,
    [proveedor] VARCHAR(255) NOT NULL,
    [nit] VARCHAR(50) NOT NULL,
    [contrato] VARCHAR(100),
    [centroCostos] VARCHAR(100),
    [area] VARCHAR(100) NOT NULL,
    [responsable] VARCHAR(255) NOT NULL,
    [fecha] DATETIME2 NOT NULL CONSTRAINT [Factura_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [vence] DATETIME2 NOT NULL,
    [subtotal] DECIMAL(18,2) NOT NULL,
    [iva] DECIMAL(18,2) NOT NULL,
    [total] DECIMAL(18,2) NOT NULL,
    [moneda] VARCHAR(3) NOT NULL CONSTRAINT [Factura_moneda_df] DEFAULT 'COP',
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [Factura_estado_df] DEFAULT 'Pendiente',
    [prioridad] VARCHAR(20) NOT NULL CONSTRAINT [Factura_prioridad_df] DEFAULT 'Media',
    [origen] VARCHAR(20) NOT NULL CONSTRAINT [Factura_origen_df] DEFAULT 'Carga manual',
    [archivoNombre] VARCHAR(255),
    [archivoRuta] VARCHAR(500),
    [archivoMime] VARCHAR(100),
    [archivoTamano] INT,
    [archivoSubidoPorNombre] VARCHAR(255),
    [archivoSubidoEn] DATETIME2,
    [eliminado] BIT NOT NULL CONSTRAINT [Factura_eliminado_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Factura_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Factura_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Factura_tenantId_empresaId_numero_key] UNIQUE NONCLUSTERED ([tenantId],[empresaId],[numero])
);

-- CreateTable
CREATE TABLE [dbo].[FacturaHistorial] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [facturaId] UNIQUEIDENTIFIER NOT NULL,
    [actor] VARCHAR(255) NOT NULL,
    [accion] VARCHAR(255) NOT NULL,
    [detalle] TEXT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [FacturaHistorial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [FacturaHistorial_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SolicitudCompra] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [area] VARCHAR(100) NOT NULL,
    [solicitante] VARCHAR(255) NOT NULL,
    [item] VARCHAR(255) NOT NULL,
    [descripcion] TEXT,
    [cantidad] INT NOT NULL,
    [valorEstimado] DECIMAL(18,2) NOT NULL,
    [prioridad] VARCHAR(20) NOT NULL CONSTRAINT [SolicitudCompra_prioridad_df] DEFAULT 'Media',
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [SolicitudCompra_estado_df] DEFAULT 'Pendiente',
    [fechaSolicitud] DATETIME2 NOT NULL CONSTRAINT [SolicitudCompra_fechaSolicitud_df] DEFAULT CURRENT_TIMESTAMP,
    [fechaResolucion] DATETIME2,
    [resueltoPorId] UNIQUEIDENTIFIER,
    [resueltoPorNombre] VARCHAR(255),
    [comentarioResolucion] TEXT,
    [eliminado] BIT NOT NULL CONSTRAINT [SolicitudCompra_eliminado_df] DEFAULT 0,
    CONSTRAINT [SolicitudCompra_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ServicioSuscripcion] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [area] VARCHAR(100) NOT NULL,
    [nombreServicio] VARCHAR(255) NOT NULL,
    [proveedor] VARCHAR(255) NOT NULL,
    [periodicidad] VARCHAR(20) NOT NULL,
    [costo] DECIMAL(18,2) NOT NULL,
    [moneda] VARCHAR(3) NOT NULL CONSTRAINT [ServicioSuscripcion_moneda_df] DEFAULT 'COP',
    [fechaRenovacion] DATETIME2 NOT NULL,
    [estado] VARCHAR(30) NOT NULL CONSTRAINT [ServicioSuscripcion_estado_df] DEFAULT 'Activo',
    [responsableArea] VARCHAR(255) NOT NULL,
    [eliminado] BIT NOT NULL CONSTRAINT [ServicioSuscripcion_eliminado_df] DEFAULT 0,
    CONSTRAINT [ServicioSuscripcion_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Contrato] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [proveedor] VARCHAR(255) NOT NULL,
    [cliente] VARCHAR(255),
    [responsable] VARCHAR(255) NOT NULL,
    [supervisor] VARCHAR(255),
    [gerente] VARCHAR(255),
    [area] VARCHAR(100) NOT NULL,
    [centroCostos] VARCHAR(100),
    [valorContratado] DECIMAL(18,2) NOT NULL,
    [fechaInicio] DATETIME2 NOT NULL,
    [fechaFin] DATETIME2 NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [Contrato_estado_df] DEFAULT 'Activo',
    [observaciones] TEXT,
    [eliminado] BIT NOT NULL CONSTRAINT [Contrato_eliminado_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Contrato_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Contrato_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ReglaEnrutamiento] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [nombre] VARCHAR(255) NOT NULL,
    [prioridad] INT NOT NULL CONSTRAINT [ReglaEnrutamiento_prioridad_df] DEFAULT 1,
    [activa] BIT NOT NULL CONSTRAINT [ReglaEnrutamiento_activa_df] DEFAULT 1,
    [condiciones] TEXT NOT NULL,
    [acciones] TEXT NOT NULL,
    [ejecuciones] INT NOT NULL CONSTRAINT [ReglaEnrutamiento_ejecuciones_df] DEFAULT 0,
    CONSTRAINT [ReglaEnrutamiento_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CreditoCliente] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [cliente] VARCHAR(255) NOT NULL,
    [cupo] DECIMAL(18,2) NOT NULL,
    [saldo] DECIMAL(18,2) NOT NULL,
    [vence] DATETIME2 NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [CreditoCliente_estado_df] DEFAULT 'Al día',
    [eliminado] BIT NOT NULL CONSTRAINT [CreditoCliente_eliminado_df] DEFAULT 0,
    CONSTRAINT [CreditoCliente_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ProyeccionMensual] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [mes] VARCHAR(20) NOT NULL,
    [anio] INT NOT NULL,
    [proyectado] DECIMAL(18,2) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProyeccionMensual_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProyeccionMensual_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProyeccionMensual_tenantId_mes_anio_key] UNIQUE NONCLUSTERED ([tenantId],[mes],[anio])
);

-- CreateTable
CREATE TABLE [dbo].[Empleado] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [documento] VARCHAR(50) NOT NULL,
    [nombres] VARCHAR(255) NOT NULL,
    [apellidos] VARCHAR(255) NOT NULL,
    [correo] VARCHAR(255) NOT NULL,
    [cargo] VARCHAR(255) NOT NULL,
    [area] VARCHAR(100) NOT NULL,
    [fechaContratacion] DATETIME2 NOT NULL,
    [fechaLiquidacion] DATETIME2,
    [salarioActual] DECIMAL(18,2) NOT NULL,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [Empleado_estado_df] DEFAULT 'Activo',
    [eliminado] BIT NOT NULL CONSTRAINT [Empleado_eliminado_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Empleado_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Empleado_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[HistorialSalario] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [fecha] DATETIME2 NOT NULL CONSTRAINT [HistorialSalario_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [salarioAnterior] DECIMAL(18,2) NOT NULL,
    [nuevoSalario] DECIMAL(18,2) NOT NULL,
    [motivo] VARCHAR(255) NOT NULL,
    CONSTRAINT [HistorialSalario_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PermisoLaboral] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [tipoPermiso] VARCHAR(50) NOT NULL,
    [fechaInicio] DATETIME2 NOT NULL,
    [fechaFin] DATETIME2 NOT NULL,
    [dias] INT NOT NULL,
    [observaciones] TEXT,
    [estado] VARCHAR(20) NOT NULL CONSTRAINT [PermisoLaboral_estado_df] DEFAULT 'Pendiente',
    [fechaSolicitud] DATETIME2 NOT NULL CONSTRAINT [PermisoLaboral_fechaSolicitud_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PermisoLaboral_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[FaltaStrike] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [tenantId] UNIQUEIDENTIFIER NOT NULL,
    [empresaId] VARCHAR(10) NOT NULL,
    [empleadoId] UNIQUEIDENTIFIER NOT NULL,
    [fecha] DATETIME2 NOT NULL CONSTRAINT [FaltaStrike_fecha_df] DEFAULT CURRENT_TIMESTAMP,
    [gravedad] VARCHAR(20) NOT NULL,
    [motivo] TEXT NOT NULL,
    [descargos] TEXT,
    [registradoPor] VARCHAR(255) NOT NULL,
    CONSTRAINT [FaltaStrike_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_tenantId_activo_idx] ON [dbo].[User]([tenantId], [activo]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_tenantId_email_idx] ON [dbo].[User]([tenantId], [email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Rol_tenantId_idx] ON [dbo].[Rol]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PermisoUsuario_userId_idx] ON [dbo].[PermisoUsuario]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Auditoria_tenantId_idx] ON [dbo].[Auditoria]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Departamento_tenantId_idx] ON [dbo].[Departamento]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Modulo_tenantId_idx] ON [dbo].[Modulo]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Modulo_departamentoId_idx] ON [dbo].[Modulo]([departamentoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Colaborador_tenantId_idx] ON [dbo].[Colaborador]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Factura_tenantId_idx] ON [dbo].[Factura]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FacturaHistorial_facturaId_idx] ON [dbo].[FacturaHistorial]([facturaId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SolicitudCompra_tenantId_idx] ON [dbo].[SolicitudCompra]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SolicitudCompra_tenantId_estado_idx] ON [dbo].[SolicitudCompra]([tenantId], [estado]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ServicioSuscripcion_tenantId_idx] ON [dbo].[ServicioSuscripcion]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Contrato_tenantId_idx] ON [dbo].[Contrato]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReglaEnrutamiento_tenantId_idx] ON [dbo].[ReglaEnrutamiento]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditoCliente_tenantId_idx] ON [dbo].[CreditoCliente]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProyeccionMensual_tenantId_idx] ON [dbo].[ProyeccionMensual]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Empleado_tenantId_idx] ON [dbo].[Empleado]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [HistorialSalario_empleadoId_idx] ON [dbo].[HistorialSalario]([empleadoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PermisoLaboral_tenantId_idx] ON [dbo].[PermisoLaboral]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PermisoLaboral_empleadoId_idx] ON [dbo].[PermisoLaboral]([empleadoId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FaltaStrike_tenantId_idx] ON [dbo].[FaltaStrike]([tenantId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [FaltaStrike_empleadoId_idx] ON [dbo].[FaltaStrike]([empleadoId]);

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_colaboradorId_fkey] FOREIGN KEY ([colaboradorId]) REFERENCES [dbo].[Colaborador]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_departamentoId_fkey] FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_rolId_fkey] FOREIGN KEY ([rolId]) REFERENCES [dbo].[Rol]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Rol] ADD CONSTRAINT [Rol_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PermisoUsuario] ADD CONSTRAINT [PermisoUsuario_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Auditoria] ADD CONSTRAINT [Auditoria_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Auditoria] ADD CONSTRAINT [Auditoria_usuarioId_fkey] FOREIGN KEY ([usuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Departamento] ADD CONSTRAINT [Departamento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Modulo] ADD CONSTRAINT [Modulo_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Modulo] ADD CONSTRAINT [Modulo_departamentoId_fkey] FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Colaborador] ADD CONSTRAINT [Colaborador_departamentoId_fkey] FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Colaborador] ADD CONSTRAINT [Colaborador_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FacturaHistorial] ADD CONSTRAINT [FacturaHistorial_facturaId_fkey] FOREIGN KEY ([facturaId]) REFERENCES [dbo].[Factura]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SolicitudCompra] ADD CONSTRAINT [SolicitudCompra_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SolicitudCompra] ADD CONSTRAINT [SolicitudCompra_resueltoPorId_fkey] FOREIGN KEY ([resueltoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ServicioSuscripcion] ADD CONSTRAINT [ServicioSuscripcion_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Contrato] ADD CONSTRAINT [Contrato_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ReglaEnrutamiento] ADD CONSTRAINT [ReglaEnrutamiento_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[CreditoCliente] ADD CONSTRAINT [CreditoCliente_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[ProyeccionMensual] ADD CONSTRAINT [ProyeccionMensual_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[Empleado] ADD CONSTRAINT [Empleado_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[HistorialSalario] ADD CONSTRAINT [HistorialSalario_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PermisoLaboral] ADD CONSTRAINT [PermisoLaboral_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[PermisoLaboral] ADD CONSTRAINT [PermisoLaboral_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[FaltaStrike] ADD CONSTRAINT [FaltaStrike_empleadoId_fkey] FOREIGN KEY ([empleadoId]) REFERENCES [dbo].[Empleado]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[FaltaStrike] ADD CONSTRAINT [FaltaStrike_tenantId_fkey] FOREIGN KEY ([tenantId]) REFERENCES [dbo].[Tenant]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

