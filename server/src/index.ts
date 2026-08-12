import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.routes";
import usuariosRoutes from "./modules/usuarios/usuarios.routes"; // <-- 1. Importar módulo de usuarios
import rolesRoutes from "./modules/roles/roles.routes";
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

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET no está definido. Configúralo en server/.env antes de iniciar el servidor.",
  );
}

const app = express();
const PORT = process.env.PORT || 4000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use("/api/auth", authRoutes);
app.use("/api/usuarios", usuariosRoutes); // <-- 2. Registrar la ruta base /api/usuarios
app.use("/api/roles", rolesRoutes);
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

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});
