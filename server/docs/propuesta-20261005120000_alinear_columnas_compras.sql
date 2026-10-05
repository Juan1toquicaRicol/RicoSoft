-- PROPUESTA (NO es una migración aplicada ni está en prisma/migrations).
-- Nombre sugerido si se aprueba: 20261005120000_alinear_columnas_compras
--
-- Alinea la base creada SOLO con migraciones con schema.prisma en lo único que
-- rompe código en ejecución: 3 columnas nullable + 2 claves foráneas que el
-- schema declara y ninguna migración crea.
--   SolicitudCompra.proveedorId  (relación a Proveedor; la usa _count.solicitudesCompra
--                                 en proveedores.controller.ts → 500 sin esta columna)
--   SolicitudCompra.proveedor    (texto libre, VARCHAR(255) NULL)
--   Factura.solicitudCompraId    (relación a SolicitudCompra)
--
-- Es IDEMPOTENTE a propósito (IF COL_LENGTH / IF NOT EXISTS): si saas_dev u otro
-- entorno ya tiene estas columnas (creadas fuera de las migraciones), no falla ni
-- las modifica. No toca datos: columnas nullable, sin DEFAULT, sin backfill.
-- NO incluye ningún otro cambio del diff (ver PROPUESTA-migracion-alineacion-schema-2026-10-05.md).

BEGIN TRY

BEGIN TRAN;

IF COL_LENGTH('dbo.SolicitudCompra', 'proveedorId') IS NULL
  ALTER TABLE [dbo].[SolicitudCompra] ADD [proveedorId] UNIQUEIDENTIFIER NULL;

IF COL_LENGTH('dbo.SolicitudCompra', 'proveedor') IS NULL
  ALTER TABLE [dbo].[SolicitudCompra] ADD [proveedor] VARCHAR(255) NULL;

IF COL_LENGTH('dbo.Factura', 'solicitudCompraId') IS NULL
  ALTER TABLE [dbo].[Factura] ADD [solicitudCompraId] UNIQUEIDENTIFIER NULL;

-- AddForeignKey (mismas acciones que declara schema.prisma: NoAction/NoAction)
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'SolicitudCompra_proveedorId_fkey')
  EXEC('ALTER TABLE [dbo].[SolicitudCompra] ADD CONSTRAINT [SolicitudCompra_proveedorId_fkey] FOREIGN KEY ([proveedorId]) REFERENCES [dbo].[Proveedor]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'Factura_solicitudCompraId_fkey')
  EXEC('ALTER TABLE [dbo].[Factura] ADD CONSTRAINT [Factura_solicitudCompraId_fkey] FOREIGN KEY ([solicitudCompraId]) REFERENCES [dbo].[SolicitudCompra]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
