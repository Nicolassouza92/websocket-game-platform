const WebSocket = require("ws");

const LOBBY_URL = "ws://localhost/ws/lobby"; // Conecta via NGINX na porta 80

// Jogadores simulados
const alice = { id: 1, username: "Alice", color: 1 };
const bob = { id: 2, username: "Bob", color: 2 };
const charlie = { id: 3, username: "Charlie", color: 3 };

let createdRoomId = "";
let gameServerUrl = "";

function connectToGame(player) {
  console.log(
    `\n[${player.username}] Tentando conectar ao jogo em: ${gameServerUrl}`
  );
  const gameWs = new WebSocket(gameServerUrl);

  gameWs.on("open", () => {
    console.log(
      `[${player.username}] Conexão com o Jogo estabelecida! Enviando informações.`
    );
    // Informa ao game-server quem ele é
    gameWs.send(
      JSON.stringify({ type: "PLAYER_JOIN", payload: { player: player } })
    );
  });

  gameWs.on("message", (message) => {
    const data = JSON.parse(message);
    console.log(`[${player.username}] Recebeu do JOGO: ${data.type}`);
    if (data.type === "GAME_START" && player.id === 1) {
      // Apenas Alice faz a 1ª jogada
      console.log(
        `[${player.username}] O JOGO COMEÇOU! É minha vez. Jogando na coluna 4.`
      );
      gameWs.send(
        JSON.stringify({
          type: "MAKE_MOVE",
          payload: { roomId: createdRoomId, playerId: player.id, column: 4 },
        })
      );
    }
  });

  gameWs.on("error", (err) =>
    console.error(`[${player.username}] Erro no Jogo:`, err)
  );
  gameWs.on("close", () =>
    console.log(`[${player.username}] Desconectado do Jogo.`)
  );
}

// 1. Alice conecta ao Lobby para criar a sala
const lobbyWsAlice = new WebSocket(LOBBY_URL);
lobbyWsAlice.on("open", () => {
  console.log("[Alice] Conectada ao Lobby. Pedindo para criar sala...");
  lobbyWsAlice.send(
    JSON.stringify({ type: "CREATE_ROOM", payload: { creator: alice } })
  );
});

lobbyWsAlice.on("message", (message) => {
  const data = JSON.parse(message);
  console.log(`[Alice] Recebeu do LOBBY: ${data.type}`);

  if (data.type === "ROOM_CREATED") {
    createdRoomId = data.payload.roomId;
    gameServerUrl = data.payload.gameServerUrl;

    // Alice recebeu a URL, agora ela pode se conectar ao jogo
    connectToGame(alice);
    lobbyWsAlice.close(); // O trabalho de Alice no lobby acabou

    // 2. Bob conecta ao Lobby para entrar na sala
    setTimeout(() => {
      const lobbyWsBob = new WebSocket(LOBBY_URL);
      lobbyWsBob.on("open", () => {
        console.log(
          `\n[Bob] Conectado ao Lobby. Pedindo para entrar na sala ${createdRoomId}...`
        );
        lobbyWsBob.send(
          JSON.stringify({
            type: "JOIN_ROOM",
            payload: { roomId: createdRoomId },
          })
        );
      });
      lobbyWsBob.on("message", (bobMsg) => {
        const bobData = JSON.parse(bobMsg);
        if (bobData.type === "JOIN_REDIRECT") {
          connectToGame(bob);
          lobbyWsBob.close();
        }
      });
    }, 1500);

    // 3. Charlie faz o mesmo
    setTimeout(() => {
      const lobbyWsCharlie = new WebSocket(LOBBY_URL);
      lobbyWsCharlie.on("open", () => {
        console.log(
          `\n[Charlie] Conectado ao Lobby. Pedindo para entrar na sala ${createdRoomId}...`
        );
        lobbyWsCharlie.send(
          JSON.stringify({
            type: "JOIN_ROOM",
            payload: { roomId: createdRoomId },
          })
        );
      });
      lobbyWsCharlie.on("message", (charlieMsg) => {
        const charlieData = JSON.parse(charlieMsg);
        if (charlieData.type === "JOIN_REDIRECT") {
          connectToGame(charlie);
          lobbyWsCharlie.close();
        }
      });
    }, 3000);
  }
});
