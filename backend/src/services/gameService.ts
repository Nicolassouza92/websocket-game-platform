import { WebSocket } from "ws";
import {
  GameState,
  Player,
  PlayerId,
  PlayerState,
  GameStateForClient,
} from "../game/state";
import { makeMove } from "../game/logic";
import Match from "../models/matchModel";

const rooms = new Map<string, GameState>();
const clientToRoomMap = new Map<
  WebSocket,
  { roomCode: string; playerId: PlayerId }
>();
const reconnectionTimers = new Map<PlayerId, NodeJS.Timeout>();
const RECONNECTION_TIMEOUT_MS = 60000;

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
    sessionWins: new Map<PlayerId, number>(),
    readyVotes: [],
    rematchVotes: [],
  };
  rooms.set(roomCode, initialState);
  console.log(`[GameService] Sala ${roomCode} criada por ${creator.username}.`);
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

  if (room.players.size === 3) {
    console.log(
      `[GameService] Sala ${roomCode} cheia. Iniciando fase de prontidão.`
    );
    room.status = "readyCheck";
    room.readyVotes = [];
  }

  broadcastRoomState(room);
  attachMessageHandlers(ws, roomCode, player);
}

// --- Funções de Lógica de Jogo e Sala (Unificadas e Corrigidas) ---

function attachMessageHandlers(
  ws: WebSocket,
  roomCode: string,
  player: Player
) {
  ws.on("message", async (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);
      switch (parsedMessage.type) {
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

  const wasHost = playerId === room.hostId;
  const statusBeforeLeave = room.status;

  // Remove os dados do jogador
  room.players.delete(playerId);
  room.playerOrder = room.playerOrder.filter((id) => id !== playerId);
  room.sessionWins.delete(playerId); // Remove do placar de sessão
  if (ws) {
    clientToRoomMap.delete(ws);
  }

  // Se a sala ficar vazia, apaga-a
  if (room.players.size === 0) {
    console.log(`[GameService] Sala ${roomCode} ficou vazia. Removendo.`);
    clearTurnTimer(roomCode);
    clearRematchTimer(roomCode);
    rooms.delete(roomCode);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    return;
  }

  // **INÍCIO DA LÓGICA CORRIGIDA**
  // Se o host saiu, promove um novo host em vez de fechar a sala
  if (wasHost) {
    room.hostId = room.playerOrder[0]; // O próximo jogador na ordem vira o novo host
    const newHost = room.players.get(room.hostId);
    if (newHost) {
      broadcastToRoom(roomCode, {
        type: "INFO_MESSAGE",
        payload: {
          message: `${leavingPlayer.username} (o host) saiu. ${newHost.username} é o novo host.`,
        },
      });
    }
  }
  // **FIM DA LÓGICA CORRIGIDA**

  // Se a saída foi durante a votação de revanche, processa os votos restantes
  if (statusBeforeLeave === "finished") {
    console.log(`[GameService] Jogador saiu durante a votação. Processando...`);
    processRematchVotes(room);
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    return;
  }

  // Decide o que fazer com base no estado anterior e no número de jogadores
  if (
    statusBeforeLeave === "readyCheck" ||
    (statusBeforeLeave === "playing" && room.players.size < 2)
  ) {
    console.log(
      `[GameService] Jogador saiu, número de jogadores insuficiente. Sala ${roomCode} voltando para o estado de espera.`
    );
    resetRoomToWaiting(room);
  } else if (statusBeforeLeave === "playing") {
    console.log(
      `[GameService] Restam ${room.players.size} jogadores. O jogo continua.`
    );
    room.currentPlayerIndex %= room.playerOrder.length;
    broadcastToRoom(roomCode, {
      type: "INFO_MESSAGE",
      payload: {
        message: `${leavingPlayer.username} saiu. O jogo continua entre os restantes.`,
      },
    });
    startTurnTimer(room); // Reinicia o timer para o próximo jogador
    broadcastRoomState(room);
  } else {
    // Para outros estados (como 'waiting'), apenas atualiza a UI
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

    if (newState.status === "finished") {
      clearTurnTimer(roomCode);
      delete newState.turnEndsAt;

      if (newState.winner) {
        const currentWins = newState.sessionWins.get(newState.winner) || 0;
        newState.sessionWins.set(newState.winner, currentWins + 1);
        console.log(
          `[GameService] Jogador ${newState.winner} agora tem ${
            currentWins + 1
          } vitórias na sala ${roomCode}.`
        );
      }

      try {
        await Match.record(
          newState.winner ?? null,
          newState.playerOrderHistory
        );
      } catch (dbError) {
        console.error(
          `[GameService] Falha ao gravar a partida ${roomCode} no DB:`,
          dbError
        );
      }
      startRematchVotePhase(newState);
    } else {
      startTurnTimer(newState);
    }

    rooms.set(roomCode, newState);
    broadcastRoomState(newState);
  } catch (error: any) {
    console.error(`[GameService] Jogada inválida: ${error.message}`);
    sendError(ws, error.message);
  }
}

function processRematchVotes(room: GameState) {
  clearRematchTimer(room.roomCode);

  const playersWhoVoted = new Set(room.rematchVotes);
  const playersToRemove: PlayerState[] = [];
  room.players.forEach((player) => {
    if (!playersWhoVoted.has(player.id)) {
      playersToRemove.push(player);
    }
  });

  if (playersToRemove.length > 0) {
    playersToRemove.forEach((player) => {
      broadcastToRoom(room.roomCode, {
        type: "INFO_MESSAGE",
        payload: {
          message: `${player.username} não votou e foi removido da sala.`,
        },
      });
      handlePlayerLeave(player.ws, room.roomCode, player.id);
    });
  }

  const finalRoomState = rooms.get(room.roomCode);
  if (!finalRoomState) return;

  const allRemainingVoted =
    finalRoomState.rematchVotes.length === finalRoomState.players.size;

  if (allRemainingVoted && finalRoomState.players.size > 0) {
    if (finalRoomState.players.size >= 2) {
      resetGameForRematch(finalRoomState);
    } else {
      resetRoomToWaiting(finalRoomState);
    }
  } else if (!allRemainingVoted) {
    broadcastToRoom(room.roomCode, {
      type: "INFO_MESSAGE",
      payload: {
        message: `A revanche não foi unânime. A sala aguardará novos jogadores.`,
      },
    });
    resetRoomToWaiting(finalRoomState);
  }
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
    `[GameService] Jogador ${playerId} votou para revanche na sala ${roomCode}.`
  );
  room.rematchVotes.push(playerId);

  if (room.rematchVotes.length === room.players.size) {
    processRematchVotes(room);
  } else {
    broadcastRoomState(room);
  }
}

// --- Funções Auxiliares de Setup e Timers (sem alterações) ---

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
          `[GameService] Pulando turno do jogador desconectado ${inactivePlayerState.username}.`
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

function handleChatMessage(roomCode: string, sender: Player, text: string) {
  if (!text || text.length > 200) return;
  const messagePayload = {
    type: "NEW_MESSAGE",
    payload: { username: sender.username, text: text },
  };
  broadcastToRoom(roomCode, messagePayload);
}

function startGame(room: GameState) {
  console.log(
    `[GameService] Todos os jogadores estão prontos. Iniciando jogo na sala ${room.roomCode}.`
  );
  room.status = "playing";
  room.currentPlayerIndex = 0;
  room.playerOrderHistory = [...room.playerOrder];
  startTurnTimer(room);
  broadcastRoomState(room);
}

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
    `[GameService] Jogador ${playerId} votou como pronto na sala ${roomCode}.`
  );
  room.readyVotes.push(playerId);

  if (room.readyVotes.length === room.players.size) {
    startGame(room);
  } else {
    broadcastRoomState(room);
  }
}

function startRematchVotePhase(room: GameState) {
  console.log(
    `[GameService] Jogo finalizado. Iniciando votação de revanche na sala ${room.roomCode}.`
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
  delete room.winner;
  room.rematchVotes = [];
  delete room.rematchVoteEndsAt;
  room.playerOrderHistory = [...room.playerOrder];
  room.players.forEach((p) => (p.inactiveTurns = 0));

  startTurnTimer(room);
  broadcastRoomState(room);
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
  const hostPlayer = Array.from(room.players.values()).find(
    (p) => p.id === room.hostId
  );
  const hostName = hostPlayer?.username || "Desconhecido";

  return {
    roomCode: room.roomCode,
    hostId: room.hostId,
    hostName: hostName,
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
    sessionWins: Object.fromEntries(room.sessionWins.entries()),
    readyVotes: room.readyVotes,
    rematchVotes: room.rematchVotes,
    rematchVoteEndsAt: room.rematchVoteEndsAt,
  };
}
