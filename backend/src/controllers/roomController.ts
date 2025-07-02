import { Request, Response } from "express";
// Importaremos o gameService na próxima etapa
// import * as gameService from "../services/gameService"; 

export const createRoom = (req: Request, res: Response): Response => {
  // O middleware `protect` já garante que `req.user` existe.
  const { userId, username } = req.user!;

  try {
    // Na próxima etapa, chamaremos a função do gameService aqui
    // const room = gameService.createRoom(userId, username);
    console.log(`Usuário ${username} (ID: ${userId}) está criando uma sala.`);
    // Por enquanto, retornamos uma resposta placeholder
    return res.status(201).json({ message: "Lógica de criação de sala a ser implementada." });
  } catch (error: any) {
    console.error("Erro ao criar sala:", error);
    return res.status(400).json({ message: error.message });
  }
};

export const getAllRooms = (req: Request, res: Response): Response => {
  try {
    // Na próxima etapa, chamaremos a função do gameService aqui
    // const rooms = gameService.getAvailableRooms();
    // Por enquanto, retornamos uma resposta placeholder
    return res.status(200).json([]);
  } catch (error) {
    console.error("Erro ao buscar salas:", error);
    return res.status(500).json({ message: "Erro ao buscar salas." });
  }
};