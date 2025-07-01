import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient, RedisClientType } from "redis";
import { GameState, Player } from "./game/state";
import { createInitialState, makeMove } from "./game/logic";

const PORT = process.env.PORT || 4001;
const SERVER_ID = process.env.SERVER_ID || "default-server-id";
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const server = http.createServer();
const wss = new WebSocketServer({ server });
const redisClient: RedisClientType = createClient({ url: REDIS_URL });

const clientToRoomMap = new Map<WebSocket, string>();

function broadcast(roomId: string, message: object) {
  const messageString = JSON.stringify(message);
  for (const [client, rId] of clientToRoomMap.entries()) {
    if (rId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  }
}

wss.on("connection", (ws: WebSocket, req) => {
  const urlParts = req.url?.split("/") || [];
  const roomId = urlParts.pop() || "";

  if (!roomId.startsWith("room-")) {
    console.error(
      `[${SERVER_ID}] Conexão inválida recebida sem um roomId válido. URL: ${req.url}`
    );
    ws.close(1008, "Room ID Inválido");
    return;
  }

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

      let roomState = JSON.parse(roomStateJSON) as GameState;

      switch (type) {
        case "PLAYER_ENTERED": {
          const newPlayer = payload.player as Player;

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
              `[${SERVER_ID}] Jogador ${newPlayer.username} entrou. Aguardando mais jogadores.`
            );
            finalState = roomState;
            broadcast(roomId, {
              type: "PLAYER_JOINED",
              payload: { gameState: finalState },
            });
          }

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
  });
});

server.listen(PORT, async () => {
  try {
    await redisClient.connect();
    await redisClient.sAdd("available_game_servers", SERVER_ID);
    console.log(
      `[GameServer ${SERVER_ID}] Rodando na porta ${PORT} e registrado no Redis.`
    );
  } catch (error) {
    console.error(
      `[GameServer ${SERVER_ID}] Falha ao iniciar ou conectar ao Redis:`,
      error
    );
    process.exit(1);
  }
});
