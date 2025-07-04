/**
 * Define o tipo de ID que um jogador pode ter.
 * Usamos 'number' pois virá do banco de dados (users.id).
 */
export type PlayerId = number;

/**
 * Define o que pode haver em uma célula do tabuleiro: o ID de um jogador ou nada (null).
 */
export type Cell = PlayerId | null;

/**
 * Define a estrutura do tabuleiro como uma matriz 2D.
 */
export type Board = Cell[][];

/**
 * Define a estrutura de um objeto Jogador, com os dados que virão da autenticação.
 */
export interface Player {
  id: PlayerId;
  username: string;
}

/**
 * A estrutura completa que representa o estado de uma sala de jogo em qualquer momento.
 */
export interface GameState {
  roomCode: string; // O código de 6 letras para entrar na sala.
  host: Player; // O dono da sala.
  players: Player[]; // A lista de jogadores que estão ativamente conectados na sala.
  board: Board; // O estado atual do tabuleiro.
  currentPlayerIndex: number; // O índice (0, 1, 2) no array 'players' para saber de quem é a vez.
  status: "waiting" | "playing" | "finished"; // O status atual da partida.
  winner?: PlayerId; // O ID do vencedor, se houver.
}
