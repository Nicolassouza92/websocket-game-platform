import express from "express";
import * as authController from "../controllers/authController"; // Criaremos este arquivo a seguir
import { protect } from "../middleware/authHttpMiddleware";

const router = express.Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);
router.get("/status", protect, authController.getAuthStatus); // Rota para verificar se o cookie é válido

export default router;