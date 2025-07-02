import http from "http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis"; // Importa o cliente Redis
import { GameState, Player } from "./game/state";
import { createInitialState, makeMove } from "./game/logic";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Conexão com o Redis ---
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redisClient = createClient({ url: REDIS_URL });
// Se o Redis estiver rodando localmente na porta padrão, não precisa de URL.
// Em produção, você usaria: { url: process.env.REDIS_URL }
redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect(); // Inicia a conexão
// -----------------------------

/**
 * Mapeia cada conexão WebSocket (cliente) ao ID da sala em que ele está.
 * Este Map permanece na memória de cada instância do servidor, pois cada
 * servidor só precisa gerenciar seus próprios clientes conectados.
 */
const clientToRoomMap = new Map<WebSocket, string>();

// A função wss.on('connection', ...) se torna async para poder usar await
wss.on("connection", (ws: WebSocket, req) => {
  // Extrai o roomId da URL (espera-se que seja o último segmento)
  const urlParts = req.url?.split("/") || [];
  const roomId = urlParts.pop() || "";

  if (!roomId.startsWith("room-")) {
    console.error(
      `[GameServer] Conexão inválida recebida sem um roomId válido. URL: ${req.url}`
    );
    ws.close(1008, "Room ID Inválido");
    return;
  }

  clientToRoomMap.set(ws, roomId);
  console.log(`[GameServer] Cliente conectado e associado à sala ${roomId}.`);

  // A função de message também precisa ser async
  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;

      switch (type) {
        case "PLAYER_ENTERED": {
          // Busca o estado atual da sala no Redis
          const roomStateJSON = await redisClient.get(roomId);
          if (!roomStateJSON) {
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Sala não encontrada." } }));
            return;
          }
          let roomState = JSON.parse(roomStateJSON) as GameState;

          const newPlayer = payload.player as Player;

          if (roomState.players.find((p) => p.id === newPlayer.id)) {
            console.log(
              `[GameServer] Jogador ${newPlayer.username} reconectou à sala ${roomId}.`
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

          let finalGameState: GameState;
          if (roomState.players.length === 3) {
            console.log(`Número mínimo de jogadores atingido na sala ${roomId}. Iniciando jogo!`);
            finalGameState = createInitialState(roomId, roomState.players);

            // Salva o estado de jogo INICIADO no Redis, substituindo o de espera.
            await redisClient.set(roomId, JSON.stringify(finalGameState));
            broadcast(roomId, { type: 'GAME_START', payload: { gameState: finalGameState } });

          } else {
            finalGameState = roomState;
            // Salva o estado de espera ATUALIZADO (com o novo jogador) no Redis.
            await redisClient.set(roomId, JSON.stringify(roomState));
            broadcast(roomId, { type: 'PLAYER_JOINED', payload: { gameState: roomState } });
          }
          break;
        }

        case "MAKE_MOVE": {
          const { playerId, column } = payload;

          // Busca o estado atual da sala no Redis
          const roomStateJSON = await redisClient.get(roomId);
          if (!roomStateJSON) {
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Sala não encontrada." } }));
            return;
          const roomState: GameState = JSON.parse(roomStateJSON);

          try {
            // A função `makeMove` continua sendo pura, ela não sabe sobre Redis.
            const newState = makeMove(roomState, playerId, column);

            // Salva o novo estado de volta no Redis
            await redisClient.set(roomId, JSON.stringify(newState));

            broadcast(roomId, { type: "GAME_STATE_UPDATE", payload: { gameState: newState } });
          } catch (error: any) {
            ws.send(JSON.stringify({ type: "ERROR", payload: { message: error.message } }));
          }
          break;
        }
      }
    } catch (error: any) {
      console.error(
        `[GameServer] Erro ao processar mensagem na sala ${roomId}:`,
        error
      );
      ws.send(
        JSON.stringify({ type: "ERROR", payload: { message: error.message } })
      );
    }
  });

  ws.on("close", () => {
    // A lógica de 'close' também pode precisar interagir com o Redis no futuro,
    // por exemplo, para remover um jogador do estado da sala.
    console.log("Cliente desconectado.");
    const roomId = clientToRoomMap.get(ws);
    if (roomId) {
      clientToRoomMap.delete(ws);
      console.log(`Cliente removido do mapeamento da sala ${roomId}.`);
      // Aqui entraria a lógica de resiliência da Fase 4.
    }
  });
});

// A função de broadcast não precisa saber sobre o Redis.
// Ela apenas envia mensagens para os clientes que *esta* instância do servidor conhece.
function broadcast(roomId: string, message: object) {
  const clientsInRoom: WebSocket[] = [];
  for (const [client, rId] of clientToRoomMap.entries()) {
    if (rId === roomId) {
      clientsInRoom.push(client);
    }
  }

  const messageString = JSON.stringify(message);
  clientsInRoom.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => {
  console.log(`Servidor de Jogo rodando na porta ${PORT}`);
});
