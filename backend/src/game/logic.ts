import { GameState, Board, PlayerId, Player, PlayerState } from "./state"; // Atualize as importações

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
  
  // --- LÓGICA DE TURNO CORRIGIDA ---
  // 1. Pega o ID do jogador atual usando o playerOrder e o currentPlayerIndex
  const currentPlayerId = currentState.playerOrder[currentState.currentPlayerIndex];
  // 2. Compara com o ID de quem está tentando jogar
  if (currentPlayerId !== playerId) {
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
  
  // MODIFICAÇÃO: Verifica o empate
  const isDraw = !winner && newBoard[0].every(cell => cell !== null);
  
  const nextPlayerIndex =
    (currentState.currentPlayerIndex + 1) % currentState.playerOrder.length;

  return {
    ...currentState,
    board: newBoard,
    currentPlayerIndex: nextPlayerIndex,
    // MODIFICAÇÃO: Atualiza o status se houver vencedor ou empate
    status: winner || isDraw ? "finished" : "playing",
    // MODIFICAÇÃO: Define o vencedor ou `null` para empate
    winner: winner ?? (isDraw ? null : undefined),
  };
}

/**
 * Verifica se um jogador venceu.
 */
export function checkWin(board: Board, playerId: PlayerId): boolean {
  // A lógica de verificação de vitória (horizontal, vertical, diagonais)
  // que você já tem permanece exatamente a mesma aqui.
  
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      if (
        board[r][c] === playerId &&
        board[r][c + 1] === playerId &&
        board[r][c + 2] === playerId
      ) return true;
    }
  }

  // Vertical
  for (let r = 0; r <= ROWS - 3; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        board[r][c] === playerId &&
        board[r + 1][c] === playerId &&
        board[r + 2][c] === playerId
      ) return true;
    }
  }

  // Diagonal (descendente)
  for (let r = 0; r <= ROWS - 3; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      if (
        board[r][c] === playerId &&
        board[r + 1][c + 1] === playerId &&
        board[r + 2][c + 2] === playerId
      ) return true;
    }
  }

  // Diagonal (ascendente)
  for (let r = 2; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 3; c++) {
      if (
        board[r][c] === playerId &&
        board[r - 1][c + 1] === playerId &&
        board[r - 2][c + 2] === playerId
      ) return true;
    }
  }

  return false;
}