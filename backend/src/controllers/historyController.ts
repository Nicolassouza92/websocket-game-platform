// backend/src/controllers/historyController.ts
import { Request, Response } from "express";
import Match from "../models/matchModel";

// --- ROTAS PÚBLICAS (para a landing page) ---

export const getPublicMatchHistory = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const history = await Match.getPublicHistory(5); // Pega as últimas 5 partidas públicas
    return res.status(200).json(history);
  } catch (error) {
    console.error("Erro ao buscar histórico de partidas público:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

export const getPublicLeaderboard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    // Chama a função existente sem userId para obter apenas o ranking público
    const leaderboardData = await Match.getLeaderboard(5);
    return res.status(200).json(leaderboardData.leaderboard); // Retorna apenas o array do leaderboard
  } catch (error) {
    console.error("Erro ao buscar ranking público de vencedores:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// --- ROTAS PRIVADAS (para o dashboard do usuário logado) ---

export const getPersonalMatchHistory = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user!.userId;
    const history = await Match.getPersonalHistory(userId, 6);
    return res.status(200).json(history);
  } catch (error) {
    console.error("Erro ao buscar histórico de partidas pessoal:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

export const getPersonalLeaderboard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user!.userId;
    const leaderboardData = await Match.getLeaderboard(5, userId);
    return res.status(200).json(leaderboardData);
  } catch (error) {
    console.error("Erro ao buscar ranking pessoal de vencedores:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};
