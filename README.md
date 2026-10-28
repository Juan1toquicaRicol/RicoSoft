# RicoSoft Enterprise

Sistema web de gestión empresarial multiempresa para Grupo Ricol. RicoSoft reúne procesos comerciales, operativos y administrativos en una plataforma con acceso separado por empresa y permisos asignados a cada usuario.

> **Estado:** en desarrollo y evolución. La disponibilidad de cada módulo depende de su configuración, permisos y estado de despliegue.

## Funcionalidades

La plataforma incluye módulos y flujos para:

- **Gestión comercial:** cotizaciones, proformas, pedidos y despachos.
- **Inventario:** consulta y seguimiento de información relacionada con pedidos y compromisos.
- **Importaciones:** seguimiento de órdenes, hitos, documentos y costos asociados.
- **Gestión humana:** colaboradores, cargos, detalles y documentos, sujeto a los permisos correspondientes.
- **Analítica:** resúmenes y consultas disponibles según los permisos del usuario.
- **Integración con Siesa UnoEE:** consultas de información del ERP desde los flujos habilitados.

Los módulos y acciones disponibles dependen del tenant activo, la configuración y los permisos de cada usuario.

## Arquitectura

RicoSoft utiliza una arquitectura web con frontend, API backend y base de datos. La información empresarial se aísla por tenant.
