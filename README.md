# FlowWise Finance

Prompt para Lovable

Quiero que actúes como un Senior Product Designer, Senior Software Architect y Full Stack Engineer especializado en aplicaciones SaaS empresariales.

Necesito desarrollar una aplicación web empresarial (SaaS) para la recepción, clasificación, distribución, aprobación, seguimiento y análisis de facturas, diseñada para empresas medianas y grandes.

No quiero un MVP básico. Quiero una plataforma moderna, elegante, escalable y preparada para producción.

Toda la aplicación debe tener una experiencia de usuario premium similar a Notion, Linear, Stripe Dashboard, Monday.com y SAP Fiori, combinando simplicidad con funcionalidades empresariales avanzadas.

Objetivo

Crear una plataforma donde cualquier factura que ingrese a la empresa sea procesada automáticamente, clasificada, enviada al responsable correspondiente según reglas de negocio y posteriormente monitoreada hasta finalizar su proceso de aprobación o pago.

La plataforma debe permitir controlar completamente el flujo documental y financiero de la organización.

Diseño

Quiero un diseño moderno.

Minimalista.

Corporativo.

Muy elegante.

Interfaz limpia.

Componentes reutilizables.

Excelente UX.

Responsive.

Dark Mode.

Light Mode.

Animaciones suaves.

Sidebar colapsable.

Cards modernas.

Tablas profesionales.

Gráficos interactivos.

Dashboard ejecutivo.

Branding

Utilizar una identidad visual empresarial.

Tipografía moderna.

Mucho espacio en blanco.

Sombras suaves.

Bordes redondeados.

Componentes tipo SaaS.

Diseño inspirado en:

Stripe

Notion

Linear

Vercel

Atlassian

Monday

Microsoft Fluent

Login

Crear un sistema completo de autenticación.

Pantallas:

Login

Recuperar contraseña

Restablecer contraseña

Cambiar contraseña

Cerrar sesión

Perfil

Configuración

Recordar sesión

2FA preparado para futuras versiones.

Roles

Implementar control de acceso basado en roles (RBAC).

Roles:

Administrador

Gerencia

Director Financiero

Contabilidad

Tesorería

Compras

Recursos Humanos

Jurídica

Supervisor

Auditor

Usuario

Cada rol tendrá permisos completamente independientes.

Dashboard Principal

Mostrar indicadores en tiempo real.

Cards con:

Facturas recibidas

Facturas pendientes

Facturas aprobadas

Facturas rechazadas

Facturas pagadas

Facturas vencidas

Facturas próximas a vencer

Valor total del mes

Valor aprobado

Valor pendiente

Valor pagado

Tiempo promedio de aprobación

Tiempo promedio de respuesta

Top proveedores

Top áreas

Top contratos

Alertas importantes

Notificaciones recientes

Dashboard Analítico

Crear dashboards completamente interactivos.

Gráficos:

Barras

Líneas

Pie

Área

Heatmaps

Comparativos mensuales

Comparativos anuales

Comparativos por proveedor

Comparativos por contrato

Comparativos por responsable

Comparativos por empresa

Comparativos por centro de costos

Recepción de Facturas

Permitir:

Subir PDF

XML

Excel

Imágenes

ZIP

Arrastrar archivos

Carga múltiple

Escaneo mediante OCR

Vista previa del documento

OCR

Extraer automáticamente:

Proveedor

NIT

Número de factura

Fecha

Subtotal

IVA

Retenciones

Total

Contrato relacionado

Centro de costos

Orden de compra

Moneda

Forma de pago

Observaciones

Clasificación Inteligente

La aplicación debe clasificar automáticamente las facturas según:

Proveedor

Cliente

Contrato

Monto

Centro de costos

Proyecto

Ciudad

Sucursal

Empresa

Área

Responsable

Tipo de gasto

Tipo de factura

Nivel de prioridad

Urgencia

Periodicidad

Estado

Motor de Reglas

Crear un módulo visual donde el administrador pueda crear reglas del tipo:

SI

Proveedor = X

Y

Monto > 20.000.000

ENTONCES

Enviar a:

Gerencia

Director Financiero

Compras

Tesorería

Otro ejemplo:

SI

Factura pertenece al contrato A

Enviar únicamente al supervisor del contrato.

Las reglas deben ser completamente configurables.

Contratos

Crear un módulo para administrar contratos.

Cada contrato tendrá:

Empresa

Proveedor

Cliente

Responsable

Supervisor

Gerente

Área

Centro de costos

Valor contratado

Fecha inicio

Fecha final

Estado

Archivos

Observaciones

Documentos asociados

Relación Factura - Contrato

Cuando una factura ingrese:

Buscar automáticamente el contrato correspondiente.

Asignar:

Supervisor

Jefe inmediato

Gerente

Área responsable

Enviar automáticamente la factura al flujo correcto.

Flujo de Aprobación

Estados:

Recibida

En revisión

Pendiente

Aprobada

Rechazada

Devuelta

Pagada

Archivada

Cada cambio debe quedar registrado.

Mostrar una línea de tiempo visual del proceso.

Bandeja de Entrada

Crear una bandeja tipo Outlook.

Con filtros.

Búsqueda.

Favoritos.

Pendientes.

Aprobadas.

Archivadas.

Urgentes.

Notificaciones

Sistema de notificaciones en tiempo real.

Correo electrónico.

Notificaciones internas.

Recordatorios.

Escalamientos automáticos.

Alertas inteligentes.

Gestión Documental

Cada factura debe almacenar:

Archivos

Historial

Comentarios

Versiones

Etiquetas

Responsables

Adjuntos

Búsqueda Global

Implementar búsqueda inteligente.

Permitir buscar por:

Factura

Proveedor

Cliente

Contrato

Proyecto

Centro de costos

Área

Usuario

Estado

NIT

Monto

Fecha

Proyección Financiera

Crear un módulo financiero.

Calcular automáticamente:

Gasto mensual

Gasto anual

Promedio mensual

Promedio anual

Proyección trimestral

Proyección semestral

Proyección anual

Tendencias

Predicciones

Variaciones

Incrementos

Alertas de sobrecostos

Comparaciones históricas

Créditos de Clientes

Crear módulo para visualizar:

Créditos activos

Créditos pendientes

Créditos vencidos

Historial

Saldo

Pagos

Reportes

Generar reportes exportables en:

PDF

Excel

CSV

Programar envíos automáticos.

Auditoría

Registrar absolutamente todas las acciones del sistema.

Accesos.

Cambios.

Ediciones.

Eliminaciones.

Aprobaciones.

Descargas.

Logins.

Intentos fallidos.

Seguridad

Preparar la aplicación para producción.

Implementar:

Autenticación segura

Protección CSRF

Protección XSS

Protección SQL Injection

Rate Limiting

Logs

Auditoría

Backups

Permisos granulares

Arquitectura

Diseñar el proyecto con una arquitectura modular para facilitar futuras ampliaciones.

Separar claramente:

 UI

 Componentes

 Páginas

 Servicios

 API

 Base de datos

 Autenticación

 Notificaciones

 Motor de reglas

 Reportes

 Analítica

 Configuración

Inteligencia Artificial (Fase 2)

Diseñar la arquitectura para integrar posteriormente IA sin modificar la estructura principal.

La IA deberá permitir:

 Clasificar automáticamente facturas.

 Detectar facturas duplicadas.

 Detectar anomalías y posibles fraudes.

 Recomendar automáticamente la ruta de aprobación.

 Generar resúmenes ejecutivos.

 Responder preguntas en lenguaje natural sobre facturas, contratos, gastos y reportes.

 Analizar tendencias de gasto y realizar proyecciones financieras.

Resultado esperado

Quiero que Lovable genere una aplicación con apariencia de software empresarial de alto nivel, con una navegación intuitiva, componentes reutilizables, dashboards ejecutivos, tablas avanzadas, formularios profesionales, filtros inteligentes, gráficos interactivos y una experiencia de usuario comparable a plataformas SaaS modernas. El diseño debe transmitir confianza, eficiencia y profesionalismo, listo para evolucionar hacia un sistema ERP/BPM completo para la gestión documental y financiera.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e63ebc33-6617-4685-a5f7-ab2ee2cabe0d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
