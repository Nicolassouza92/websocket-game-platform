import { Request, Response } from "express";
import * as gameService from "../services/gameService";
import { Player } from "../game/state";

export const createRoom = (req: Request, res: Response): Response => {
  // O middleware `protect` já garante que `req.user` existe.
  const { userId, username } = req.user!;

  try {
    const creator: Player = { id: userId, username };
    const newRoomState = gameService.createRoom(creator);

    console.log(
      `Usuário ${username} (ID: ${userId}) criou a sala ${newRoomState.roomCode}.`
    );

    // Retorna o código da sala para o cliente.
    // O frontend usará esse código para se conectar via WebSocket.
    return res.status(201).json({
      message: "Sala criada com sucesso!",
      roomCode: newRoomState.roomCode,
    });
  } catch (error: any) {
    console.error("Erro ao criar sala:", error);
    return res.status(500).json({ message: "Erro interno ao criar a sala." });
  }
};

export const getAllRooms = (req: Request, res: Response): Response => {
  try {
    const availableRooms = gameService.getAvailableRooms();
    return res.status(200).json(availableRooms);
  } catch (error) {
    console.error("Erro ao buscar salas:", error);
    return res.status(500).json({ message: "Erro ao buscar salas." });
  }
};
