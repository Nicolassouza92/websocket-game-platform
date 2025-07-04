document.addEventListener("DOMContentLoaded", () => {
  // --- Estado da Aplicação (a "memória" do frontend) ---
  const state = {
    currentUser: null, // { userId, username }
    currentRoom: null, // O estado completo da sala de jogo
    availableRooms: [], // Lista de salas do lobby
    socket: null, // A conexão WebSocket ativa
  };

  // --- Referências aos Elementos da UI ---
  const elements = {
    authSection: document.getElementById("authSection"),
    appSection: document.getElementById("appSection"),
    welcomeMessage: document.getElementById("welcomeMessage"),
    registerForm: document.getElementById("registerForm"),
    loginForm: document.getElementById("loginForm"),
    logoutBtn: document.getElementById("logoutBtn"),
    lobby: document.getElementById("lobby"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    refreshRoomsBtn: document.getElementById("refreshRoomsBtn"),
    roomList: document.getElementById("roomList"),
    game: document.getElementById("game"),
    gameRoomCode: document.getElementById("gameRoomCode"),
    gamePlayers: document.getElementById("gamePlayers"),
    gameStatus: document.getElementById("gameStatus"),
    gameBoard: document.getElementById("gameBoard"),
  };

  // --- Função Central de Renderização ---
  function render() {
    const { currentUser, currentRoom, availableRooms } = state;
    const isLoggedIn = !!currentUser;

    elements.authSection.classList.toggle("hidden", isLoggedIn);
    elements.appSection.classList.toggle("hidden", !isLoggedIn);

    if (isLoggedIn) {
      elements.welcomeMessage.textContent = `Bem-vindo, ${currentUser.username}!`;
      const isInGame = !!currentRoom;
      elements.lobby.classList.toggle("hidden", isInGame);
      elements.game.classList.toggle("hidden", !isInGame);

      if (isInGame) {
        elements.gameRoomCode.textContent = currentRoom.roomCode;
        elements.gamePlayers.textContent = currentRoom.players
          .map((p) => p.username)
          .join(", ");
        elements.gameStatus.textContent = currentRoom.status;
        renderBoard(currentRoom.board);
      } else {
        elements.roomList.innerHTML = "";
        if (availableRooms.length === 0) {
          elements.roomList.innerHTML =
            "<p>Nenhuma sala disponível. Crie uma!</p>";
        } else {
          availableRooms.forEach((room) => {
            const roomEl = document.createElement("div");
            roomEl.style.cssText =
              "display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;";
            roomEl.innerHTML = `<span>Sala: ${room.roomCode} - Jogadores: ${room.players.length}/3 (${room.status})</span>`;
            const joinBtn = document.createElement("button");
            joinBtn.textContent = "Entrar";
            joinBtn.onclick = () => connectToGame(room.roomCode);
            roomEl.appendChild(joinBtn);
            elements.roomList.appendChild(roomEl);
          });
        }
      }
    }
  }

  function renderBoard(board) {
    elements.gameBoard.innerHTML = "";
    if (!board || !board[0]) return;
    elements.gameBoard.style.gridTemplateColumns = `repeat(${board[0].length}, 1fr)`;
    board.forEach((row, r) => {
      row.forEach((cellValue, c) => {
        const cell = document.createElement("div");
        cell.classList.add("cell");
        cell.dataset.column = c.toString();
        if (cellValue !== null) {
          const piece = document.createElement("div");
          piece.classList.add("piece", `player${cellValue}`);
          cell.appendChild(piece);
        }
        cell.addEventListener("click", () => handleColumnClick(c));
        elements.gameBoard.appendChild(cell);
      });
    });
  }

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

  // --- Lógica de Autenticação ---
  async function handleLoginSuccess(userData) {
    state.currentUser = userData.user || {
      userId: userData.userId,
      username: userData.username,
    };
    try {
      const rooms = await apiRequest("/rooms");
      state.availableRooms = rooms;
    } catch (error) {
      console.error("Não foi possível buscar as salas após o login.", error);
      state.availableRooms = [];
    }
    render();
  }

  elements.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    try {
      const data = await apiRequest("/auth/register", "POST", {
        username,
        password,
      });
      await handleLoginSuccess(data);
    } catch (error) {
      alert(`Erro no registro: ${error.message}`);
    }
  });

  elements.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;
    try {
      const data = await apiRequest("/auth/login", "POST", {
        username,
        password,
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
      render();
    } catch (error) {
      /* Silencioso no logout */
    }
  });

  // --- Lógica do Jogo ---
  elements.createRoomBtn.addEventListener("click", async () => {
    try {
      const data = await apiRequest("/rooms", "POST");
      connectToGame(data.roomCode);
    } catch (error) {
      alert(`Não foi possível criar a sala: ${error.message}`);
    }
  });

  elements.refreshRoomsBtn.addEventListener("click", fetchRooms);

  async function fetchRooms() {
    try {
      const rooms = await apiRequest("/rooms");
      state.availableRooms = rooms;
      render();
    } catch (error) {
      // Se falhar (ex: token expirou), a lógica de inicialização vai lidar com o deslogue.
    }
  }

  function handleColumnClick(column) {
    if (
      state.socket &&
      state.currentRoom &&
      state.currentRoom.status === "playing"
    ) {
      state.socket.send(
        JSON.stringify({ type: "MAKE_MOVE", payload: { column } })
      );
    }
  }

  function connectToGame(roomCode) {
    if (state.socket) {
      state.socket.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    state.socket = new WebSocket(`${protocol}//${host}?roomCode=${roomCode}`);

    state.socket.onopen = () => {
      console.log(`WebSocket conectado à sala ${roomCode}`);
    };

    state.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("Mensagem WS recebida:", data);

      // --- LÓGICA DE TRATAMENTO DE ERRO CORRIGIDA ---
      if (data.type === "ERROR") {
        // Apenas mostra o alerta. NÃO fecha a sala nem leva para o lobby.
        alert(`Erro do servidor: ${data.payload.message}`);
        // Se o erro for "Sala não encontrada", aí sim podemos tomar uma ação drástica.
        if (data.payload.message.includes("encontrada")) {
          state.socket?.close(); // Aciona o onclose que limpa a UI
        }
        return; // Para a execução para não processar o resto.
      }

      // Se não for um erro, atualiza o estado do jogo.
      if (data.payload.gameState) {
        state.currentRoom = data.payload.gameState;
        render(); // Renderiza o novo estado.
      }
    };

    state.socket.onclose = () => {
      console.log("Desconectado da sala.");
      alert("A conexão com a sala foi fechada.");
      state.socket = null;
      state.currentRoom = null;
      render(); // Volta para a tela de lobby
    };
  }

  // --- Verificação Inicial ---
  async function initializeApp() {
    try {
      const data = await apiRequest("/auth/status");
      if (data.isAuthenticated) {
        await handleLoginSuccess({ user: data.user });
      }
    } catch (error) {
      // Se a requisição de status falhar (ex: 401), o estado de usuário
      // permanece nulo, o que é o comportamento correto.
      state.currentUser = null;
    } finally {
      // Sempre renderiza a UI no final, com o estado que foi determinado.
      render();
    }
  }

  initializeApp();
});
