import { WebSocket } from "ws";
import {
  GameState,
  Player,
  PlayerId,
  PlayerState,
  GameStateForClient,
} from "../game/state";
import { makeMove } from "../game/logic";
import Match from "../models/matchModel"; // Importar o novo model

const rooms = new Map<string, GameState>();
const clientToRoomMap = new Map<
  WebSocket,
  { roomCode: string; playerId: PlayerId }
>();
const reconnectionTimers = new Map<PlayerId, NodeJS.Timeout>();
const RECONNECTION_TIMEOUT_MS = 60000; // 60 segundos

// --- NOVAS CONSTANTES E MAPA PARA O CRONÔMETRO ---
const turnTimers = new Map<string, NodeJS.Timeout>();
const TURN_DURATION_MS = 30000;
const MAX_INACTIVE_TURNS = 2;
const REMATCH_VOTE_DURATION_MS = 30000;
const rematchTimers = new Map<string, NodeJS.Timeout>();

// --- Funções Principais Exportadas ---
export function createRoom(creator: Player): GameState {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const initialState: GameState = {
    roomCode,
    hostId: creator.id,
    players: new Map<PlayerId, PlayerState>(),
    playerOrder: [],
    playerOrderHistory: [],
    board: Array(9)
      .fill(null)
      .map(() => Array(10).fill(null)),
    currentPlayerIndex: 0,
    status: "waiting",
    winner: undefined,
    // NOVO: Inicializa o array de votos de pronto
    readyVotes: [],
    rematchVotes: [],
  };
  rooms.set(roomCode, initialState);
  console.log(
    `[GameService] Sala ${roomCode} criada por ${creator.username}. O host precisa se conectar.`
  );
  return initialState;
}

export function getAvailableRooms(): GameStateForClient[] {
  return Array.from(rooms.values())
    .filter((room) => room.status === "waiting" && room.players.size < 3)
    .map(getGameStateForClient);
}

export function handlePlayerConnection(
  ws: WebSocket,
  roomCode: string,
  player: Player
) {
  const room = rooms.get(roomCode);
  if (!room) {
    sendError(ws, "Sala não encontrada.", true);
    return;
  }

  const existingPlayerState = room.players.get(player.id);

  if (existingPlayerState && existingPlayerState.ws === null) {
    console.log(
      `[GameService] Jogador ${player.username} RECONECTOU-SE à sala ${roomCode}.`
    );
    const timer = reconnectionTimers.get(player.id);
    if (timer) {
      clearTimeout(timer);
      reconnectionTimers.delete(player.id);
    }
    existingPlayerState.ws = ws;
    clientToRoomMap.set(ws, { roomCode, playerId: player.id });
    broadcastRoomState(room);
    attachMessageHandlers(ws, roomCode, player);
    return;
  }

  if (room.players.has(player.id)) {
    sendError(ws, "Você já está conectado a esta sala em outra aba.", true);
    return;
  }
  if (room.status !== "waiting" || room.players.size >= 3) {
    sendError(ws, "A sala não está aceitando novos jogadores.", true);
    return;
  }

  const newPlayerState: PlayerState = { ...player, ws, inactiveTurns: 0 };
  room.players.set(player.id, newPlayerState);
  if (room.playerOrder.indexOf(player.id) === -1) {
    room.playerOrder.push(player.id);
  }
  clientToRoomMap.set(ws, { roomCode, playerId: player.id });
  console.log(
    `[GameService] Jogador ${player.username} entrou na sala ${roomCode}. (${room.players.size}/3)`
  );

  // ATUALIZADO: Lógica para quando a sala fica cheia
  if (room.players.size === 3) {
    console.log(
      `[GameService] Sala ${roomCode} cheia. Iniciando fase de prontidão.`
    );
    // Em vez de iniciar o jogo, entra no modo de 'readyCheck'
    room.status = "readyCheck";
    room.readyVotes = []; // Garante que a lista de votos esteja limpa
  }

  broadcastRoomState(room);
  attachMessageHandlers(ws, roomCode, player);
}

// ... (as funções de timer, etc, permanecem as mesmas por enquanto)
function clearTurnTimer(roomCode: string) {
  const existingTimer = turnTimers.get(roomCode);
  if (existingTimer) {
    clearTimeout(existingTimer);
    turnTimers.delete(roomCode);
  }
}

function clearRematchTimer(roomCode: string) {
  const existingTimer = rematchTimers.get(roomCode);
  if (existingTimer) {
    clearTimeout(existingTimer);
    rematchTimers.delete(roomCode);
  }
}

function startTurnTimer(room: GameState) {
  clearTurnTimer(room.roomCode);
  if (room.status !== "playing") return;

  room.turnEndsAt = Date.now() + TURN_DURATION_MS;

  const timer = setTimeout(() => {
    const roomNow = rooms.get(room.roomCode);
    if (!roomNow || roomNow.status !== "playing") return;

    const inactivePlayerId = roomNow.playerOrder[roomNow.currentPlayerIndex];
    const inactivePlayerState = roomNow.players.get(inactivePlayerId);

    if (inactivePlayerState) {
      if (inactivePlayerState.ws !== null) {
        inactivePlayerState.inactiveTurns++;
        console.log(
          `[GameService] Turno esgotado para ${inactivePlayerState.username}. Strikes: ${inactivePlayerState.inactiveTurns}/${MAX_INACTIVE_TURNS}`
        );
        if (inactivePlayerState.inactiveTurns >= MAX_INACTIVE_TURNS) {
          broadcastToRoom(room.roomCode, {
            type: "INFO_MESSAGE",
            payload: {
              message: `${inactivePlayerState.username} foi removido por inatividade.`,
            },
          });
          handlePlayerLeave(
            inactivePlayerState.ws,
            room.roomCode,
            inactivePlayerState.id
          );
          return;
        }
      } else {
        console.log(
          `[GameService] Pulando turno do jogador desconectado ${inactivePlayerState.username} sem penalidade.`
        );
      }
    }

    roomNow.currentPlayerIndex =
      (roomNow.currentPlayerIndex + 1) % roomNow.playerOrder.length;
    startTurnTimer(roomNow);
    broadcastRoomState(roomNow);
  }, TURN_DURATION_MS);

  turnTimers.set(room.roomCode, timer);
}

function attachMessageHandlers(
  ws: WebSocket,
  roomCode: string,
  player: Player
) {
  ws.on("message", async (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);
      switch (parsedMessage.type) {
        // NOVO: Manipulador para o voto de pronto
        case "VOTE_READY":
          handleReadyVote(ws, roomCode, player.id);
          break;
        case "MAKE_MOVE":
          await handleMakeMove(
            ws,
            roomCode,
            player.id,
            parsedMessage.payload.column
          );
          break;
        case "LEAVE_ROOM":
          handlePlayerLeave(ws, roomCode, player.id);
          break;
        case "VOTE_REMATCH":
          handleRematchVote(ws, roomCode, player.id);
          break;
        case "SEND_CHAT_MESSAGE":
          handleChatMessage(roomCode, player, parsedMessage.payload.text);
          break;
        default:
          console.warn(
            `[GameService] Tipo de mensagem desconhecido: ${parsedMessage.type}`
          );
      }
    } catch (error) {
      console.error("[GameService] Erro ao processar mensagem:", error);
    }
  });
  ws.on("close", () => {
    handlePlayerDisconnection(ws);
  });
}

function handleChatMessage(roomCode: string, sender: Player, text: string) {
  if (!text || text.length > 200) return;
  const messagePayload = {
    type: "NEW_MESSAGE",
    payload: { username: sender.username, text: text },
  };
  broadcastToRoom(roomCode, messagePayload);
}

function handlePlayerLeave(
  ws: WebSocket | null,
  roomCode: string,
  playerId: PlayerId
) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const leavingPlayer = room.players.get(playerId);
  if (!leavingPlayer) return;

  console.log(
    `[GameService] Jogador ${leavingPlayer.username} está saindo/sendo removido da sala ${roomCode}.`
  );

  if (playerId === room.hostId) {
    console.log(
      `[GameService] Host (${leavingPlayer.username}) saiu. Fechando a sala ${roomCode}.`
    );
    broadcastToRoom(roomCode, {
      type: "ROOM_CLOSED",
      payload: {
        message: `O host (${leavingPlayer.username}) encerrou a sala.`,
      },
    });
    room.players.forEach((p) => {
      if (p.id !== playerId && p.ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.close();
      }
    });
    clearTurnTimer(roomCode);
    clearRematchTimer(roomCode);
    rooms.delete(roomCode);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    return;
  }

  room.players.delete(playerId);
  room.playerOrder = room.playerOrder.filter((id) => id !== playerId);
  if (ws) {
    clientToRoomMap.delete(ws);
  }

  if (room.players.size === 0) {
    console.log(`[GameService] Sala ${roomCode} ficou vazia. Removendo.`);
    clearTurnTimer(roomCode);
    clearRematchTimer(roomCode);
    rooms.delete(roomCode);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    return;
  }

  // ATUALIZADO: Se um jogador sair durante a verificação de prontidão, a sala volta a esperar.
  if (
    room.status === "readyCheck" ||
    (room.status === "playing" && room.players.size < 2)
  ) {
    console.log(
      `[GameService] Jogador saiu, número de jogadores insuficiente. Sala ${roomCode} voltando para o estado de espera.`
    );
    resetRoomToWaiting(room);
  } else if (room.status === "playing") {
    console.log(
      `[GameService] Restam 2 jogadores na sala ${roomCode}. O jogo continua.`
    );
    room.currentPlayerIndex %= room.playerOrder.length;
    broadcastToRoom(roomCode, {
      type: "INFO_MESSAGE",
      payload: {
        message: `${leavingPlayer.username} saiu. O jogo continua entre os 2 restantes.`,
      },
    });
    startTurnTimer(room);
    broadcastRoomState(room);
  } else {
    broadcastRoomState(room);
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}

function handlePlayerDisconnection(ws: WebSocket) {
  const connectionInfo = clientToRoomMap.get(ws);
  if (!connectionInfo) return;
  const { roomCode, playerId } = connectionInfo;
  const room = rooms.get(roomCode);
  if (!room) return;
  const disconnectedPlayer = room.players.get(playerId);
  if (!disconnectedPlayer || !room.players.has(playerId)) return;

  console.log(
    `[GameService] Jogador ${disconnectedPlayer.username} desconectou. Iniciando timer de remoção.`
  );
  disconnectedPlayer.ws = null;
  clientToRoomMap.delete(ws);
  broadcastRoomState(room);

  const timeout = setTimeout(() => {
    const currentRoom = rooms.get(roomCode);
    if (!currentRoom) return;
    const playerToRemove = currentRoom.players.get(playerId);
    if (playerToRemove && playerToRemove.ws === null) {
      console.log(
        `[GameService] Tempo de reconexão para ${playerToRemove.username} esgotou. Removendo-o.`
      );
      broadcastToRoom(roomCode, {
        type: "INFO_MESSAGE",
        payload: {
          message: `${playerToRemove.username} não se reconectou a tempo e foi removido.`,
        },
      });
      handlePlayerLeave(null, roomCode, playerId);
    }
  }, RECONNECTION_TIMEOUT_MS);
  reconnectionTimers.set(playerId, timeout);
}

// NOVO: Função para iniciar o jogo de fato
function startGame(room: GameState) {
  console.log(
    `[GameService] Todos os jogadores estão prontos. Iniciando jogo na sala ${room.roomCode}.`
  );
  room.status = "playing";
  room.currentPlayerIndex = 0;
  // Tira a "foto" dos jogadores no início da partida
  room.playerOrderHistory = [...room.playerOrder];
  startTurnTimer(room);
  broadcastRoomState(room);
}

// NOVO: Função para lidar com o voto de "pronto"
function handleReadyVote(ws: WebSocket, roomCode: string, playerId: PlayerId) {
  const room = rooms.get(roomCode);
  if (
    !room ||
    room.status !== "readyCheck" ||
    room.readyVotes.includes(playerId)
  ) {
    return;
  }

  console.log(
    `[GameService] Jogador com ID ${playerId} votou como pronto na sala ${roomCode}.`
  );
  room.readyVotes.push(playerId);

  // Verifica se todos os jogadores na sala votaram
  if (room.readyVotes.length === room.players.size) {
    // Se sim, inicia o jogo
    startGame(room);
  } else {
    // Se não, apenas atualiza o estado para os outros clientes
    broadcastRoomState(room);
  }
}

async function handleMakeMove(
  ws: WebSocket,
  roomCode: string,
  playerId: PlayerId,
  column: number
) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const playerState = room.players.get(playerId);
  if (!playerState) return;

  try {
    const newState = makeMove(room, playerId, column);
    playerState.inactiveTurns = 0;
    rooms.set(roomCode, newState);

    if (newState.status === "finished") {
      clearTurnTimer(roomCode);
      delete newState.turnEndsAt;
      try {
        await Match.record(
          newState.winner ?? null,
          newState.playerOrderHistory
        );
      } catch (dbError) {
        console.error(
          `[GameService] Falha ao gravar a partida ${roomCode} no banco de dados:`,
          dbError
        );
      }
      startRematchVotePhase(newState);
    } else {
      startTurnTimer(newState);
    }
    broadcastRoomState(newState);
  } catch (error: any) {
    console.error(`[GameService] Jogada inválida: ${error.message}`);
    sendError(ws, error.message);
  }
}

function startRematchVotePhase(room: GameState) {
  console.log(
    `[GameService] Jogo finalizado na sala ${room.roomCode}. Iniciando votação para jogar novamente.`
  );
  room.rematchVoteEndsAt = Date.now() + REMATCH_VOTE_DURATION_MS;
  room.rematchVotes = [];

  const timer = setTimeout(() => {
    const currentRoom = rooms.get(room.roomCode);
    if (currentRoom) {
      processRematchVotes(currentRoom);
    }
  }, REMATCH_VOTE_DURATION_MS);

  rematchTimers.set(room.roomCode, timer);
}

function processRematchVotes(room: GameState) {
  const roomCode = room.roomCode;
  console.log(`[GameService] Votação encerrada na sala ${roomCode}.`);
  clearRematchTimer(roomCode);

  const playersWhoVoted = new Set(room.rematchVotes);
  const playersToRemove: PlayerState[] = [];

  room.players.forEach((player) => {
    if (!playersWhoVoted.has(player.id)) {
      playersToRemove.push(player);
    }
  });

  if (playersToRemove.length > 0) {
    playersToRemove.forEach((player) => {
      broadcastToRoom(roomCode, {
        type: "INFO_MESSAGE",
        payload: {
          message: `${player.username} não votou e foi removido da sala.`,
        },
      });
      handlePlayerLeave(player.ws, roomCode, player.id);
    });
  }

  const finalRoomState = rooms.get(roomCode);
  if (!finalRoomState) {
    console.log(
      `[GameService] Sala ${roomCode} não existe mais após a votação.`
    );
    return;
  }

  const remainingPlayersCount = finalRoomState.players.size;
  const allRemainingVoted = Array.from(finalRoomState.players.keys()).every(
    (id) => playersWhoVoted.has(id)
  );

  if (allRemainingVoted) {
    if (remainingPlayersCount === 3) {
      resetGameForRematch(finalRoomState);
    } else if (remainingPlayersCount >= 1) {
      resetRoomToWaiting(finalRoomState);
    }
  }
}

function resetRoomToWaiting(room: GameState) {
  console.log(
    `[GameService] Sala ${room.roomCode} voltando para o estado de espera com ${room.players.size} jogador(es).`
  );
  room.status = "waiting";
  room.board = Array(9)
    .fill(null)
    .map(() => Array(10).fill(null));
  room.currentPlayerIndex = 0;
  delete room.winner;
  // ATUALIZADO: Limpa os votos de pronto e de revanche
  room.readyVotes = [];
  room.rematchVotes = [];
  delete room.rematchVoteEndsAt;
  room.playerOrderHistory = [];
  room.players.forEach((p) => (p.inactiveTurns = 0));

  if (room.players.size > 0 && !room.players.has(room.hostId)) {
    room.hostId = room.playerOrder[0];
  }

  clearTurnTimer(room.roomCode);
  broadcastRoomState(room);
}

function resetGameForRematch(room: GameState) {
  console.log(
    `[GameService] Todos concordaram! Reiniciando jogo na sala ${room.roomCode}.`
  );
  room.status = "playing";
  room.board = Array(9)
    .fill(null)
    .map(() => Array(10).fill(null));
  room.currentPlayerIndex = 0;
  room.winner = undefined;
  room.rematchVotes = [];
  delete room.rematchVoteEndsAt;
  room.playerOrderHistory = [...room.playerOrder];
  room.players.forEach((p) => (p.inactiveTurns = 0));

  startTurnTimer(room);
  broadcastRoomState(room);
}

function handleRematchVote(
  ws: WebSocket,
  roomCode: string,
  playerId: PlayerId
) {
  const room = rooms.get(roomCode);
  if (
    !room ||
    room.status !== "finished" ||
    room.rematchVotes.includes(playerId)
  ) {
    return;
  }

  console.log(
    `[GameService] Jogador com ID ${playerId} votou para jogar novamente na sala ${roomCode}.`
  );
  room.rematchVotes.push(playerId);
  broadcastRoomState(room);

  if (room.rematchVotes.length === room.players.size) {
    clearRematchTimer(roomCode);
    processRematchVotes(room);
  }
}

function broadcastToRoom(roomCode: string, message: object) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const messageString = JSON.stringify(message);
  room.players.forEach((player) => {
    if (player.ws && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(messageString);
    }
  });
}

function broadcastRoomState(room: GameState) {
  broadcastToRoom(room.roomCode, {
    type: "GAME_STATE_UPDATE",
    payload: { gameState: getGameStateForClient(room) },
  });
}

function sendError(
  ws: WebSocket,
  message: string,
  shouldClose: boolean = false
) {
  ws.send(JSON.stringify({ type: "ERROR", payload: { message } }));
  if (shouldClose) {
    ws.close();
  }
}

function getGameStateForClient(room: GameState): GameStateForClient {
  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    players: Array.from(room.players.values()).map((p) => ({
      id: p.id,
      username: p.username,
      isOnline: p.ws !== null,
    })),
    board: room.board,
    playerOrder: room.playerOrder,
    playerOrderHistory: room.playerOrderHistory,
    currentPlayerIndex: room.currentPlayerIndex,
    status: room.status,
    winner: room.winner,
    turnEndsAt: room.turnEndsAt,
    // ATUALIZADO: Inclui os votos de pronto no estado enviado ao cliente
    readyVotes: room.readyVotes,
    rematchVotes: room.rematchVotes,
    rematchVoteEndsAt: room.rematchVoteEndsAt,
  };
}