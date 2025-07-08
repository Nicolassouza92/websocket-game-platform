import express from "express";
import * as historyController from "../controllers/historyController";

const router = express.Router();

// Rotas públicas para a página inicial
router.get("/matches", historyController.getMatchHistory);
router.get("/leaderboard", historyController.getLeaderboard);

export default router;
