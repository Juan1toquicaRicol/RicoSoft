BEGIN TRANSACTION;
CREATE TABLE dbo.ConfigCorreoImportaciones (
 id INT NOT NULL PRIMARY KEY CHECK (id = 1), lectura BIT NOT NULL, procesamiento BIT NOT NULL,
 etiqueta VARCHAR(128) NOT NULL, minutos INT NOT NULL, correos INT NOT NULL, adjuntos INT NOT NULL
);
ALTER TABLE dbo.ImportacionCorreo ADD etiquetaPiloto VARCHAR(128) NULL, gmailId VARCHAR(128) NULL;
COMMIT;
