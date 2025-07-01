/**
 * Define os tipos de peças no tabuleiro.
 * `null` representa uma casa vazia.
 * Os números representam o ID do jogador que possui a peça.
 */
export type PlayerId = number;
export type Cell = PlayerId | null;

/**
 * Representa o tabuleiro do jogo como uma matriz 2D (array de arrays).
 * O padrão é 6 linhas e 7 colunas.
 */
export type Board = Cell[][];

/**
 * Define os possíveis status do jogo.
 */
export type GameStatus = "waiting" | "playing" | "finished";

/**
 * A interface principal que descreve o estado completo de uma partida de Quatro em Linha.
 */
export interface GameState {
  roomId: string; // ID único da sala de jogo.
  board: Board;
  players: PlayerId[];
  currentPlayerIndex: number; // O índice do jogador atual no array `players`.
  status: GameStatus;
  winner: PlayerId | null; // `null` se não houver vencedor ainda.
}

export interface Player {
  id: PlayerId;
  username: string;
  color: number; // 1: Vermelho, 2: Amarelo, 3: Azul
}
