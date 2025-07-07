// backend/src/game/state.ts
import { WebSocket } from 'ws';

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

export interface PlayerInfoForClient extends Player {
    isOnline: boolean;
}

export interface GameState {
  roomCode: string;
  hostId: PlayerId;
  players: Map<PlayerId, PlayerState>; // Usaremos um Map para acesso fácil
  playerOrder: PlayerId[];
  currentPlayerIndex: number;
  board: Board;
  status: "waiting" | "playing" | "finished";
  winner?: PlayerId | null;
  turnEndsAt?: number;
}

export interface GameStateForClient {
    roomCode: string;
    hostId: PlayerId;
    players: PlayerInfoForClient[];
    board: Board;
    playerOrder: PlayerId[];
    currentPlayerIndex: number;
    status: "waiting" | "playing" | "finished";
    winner?: PlayerId | null;
    turnEndsAt?: number;
}