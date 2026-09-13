-- Nuevos campos estructurados para el formulario "Nueva Orden de Compra
-- Internacional" (mejora funcional, no cambia lógica de landed cost /
-- tracking / bandeja inteligente existente).

-- fechaOrden: NOT NULL con DEFAULT GETDATE() WITH VALUES para que las
-- órdenes existentes queden con un valor real (la fecha de esta migración)
-- en vez de NULL; de aquí en adelante cada INSERT nuevo usa
-- @default(now()) de Prisma salvo que el formulario mande una fecha
-- explícita.
ALTER TABLE [dbo].[OrdenCompraIntl] ADD [fechaOrden] DATETIME2 NOT NULL CONSTRAINT [DF_OrdenCompraIntl_fechaOrden] DEFAULT GETDATE() WITH VALUES;

ALTER TABLE [dbo].[OrdenCompraIntl] ADD [lugarPactado] VARCHAR(255) NULL;

ALTER TABLE [dbo].[OrdenCompraIntl] ADD [tasaCambioFecha] DATETIME2 NULL;

ALTER TABLE [dbo].[OrdenCompraIntl] ADD [tasaCambioFuente] VARCHAR(20) NULL;

ALTER TABLE [dbo].[OrdenCompraIntl] ADD [condicionPago] VARCHAR(255) NULL;

ALTER TABLE [dbo].[OrdenCompraIntl] ADD [detallePago] TEXT NULL;

ALTER TABLE [dbo].[OrdenCompraIntl] ADD [fechaRequeridaLlegada] DATETIME2 NULL;

ALTER TABLE [dbo].[ItemOrdenCompraIntl] ADD [referenciaProveedor] VARCHAR(100) NULL;
