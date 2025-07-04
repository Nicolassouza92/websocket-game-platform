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

  // O estado da sala começa como 'waiting'. O tabuleiro e outros campos
  // serão totalmente inicializados quando o jogo começar.
  const initialState: GameState = {
    roomCode,
    host: creator,
    players: [], // Começa vazio, o host será adicionado em handlePlayerConnection
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
 * Retorna uma lista de salas disponíveis.
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
 * Lida com a entrada de um novo jogador em uma sala via WebSocket.
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
    // Lógica de reconexão poderia entrar aqui, mas por enquanto fechamos.
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
    // Opcional: ordenar jogadores se necessário (host primeiro)
    room.players.sort((a, b) =>
      a.id === room.host.id ? -1 : b.id === room.host.id ? 1 : 0
    );
    // Reinicia o índice do jogador atual para garantir que o host comece
    room.currentPlayerIndex = room.players.findIndex(
      (p) => p.id === room.host.id
    );

    // O estado está pronto, agora notificamos todos que o jogo começou
    broadcastToRoom(roomCode, {
      type: "GAME_START",
      payload: { gameState: room },
    });
  } else {
    // Se o jogo ainda está esperando, apenas notifica sobre o novo jogador.
    broadcastToRoom(roomCode, {
      type: "PLAYER_JOINED",
      payload: { gameState: room },
    });
  }

  ws.on("message", (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === "MAKE_MOVE") {
        handleMakeMove(ws, roomCode, player.id, parsedMessage.payload.column);
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

function handlePlayerDisconnection(ws: WebSocket) {
  const connectionInfo = clientToRoomMap.get(ws);
  if (!connectionInfo) return;

  const { roomCode, playerId } = connectionInfo;
  const room = rooms.get(roomCode);
  if (!room) return;

  const disconnectedPlayer = room.players.find((p) => p.id === playerId);
  clientToRoomMap.delete(ws);

  // Remove o jogador da lista
  room.players = room.players.filter((p) => p.id !== playerId);

  console.log(
    `[GameService] Jogador ${
      disconnectedPlayer?.username || playerId
    } desconectou da sala ${roomCode}.`
  );

  // Se a sala ficar com menos de 3 jogadores e estava jogando, ela é encerrada.
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
    // Fecha as conexões restantes e remove a sala.
    room.players.forEach((p) => {
      const playerWs = Array.from(clientToRoomMap.keys()).find(
        (key) => clientToRoomMap.get(key)?.playerId === p.id
      );
      playerWs?.close();
    });
    rooms.delete(roomCode);
  } else {
    // Se a sala ainda pode continuar (ou estava em 'waiting'), apenas notifica
    broadcastToRoom(roomCode, {
      type: "PLAYER_LEFT",
      payload: { gameState: room, disconnectedPlayerId: playerId }, // Envia o ID de quem saiu
    });
  }
}

/**
 * Processa a jogada de um jogador.
 */
function handleMakeMove(
  ws: WebSocket,
  roomCode: string,
  playerId: PlayerId,
  column: number
) {
  const room = rooms.get(roomCode);
  if (!room) return;

  try {
    // A lógica pura do jogo valida o turno, a jogada, etc.
    const newState = makeMove(room, playerId, column);
    rooms.set(roomCode, newState); // Atualiza o estado da sala

    // Notifica todos na sala sobre o novo estado do jogo.
    broadcastToRoom(roomCode, {
      type: "GAME_STATE_UPDATE",
      payload: { gameState: newState },
    });
  } catch (error: any) {
    // **CORREÇÃO IMPORTANTE**: Notifica o jogador sobre a jogada inválida.
    console.error(
      `[GameService] Jogada inválida na sala ${roomCode} pelo jogador ${playerId}: ${error.message}`
    );
    ws.send(
      JSON.stringify({ type: "ERROR", payload: { message: error.message } })
    );
  }
}

/**
 * Envia uma mensagem para todos os jogadores em uma sala específica.
 */
function broadcastToRoom(roomCode: string, message: object) {
  const messageString = JSON.stringify(message);
  for (const [client, info] of clientToRoomMap.entries()) {
    if (info.roomCode === roomCode && client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  }
}
