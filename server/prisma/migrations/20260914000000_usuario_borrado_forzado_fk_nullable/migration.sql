BEGIN TRY

BEGIN TRAN;

-- Habilita el borrado forzado de usuarios (eliminarUsuario) desvinculando
-- estas 4 FK en vez de bloquear el borrado: el registro de negocio se
-- conserva (todas ya guardan un snapshot en texto del nombre, o el propio
-- `detalle` en Auditoria), solo queda con el usuario NULL.

-- AlterTable: Auditoria.usuarioId -> nullable
ALTER TABLE [dbo].[Auditoria] DROP CONSTRAINT [Auditoria_usuarioId_fkey];
ALTER TABLE [dbo].[Auditoria] ALTER COLUMN [usuarioId] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[Auditoria] ADD CONSTRAINT [Auditoria_usuarioId_fkey] FOREIGN KEY ([usuarioId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: SincronizacionSiesaLog.iniciadoPorId -> nullable
ALTER TABLE [dbo].[SincronizacionSiesaLog] DROP CONSTRAINT [SincronizacionSiesaLog_iniciadoPorId_fkey];
ALTER TABLE [dbo].[SincronizacionSiesaLog] ALTER COLUMN [iniciadoPorId] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[SincronizacionSiesaLog] ADD CONSTRAINT [SincronizacionSiesaLog_iniciadoPorId_fkey] FOREIGN KEY ([iniciadoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: Pago.registradoPorId -> nullable
ALTER TABLE [dbo].[Pago] DROP CONSTRAINT [Pago_registradoPorId_fkey];
ALTER TABLE [dbo].[Pago] ALTER COLUMN [registradoPorId] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[Pago] ADD CONSTRAINT [Pago_registradoPorId_fkey] FOREIGN KEY ([registradoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: CotizacionProveedor.subidoPorId -> nullable
ALTER TABLE [dbo].[CotizacionProveedor] DROP CONSTRAINT [CotizacionProveedor_subidoPorId_fkey];
ALTER TABLE [dbo].[CotizacionProveedor] ALTER COLUMN [subidoPorId] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[CotizacionProveedor] ADD CONSTRAINT [CotizacionProveedor_subidoPorId_fkey] FOREIGN KEY ([subidoPorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
