// backend/src/game/state.ts
import { WebSocket } from "ws";

export type PlayerId = number;
export type Cell = PlayerId | null;
export type Board = Cell[][];

export interface Player {
  id: PlayerId;
  username: string;
}

export interface PlayerState extends Player {
  ws: WebSocket | null; // A conexão ativa ou null se estiver offline
  inactiveTurns: number; // NOVO: Contador de turnos inativos (strikes)
}

export interface PlayerInfoForClient {
  id: PlayerId;
  username: string;
  isOnline: boolean;
}

export interface GameState {
  roomCode: string;
  hostId: PlayerId;
  players: Map<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  playerOrderHistory: PlayerId[]; // Histórico imutável da ordem dos jogadores da partida
  currentPlayerIndex: number;
  board: Board;
  status: "waiting" | "playing" | "finished";
  winner?: PlayerId | null;
  turnEndsAt?: number;
  rematchVotes: PlayerId[];
  rematchVoteEndsAt?: number;
}

export interface GameStateForClient {
  roomCode: string;
  hostId: PlayerId;
  players: PlayerInfoForClient[];
  board: Board;
  playerOrder: PlayerId[];
  playerOrderHistory: PlayerId[]; // Envia o histórico para o cliente
  currentPlayerIndex: number;
  status: "waiting" | "playing" | "finished";
  winner?: PlayerId | null;
  turnEndsAt?: number;
  rematchVotes: PlayerId[];
  rematchVoteEndsAt?: number;
}
