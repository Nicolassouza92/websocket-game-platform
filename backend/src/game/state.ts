import { WebSocket } from "ws";

export type PlayerId = number;
export type Cell = PlayerId | null;
export type Board = Cell[][];

export interface Player {
  id: PlayerId;
  username: string;
}

export interface PlayerState extends Player {
  ws: WebSocket | null;
  inactiveTurns: number;
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
  playerOrderHistory: PlayerId[];
  currentPlayerIndex: number;
  board: Board;
  status: "waiting" | "readyCheck" | "playing" | "finished";
  winner?: PlayerId | null;
  turnEndsAt?: number;
  readyVotes: PlayerId[];
  rematchVotes: PlayerId[];
  rematchVoteEndsAt?: number;
}

export interface GameStateForClient {
  roomCode: string;
  hostId: PlayerId;
  hostName: string; // Adicionado para exibir o nome do criador
  players: PlayerInfoForClient[];
  board: Board;
  playerOrder: PlayerId[];
  playerOrderHistory: PlayerId[];
  currentPlayerIndex: number;
  status: "waiting" | "readyCheck" | "playing" | "finished";
  winner?: PlayerId | null;
  turnEndsAt?: number;
  readyVotes: PlayerId[];
  rematchVotes: PlayerId[];
  rematchVoteEndsAt?: number;
}
