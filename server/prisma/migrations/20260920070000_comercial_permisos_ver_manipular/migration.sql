-- Modelo funcional de permisos Módulo → Sección → Ver/Manipular, piloto en
-- Comercial. No crea columnas ni tablas nuevas: los códigos de permiso nuevos
-- (cotizaciones.manipular, pedidos_comerciales.manipular, proformas.ver,
-- proformas.manipular) los siembra en runtime asegurarCatalogoSembrado()
-- (server/src/lib/permissions.ts + permisos.service.ts) contra la tabla
-- Permiso existente, como cualquier código nuevo agregado a PERMISOS_SISTEMA.
--
-- Lo único que esta migración backfillea es el módulo de menú "Gestión
-- Comercial" (tabla Modulo): antes exigía solo "cotizaciones.ver" para
-- aparecer en el sidebar; ahora agrega también Proformas y Pedidos
-- comerciales, así que debe aceptar cualquiera de las 3 secciones. Solo toca
-- filas que SIGAN en el valor por defecto original — si un administrador ya
-- personalizó el permiso de este módulo desde Configuración > Módulos, esa
-- personalización se respeta y no se sobreescribe.
UPDATE [dbo].[Modulo]
SET [permisoClave] = 'cotizaciones.ver,proformas.ver,pedidos_comerciales.ver'
WHERE [clave] = 'gestion-comercial'
  AND [permisoClave] = 'cotizaciones.ver';
