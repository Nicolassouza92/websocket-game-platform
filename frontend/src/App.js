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
    registerWrapper: document.getElementById("registerWrapper"),
    loginWrapper: document.getElementById("loginWrapper"),
    mainAppContainer: document.getElementById("mainAppContainer"),
    lobbyDashboard: document.getElementById("lobbyDashboard"),
    gameScreen: document.getElementById("gameScreen"),
    registerForm: document.getElementById("registerForm"),
    loginForm: document.getElementById("loginForm"),
    logoutBtn: document.getElementById("logoutBtn"),
    welcomeMessage: document.getElementById("welcomeMessage"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    refreshRoomsBtn: document.getElementById("refreshRoomsBtn"),
    roomList: document.getElementById("roomList"),
    personalHistoryContent: document.getElementById("personalHistoryContent"),
    leaderboardContent: document.getElementById("leaderboardContent"),
    userRank: document.getElementById("userRank"),
    gameInfo: document.getElementById("game-info"),
    playerListContent: document.getElementById("player-list-content"),
    gameBoard: document.getElementById("board"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatMessages: document.getElementById("chat-messages"),
    rematchContainer: document.getElementById("rematch-container"),
    rematchStatus: document.getElementById("rematch-status"),
    rematchAcceptBtn: document.getElementById("rematch-accept-btn"),
    rematchDeclineBtn: document.getElementById("rematch-decline-btn"),
    leaveRoomBtn: document.getElementById("leaveRoomBtn"),
    readyCheckModal: document.getElementById("readyCheckModal"),
    readyCheckStatus: document.getElementById("readyCheckStatus"),
    readyCheckBtn: document.getElementById("readyCheckBtn"),
    readyCheckDeclineBtn: document.getElementById("readyCheckDeclineBtn"),
  };

  let turnCountdownInterval = null;
  let rematchCountdownInterval = null;

  // =============================================
  // --- FUNÇÃO PARA CONTROLAR A VISÃO DE AUTH ---
  // =============================================
  function handleAuthView() {
    if (state.currentUser) return;
    const hash = window.location.hash || "#login";
    if (elements.registerWrapper && elements.loginWrapper) {
      elements.registerWrapper.classList.toggle("hidden", hash !== "#register");
      elements.loginWrapper.classList.toggle("hidden", hash !== "#login");
    }
  }

  // =============================================
  // --- FUNÇÃO CENTRAL DE RENDERIZAÇÃO ---
  // =============================================
  function render() {
    const { currentUser, currentRoom } = state;
    const isLoggedIn = !!currentUser;

    elements.authContainer.classList.toggle("hidden", isLoggedIn);
    elements.mainAppContainer.classList.toggle("hidden", !isLoggedIn);

    if (isLoggedIn) {
      elements.welcomeMessage.textContent = `Bem-vindo, ${currentUser.username}!`;
      const isInGame = !!currentRoom;

      elements.lobbyDashboard.classList.toggle("hidden", isInGame);
      elements.gameScreen.classList.toggle("hidden", !isInGame);
      elements.leaveRoomBtn.classList.toggle("hidden", !isInGame);

      if (isInGame) {
        // Lógica de renderização quando está DENTRO de um jogo
        renderPlayerList(currentRoom.players);
        renderBoard(currentRoom);

        const isReadyCheck = currentRoom.status === "readyCheck";
        elements.readyCheckModal.classList.toggle("hidden", !isReadyCheck);
        if (isReadyCheck) {
          renderReadyCheckUI(currentRoom);
        }

        renderGameInfo(currentRoom);

        if (currentRoom.status === "playing") {
          startTurnCountdown();
        } else {
          stopTurnCountdown();
        }

        if (currentRoom.status === "finished") {
          renderRematchUI(currentRoom);
        } else {
          elements.rematchContainer.classList.add("hidden");
          stopRematchCountdown();
        }
      } else {
        // Lógica de renderização quando está FORA de um jogo (no dashboard)
        stopTurnCountdown();
        stopRematchCountdown();
        elements.readyCheckModal.classList.add("hidden");
      }
    } else {
      stopTurnCountdown();
      handleAuthView();
    }
  }

  // =============================================
  // --- FUNÇÕES DE TIMER ---
  // =============================================
  function stopTurnCountdown() {
    if (turnCountdownInterval) {
      clearInterval(turnCountdownInterval);
      turnCountdownInterval = null;
    }
  }
  function startTurnCountdown() {
    if (turnCountdownInterval) return;
    turnCountdownInterval = setInterval(() => {
      if (state.currentRoom) renderGameInfo(state.currentRoom);
      else stopTurnCountdown();
    }, 1000);
  }
  function stopRematchCountdown() {
    if (rematchCountdownInterval) {
      clearInterval(rematchCountdownInterval);
      rematchCountdownInterval = null;
    }
  }
  function startRematchCountdown() {
    if (rematchCountdownInterval) return;
    rematchCountdownInterval = setInterval(() => {
      if (state.currentRoom) renderRematchUI(state.currentRoom);
      else stopRematchCountdown();
    }, 1000);
  }

  // =============================================
  // --- FUNÇÕES AUXILIARES DE RENDERIZAÇÃO ---
  // =============================================

  // --- Funções do Dashboard do Lobby ---
  function renderRoomList(rooms) {
    if (!elements.roomList) return;
    elements.roomList.innerHTML = "";
    if (!rooms || rooms.length === 0) {
      elements.roomList.innerHTML = "<p>Nenhuma sala disponível. Crie uma!</p>";
      return;
    }
    const statusTranslations = { waiting: "Aguardando" };
    rooms.forEach((room) => {
      const roomEl = document.createElement("div");
      roomEl.className = "room-item";
      const roomInfo = document.createElement("div");
      roomInfo.className = "room-info";
      const statusText = statusTranslations[room.status] || room.status;
      roomInfo.innerHTML = `
        <span class="room-name">Sala: <b>${room.roomCode}</b> (Host: ${room.hostName})</span>
        <span class="room-details">Jogadores: ${room.players.length}/3 | Status: ${statusText}</span>
      `;
      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Entrar";
      joinBtn.onclick = () => connectToGame(room.roomCode);
      roomEl.appendChild(roomInfo);
      roomEl.appendChild(joinBtn);
      elements.roomList.appendChild(roomEl);
    });
  }

  function renderPersonalHistory(matches) {
    if (!elements.personalHistoryContent) return;
    if (!matches || matches.length === 0) {
      elements.personalHistoryContent.innerHTML =
        '<tr><td colspan="2">Nenhuma partida jogada ainda.</td></tr>';
      return;
    }
    elements.personalHistoryContent.innerHTML = matches
      .map((match) => {
        let resultText, resultClass;
        if (match.winner_name === null) {
          resultText = "Empate";
          resultClass = "draw";
        } else if (match.is_winner) {
          resultText = "Vitória";
          resultClass = "win";
        } else {
          resultText = "Derrota";
          resultClass = "loss";
        }
        return `<tr><td>${match.players}</td><td class="${resultClass}">${resultText}</td></tr>`;
      })
      .join("");
  }

  function renderLeaderboard(data) {
    const { leaderboard, userRank } = data;
    if (elements.leaderboardContent) {
      if (!leaderboard || leaderboard.length === 0) {
        elements.leaderboardContent.innerHTML =
          '<tr><td colspan="3">O ranking está vazio.</td></tr>';
      } else {
        elements.leaderboardContent.innerHTML = leaderboard
          .map(
            (player, index) =>
              `<tr><td>#${index + 1}</td><td>${player.username}</td><td>${
                player.wins
              }</td></tr>`
          )
          .join("");
      }
    }
    if (elements.userRank) {
      if (userRank) {
        elements.userRank.innerHTML = `Sua Posição: <strong>#${userRank.rank}</strong> com <strong>${userRank.wins}</strong> vitórias.`;
        elements.userRank.classList.remove("hidden");
      } else {
        elements.userRank.classList.add("hidden");
      }
    }
  }

  // --- Funções da Tela de Jogo ---
  function renderGameInfo(roomState) {
    if (!elements.gameInfo) return;
    const hideGameInfo = ["finished", "readyCheck"].includes(roomState.status);
    elements.gameInfo.classList.toggle("hidden", hideGameInfo);
    if (roomState.status === "waiting") {
      elements.gameInfo.textContent = `Aguardando jogadores... (${roomState.players.length}/3)`;
    } else if (roomState.status === "playing") {
      const currentPlayerId =
        roomState.playerOrder[roomState.currentPlayerIndex];
      const currentPlayer = roomState.players.find(
        (p) => p.id === currentPlayerId
      );
      const isMyTurn =
        state.currentUser && currentPlayerId === state.currentUser.userId;
      let timerText = "";
      if (roomState.turnEndsAt) {
        const timeLeft = Math.max(
          0,
          Math.round((roomState.turnEndsAt - Date.now()) / 1000)
        );
        const seconds = String(timeLeft).padStart(2, "0");
        timerText = ` (Tempo: ${seconds}s)`;
      }
      if (isMyTurn) {
        elements.gameInfo.textContent = `É a sua vez!${timerText}`;
      } else if (currentPlayer) {
        elements.gameInfo.textContent = `Aguardando a jogada de ${currentPlayer.username}...${timerText}`;
      } else {
        elements.gameInfo.textContent = `Aguardando...${timerText}`;
      }
    } else if (roomState.status === "finished") {
      stopTurnCountdown();
      const allPlayersInMatch = roomState.players.filter((p) =>
        roomState.playerOrderHistory.includes(p.id)
      );
      const winner = allPlayersInMatch.find((p) => p.id === roomState.winner);
      let finishMessage;
      if (winner) {
        finishMessage = `O vencedor é ${winner.username}!`;
      } else if (roomState.winner === null) {
        finishMessage = "O jogo terminou em empate!";
      }
      elements.rematchStatus.textContent = finishMessage;
    }
  }

  function renderPlayerList(players) {
    if (!elements.playerListContent) return;
    elements.playerListContent.innerHTML = "";
    players.forEach((player) => {
      const playerEl = document.createElement("div");
      const statusIcon = player.isOnline ? "🟢" : "🔴";
      playerEl.innerHTML = `${statusIcon} ${player.username}`;
      elements.playerListContent.appendChild(playerEl);
    });
  }

  function renderBoard(roomState) {
    const { board, playerOrderHistory } = roomState;
    if (!elements.gameBoard || !board || !board[0]) return;
    const oldPieces = new Map();
    elements.gameBoard.querySelectorAll(".piece").forEach((p) => {
      const cell = p.parentElement;
      const key = `${cell.dataset.row}-${cell.dataset.column}`;
      oldPieces.set(key, true);
    });
    elements.gameBoard.innerHTML = "";
    elements.gameBoard.style.gridTemplateColumns = `repeat(${board[0].length}, 1fr)`;
    const orderForColoring =
      playerOrderHistory.length > 0
        ? playerOrderHistory
        : roomState.playerOrder;
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
          const playerIndex = orderForColoring.indexOf(cellValue);
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

  function renderReadyCheckUI(roomState) {
    if (!elements.readyCheckModal) return;
    const { readyVotes, players } = roomState;
    const myVote = readyVotes.includes(state.currentUser.userId);
    const votesCount = readyVotes.length;
    const totalPlayers = players.length;
    elements.readyCheckStatus.textContent = `Jogadores Prontos: ${votesCount}/${totalPlayers}`;
    elements.readyCheckBtn.disabled = myVote;
    elements.readyCheckBtn.textContent = myVote
      ? "Aguardando outros..."
      : "Estou Pronto!";
  }

  function renderRematchUI(roomState) {
    elements.rematchContainer.classList.remove("hidden");
    startRematchCountdown();
    const { rematchVotes, rematchVoteEndsAt, players } = roomState;
    const myVote = rematchVotes.includes(state.currentUser.userId);
    let timerText = "";
    if (rematchVoteEndsAt) {
      const timeLeft = Math.max(
        0,
        Math.round((rematchVoteEndsAt - Date.now()) / 1000)
      );
      timerText = `Tempo para votar: ${String(timeLeft).padStart(2, "0")}s`;
    }
    const votesCount = rematchVotes.length;
    const totalPlayers = players.length;
    elements.rematchStatus.textContent = `${timerText}  |  Votos: ${votesCount}/${totalPlayers}`;
    elements.rematchAcceptBtn.disabled = myVote;
    elements.rematchDeclineBtn.disabled = myVote;
    elements.rematchAcceptBtn.textContent = myVote
      ? "Aguardando outros..."
      : "Jogar Novamente";
  }

  // =============================================
  // --- FUNÇÕES DE API E LÓGICA DE DADOS ---
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
    await loadLobbyData();
    render();
  }

  async function fetchRooms() {
    try {
      const rooms = await apiRequest("/rooms");
      state.availableRooms = rooms;
      renderRoomList(state.availableRooms);
    } catch (error) {
      if (elements.roomList)
        elements.roomList.innerHTML = "<p>Erro ao carregar salas.</p>";
    }
  }

  async function fetchPersonalHistory() {
    try {
      const history = await apiRequest("/history/personal");
      renderPersonalHistory(history);
    } catch (error) {
      if (elements.personalHistoryContent)
        elements.personalHistoryContent.innerHTML =
          '<tr><td colspan="2">Erro ao carregar histórico.</td></tr>';
    }
  }

  async function fetchLeaderboard() {
    try {
      const data = await apiRequest("/history/leaderboard-personal");
      renderLeaderboard(data);
    } catch (error) {
      if (elements.leaderboardContent)
        elements.leaderboardContent.innerHTML =
          '<tr><td colspan="3">Erro ao carregar ranking.</td></tr>';
    }
  }

  async function loadLobbyData() {
    if (elements.roomList) elements.roomList.innerHTML = "<p>Carregando...</p>";
    if (elements.personalHistoryContent)
      elements.personalHistoryContent.innerHTML =
        '<tr><td colspan="2">Carregando...</td></tr>';
    if (elements.leaderboardContent)
      elements.leaderboardContent.innerHTML =
        '<tr><td colspan="3">Carregando...</td></tr>';

    await Promise.all([
      fetchRooms(),
      fetchPersonalHistory(),
      fetchLeaderboard(),
    ]);
  }

  function connectToGame(roomCode) {
    if (state.socket) state.socket.close();
    localStorage.setItem("currentRoomCode", roomCode);
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    state.socket = new WebSocket(`${protocol}//${host}?roomCode=${roomCode}`);

    state.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const { type, payload } = data;
      switch (type) {
        case "ERROR":
          showSnackbar(`Erro do servidor: ${payload.message}`, "error");
          if (
            payload.message.includes("encontrada") ||
            payload.message.includes("cheia")
          ) {
            state.socket?.close();
          }
          break;
        case "GAME_STATE_UPDATE":
          state.currentRoom = payload.gameState;
          render();
          if (payload.gameState.status === "readyCheck") {
            showSnackbar(
              "Sala cheia! Todos devem confirmar para começar.",
              "info"
            );
          }
          break;
        case "NEW_MESSAGE":
          displayChatMessage(payload.username, payload.text);
          break;
        case "ROOM_CLOSED":
          showSnackbar(payload.message, "error", 5000);
          break;
        case "INFO_MESSAGE":
          showSnackbar(payload.message, "info", 5000);
          break;
        default:
          console.warn(`Tipo de mensagem não tratada: ${type}`);
      }
    };

    state.socket.onclose = async () => {
      showSnackbar("Retornando ao lobby.");
      state.socket = null;
      state.currentRoom = null;
      localStorage.removeItem("currentRoomCode");
      await loadLobbyData(); // Recarrega os dados do lobby ao sair de uma sala
      render();
    };
  }

  function showSnackbar(message, type = "info", duration = 4000) {
    const container = document.getElementById("snackbar-container");
    if (!container) return;
    const existingSnackbar = container.querySelector(".snackbar");
    if (existingSnackbar) existingSnackbar.remove();
    const snackbar = document.createElement("div");
    snackbar.className = `snackbar ${type}`;
    snackbar.textContent = message;
    container.appendChild(snackbar);
    requestAnimationFrame(() => {
      snackbar.classList.add("show");
    });
    setTimeout(() => {
      snackbar.classList.remove("show");
      snackbar.addEventListener("transitionend", () => snackbar.remove());
    }, duration);
  }

  // =============================================
  // --- EVENT LISTENERS ---
  // =============================================
  elements.registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await apiRequest("/auth/register", "POST", {
        username: e.target.username.value,
        password: e.target.password.value,
      });
      await handleLoginSuccess(data);
    } catch (error) {
      showSnackbar(`Erro no registro: ${error.message}`, "error");
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
      showSnackbar(`Falha no login: ${error.message}`, "error");
    }
  });

  elements.logoutBtn.addEventListener("click", async () => {
    try {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
      }
      await apiRequest("/auth/logout", "POST");
    } catch (error) {
      console.error("Erro na API de logout:", error);
    } finally {
      if (state.socket) {
        state.socket.onclose = null; // Evita que o onclose padrão seja chamado
        state.socket.close();
      }
      state.currentUser = null;
      state.currentRoom = null;
      localStorage.removeItem("currentRoomCode");
      render();
    }
  });

  elements.leaveRoomBtn.addEventListener("click", () => {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
    }
  });

  elements.createRoomBtn.addEventListener("click", async () => {
    try {
      const data = await apiRequest("/rooms", "POST");
      connectToGame(data.roomCode);
    } catch (error) {
      showSnackbar(`Não foi possível criar a sala: ${error.message}`, "error");
    }
  });

  elements.refreshRoomsBtn.addEventListener("click", loadLobbyData);

  function handleColumnClick(column) {
    if (state.socket && state.currentRoom?.status === "playing") {
      const currentPlayerId =
        state.currentRoom.playerOrder[state.currentRoom.currentPlayerIndex];
      if (state.currentUser && currentPlayerId === state.currentUser.userId) {
        state.socket.send(
          JSON.stringify({ type: "MAKE_MOVE", payload: { column } })
        );
      } else {
        showSnackbar("Aguarde o seu turno para jogar!");
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

  elements.readyCheckBtn.addEventListener("click", () => {
    if (state.socket) state.socket.send(JSON.stringify({ type: "VOTE_READY" }));
  });

  elements.readyCheckDeclineBtn.addEventListener("click", () => {
    if (state.socket) state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
  });

  elements.rematchAcceptBtn.addEventListener("click", () => {
    if (state.socket)
      state.socket.send(JSON.stringify({ type: "VOTE_REMATCH" }));
  });

  elements.rematchDeclineBtn.addEventListener("click", () => {
    if (state.socket) state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
  });

  // =============================================
  // --- INICIALIZAÇÃO DA APLICAÇÃO ---
  // =============================================
  async function initializeApp() {
    try {
      const data = await apiRequest("/auth/status");
      if (data.isAuthenticated) {
        state.currentUser = data.user;
        const lastRoomCode = localStorage.getItem("currentRoomCode");
        if (lastRoomCode) {
          connectToGame(lastRoomCode);
        } else {
          await loadLobbyData();
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

  window.addEventListener("hashchange", handleAuthView);
  initializeApp();
});
