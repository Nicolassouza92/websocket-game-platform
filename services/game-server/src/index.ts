// services/game-server/src/index.ts
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";
import { GameState, Player } from "./game/state";
import { createInitialState, makeMove } from "./game/logic";

// --- Configuração do Ambiente ---
const PORT = process.env.PORT || 4001;
const SERVER_ID = process.env.SERVER_ID || "default-server-id";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// --- Inicialização dos Serviços ---
const server = http.createServer();
const wss = new WebSocketServer({ server });
const redisClient = createClient({ url: REDIS_URL });

// Mapeia uma conexão WebSocket (que vive nesta instância) ao seu roomId
const clientToRoomMap = new Map<WebSocket, string>();

// Função para enviar uma mensagem a todos os clientes da mesma sala NESTA instância
function broadcast(roomId: string, message: object) {
  const messageString = JSON.stringify(message);
  for (const [client, rId] of clientToRoomMap.entries()) {
    if (rId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  }
}

// --- Lógica Principal de Conexão ---
wss.on("connection", (ws: WebSocket, req) => {
  // O Lobby e o NGINX garantem que a URL terá o formato: /ws/game/server-X/room-Y
  const urlParts = req.url?.split("/") || [];
  const roomId = urlParts.pop() || "";

  if (!roomId.startsWith("room-")) {
    console.error(
      `[${SERVER_ID}] Conexão inválida recebida sem um roomId válido. URL: ${req.url}`
    );
    ws.close(1008, "Room ID Inválido");
    return;
  }

  // Associa este cliente a esta sala
  clientToRoomMap.set(ws, roomId);
  console.log(`[${SERVER_ID}] Cliente conectado e associado à sala ${roomId}`);

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;

      const roomStateJSON = await redisClient.get(roomId);
      if (!roomStateJSON) {
        throw new Error(
          "O estado da sala não foi encontrado no Redis. A sala pode ter expirado ou nunca foi criada."
        );
      }
      let roomState: GameState = JSON.parse(roomStateJSON);

      // O Game Server só se preocupa com a lógica DENTRO do jogo
      switch (type) {
        // Esta é a primeira mensagem que o cliente envia após ser redirecionado pelo lobby
        case "PLAYER_ENTERED": {
          const newPlayer: Player = payload.player;

          // Se o jogador já está na lista, é uma reconexão. Apenas enviamos o estado atual.
          if (roomState.players.find((p) => p.id === newPlayer.id)) {
            console.log(
              `[${SERVER_ID}] Jogador ${newPlayer.username} reconectou à sala ${roomId}.`
            );
            ws.send(
              JSON.stringify({
                type: "GAME_STATE_UPDATE",
                payload: { gameState: roomState },
              })
            );
            return;
          }

          // Adiciona o novo jogador ao estado
          roomState.players.push(newPlayer);

          let finalState: GameState;
          if (roomState.players.length === 3) {
            console.log(
              `[${SERVER_ID}] Terceiro jogador entrou na sala ${roomId}. Iniciando o jogo!`
            );
            finalState = createInitialState(roomId, roomState.players);
            broadcast(roomId, {
              type: "GAME_START",
              payload: { gameState: finalState },
            });
          } else {
            console.log(
              `[${SERVER_ID}] Jogador ${newPlayer.username} entrou. Aguardando mais jogadores na sala ${roomId}.`
            );
            finalState = roomState;
            broadcast(roomId, {
              type: "PLAYER_JOINED",
              payload: { gameState: finalState },
            });
          }

          // Salva o estado atualizado no Redis
          await redisClient.set(roomId, JSON.stringify(finalState));
          break;
        }

        case "MAKE_MOVE": {
          const { playerId, column } = payload;
          const newState = makeMove(roomState, playerId, column);
          await redisClient.set(roomId, JSON.stringify(newState));
          broadcast(roomId, {
            type: "GAME_STATE_UPDATE",
            payload: { gameState: newState },
          });
          break;
        }
      }
    } catch (error: any) {
      console.error(
        `[${SERVER_ID}] Erro ao processar mensagem na sala ${roomId}:`,
        error
      );
      ws.send(
        JSON.stringify({ type: "ERROR", payload: { message: error.message } })
      );
    }
  });

  ws.on("close", () => {
    clientToRoomMap.delete(ws);
    console.log(`[${SERVER_ID}] Cliente desconectado da sala ${roomId}.`);
    // Futuramente, aqui entraria a lógica de resiliência (ex: notificar outros que o jogador saiu)
  });
});

// --- Inicialização do Servidor ---
server.listen(PORT, async () => {
  try {
    await redisClient.connect();
    // Anuncia-se como um servidor disponível
    await redisClient.sAdd("available_game_servers", SERVER_ID);
    console.log(
      `[GameServer ${SERVER_ID}] Rodando na porta ${PORT} e registrado com sucesso no Redis.`
    );
  } catch (error) {
    console.error(
      `[GameServer ${SERVER_ID}] Falha ao iniciar ou conectar ao Redis:`,
      error
    );
    process.exit(1);
  }
});
