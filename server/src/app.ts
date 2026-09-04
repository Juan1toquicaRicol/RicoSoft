import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import usuariosRoutes from "./modules/usuarios/usuarios.routes";
import rolesRoutes from "./modules/roles/roles.routes";
import permisosRoutes from "./modules/permisos/permisos.routes";
import departamentosRoutes from "./modules/departamentos/departamentos.routes";
import auditoriaRoutes from "./modules/auditoria/auditoria.routes";
import facturasRoutes from "./modules/facturas/facturas.routes";
import solicitudesRoutes from "./modules/solicitudes/solicitudes.routes";
import serviciosRoutes from "./modules/servicios/servicios.routes";
import contratosRoutes from "./modules/contratos/contratos.routes";
import reglasRoutes from "./modules/reglas/reglas.routes";
import creditosRoutes from "./modules/creditos/creditos.routes";
import gestionHumanaRoutes from "./modules/gestion-humana/gestion-humana.routes";
import analiticaRoutes from "./modules/analitica/analitica.routes";
import modulosRoutes from "./modules/modulos/modulos.routes";
import notificacionesRoutes from "./modules/notificaciones/notificaciones.routes";
import proveedoresRoutes from "./modules/proveedores/proveedores.routes";
import itemClasificacionesRoutes from "./modules/item-clasificaciones/item-clasificaciones.routes";
import importacionesRoutes from "./modules/importaciones/importaciones.routes";
import integracionesSiesaRoutes from "./modules/integraciones-siesa/siesa-sync.routes";
import membresiasRoutes from "./modules/membresias/membresias.routes";
import inventarioRoutes from "./modules/inventario/inventario.routes";
import tomaFisicaRoutes from "./modules/toma-fisica/toma-fisica.routes";
import planProduccionRoutes from "./modules/plan-produccion/plan-produccion.routes";
import gestionLiquidacionRoutes from "./modules/gestion-liquidacion/gestion-liquidacion.routes";
import gerencialRoutes from "./modules/gerencial/gerencial.routes";
import ventasRoutes from "./modules/ventas/ventas.routes";
import despachosRoutes from "./modules/despachos/despachos.routes";
import logisticaRoutes from "./modules/logistica/logistica.routes";
import oportunidadesRoutes from "./modules/oportunidades/oportunidades.routes";
import objetivosRoutes from "./modules/objetivos/objetivos.routes";

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Construye la app de Express sin arrancar el servidor (sin `listen`), para
 * que pueda importarse tanto desde `index.ts` (arranque real) como desde
 * pruebas con supertest (que solo necesitan el handler de Express).
 */
export function createApp() {
  // En producción, exige una lista explícita de orígenes permitidos
  // (separados por coma) en vez de aceptar cualquier origen. En desarrollo,
  // si no se configura, se permite cualquier origen para no complicar el
  // flujo local.
  const origenesPermitidos = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (isProduction && origenesPermitidos.length === 0) {
    throw new Error(
      "CORS_ORIGIN no está definido. En producción debes listar los orígenes permitidos (separados por coma) en server/.env.",
    );
  }

  const app = express();

  // Sin esto, detrás de un reverse proxy/load balancer (nginx, ALB, etc.)
  // req.ip siempre resuelve a la IP del proxy, no la del cliente real: el
  // rate-limit anti fuerza-bruta de /login (por IP) terminaría tratando a
  // TODOS los usuarios como una sola IP, bloqueando la app entera tras pocos
  // intentos fallidos de cualquiera. "1" = confiar solo en el primer salto
  // (el proxy que hace terminación TLS delante de este proceso), no en
  // cualquier X-Forwarded-For que mande el cliente directamente.
  // Solo en producción: en desarrollo no hay proxy y confiar en XFF sin uno
  // permitiría a cualquiera falsificar su IP aparente y evadir el rate-limit.
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(
    cors(
      origenesPermitidos.length > 0 ? { origin: origenesPermitidos } : undefined, // sin restricción solo cuando no hay CORS_ORIGIN configurado (dev)
    ),
  );
  app.use(express.json());

  // Liveness/readiness: usado por balanceadores de carga y orquestadores
  // para saber si el proceso está arriba. No requiere autenticación.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/usuarios", usuariosRoutes);
  app.use("/api/roles", rolesRoutes);
  app.use("/api/permisos", permisosRoutes);
  app.use("/api/departamentos", departamentosRoutes);
  app.use("/api/auditoria", auditoriaRoutes);
  app.use("/api/facturas", facturasRoutes);
  app.use("/api/solicitudes-compra", solicitudesRoutes);
  app.use("/api/servicios", serviciosRoutes);
  app.use("/api/contratos", contratosRoutes);
  app.use("/api/reglas", reglasRoutes);
  app.use("/api/creditos", creditosRoutes);
  app.use("/api/gestion-humana", gestionHumanaRoutes);
  app.use("/api/analitica", analiticaRoutes);
  app.use("/api/modulos", modulosRoutes);
  app.use("/api/notificaciones", notificacionesRoutes);
  app.use("/api/proveedores", proveedoresRoutes);
  app.use("/api/item-clasificaciones", itemClasificacionesRoutes);
  app.use("/api/importaciones", importacionesRoutes);
  app.use("/api/integraciones/siesa", integracionesSiesaRoutes);
  app.use("/api/membresias", membresiasRoutes);
  app.use("/api/inventario", inventarioRoutes);
  app.use("/api/toma-fisica", tomaFisicaRoutes);
  app.use("/api/plan-produccion", planProduccionRoutes);
  app.use("/api/gestion-liquidacion", gestionLiquidacionRoutes);
  app.use("/api/gerencial", gerencialRoutes);
  app.use("/api/ventas", ventasRoutes);
  app.use("/api/despachos", despachosRoutes);
  app.use("/api/logistica", logisticaRoutes);
  app.use("/api/oportunidades", oportunidadesRoutes);
  app.use("/api/objetivos", objetivosRoutes);

  // 404 para cualquier ruta no reconocida bajo /api
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "Recurso no encontrado." });
  });

  // Manejador de errores global: cualquier error no capturado en un
  // controlador (incluyendo los lanzados de forma síncrona) cae aquí en vez
  // de tumbar el proceso o dejar la petición colgada. En producción no se
  // expone el detalle interno del error al cliente.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Error no controlado:", err);
    if (res.headersSent) return;
    res.status(500).json({
      message: "Ocurrió un error inesperado en el servidor.",
      ...(isProduction ? {} : { detalle: err instanceof Error ? err.message : String(err) }),
    });
  });

  return app;
}
