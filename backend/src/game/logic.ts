import { GameState, Board, PlayerId, Player } from "./state";

const ROWS = 9;
const COLS = 10;

/**
 * Processa a jogada de um jogador.
 */
export function makeMove(
  currentState: GameState,
  playerId: PlayerId,
  column: number
): GameState {
  if (currentState.status !== "playing") {
    throw new Error("O jogo não está em andamento.");
  }

  const currentPlayer = currentState.players[currentState.currentPlayerIndex];
  if (currentPlayer.id !== playerId) {
    throw new Error("Não é o seu turno.");
  }

  if (column < 0 || column >= COLS) {
    throw new Error("Coluna inválida.");
  }

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

  const newBoard = currentState.board.map((row) => [...row]);
  newBoard[rowPlaced][column] = playerId;

  const winner = checkWin(newBoard, playerId) ? playerId : null;
  const nextPlayerIndex =
    (currentState.currentPlayerIndex + 1) % currentState.players.length;

  return {
    ...currentState,
    board: newBoard,
    currentPlayerIndex: nextPlayerIndex,
    status: winner ? "finished" : "playing",
    winner: winner ?? undefined,
  };
}

/**
 * Verifica se um jogador venceu.
 */
export function checkWin(board: Board, playerId: PlayerId): boolean {
  const ROWS = 9;
  const COLS = 10;

  // Horizontal (precisa de 3 em linha)
  for (let r = 0; r < ROWS; r++) {
    // O loop vai até a antepenúltima coluna
    for (let c = 0; c <= COLS - 3; c++) { 
      if (
        board[r][c] === playerId &&
        board[r][c + 1] === playerId &&
        board[r][c + 2] === playerId
      ) {
        return true;
      }
    }
  }

  // Vertical
  for (let r = 0; r <= ROWS - 3; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        board[r][c] === playerId &&
        board[r + 1][c] === playerId &&
        board[r + 2][c] === playerId
      ) {
        return true;
      }
    }
  }

  // Diagonal (descendente)
  for (let r = 0; r <= ROWS - 3; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      if (
        board[r][c] === playerId &&
        board[r + 1][c + 1] === playerId &&
        board[r + 2][c + 2] === playerId
      ) {
        return true;
      }
    }
  }

  // Diagonal (ascendente)
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      // Começamos da linha 2 (índice 2) para a verificação ascendente
      if (r >= 2 &&
        board[r][c] === playerId &&
        board[r - 1][c + 1] === playerId &&
        board[r - 2][c + 2] === playerId
      ) {
        return true;
      }
    }
  }

  return false;
}