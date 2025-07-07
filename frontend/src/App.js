document.addEventListener("DOMContentLoaded", () => {
  // --- Estado da Aplicação (a "memória" do frontend) ---
  const state = {
    currentUser: null,
    currentRoom: null,
    availableRooms: [],
    socket: null,
  };

  // --- Referências aos Elementos da UI ---
  const elements = {
    authContainer: document.getElementById("authContainer"),
    mainAppContainer: document.getElementById("mainAppContainer"),
    lobby: document.getElementById("lobby"),
    gameScreen: document.getElementById("gameScreen"),
    registerForm: document.getElementById("registerForm"),
    loginForm: document.getElementById("loginForm"),
    logoutBtn: document.getElementById("logoutBtn"),
    welcomeMessage: document.getElementById("welcomeMessage"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    refreshRoomsBtn: document.getElementById("refreshRoomsBtn"),
    roomList: document.getElementById("roomList"),
    gameInfo: document.getElementById("game-info"),
    playerListContent: document.getElementById("player-list-content"),
    gameBoard: document.getElementById("board"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatMessages: document.getElementById("chat-messages"),
  };

  // =============================================
  // --- FUNÇÃO CENTRAL DE RENDERIZAÇÃO ---
  // =============================================
  function render() {
    const { currentUser, currentRoom, availableRooms } = state;
    const isLoggedIn = !!currentUser;

    elements.authContainer.classList.toggle("hidden", isLoggedIn);
    elements.mainAppContainer.classList.toggle("hidden", !isLoggedIn);

    if (isLoggedIn) {
      elements.welcomeMessage.textContent = `Bem-vindo, ${currentUser.username}!`;
      const isInGame = !!currentRoom;
      elements.lobby.classList.toggle("hidden", isInGame);
      elements.gameScreen.classList.toggle("hidden", !isInGame);

      if (isInGame) {
        renderGameInfo(currentRoom);
        renderPlayerList(currentRoom.players);
        renderBoard(currentRoom.board);
      } else {
        renderRoomList(availableRooms);
      }
    }
  }

  // =============================================
  // --- FUNÇÕES AUXILIARES DE RENDERIZAÇÃO ---
  // =============================================

  function renderRoomList(rooms) {
    elements.roomList.innerHTML = "";
    if (!rooms || rooms.length === 0) {
      elements.roomList.innerHTML = "<p>Nenhuma sala disponível. Crie uma!</p>";
    } else {
      rooms.forEach((room) => {
        const roomEl = document.createElement("div");
        roomEl.innerHTML = `<span>Sala: <b>${room.roomCode}</b> - Jogadores: ${room.players.length}/3 (${room.status})</span>`;
        const joinBtn = document.createElement("button");
        joinBtn.textContent = "Entrar";
        joinBtn.onclick = () => connectToGame(room.roomCode);
        roomEl.appendChild(joinBtn);
        elements.roomList.appendChild(roomEl);
      });
    }
  }

  function renderGameInfo(roomState) {
    if (!elements.gameInfo) return;
    if (roomState.status === "waiting") {
      elements.gameInfo.textContent = `Aguardando jogadores... (${roomState.players.length}/3)`;
    } else if (roomState.status === "playing") {
      const currentPlayer = roomState.players[roomState.currentPlayerIndex];
      if (
        state.currentUser &&
        currentPlayer &&
        currentPlayer.id === state.currentUser.userId
      ) {
        elements.gameInfo.textContent = "É a sua vez!";
      } else if (currentPlayer) {
        elements.gameInfo.textContent = `Aguardando a jogada de ${currentPlayer.username}...`;
      }
    } else if (roomState.status === "finished") {
      const winner = roomState.players.find((p) => p.id === roomState.winner);
      elements.gameInfo.textContent = winner
        ? `O vencedor é ${winner.username}!`
        : "O jogo empatou!";
    }
  }

  function renderPlayerList(players) {
    if (!elements.playerListContent) return;
    elements.playerListContent.innerHTML = "";
    players.forEach((player) => {
      const playerEl = document.createElement("div");
      // NOVO: Mostra o status online/offline
      const statusIcon = player.isOnline ? "🟢" : "🔴";
      playerEl.innerHTML = `${statusIcon} ${player.username}`;
      elements.playerListContent.appendChild(playerEl);
    });
  }

  function renderBoard(board) {
    if (!elements.gameBoard || !board || !board[0]) return;

    const oldPieces = new Map();
    elements.gameBoard.querySelectorAll(".piece").forEach((p) => {
      const cell = p.parentElement;
      const key = `${cell.dataset.row}-${cell.dataset.column}`;
      oldPieces.set(key, true);
    });

    elements.gameBoard.innerHTML = "";
    elements.gameBoard.style.gridTemplateColumns = `repeat(${board[0].length}, 1fr)`;

    board.forEach((row, r) => {
      row.forEach((cellValue, c) => {
        const cell = document.createElement("div");
        cell.classList.add("cell");
        cell.dataset.row = r.toString();
        cell.dataset.column = c.toString();
        cell.addEventListener("click", () => handleColumnClick(c));

        if (cellValue !== null) {
          const piece = document.createElement("div");
          piece.classList.add("piece");

          const playerIndex = state.currentRoom.players.findIndex(
            (p) => p.id === cellValue
          );
          if (playerIndex !== -1) {
            piece.classList.add(`player${playerIndex + 1}`);
          }

          const key = `${r}-${c}`;
          if (!oldPieces.has(key)) {
            piece.classList.add("piece-dropped");
          }

          cell.appendChild(piece);
        }
        elements.gameBoard.appendChild(cell);
      });
    });
  }

  function displayChatMessage(username, text) {
    if (!elements.chatMessages || !state.currentUser) return;
    const messageWrapper = document.createElement("div");
    messageWrapper.classList.add("chat-message-wrapper");

    const messageBubble = document.createElement("div");
    messageBubble.classList.add("message-bubble");

    if (username === state.currentUser.username) {
      messageWrapper.classList.add("my-message");
      messageBubble.innerHTML = `<p class="message-content">${text}</p>`;
    } else {
      messageWrapper.classList.add("other-message");
      messageBubble.innerHTML = `<span class="message-author">${username}</span><p class="message-content">${text}</p>`;
    }

    messageWrapper.appendChild(messageBubble);
    elements.chatMessages.appendChild(messageWrapper);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  // =============================================
  // --- LÓGICA DE API E EVENTOS ---
  // =============================================

  async function apiRequest(endpoint, method = "GET", body = null) {
    try {
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body) options.body = JSON.stringify(body);
      const response = await fetch(`/api${endpoint}`, options);
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.message || "Erro de rede");
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      console.error(`Falha na requisição para ${endpoint}:`, error);
      throw error;
    }
  }

  async function handleLoginSuccess(userData) {
    state.currentUser = userData.user || {
      userId: userData.userId,
      username: userData.username,
    };
    await fetchRooms();
  }

  elements.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await apiRequest("/auth/register", "POST", {
        username: e.target.username.value,
        password: e.target.password.value,
      });
      await handleLoginSuccess(data);
    } catch (error) {
      alert(`Erro no registro: ${error.message}`);
    }
  });

  elements.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await apiRequest("/auth/login", "POST", {
        username: e.target.username.value,
        password: e.target.password.value,
      });
      await handleLoginSuccess(data);
    } catch (error) {
      alert(`Falha no login: ${error.message}`);
    }
  });

  elements.logoutBtn.addEventListener("click", async () => {
    try {
      await apiRequest("/auth/logout", "POST");
      if (state.socket) state.socket.close();
      state.currentUser = null;
      state.currentRoom = null;
      // *** LIMPA A MEMÓRIA DA SESSÃO NO LOGOUT ***
      sessionStorage.removeItem("currentRoomCode");
      render();
    } catch (error) {
      /* Silencioso */
    }
  });

  elements.createRoomBtn.addEventListener("click", async () => {
    try {
      const data = await apiRequest("/rooms", "POST");
      connectToGame(data.roomCode);
    } catch (error) {
      alert(`Não foi possível criar a sala: ${error.message}`);
    }
  });

  async function fetchRooms() {
    try {
      const rooms = await apiRequest("/rooms");
      state.availableRooms = rooms;
      render();
    } catch (error) {
      /* Silencioso se não estiver autenticado */
    }
  }
  elements.refreshRoomsBtn.addEventListener("click", fetchRooms);

  function handleColumnClick(column) {
    if (state.socket && state.currentRoom?.status === "playing") {
      const currentPlayer =
        state.currentRoom.players[state.currentRoom.currentPlayerIndex];
      if (
        currentPlayer &&
        state.currentUser &&
        currentPlayer.id === state.currentUser.userId
      ) {
        state.socket.send(
          JSON.stringify({ type: "MAKE_MOVE", payload: { column } })
        );
      } else {
        alert("Aguarde o seu turno para jogar!");
      }
    }
  }

  if (elements.chatForm) {
    elements.chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const messageText = elements.chatInput.value.trim();
      if (messageText && state.socket) {
        state.socket.send(
          JSON.stringify({
            type: "SEND_CHAT_MESSAGE",
            payload: { text: messageText },
          })
        );
        elements.chatInput.value = "";
      }
    });
  }

  function connectToGame(roomCode) {
    if (state.socket) state.socket.close();

    sessionStorage.setItem("currentRoomCode", roomCode);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    state.socket = new WebSocket(`${protocol}//${host}?roomCode=${roomCode}`);

    state.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const { type, payload } = data;

      switch (type) {
        case "ERROR":
          alert(`Erro do servidor: ${payload.message}`);
          if (
            payload.message.includes("encontrada") ||
            payload.message.includes("cheia")
          ) {
            state.socket?.close();
          }
          break;
        case "GAME_START":
        case "PLAYER_JOINED":
        case "PLAYER_LEFT":
        case "GAME_STATE_UPDATE":
        case "PLAYER_RECONNECTED":
        case "PLAYER_STATUS_UPDATE":
          state.currentRoom = payload.gameState;
          render();
          break;
        case "NEW_MESSAGE":
          displayChatMessage(payload.username, payload.text);
          break;
        case "ROOM_CLOSED":
          alert(payload.message);
          state.socket?.close(); // Aciona o onclose, que limpa o estado e renderiza o lobby
          break;
        default:
          console.warn(`Tipo de mensagem não tratada: ${type}`);
      }
    };

    state.socket.onclose = () => {
      console.log("A conexão com a sala foi fechada.");
      alert("A conexão com a sala foi fechada.");
      state.socket = null;
      state.currentRoom = null;
      sessionStorage.removeItem("currentRoomCode"); // Limpa a memória
      render(); // Volta para a tela de lobby
      fetchRooms(); // **ATUALIZA A LISTA DE SALAS PARA TODOS**
    };
  }

  async function initializeApp() {
    try {
      const data = await apiRequest("/auth/status");
      if (data.isAuthenticated) {
        state.currentUser = data.user;

        // *** AQUI ESTÁ A LÓGICA DE RECONEXÃO ***
        const lastRoomCode = sessionStorage.getItem("currentRoomCode");

        if (lastRoomCode) {
          // Se encontramos uma sala na memória, tentamos nos reconectar a ela.
          console.log(`Tentando reconectar à sala anterior: ${lastRoomCode}`);
          connectToGame(lastRoomCode);
        } else {
          // Se não, carregamos o lobby normalmente.
          await fetchRooms();
          render();
        }
      } else {
        state.currentUser = null;
        render();
      }
    } catch (error) {
      state.currentUser = null;
      render();
    }
  }

  initializeApp();
});
