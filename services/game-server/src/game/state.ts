/**
 * Define os tipos de peças no tabuleiro.
 * `null` representa uma casa vazia.
 * Os números representam o ID do jogador que possui a peça.
 */
export type PlayerId = number | string;
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
 * Representa um jogador com todos os seus dados.
 */
export interface Player {
  id: PlayerId;
  username: string;
  color: number; // 1: Vermelho, 2: Amarelo, 3: Azul
}

/**
 * A estrutura completa e ÚNICA do estado de um jogo.
 * A propriedade 'players' é a única fonte da verdade sobre os jogadores.
 */
export interface GameState {
  roomId: string; // ID único da sala de jogo.
  board: Board;
  players: Player[]; // <- 'players' é um array de OBJETOS Player.
  currentPlayerIndex: number; // O índice do jogador atual no array `players`.
  status: GameStatus;
  winner: PlayerId | null; // `null` se não houver vencedor ainda.
}
