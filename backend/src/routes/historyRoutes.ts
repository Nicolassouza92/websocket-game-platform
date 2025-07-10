// backend/src/routes/historyRoutes.ts
import express from "express";
import * as historyController from "../controllers/historyController";
import { protect } from "../middleware/authHttpMiddleware";

const router = express.Router();

// === ROTAS PÚBLICAS (usadas pela landing page) ===
// NÃO usam o middleware `protect`
router.get("/matches-public", historyController.getPublicMatchHistory);
router.get("/leaderboard-public", historyController.getPublicLeaderboard);

// === ROTAS PRIVADAS (usadas pelo app logado) ===
// USAM o middleware `protect` para garantir que o usuário está logado
router.get("/personal", protect, historyController.getPersonalMatchHistory);
router.get(
  "/leaderboard-personal",
  protect,
  historyController.getPersonalLeaderboard
);

export default router;
