BEGIN TRY

BEGIN TRAN;

-- DropIndex
-- Tenant_siesaCiaId_key (creada en 20260826203752_tenant_siesa_cia_id) era una
-- UNIQUE CONSTRAINT plana. A diferencia de PostgreSQL/MySQL, SQL Server trata
-- una UNIQUE CONSTRAINT estándar como si NULL fuera un valor comparable: solo
-- permite UNA fila con NULL en la columna. Como siesaCiaId es NULL para
-- cualquier tenant que no se integra con Siesa, esto bloqueaba crear un
-- segundo tenant sin esa integración (expuesto por primera vez por la suite
-- de integración real en server/src/lib/tenant-siesa-cia-id.integration.test.ts,
-- no detectable con los tests previos porque ninguno usa una base de datos
-- real). No se edita la migración original ya aplicada — se corrige hacia
-- adelante con una nueva migración, igual que cualquier cambio de schema
-- sobre una base de datos existente.
ALTER TABLE [dbo].[Tenant] DROP CONSTRAINT [Tenant_siesaCiaId_key];

-- CreateIndex
-- Índice único FILTRADO (no una constraint UNIQUE normal): mismo patrón ya
-- usado para Tenant.dominioCorporativo (ver 20260826215604_tenant_dominio_activo).
-- Prisma no tiene una sintaxis en schema.prisma para expresar un índice único
-- filtrado — `siesaCiaId Int? @unique` se queda exactamente igual en el
-- schema; la diferencia vive solo aquí, en el SQL de la migración. Por eso
-- esto NO se puede regenerar corriendo `prisma migrate dev` de nuevo sin
-- volver a perderlo: cualquier cambio futuro de schema que tolque esta tabla
-- debe seguir editando la migración generada a mano, igual que se hizo aquí,
-- y en ningún caso debe aplicarse `prisma db push` sobre esta tabla (ese
-- comando reconcilia el DDL directo desde schema.prisma, sin pasar por el
-- historial de migraciones, y recrearía una UNIQUE CONSTRAINT plana en vez
-- de este índice filtrado).
-- Se crea con EXEC(dynamic SQL) porque, dentro del mismo batch en el que se
-- soltó la constraint, SQL Server no permite crear el índice referenciando
-- la misma columna sin forzar resolución de nombres diferida.
EXEC('CREATE UNIQUE NONCLUSTERED INDEX [Tenant_siesaCiaId_key] ON [dbo].[Tenant]([siesaCiaId]) WHERE [siesaCiaId] IS NOT NULL');

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
