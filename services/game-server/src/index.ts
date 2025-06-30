// services/game-server/src/index.ts

import http from 'http';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GameState } from './game/state';
import { createInitialState, makeMove } from './game/logic';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/**
 * Armazena o estado de todas as salas de jogo ativas.
 * A chave é o ID da sala (uma string aleatória).
 * O valor é o objeto GameState completo daquela sala.
 */
const rooms = new Map<string, GameState>();

/**
 * Mapeia cada conexão WebSocket (cliente) ao ID da sala em que ele está.
 * Isso nos ajuda a encontrar rapidamente a sala de um jogador quando ele envia uma mensagem
 * ou se desconecta.
 */
const clientToRoomMap = new Map<WebSocket, string>();

wss.on('connection', (ws: WebSocket) => {
  console.log('Novo cliente conectado.');

  ws.on('message', (message: string) => {
    const data = JSON.parse(message);
    const { type, payload } = data;

    switch (type) {
      case 'CREATE_ROOM': {
        const roomId = `room-${Math.random().toString(36).substr(2, 9)}`;
        const playerIds = [1]; // O criador é o jogador 1
        const initialState = createInitialState(playerIds);
        
        rooms.set(roomId, initialState);
        clientToRoomMap.set(ws, roomId);

        ws.send(JSON.stringify({ type: 'ROOM_CREATED', payload: { roomId, gameState: initialState } }));
        console.log(`Sala ${roomId} criada.`);
        break;
      }

      case 'JOIN_ROOM': {
        const { roomId } = payload;
        const roomState = rooms.get(roomId);

        if (!roomState) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Sala não encontrada.' } }));
          return;
        }

        if (roomState.players.length >= 3) { // Exemplo para 3 jogadores
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Sala cheia.' } }));
          return;
        }

        // Adiciona o novo jogador
        const newPlayerId = roomState.players.length + 1;
        roomState.players.push(newPlayerId);
        clientToRoomMap.set(ws, roomId);

        console.log(`Jogador ${newPlayerId} entrou na sala ${roomId}.`);
        broadcast(roomId, { type: 'PLAYER_JOINED', payload: { gameState: roomState } });
        break;
      }
      
      case 'MAKE_MOVE': {
        const { roomId, playerId, column } = payload;
        const roomState = rooms.get(roomId);

        if (!roomState) return; // Sala não existe mais

        try {
          const newState = makeMove(roomState, playerId, column);
          rooms.set(roomId, newState); // Atualiza o estado da sala

          broadcast(roomId, { type: 'GAME_STATE_UPDATE', payload: { gameState: newState } });
        } catch (error: any) {
          // Envia o erro de volta para o jogador que tentou a jogada inválida
          ws.send(JSON.stringify({ type: 'ERROR', payload: { message: error.message } }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado.');
    const roomId = clientToRoomMap.get(ws);
    if (roomId) {
      // Lógica de limpeza: remover o jogador da sala, notificar outros, etc.
      // (Pode ser implementado na Fase de Resiliência)
      clientToRoomMap.delete(ws);
      console.log(`Cliente removido do mapeamento da sala ${roomId}.`);
      // O ideal seria também remover o jogador do array `players` no estado da sala.
    }
  });
});

/**
 * Envia uma mensagem para todos os clientes em uma sala específica.
 * @param roomId - O ID da sala para a qual a mensagem será enviada.
 * @param message - O objeto da mensagem a ser enviado.
 */
function broadcast(roomId: string, message: object) {
  const roomState = rooms.get(roomId);
  if (!roomState) return;

  // Encontra todos os sockets que pertencem a esta sala
  const clientsInRoom: WebSocket[] = [];
  for (const [client, rId] of clientToRoomMap.entries()) {
    if (rId === roomId) {
      clientsInRoom.push(client);
    }
  }

  // Envia a mensagem para cada cliente na sala
  clientsInRoom.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => {
  console.log(`Servidor de Jogo rodando na porta ${PORT}`);
});