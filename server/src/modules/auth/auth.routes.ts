import { Router } from "express";
import rateLimit from "express-rate-limit";
import { registerController, loginController, selectTenantController, meController } from "./auth.controller";
import { authenticateJWT } from "../../middleware/auth.middleware";
import { validarBody } from "../../middleware/validate.middleware";
import { registerSchema, loginSchema, selectTenantSchema } from "./auth.schemas";

const router = Router();

// Límite anti fuerza-bruta: 10 intentos por IP cada 15 minutos en los
// endpoints de autenticación. No cuenta los intentos exitosos, solo los
// fallidos/repetidos, para no bloquear a alguien que solo está iniciando
// sesión varias veces seguidas legítimamente.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Demasiados intentos. Intenta de nuevo en unos minutos." },
});

// Endpoint de registro: POST /api/auth/register
router.post("/register", authLimiter, validarBody(registerSchema), registerController);

// Endpoint de login: POST /api/auth/login
router.post("/login", authLimiter, validarBody(loginSchema), loginController);

// Paso 2 del login cuando el usuario tiene más de una empresa accesible:
// POST /api/auth/select-tenant
router.post("/select-tenant", authLimiter, validarBody(selectTenantSchema), selectTenantController);

// Endpoint de sesión actual: GET /api/auth/me
router.get("/me", authenticateJWT, meController);

export default router;
