ALTER TABLE [dbo].[LoteImportacion] ADD
  [booking] NVARCHAR(100) NULL,
  [forwarder] NVARCHAR(255) NULL,
  [buqueNombre] NVARCHAR(255) NULL,
  [buqueImo] NVARCHAR(20) NULL,
  [buqueMmsi] NVARCHAR(20) NULL,
  [etaTrackingActual] DATETIME2 NULL,
  [ultimaPosicionLat] FLOAT NULL,
  [ultimaPosicionLon] FLOAT NULL,
  [ultimaPosicionFecha] DATETIME2 NULL,
  [velocidadNudos] FLOAT NULL,
  [rumboGrados] FLOAT NULL,
  [estadoTracking] NVARCHAR(20) NOT NULL CONSTRAINT [DF_LoteImportacion_estadoTracking] DEFAULT 'PENDIENTE',
  [proveedorTracking] NVARCHAR(50) NULL,
  [ultimoErrorTracking] NVARCHAR(MAX) NULL,
  [ultimaSincronizacionTracking] DATETIME2 NULL;

CREATE TABLE [dbo].[ContenedorLote] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_ContenedorLote_id] DEFAULT NEWID(),
  [loteId] UNIQUEIDENTIFIER NOT NULL,
  [numero] NVARCHAR(20) NOT NULL,
  [ultimoEvento] NVARCHAR(30) NULL,
  [ultimoEventoFecha] DATETIME2 NULL,
  [eventosJson] NVARCHAR(MAX) NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ContenedorLote_createdAt] DEFAULT GETDATE(),
  CONSTRAINT [PK_ContenedorLote] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [FK_ContenedorLote_LoteImportacion] FOREIGN KEY ([loteId]) REFERENCES [dbo].[LoteImportacion]([id]) ON DELETE CASCADE
);

CREATE UNIQUE NONCLUSTERED INDEX [ContenedorLote_loteId_numero_key] ON [dbo].[ContenedorLote]([loteId], [numero]);
CREATE NONCLUSTERED INDEX [ContenedorLote_loteId_idx] ON [dbo].[ContenedorLote]([loteId]);
