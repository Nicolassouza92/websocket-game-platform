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
const clientToRoomMap = new Map<WebSocket, string>();

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
    players: [creator],
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
  if (!room || room.players.length >= 3) {
    ws.send(
      JSON.stringify({
        type: "ERROR",
        payload: { message: "Sala não encontrada ou está cheia." },
      })
    );
    ws.close();
    return;
  }

  // Mapeia esta conexão WebSocket ao roomCode.
  clientToRoomMap.set(ws, roomCode);

  // Adiciona o jogador à lista de jogadores da sala.
  room.players.push(player);

  // Se a sala agora tem 3 jogadores, o jogo começa!
  if (room.players.length === 3) {
    // Usamos nossa lógica pura para criar o estado inicial do jogo.
    const gameStartState = createInitialState(roomCode, room.players);
    // Atualizamos o estado da sala no nosso Map.
    rooms.set(roomCode, gameStartState);
    console.log(`[GameService] Jogo começando na sala ${roomCode}!`);
    // Notifica a todos que o jogo começou.
    broadcastToRoom(roomCode, {
      type: "GAME_START",
      payload: { gameState: gameStartState },
    });
  } else {
    // Se a sala ainda não está cheia, apenas notifica que um novo jogador entrou.
    console.log(
      `[GameService] Jogador ${player.username} entrou na sala ${roomCode}.`
    );
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
    console.log(
      `[GameService] Jogador ${player.username} desconectou da sala ${roomCode}.`
    );
    clientToRoomMap.delete(ws);
    // (Lógica futura: remover jogador da sala e notificar os outros)
  });
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
    // Idealmente, enviar o erro apenas para o jogador que errou.
  }
}

/**
 * Envia uma mensagem para todos os jogadores em uma sala específica.
 */
function broadcastToRoom(roomCode: string, message: object) {
  const messageString = JSON.stringify(message);
  console.log(
    `[GameService] Fazendo broadcast para a sala ${roomCode}:`,
    // Exibe o tipo da mensagem - usando cast para evitar erro de tipo - corrigir isso depois
    (message as any).type
  );

  // Itera sobre nosso mapa de conexões
  for (const [client, rCode] of clientToRoomMap.entries()) {
    // Se a conexão pertence à sala correta e está aberta...
    if (rCode === roomCode && client.readyState === WebSocket.OPEN) {
      // ...envia a mensagem!
      client.send(messageString);
    }
  }
}

/**
 * (Função para o controller)
 * Retorna uma lista de salas que ainda não estão cheias.
 */
export function getAvailableRooms(): Omit<GameState, "board">[] {
  const availableRooms = [];
  for (const [roomCode, gameState] of rooms.entries()) {
    if (gameState.status === "waiting") {
      const { board, ...roomInfo } = gameState; // Remove o tabuleiro para não enviar dados pesados
      availableRooms.push(roomInfo);
    }
  }
  return availableRooms;
}
