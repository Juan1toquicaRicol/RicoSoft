BEGIN TRY

BEGIN TRAN;

-- Índice único FILTRADO (Fase 5.4.1): garantiza que, para una misma
-- combinación tenantId+usuarioId+tipo+entidadTipo+entidadId, exista como
-- máximo una fila. El filtro WHERE excluye explícitamente las notificaciones
-- que no tienen entidad (entidadTipo/entidadId NULL, el caso de TODAS las
-- notificaciones existentes hoy) — esas siguen sin ninguna restricción de
-- unicidad, exactamente como antes. Mismo patrón que
-- SincronizacionBiometricoLog_fuenteId_en_curso_uq (migración
-- 20260907120000_biometrico_crosschex): un índice único filtrado en SQL
-- Server es la forma de expresar "único solo quando aplica" sin un
-- constraint global que rompería los emisores que no usan entidad.
CREATE UNIQUE NONCLUSTERED INDEX [Notificacion_dedupe_entidad_uq]
ON [dbo].[Notificacion]([tenantId], [usuarioId], [tipo], [entidadTipo], [entidadId])
WHERE ([entidadTipo] IS NOT NULL AND [entidadId] IS NOT NULL);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
