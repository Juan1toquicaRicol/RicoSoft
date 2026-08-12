import { Router } from "express";
import { registerController, loginController, meController } from "./auth.controller";
import { authenticateJWT } from "../../middleware/auth.middleware";

const router = Router();

// Endpoint de registro: POST /api/auth/register
router.post("/register", registerController);

// Endpoint de login: POST /api/auth/login
router.post("/login", loginController);

// Endpoint de sesión actual: GET /api/auth/me
router.get("/me", authenticateJWT, meController);

export default router;
