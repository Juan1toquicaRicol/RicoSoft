-- Asociación opcional entre cargos y departamentos.
ALTER TABLE [dbo].[CargoColaborador] ADD [departamentoId] UNIQUEIDENTIFIER NULL;

CREATE NONCLUSTERED INDEX [CargoColaborador_departamentoId_idx]
ON [dbo].[CargoColaborador]([departamentoId]);

ALTER TABLE [dbo].[CargoColaborador]
ADD CONSTRAINT [CargoColaborador_departamentoId_fkey]
FOREIGN KEY ([departamentoId]) REFERENCES [dbo].[Departamento]([id])
ON DELETE NO ACTION ON UPDATE NO ACTION;
