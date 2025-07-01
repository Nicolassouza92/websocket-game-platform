import http from "http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis"; // Importa o cliente Redis
import { GameState } from "./game/state";
import { createInitialState, makeMove } from "./game/logic";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Conexão com o Redis ---
const redisClient = createClient({
  // Se o Redis estiver rodando localmente na porta padrão, não precisa de URL.
  // Em produção, você usaria: { url: process.env.REDIS_URL }
});
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
wss.on("connection", (ws: WebSocket) => {
  console.log("Novo cliente conectado.");

  // A função de message também precisa ser async
  ws.on("message", async (message: string) => {
    const data = JSON.parse(message);
    const { type, payload } = data;

    switch (type) {
      case "CREATE_ROOM": {
        const roomId = `room-${Math.random().toString(36).substr(2, 9)}`;
        const creatorPlayerId = 1;
        
        const waitingRoomState: Partial<GameState> & { players: number[] } = {
          players: [creatorPlayerId],
          status: "waiting",
        };

        // Salva o estado da sala no Redis.
        // O estado do jogo é convertido para uma string JSON para armazenamento.
        await redisClient.set(roomId, JSON.stringify(waitingRoomState));

        clientToRoomMap.set(ws, roomId);

        ws.send(JSON.stringify({
          type: 'ROOM_CREATED',
          payload: {
            roomId,
            message: 'Sala criada. Aguardando outros jogadores...',
            gameState: waitingRoomState
          }
        }));
        console.log(`Sala ${roomId} criada e salva no Redis.`);
        break;
      }

      case "JOIN_ROOM": {
        const { roomId } = payload;
        
        // Busca a sala no Redis
        const roomStateJSON = await redisClient.get(roomId);

        if (!roomStateJSON) {
          ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Sala não encontrada." } }));
          return;
        }

        const roomState: GameState = JSON.parse(roomStateJSON);

        if (roomState.players.length >= 3) {
          ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Sala cheia." } }));
          return;
        }

        const newPlayerId = roomState.players.length + 1;
        roomState.players.push(newPlayerId);
        clientToRoomMap.set(ws, roomId);
        console.log(`Jogador ${newPlayerId} entrou na sala ${roomId}.`);
        
        let finalGameState: GameState;

        if (roomState.players.length === 3) {
            console.log(`Número mínimo de jogadores atingido na sala ${roomId}. Iniciando jogo!`);
            const initialState = createInitialState(roomState.players);
            finalGameState = initialState;
            
            // Salva o estado de jogo INICIADO no Redis, substituindo o de espera.
            await redisClient.set(roomId, JSON.stringify(initialState));
            broadcast(roomId, { type: 'GAME_START', payload: { gameState: initialState } });

        } else {
            finalGameState = roomState;
            // Salva o estado de espera ATUALIZADO (com o novo jogador) no Redis.
            await redisClient.set(roomId, JSON.stringify(roomState));
            broadcast(roomId, { type: 'PLAYER_JOINED', payload: { gameState: roomState } });
        }

        break;
      }
      
      case "MAKE_MOVE": {
        const { roomId, playerId, column } = payload;
        
        // Busca o estado atual da sala no Redis
        const roomStateJSON = await redisClient.get(roomId);
        if (!roomStateJSON) return;

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