BEGIN TRY

BEGIN TRAN;

-- Inmutabilidad del historial de auditoría (ISO 27001 A.12.4): Auditoria.usuarioId
-- deja de tener FK a User. Antes, borrar un usuario obligaba a hacer
-- UPDATE Auditoria SET usuarioId = NULL (mutación de filas históricas). Ahora
-- la fila nunca se toca; el actor se resuelve en la aplicación
-- (lib/auditoria-usuarios.ts). La columna se conserva tal cual (sin pérdida de
-- datos) y se añade un índice para los filtros por usuario.

-- DropForeignKey
ALTER TABLE [dbo].[Auditoria] DROP CONSTRAINT [Auditoria_usuarioId_fkey];

-- CreateIndex
CREATE NONCLUSTERED INDEX [Auditoria_usuarioId_idx] ON [dbo].[Auditoria]([usuarioId]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
