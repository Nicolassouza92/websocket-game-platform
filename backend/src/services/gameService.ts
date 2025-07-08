// backend/src/services/gameService.ts
import { WebSocket } from "ws";
import {
  GameState,
  Player,
  PlayerId,
  PlayerState,
  GameStateForClient,
} from "../game/state";
import { makeMove } from "../game/logic";

const rooms = new Map<string, GameState>();
const clientToRoomMap = new Map<
  WebSocket,
  { roomCode: string; playerId: PlayerId }
>();
const reconnectionTimers = new Map<PlayerId, NodeJS.Timeout>();
const RECONNECTION_TIMEOUT_MS = 60000; // 60 segundos

// --- NOVAS CONSTANTES E MAPA PARA O CRONÔMETRO ---
const turnTimers = new Map<string, NodeJS.Timeout>(); // Armazena os timers ativos por sala
const TURN_DURATION_MS = 30000; // 30 segundos
const MAX_INACTIVE_TURNS = 2; // NOVO: Limite de turnos inativos
const REMATCH_VOTE_DURATION_MS = 30000; // 30 segundos para votar
const rematchTimers = new Map<string, NodeJS.Timeout>();

// --- Funções Principais Exportadas ---
// ... (createRoom e getAvailableRooms permanecem iguais)
export function createRoom(creator: Player): GameState {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const initialState: GameState = {
    roomCode,
    hostId: creator.id,
    players: new Map<PlayerId, PlayerState>(),
    playerOrder: [],
    board: Array(9)
      .fill(null)
      .map(() => Array(10).fill(null)),
    currentPlayerIndex: 0,
    status: "waiting",
    winner: undefined,
    rematchVotes: [], // Inicializa a lista de votos
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
  // ... (lógica de conexão e reconexão existente)
  const room = rooms.get(roomCode);
  if (!room) {
    sendError(ws, "Sala não encontrada.", true);
    return;
  }

  const existingPlayerState = room.players.get(player.id);

  // --- LÓGICA DE RECONEXÃO ---
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

  // --- LÓGICA PARA NOVOS JOGADORES (INCLUINDO O HOST NA PRIMEIRA VEZ) ---
  if (room.players.has(player.id)) {
    sendError(ws, "Você já está conectado a esta sala em outra aba.", true);
    return;
  }
  if (room.status !== "waiting" || room.players.size >= 3) {
    sendError(ws, "A sala não está aceitando novos jogadores.", true);
    return;
  }

  // MODIFICADO: Inclui a inicialização de inactiveTurns
  const newPlayerState: PlayerState = { ...player, ws, inactiveTurns: 0 };
  room.players.set(player.id, newPlayerState);
  if (room.playerOrder.indexOf(player.id) === -1) {
    room.playerOrder.push(player.id);
  }
  clientToRoomMap.set(ws, { roomCode, playerId: player.id });
  console.log(
    `[GameService] Jogador ${player.username} entrou na sala ${roomCode}. (${room.players.size}/3)`
  );

  if (room.players.size === 3) {
    console.log(`[GameService] Sala ${roomCode} cheia. Iniciando jogo.`);
    room.status = "playing";
    room.currentPlayerIndex = 0;
    // INICIA O CRONÔMETRO PARA O PRIMEIRO JOGADOR
    startTurnTimer(room);
  }

  broadcastRoomState(room);
  attachMessageHandlers(ws, roomCode, player);
}

// --- NOVAS FUNÇÕES INTERNAS PARA GERENCIAR O CRONÔMETRO ---

/** Cancela qualquer cronômetro de turno existente para uma sala. */
function clearTurnTimer(roomCode: string) {
  const existingTimer = turnTimers.get(roomCode);
  if (existingTimer) {
    clearTimeout(existingTimer);
    turnTimers.delete(roomCode);
  }
}

/** Inicia um novo cronômetro de turno para o jogador atual na sala. */
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
      inactivePlayerState.inactiveTurns++;
      console.log(
        `[GameService] Turno esgotado para ${inactivePlayerState.username}. Strikes: ${inactivePlayerState.inactiveTurns}/${MAX_INACTIVE_TURNS}`
      );

      // REGRA DE REMOÇÃO POR INATIVIDADE
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
    }

    roomNow.currentPlayerIndex =
      (roomNow.currentPlayerIndex + 1) % roomNow.playerOrder.length;
    startTurnTimer(roomNow);
    broadcastRoomState(roomNow);
  }, TURN_DURATION_MS);

  turnTimers.set(room.roomCode, timer);
}

// --- Funções Internas Modificadas ---
// ... (attachMessageHandlers permanece igual)
function attachMessageHandlers(
  ws: WebSocket,
  roomCode: string,
  player: Player
) {
  ws.on("message", (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);
      // ROTEAMENTO DE MENSAGENS
      switch (parsedMessage.type) {
        case "MAKE_MOVE":
          handleMakeMove(ws, roomCode, player.id, parsedMessage.payload.column);
          break;
        case "LEAVE_ROOM": // NOVA ROTA
          handlePlayerLeave(ws, roomCode, player.id);
          break;
        case "VOTE_REMATCH": // NOVO TIPO DE MENSAGEM
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
    payload: {
      username: sender.username,
      text: text,
    },
  };
  broadcastToRoom(roomCode, messagePayload);
}

/**
 * Lida com a saída *deliberada* de um jogador.
 * A conexão dele será encerrada no final.
 */
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

  // REGRA 1: O HOST SAIU DURANTE O JOGO.
  if (playerId === room.hostId && room.status !== "waiting") {
    console.log(`[GameService] Host saiu. Fechando a sala ${roomCode}.`);
    broadcastToRoom(roomCode, {
      type: "ROOM_CLOSED",
      payload: {
        message: `O host (${leavingPlayer.username}) encerrou a sala.`,
      },
    });
    room.players.forEach((p) => p.ws?.close());
    clearTurnTimer(roomCode);
    rooms.delete(roomCode);
    return;
  }

  room.players.delete(playerId);
  room.playerOrder = room.playerOrder.filter((id) => id !== playerId);
  if (ws) {
    clientToRoomMap.delete(ws);
  }

  // REGRA 2: RESTARAM 2 JOGADORES. O JOGO CONTINUA.
  if (room.status === "playing" && room.players.size === 2) {
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

    // REGRA 3: RESTOU APENAS 1 JOGADOR. A SALA REINICIA.
  } else if (room.status === "playing" && room.players.size < 2) {
    console.log(
      `[GameService] Apenas 1 jogador restou. Sala ${roomCode} voltando para o estado de espera.`
    );
    room.status = "waiting";
    const newHost = Array.from(room.players.values())[0];
    room.hostId = newHost.id;
    room.board = Array(9)
      .fill(null)
      .map(() => Array(10).fill(null));
    room.currentPlayerIndex = 0;
    delete room.winner;
    delete room.turnEndsAt;
    clearTurnTimer(roomCode);
    broadcastRoomState(room);

    // CASO PADRÃO (ex: jogador sai enquanto estava em 'waiting')
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
  if (!disconnectedPlayer) return;

  // Se o jogador já foi removido por 'handlePlayerLeave', não faz nada.
  if (!room.players.has(playerId)) return;

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

function handleMakeMove(
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
      // NOVO: Inicia a fase de votação
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

// --- NOVAS FUNÇÕES PARA O CICLO DE "JOGAR NOVAMENTE" ---

function startRematchVotePhase(room: GameState) {
  console.log(
    `[GameService] Jogo finalizado na sala ${room.roomCode}. Iniciando votação para jogar novamente.`
  );
  room.rematchVoteEndsAt = Date.now() + REMATCH_VOTE_DURATION_MS;
  room.rematchVotes = [];

  const timer = setTimeout(() => {
    processRematchVotes(room.roomCode);
  }, REMATCH_VOTE_DURATION_MS);

  rematchTimers.set(room.roomCode, timer);
}

function processRematchVotes(roomCode: string) {
  const room = rooms.get(roomCode);
  if (!room) return;

  console.log(`[GameService] Votação encerrada na sala ${roomCode}.`);
  rematchTimers.delete(roomCode);

  const playersWhoVoted = new Set(room.rematchVotes);
  const playersToRemove: PlayerState[] = [];

  // Identifica quem não votou
  room.players.forEach((player) => {
    if (!playersWhoVoted.has(player.id)) {
      playersToRemove.push(player);
    }
  });

  // Remove os jogadores que não votaram
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

  // Se, após as remoções, todos os jogadores restantes votaram sim, reinicia o jogo.
  const remainingPlayers = room.players.size;
  if (remainingPlayers > 1 && playersWhoVoted.size === remainingPlayers) {
    resetGameForRematch(room);
  }
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

  // Se todos os jogadores atuais votaram, não espera o timer.
  if (room.rematchVotes.length === room.players.size) {
    const timer = rematchTimers.get(roomCode);
    if (timer) clearTimeout(timer);
    processRematchVotes(roomCode);
  }
}

// ... (broadcastToRoom e broadcastRoomState permanecem iguais)
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

// ... (sendError permanece igual)
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

// ATUALIZE getGameStateForClient PARA ENVIAR O NOVO CAMPO
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
    currentPlayerIndex: room.currentPlayerIndex,
    status: room.status,
    winner: room.winner,
    turnEndsAt: room.turnEndsAt,
    // NOVOS
    rematchVotes: room.rematchVotes,
    rematchVoteEndsAt: room.rematchVoteEndsAt,
  };
}
