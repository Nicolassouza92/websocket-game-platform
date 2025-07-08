import { Request, Response } from "express";
import Match from "../models/matchModel";

export const getMatchHistory = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const history = await Match.getHistory(5); // Pega as últimas 5 partidas
    return res.status(200).json(history);
  } catch (error) {
    console.error("Erro ao buscar histórico de partidas:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

export const getLeaderboard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const leaderboard = await Match.getLeaderboard(5); // Pega o top 5
    return res.status(200).json(leaderboard);
  } catch (error) {
    console.error("Erro ao buscar ranking de vencedores:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};
