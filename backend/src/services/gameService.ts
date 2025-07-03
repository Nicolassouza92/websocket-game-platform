import { WebSocket } from "ws";
import { GameState, Player, PlayerId } from "../game/state";
import { createInitialState, makeMove } from "../game/logic";

/**
 * O "caderno" que guarda todas as salas de jogo ativas na memória.
 * A chave é o 'roomCode' (string).
 * O valor é o estado completo da sala (GameState).
 */
const rooms = new Map<string, GameState>();

/**
 * Mapeia uma conexão WebSocket individual a um roomCode.
 * Isso nos ajuda a saber para qual sala enviar mensagens (broadcast).
 */
const clientToRoomMap = new Map<
  WebSocket,
  { roomCode: string; playerId: PlayerId }
>();

/**
 * (Função a ser chamada pelo controller)
 * Cria uma nova sala, a adiciona ao nosso Map e retorna seu estado.
 */
export function createRoom(creator: Player): GameState {
  // Gera um código de sala aleatório de 6 caracteres.
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  // Cria um estado inicial de "espera" para a sala.
  const initialState: GameState = {
    roomCode,
    host: creator, // O criador é definido como o host
    players: [], // A lista de jogadores conectados começa vazia
    board: Array(9)
      .fill(null)
      .map(() => Array(10).fill(null)),
    currentPlayerIndex: 0,
    status: "waiting",
  };

  // Adiciona a sala ao nosso "caderno" de salas ativas.
  rooms.set(roomCode, initialState);
  console.log(`[GameService] Sala ${roomCode} criada por ${creator.username}.`);

  return initialState;
}

/**
 * (Função a ser chamada quando um WebSocket se conecta)
 * Lida com a entrada de um novo jogador em uma sala.
 */
export function handlePlayerConnection(
  ws: WebSocket,
  roomCode: string,
  player: Player
) {
  const room = rooms.get(roomCode);

  // Validação: a sala existe e não está cheia?
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

  if (room.players.length >= 3) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        payload: { message: "A sala está cheia." },
      })
    );
    ws.close();
    return;
  }

  // Adiciona o jogador à lista de conectados e mapeia sua conexão
  room.players.push(player);
  clientToRoomMap.set(ws, { roomCode, playerId: player.id });
  console.log(
    `[GameService] Jogador ${player.username} entrou na sala ${roomCode}. (${room.players.length}/3)`
  );

  // Lógica de início de jogo (permanece a mesma)
  if (room.players.length === 3) {
    // Ordena os jogadores para garantir consistência (host sempre primeiro)
    room.players.sort((a, b) =>
      a.id === room.host.id ? -1 : b.id === room.host.id ? 1 : 0
    );

    const gameStartState = createInitialState(
      roomCode,
      room.players,
      room.host
    );
    rooms.set(roomCode, gameStartState);
    broadcastToRoom(roomCode, {
      type: "GAME_START",
      payload: { gameState: gameStartState },
    });
  } else {
    broadcastToRoom(roomCode, {
      type: "PLAYER_JOINED",
      payload: { gameState: room },
    });
  }

  // Lógica para quando o jogador envia uma mensagem (faz uma jogada)
  ws.on("message", (message: string) => {
    try {
      const parsedMessage = JSON.parse(message);
      if (parsedMessage.type === "MAKE_MOVE") {
        handleMakeMove(roomCode, player.id, parsedMessage.payload.column);
      }
    } catch (error) {
      console.error("Erro ao processar mensagem do WebSocket:", error);
    }
  });

  // Lógica para quando a conexão é fechada
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
  console.log(
    `[GameService] Jogador ${
      disconnectedPlayer?.username || playerId
    } desconectou da sala ${roomCode}.`
  );

  // Remove o mapeamento da conexão
  clientToRoomMap.delete(ws);

  // Se o jogador que desconectou era o HOST, a sala é encerrada.
  if (playerId === room.host.id) {
    console.log(
      `[GameService] O host desconectou. Fechando a sala ${roomCode}.`
    );
    broadcastToRoom(roomCode, {
      type: "ROOM_CLOSED",
      payload: { message: "O anfitrião encerrou a sala." },
    });
    // Fecha todas as conexões restantes na sala e a remove do mapa.
    room.players.forEach((p) => {
      const playerWs = Array.from(clientToRoomMap.keys()).find(
        (key) => clientToRoomMap.get(key)?.playerId === p.id
      );
      playerWs?.close();
    });
    rooms.delete(roomCode);
  } else {
    // Se um jogador normal saiu, apenas o remove da lista e notifica os outros.
    room.players = room.players.filter((p) => p.id !== playerId);
    broadcastToRoom(roomCode, {
      type: "PLAYER_LEFT",
      payload: { gameState: room },
    });
  }
}

/**
 * Processa a jogada de um jogador.
 */
function handleMakeMove(roomCode: string, playerId: PlayerId, column: number) {
  const room = rooms.get(roomCode);
  if (!room) return;

  try {
    const newState = makeMove(room, playerId, column);
    rooms.set(roomCode, newState); // Atualiza o estado da sala
    broadcastToRoom(roomCode, {
      type: "GAME_STATE_UPDATE",
      payload: { gameState: newState },
    });
  } catch (error: any) {
    console.error(
      `[GameService] Jogada inválida na sala ${roomCode}: ${error.message}`
    );
  }
}

/**
 * Envia uma mensagem para todos os jogadores em uma sala específica.
 */
function broadcastToRoom(roomCode: string, message: object) {
  const messageString = JSON.stringify(message);
  console.log(
    `[GameService] Fazendo broadcast para a sala ${roomCode}:`,
    (message as any).type
  );

  for (const [client, info] of clientToRoomMap.entries()) {
    if (info.roomCode === roomCode && client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  }
}

/**
 * (Função para o controller)
 * Retorna uma lista de salas que ainda não estão cheias.
 */
export function getAvailableRooms(): Omit<GameState, "board" | "host">[] {
  const availableRooms = [];
  for (const [roomCode, gameState] of rooms.entries()) {
    if (gameState.status === "waiting") {
      const { board, host, ...roomInfo } = gameState; // Também remove o host da lista pública
      availableRooms.push(roomInfo);
    }
  }
  return availableRooms;
}
