// services/game-server/src/game/logic.ts

import { GameState, Board, PlayerId, Cell } from "./state";

const ROWS = 6;
const COLS = 10;

/**
 * Cria e retorna o estado inicial de um novo jogo.
 * @param playerIds - Um array com os IDs dos jogadores que participarão.
 */
export function createInitialState(
  roomId: string,
  playerIds: PlayerId[]
): GameState {
  if (playerIds.length < 3) {
    throw new Error("O jogo precisa de pelo menos 3 jogadores para começar.");
  }
  return {
    // Cria um tabuleiro 6x7 preenchido com `null` (casas vazias).
    roomId,
    board: Array(ROWS)
      .fill(null)
      .map(() => Array(COLS).fill(null)),
    players: playerIds,
    currentPlayerIndex: 0, // O primeiro jogador do array começa.
    status: "playing",
    winner: null,
  };
}

/**
 * Processa a jogada de um jogador em uma determinada coluna.
 * @param currentState - O estado atual do jogo.
 * @param playerId - O ID do jogador que está fazendo a jogada.
 * @param column - A coluna onde a peça será jogada (0 a 6).
 * @returns O novo estado do jogo após a jogada.
 */
export function makeMove(
  currentState: GameState,
  playerId: PlayerId,
  column: number
): GameState {
  // Validações de regras
  if (currentState.status !== "playing") {
    throw new Error("O jogo não está em andamento.");
  }
  if (currentState.players[currentState.currentPlayerIndex] !== playerId) {
    throw new Error("Não é o seu turno.");
  }
  if (column < 0 || column >= COLS) {
    throw new Error("Coluna inválida.");
  }

  // Encontra a primeira linha vazia na coluna, de baixo para cima.
  let rowPlaced = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (currentState.board[r][column] === null) {
      rowPlaced = r;
      break;
    }
  }

  if (rowPlaced === -1) {
    throw new Error("Esta coluna já está cheia.");
  }

  // Cria uma cópia profunda do tabuleiro para não modificar o estado original.
  const newBoard = currentState.board.map((row) => [...row]);
  newBoard[rowPlaced][column] = playerId;

  // Verifica se a jogada resultou em vitória
  const winner = checkWin(newBoard, playerId) ? playerId : null;

  // Calcula o próximo jogador
  const nextPlayerIndex =
    (currentState.currentPlayerIndex + 1) % currentState.players.length;

  return {
    ...currentState, // Copia as propriedades do estado antigo
    board: newBoard, // Usa o novo tabuleiro
    currentPlayerIndex: nextPlayerIndex,
    winner: winner,
    status: winner ? "finished" : "playing",
  };
}

/**
 * Verifica se um jogador venceu o jogo a partir da última jogada.
 * @param board - O tabuleiro do jogo.
 * @param playerId - O ID do jogador a ser verificado.
 */
export function checkWin(board: Board, playerId: PlayerId): boolean {
  // Lógica para verificar 4 em linha na horizontal, vertical e diagonais.

  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (
        board[r][c] === playerId &&
        board[r][c + 1] === playerId &&
        board[r][c + 2] === playerId &&
        board[r][c + 3] === playerId
      ) {
        return true;
      }
    }
  }

  // Vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        board[r][c] === playerId &&
        board[r + 1][c] === playerId &&
        board[r + 2][c] === playerId &&
        board[r + 3][c] === playerId
      ) {
        return true;
      }
    }
  }

  // Diagonal (descendente)
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (
        board[r][c] === playerId &&
        board[r + 1][c + 1] === playerId &&
        board[r + 2][c + 2] === playerId &&
        board[r + 3][c + 3] === playerId
      ) {
        return true;
      }
    }
  }

  // Diagonal (ascendente)
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      if (
        board[r][c] === playerId &&
        board[r - 1][c + 1] === playerId &&
        board[r - 2][c + 2] === playerId &&
        board[r - 3][c + 3] === playerId
      ) {
        return true;
      }
    }
  }

  return false;
}
