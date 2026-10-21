-- Ejecutar como administrador (sysadmin) en PC-RC-SV-PR (192.168.0.234),
-- instancia predeterminada (confirmado: InstanceName = NULL), puerto TCP 1433.
-- Crea la base QA aislada para pruebas de integración de RicoSoft.
-- NO toca saas_dev ni UnoEE_Ricol_Real. No restaura backups ni copia datos.
-- Reemplaza <CLAVE_MIGRADOR> y <CLAVE_RUNNER> al ejecutar; NO las guardes en git.
--
-- Comportamiento fail-fast (sin SET NOEXEC, la sesión nunca queda bloqueada):
--  * Si saas_dev_qa o cualquiera de los dos logins YA existe, no se crea ni se
--    modifica NADA (no se valida ni se cambia la contraseña de logins existentes:
--    inspecciónalos manualmente).
--  * Cada paso va en TRY/CATCH: ante cualquier error se crea el marcador #abort,
--    se imprime el error y TODOS los lotes siguientes se omiten.
--  * El último lote imprime "RESULTADO: OK" o "RESULTADO: ABORTADO". Si sale
--    ABORTADO tras un fallo parcial, revisa qué se creó antes de reintentar
--    (un reintento abortará porque la base/logins ya existen: es intencional).
--  * Recomendado: ejecutar con sqlcmd -b (o revisar el panel de Mensajes en SSMS).

USE master;
GO

IF OBJECT_ID(N'tempdb..#abort') IS NOT NULL DROP TABLE #abort;
GO

-- 0) Diagnóstico del servidor (informativo; la base se crea con collation explícita
--    Modern_Spanish_CI_AS, igual que saas_dev, sin depender de la del servidor).
SELECT @@SERVERNAME AS servidor, SERVERPROPERTY('InstanceName') AS instancia,
       SERVERPROPERTY('ProductVersion') AS version, SERVERPROPERTY('Collation') AS collation_servidor;
GO

-- El nivel de compatibilidad 160 exige SQL Server 2022 (versión mayor 16) o superior.
IF CAST(SERVERPROPERTY('ProductMajorVersion') AS int) < 16
BEGIN
  CREATE TABLE #abort (x int);
  PRINT N'ABORTADO: este servidor no soporta el nivel de compatibilidad 160 (requiere SQL Server 2022+). No se modificó nada.';
END
GO

-- 1) Verificación previa: base y logins no deben existir
IF DB_ID(N'saas_dev_qa') IS NOT NULL
   OR SUSER_ID(N'saas_dev_qa_migrador') IS NOT NULL
   OR SUSER_ID(N'saas_dev_qa_runner') IS NOT NULL
BEGIN
  IF OBJECT_ID(N'tempdb..#abort') IS NULL CREATE TABLE #abort (x int);
  PRINT N'ABORTADO: saas_dev_qa o alguno de sus logins YA EXISTE. No se modificó nada. Inspecciónalos manualmente.';
END
GO

-- 2) Crear vacía con la misma collation y compatibilidad de saas_dev (Modern_Spanish_CI_AS / 160)
IF OBJECT_ID(N'tempdb..#abort') IS NULL
BEGIN
BEGIN TRY
  EXEC (N'CREATE DATABASE [saas_dev_qa] COLLATE Modern_Spanish_CI_AS');
  EXEC (N'ALTER DATABASE [saas_dev_qa] SET COMPATIBILITY_LEVEL = 160');
END TRY
BEGIN CATCH
  IF OBJECT_ID(N'tempdb..#abort') IS NULL CREATE TABLE #abort (x int);
  PRINT N'ERROR creando la base: ' + ERROR_MESSAGE();
END CATCH
END
GO

-- 3) Logins separados (sin sysadmin, sin acceso a otras bases)
--    migrador: solo `prisma migrate deploy` (DDL). runner: solo datos para las pruebas.
IF OBJECT_ID(N'tempdb..#abort') IS NULL
BEGIN
BEGIN TRY
  EXEC (N'CREATE LOGIN [saas_dev_qa_migrador] WITH PASSWORD = N''<CLAVE_MIGRADOR>'', CHECK_POLICY = ON, DEFAULT_DATABASE = [saas_dev_qa]');
  EXEC (N'CREATE LOGIN [saas_dev_qa_runner] WITH PASSWORD = N''<CLAVE_RUNNER>'', CHECK_POLICY = ON, DEFAULT_DATABASE = [saas_dev_qa]');
END TRY
BEGIN CATCH
  IF OBJECT_ID(N'tempdb..#abort') IS NULL CREATE TABLE #abort (x int);
  PRINT N'ERROR creando logins: ' + ERROR_MESSAGE();
END CATCH
END
GO

-- 4) Usuarios y roles dentro de saas_dev_qa. Si la base no se creó, USE falla,
--    pero #abort ya existe y el resto de lotes se omite.
USE [saas_dev_qa];
GO

IF OBJECT_ID(N'tempdb..#abort') IS NULL AND DB_NAME() = N'saas_dev_qa'
BEGIN
BEGIN TRY
  CREATE USER [saas_dev_qa_migrador] FOR LOGIN [saas_dev_qa_migrador];
  ALTER ROLE db_owner ADD MEMBER [saas_dev_qa_migrador];   -- db_owner SOLO dentro de saas_dev_qa
  CREATE USER [saas_dev_qa_runner] FOR LOGIN [saas_dev_qa_runner];
  ALTER ROLE db_datareader ADD MEMBER [saas_dev_qa_runner];
  ALTER ROLE db_datawriter ADD MEMBER [saas_dev_qa_runner];
  EXEC (N'GRANT EXECUTE TO [saas_dev_qa_runner]');
END TRY
BEGIN CATCH
  IF OBJECT_ID(N'tempdb..#abort') IS NULL CREATE TABLE #abort (x int);
  PRINT N'ERROR creando usuarios/roles: ' + ERROR_MESSAGE();
END CATCH
END
GO

-- 5) Verificación y resultado
USE master;
GO
SELECT name, CAST(DATABASEPROPERTYEX(name,'Collation') AS varchar(60)) AS collation, compatibility_level
FROM sys.databases WHERE name IN (N'saas_dev', N'saas_dev_qa');
GO
IF OBJECT_ID(N'tempdb..#abort') IS NULL
  PRINT N'RESULTADO: OK';
ELSE
  PRINT N'RESULTADO: ABORTADO (revisa los mensajes anteriores)';
GO
