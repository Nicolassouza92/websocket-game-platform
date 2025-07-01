import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const PORT = process.env.PORT || 3001;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const server = http.createServer();
const wss = new WebSocketServer({ server });
const redisClient = createClient({ url: REDIS_URL });

async function getAvailableGameServer(): Promise<string | null> {
  return redisClient.sRandMember("available_game_servers");
}

wss.on("connection", (ws: WebSocket) => {
  console.log(`[Lobby] Novo cliente conectado.`);

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;

      switch (type) {
        case "CREATE_ROOM": {
          const serverId = await getAvailableGameServer();
          if (!serverId) {
            ws.send(
              JSON.stringify({
                type: "ERROR",
                payload: { message: "Nenhum servidor de jogo disponível." },
              })
            );
            return;
          }

          const roomId = `room-${Math.random().toString(36).substr(2, 9)}`;

          // 1. Mapeia a sala ao servidor de jogo no Redis
          await redisClient.hSet("room_to_server_map", roomId, serverId);

          // 2. Cria um estado inicial de "espera" para a sala no Redis
          const waitingState = {
            roomId: roomId,
            players: [payload.creator], // Assume que o criador envia seus dados
            status: "waiting",
          };
          await redisClient.set(roomId, JSON.stringify(waitingState));

          // 3. Devolve a URL exata para o cliente se conectar, via NGINX
          const gameServerUrl = `ws://localhost/ws/game/${serverId}/${roomId}`; // Usa localhost (ou seu domínio) na porta 80

          ws.send(
            JSON.stringify({
              type: "ROOM_CREATED",
              payload: { roomId, gameServerUrl },
            })
          );
          console.log(`[Lobby] Sala ${roomId} criada no servidor ${serverId}.`);
          break;
        }
        case "JOIN_ROOM": {
          const { roomId } = payload;
          const serverId = await redisClient.hGet("room_to_server_map", roomId);

          if (!serverId) {
            ws.send(
              JSON.stringify({
                type: "ERROR",
                payload: { message: "Sala não encontrada." },
              })
            );
            return;
          }

          const gameServerUrl = `ws://localhost/ws/game/${serverId}/${roomId}`;
          // Apenas devolve a URL, o cliente fará o resto
          ws.send(
            JSON.stringify({
              type: "JOIN_REDIRECT",
              payload: { roomId, gameServerUrl },
            })
          );
          console.log(
            `[Lobby] Redirecionando jogador para sala ${roomId} no servidor ${serverId}.`
          );
          break;
        }
      }
    } catch (error: any) {
      console.error("[Lobby] Erro:", error.message);
      ws.send(
        JSON.stringify({
          type: "ERROR",
          payload: { message: "Requisição inválida." },
        })
      );
    }
  });
});

server.listen(PORT, async () => {
  await redisClient.connect();
  console.log(`[Lobby] Servidor de Lobby rodando na porta ${PORT}`);
});
