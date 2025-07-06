import { WebSocket } from "ws";
import { GameState, Player, PlayerId } from "../game/state";
import { makeMove } from "../game/logic";

const rooms = new Map<string, GameState>();
const clientToRoomMap = new Map<
  WebSocket,
  { roomCode: string; playerId: PlayerId }
>();

/**
 * Cria uma nova sala de jogo em memória.
 */
export function createRoom(creator: Player): GameState {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  const initialState: GameState = {
    roomCode,
    host: creator,
    players: [], // O criador será adicionado em handlePlayerConnection
    board: Array(9)
      .fill(null)
      .map(() => Array(10).fill(null)),
    currentPlayerIndex: 0,
    status: "waiting",
    winner: undefined,
  };

  rooms.set(roomCode, initialState);
  console.log(`[GameService] Sala ${roomCode} criada por ${creator.username}.`);
  return initialState;
}

/**
 * Retorna uma lista de salas disponíveis para entrar.
 */
export function getAvailableRooms(): Pick<
  GameState,
  "roomCode" | "players" | "status"
>[] {
  return Array.from(rooms.values())
    .filter((room) => room.status === "waiting" && room.players.length < 3)
    .map(({ roomCode, players, status }) => ({ roomCode, players, status }));
}

/**
 * Lida com uma nova conexão de um jogador a uma sala específica.
 */
export function handlePlayerConnection(
  ws: WebSocket,
  roomCode: string,
  player: Player
) {
  const room = rooms.get(roomCode);

  if (!room) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        payload: { message: "Sala não encontrada." },
      })
    );
    ws.close();
    return;
  }
  if (room.players.some((p) => p.id === player.id)) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        payload: { message: "Você já está conectado a esta sala." },
      })
    );
    ws.close();
    return;
  }
  if (room.status !== "waiting" || room.players.length >= 3) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        payload: { message: "A sala não está aceitando novos jogadores." },
      })
    );
    ws.close();
    return;
  }

  room.players.push(player);
  clientToRoomMap.set(ws, { roomCode, playerId: player.id });
  console.log(
    `[GameService] Jogador ${player.username} entrou na sala ${roomCode}. (${room.players.length}/3)`
  );

  if (room.players.length === 3) {
    console.log(`[GameService] Sala ${roomCode} cheia. Iniciando jogo.`);
    room.status = "playing";
    room.players.sort((a, b) =>
      a.id === room.host.id ? -1 : b.id === room.host.id ? 1 : 0
    );
    room.currentPlayerIndex = room.players.findIndex(
      (p) => p.id === room.host.id
    );
    broadcastToRoom(roomCode, {
      type: "GAME_START",
      payload: { gameState: room },
    });
  } else {
    broadcastToRoom(roomCode, {
      type: "PLAYER_JOINED",
      payload: { gameState: room },
    });
  }

  ws.on("message", (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);
      switch (parsedMessage.type) {
        case "MAKE_MOVE":
          handleMakeMove(ws, roomCode, player.id, parsedMessage.payload.column);
          break;
        case "SEND_CHAT_MESSAGE":
          handleChatMessage(roomCode, player, parsedMessage.payload.text);
          break;
      }
    } catch (error) {
      console.error(
        "[GameService] Erro ao processar mensagem do WebSocket:",
        error
      );
    }
  });

  ws.on("close", () => {
    handlePlayerDisconnection(ws);
  });
}

function handleChatMessage(roomCode: string, sender: Player, text: string) {
  const message = {
    type: "NEW_MESSAGE",
    payload: {
      username: sender.username,
      text: text,
    },
  };
  broadcastToRoom(roomCode, message);
}

function handlePlayerDisconnection(ws: WebSocket) {
  const connectionInfo = clientToRoomMap.get(ws);
  if (!connectionInfo) return;

  const { roomCode, playerId } = connectionInfo;
  const room = rooms.get(roomCode);
  if (!room) return;

  const disconnectedPlayer = room.players.find((p) => p.id === playerId);
  clientToRoomMap.delete(ws);
  room.players = room.players.filter((p) => p.id !== playerId);

  console.log(
    `[GameService] Jogador ${
      disconnectedPlayer?.username || playerId
    } desconectou da sala ${roomCode}.`
  );

  if (room.players.length < 3 && room.status !== "waiting") {
    console.log(
      `[GameService] Número de jogadores insuficiente. Fechando a sala ${roomCode}.`
    );
    broadcastToRoom(roomCode, {
      type: "ROOM_CLOSED",
      payload: {
        message: `A sala foi fechada porque ${disconnectedPlayer?.username} saiu.`,
      },
    });
    room.players.forEach((p) => {
      const playerWs = Array.from(clientToRoomMap.keys()).find(
        (key) => clientToRoomMap.get(key)?.playerId === p.id
      );
      playerWs?.close();
    });
    rooms.delete(roomCode);
  } else {
    broadcastToRoom(roomCode, {
      type: "PLAYER_LEFT",
      payload: { gameState: room, disconnectedPlayerId: playerId },
    });
  }
}

function handleMakeMove(
  ws: WebSocket,
  roomCode: string,
  playerId: PlayerId,
  column: number
) {
  const room = rooms.get(roomCode);
  if (!room) return;

  try {
    const newState = makeMove(room, playerId, column);
    rooms.set(roomCode, newState);
    broadcastToRoom(roomCode, {
      type: "GAME_STATE_UPDATE",
      payload: { gameState: newState },
    });
  } catch (error: any) {
    console.error(
      `[GameService] Jogada inválida na sala ${roomCode} pelo jogador ${playerId}: ${error.message}`
    );
    ws.send(
      JSON.stringify({ type: "ERROR", payload: { message: error.message } })
    );
  }
}

function broadcastToRoom(roomCode: string, message: object) {
  const messageString = JSON.stringify(message);
  for (const [client, info] of clientToRoomMap.entries()) {
    if (info.roomCode === roomCode && client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  }
}