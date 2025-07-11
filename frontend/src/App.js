document.addEventListener("DOMContentLoaded", () => {
  // --- Estado da Aplicação ---
  const state = {
    currentUser: null,
    currentRoom: null,
    availableRooms: [],
    socket: null,
  };

  let isLeavingIntentionally = false;

  // --- Referências aos Elementos da UI ---
  const elements = {
    // Elementos do Lobby/Auth
    authContainer: document.getElementById("authContainer"),
    registerWrapper: document.getElementById("registerWrapper"),
    loginWrapper: document.getElementById("loginWrapper"),
    lobbyDashboard: document.getElementById("lobbyDashboard"),
    registerForm: document.getElementById("registerForm"),
    registerUsernameInput: document.querySelector(
      "#registerForm input[name='username']"
    ),
    registerPasswordInput: document.querySelector(
      "#registerForm input[name='password']"
    ),
    usernameFeedback: document.getElementById("username-feedback"),
    passwordFeedback: document.getElementById("password-feedback"),
    loginForm: document.getElementById("loginForm"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    refreshRoomsBtn: document.getElementById("refreshRoomsBtn"),
    roomList: document.getElementById("roomList"),
    personalHistoryContent: document.getElementById("personalHistoryContent"),
    leaderboardContent: document.getElementById("leaderboardContent"),
    userRank: document.getElementById("userRank"),

    // Elementos do Jogo
    gameScreen: document.getElementById("gameScreen"),
    gameInfo: document.getElementById("game-info"),
    playerListContent: document.getElementById("player-list-content"),
    gameBoard: document.getElementById("board"),
    chatForm: document.getElementById("chat-form"),
    chatInput: document.getElementById("chat-input"),
    chatMessages: document.getElementById("chat-messages"),
    leaveRoomBtn: document.getElementById("leaveRoomBtn"),
    readyCheckModal: document.getElementById("readyCheckModal"),
    readyCheckStatus: document.getElementById("readyCheckStatus"),
    readyCheckBtn: document.getElementById("readyCheckBtn"),
    readyCheckDeclineBtn: document.getElementById("readyCheckDeclineBtn"),
    rematchModal: document.getElementById("rematchModal"),
    rematchWinnerStatus: document.getElementById("rematchWinnerStatus"),
    rematchVoteStatus: document.getElementById("rematchVoteStatus"),
    rematchModalAcceptBtn: document.getElementById("rematchModalAcceptBtn"),
    rematchModalDeclineBtn: document.getElementById("rematchModalDeclineBtn"),
    roomNameDisplay: document.getElementById("roomNameDisplay"),
    playerListToggle: document.getElementById("playerListToggle"),

    // Elementos Comuns
    mainAppContainer: document.getElementById("mainAppContainer"),
    logoutBtn: document.getElementById("logoutBtn"),
    welcomeMessage: document.getElementById("welcomeMessage"),
  };

  let turnCountdownInterval = null;
  let rematchCountdownInterval = null;
  let pingInterval = null;

  // =============================================
  // --- NAVEGAÇÃO E LÓGICA DE PÁGINA ---
  // =============================================
  function goToGame(roomCode) {
    localStorage.setItem("currentRoomCode", roomCode);
    window.location.href = "game.html";
  }

  function goToLobby() {
    localStorage.removeItem("currentRoomCode");
    window.location.href = "lobby.html";
  }

  function handleAuthView() {
    if (state.currentUser || !elements.registerWrapper) return;
    const hash = window.location.hash || "#login";
    elements.registerWrapper.classList.toggle("hidden", hash !== "#register");
    elements.loginWrapper.classList.toggle("hidden", hash !== "#login");
  }

  // =============================================
  // --- FUNÇÃO CENTRAL DE RENDERIZAÇÃO (CORRIGIDA) ---
  // =============================================
  function render() {
    const { currentUser, currentRoom } = state;
    const isLoggedIn = !!currentUser;

    if (!elements.mainAppContainer) return; // Sai se não for uma página da app

    // Lógica de visibilidade geral
    if (elements.authContainer) {
      elements.authContainer.classList.toggle("hidden", isLoggedIn);
    }
    elements.mainAppContainer.classList.toggle("hidden", !isLoggedIn);

    if (isLoggedIn) {
      elements.welcomeMessage.textContent = `Bem-vindo, ${currentUser.username}!`;
    }

    // Lógica específica para a PÁGINA DE LOBBY
    if (elements.lobbyDashboard) {
      if (!isLoggedIn) {
        handleAuthView();
      } else {
        renderRoomList(state.availableRooms);
      }
    }

    // Lógica específica para a PÁGINA DE JOGO
    if (elements.gameScreen) {
      const isInGame = !!currentRoom;
      elements.gameScreen.style.display = isInGame ? "flex" : "none";

      if (elements.leaveRoomBtn)
        elements.leaveRoomBtn.classList.toggle("hidden", !isInGame);

      if (isInGame) {
        renderPlayerList(currentRoom.players);
        renderBoard(currentRoom);
        renderGameInfo(currentRoom);

        if (elements.roomNameDisplay) {
          elements.roomNameDisplay.textContent = `Sala: ${currentRoom.roomCode}`;
          elements.roomNameDisplay.classList.remove("hidden");
        }

        const isReadyCheck = currentRoom.status === "readyCheck";
        if (elements.readyCheckModal)
          elements.readyCheckModal.classList.toggle("hidden", !isReadyCheck);
        if (isReadyCheck) renderReadyCheckUI(currentRoom);

        const isFinished = currentRoom.status === "finished";
        if (elements.rematchModal)
          elements.rematchModal.classList.toggle("hidden", !isFinished);
        if (isFinished) renderRematchModalUI(currentRoom);
        else stopRematchCountdown();

        if (currentRoom.status === "playing") startTurnCountdown();
        else stopTurnCountdown();
      } else {
        // Mostra uma tela de "Conectando..." ou similar se não estiver no jogo ainda
        // (pode ser aprimorado no futuro)
      }
    }
  }

  // =============================================
  // --- TIMERS, RENDER HELPERS, API, WEBSOCKET ---
  // --- (sem mudanças a partir daqui) ---
  // =============================================

  function stopTurnCountdown() {
    if (turnCountdownInterval) {
      clearInterval(turnCountdownInterval);
      turnCountdownInterval = null;
    }
  }
  function stopPing() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
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
      if (state.currentRoom && state.currentRoom.status === "finished") {
        renderRematchModalUI(state.currentRoom);
      } else {
        stopRematchCountdown();
      }
    }, 1000);
  }

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
      roomInfo.innerHTML = `<span class="room-name">Sala: <b>${room.roomCode}</b> (Host: ${room.hostName})</span><span class="room-details">Jogadores: ${room.players.length}/3 | Status: ${statusText}</span>`;
      const joinBtn = document.createElement("button");
      joinBtn.textContent = "Entrar";
      joinBtn.onclick = () => goToGame(room.roomCode);
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
    }
  }
  function renderPlayerList(players) {
    if (!elements.playerListContent) return;
    elements.playerListContent.innerHTML = "";
    const wins = state.currentRoom.sessionWins || {};
    players.forEach((player) => {
      const playerEl = document.createElement("div");
      const statusIcon = player.isOnline ? "🟢" : "🔴";
      const playerWins = wins[player.id];
      let winCounterHTML = "";
      if (playerWins > 0) {
        winCounterHTML = `<span class="win-counter">🏆 ${playerWins}</span>`;
      }
      playerEl.innerHTML = `${statusIcon} ${player.username} ${winCounterHTML}`;
      elements.playerListContent.appendChild(playerEl);
    });
  }
  function renderBoard(roomState) {
    if (!elements.gameBoard || !roomState.board || !roomState.board[0]) return;
    const { board, playerOrderHistory } = roomState;
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

  // Cria o parágrafo para o conteúdo da mensagem de forma segura
  const contentP = document.createElement("p");
  contentP.classList.add("message-content");
  contentP.innerText = text; // <-- A MUDANÇA CRUCIAL: usa innerText

  if (username === state.currentUser.username) {
    // Para as próprias mensagens, só precisamos do conteúdo
    messageWrapper.classList.add("my-message");
    messageBubble.appendChild(contentP);
  } else {
    // Para mensagens de outros, adicionamos o nome do autor primeiro
    messageWrapper.classList.add("other-message");

    // Cria o span para o nome do autor de forma segura
    const authorSpan = document.createElement("span");
    authorSpan.classList.add("message-author");
    authorSpan.innerText = username; // <-- Seguro

    messageBubble.appendChild(authorSpan);
    messageBubble.appendChild(contentP);
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
  function renderRematchModalUI(roomState) {
    if (!elements.rematchModal) return;
    startRematchCountdown();
    const { rematchVotes, rematchVoteEndsAt, players, winner } = roomState;
    const myVote = rematchVotes.includes(state.currentUser.userId);
    if (winner === state.currentUser.userId) {
      elements.rematchWinnerStatus.textContent = "Você ganhou, parabéns!";
    } else if (winner === null) {
      elements.rematchWinnerStatus.textContent = "O jogo terminou em empate!";
    } else {
      const winnerPlayer = players.find((p) => p.id === winner);
      elements.rematchWinnerStatus.textContent = winnerPlayer
        ? `O vencedor é ${winnerPlayer.username}!`
        : "Fim de jogo!";
    }
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
    elements.rematchVoteStatus.textContent = `${timerText}  |  Votos: ${votesCount}/${totalPlayers}`;
    elements.rematchModalAcceptBtn.disabled = myVote;
    elements.rematchModalDeclineBtn.disabled = myVote;
    elements.rematchModalAcceptBtn.textContent = myVote
      ? "Aguardando outros..."
      : "Jogar Novamente";
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
  function connectToGame(roomCode) {
    if (state.socket) state.socket.close();
    stopPing();
    isLeavingIntentionally = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    //state.socket = new WebSocket(`${protocol}//${host}?roomCode=${roomCode}`);
    state.socket = new WebSocket(`${protocol}//${host}/ws?roomCode=${roomCode}`);
    state.socket.onopen = () => {
      pingInterval = setInterval(() => {
        // Envia o ping apenas se a conexão ainda estiver aberta
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
          state.socket.send(JSON.stringify({ type: "PING" }));
        }
      }, 15000); // 15 segundos
    };
    state.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const { type, payload } = data;
      switch (type) {
        case "ERROR":
          showSnackbar(`Erro: ${payload.message}`, "error");
          const isFatalError =
            payload.message.includes("encontrada") ||
            payload.message.includes("cheia") ||
            payload.message.includes("finalizado") ||
            payload.message.includes("aceitando");
          if (isFatalError) {
            showSnackbar("Retornando ao lobby...", "info", 2000);
            setTimeout(goToLobby, 2000);
          }
          break;
        case "GAME_STATE_UPDATE":
          state.currentRoom = payload.gameState;
          render();
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
    state.socket.onclose = () => {
      stopPing();
      if (isLeavingIntentionally) {
        goToLobby();
      } else {
        showSnackbar(
          "Conexão perdida. Recarregue a página para reconectar.",
          "error",
          10000
        );
        state.socket = null;
        state.currentRoom = null;
        render();
      }
    };
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
    if (!elements.roomList) return;
    try {
      const rooms = await apiRequest("/rooms");
      state.availableRooms = rooms;
      renderRoomList(state.availableRooms);
    } catch (error) {
      elements.roomList.innerHTML = "<p>Erro ao carregar salas.</p>";
    }
  }
  async function fetchPersonalHistory() {
    if (!elements.personalHistoryContent) return;
    try {
      const history = await apiRequest("/history/personal");
      renderPersonalHistory(history);
    } catch (error) {
      elements.personalHistoryContent.innerHTML =
        '<tr><td colspan="2">Erro ao carregar histórico.</td></tr>';
    }
  }
  async function fetchLeaderboard() {
    if (!elements.leaderboardContent) return;
    try {
      const data = await apiRequest("/history/leaderboard-personal");
      renderLeaderboard(data);
    } catch (error) {
      elements.leaderboardContent.innerHTML =
        '<tr><td colspan="3">Erro ao carregar ranking.</td></tr>';
    }
  }
  async function loadLobbyData() {
    if (!elements.lobbyDashboard) return;
    await Promise.all([
      fetchRooms(),
      fetchPersonalHistory(),
      fetchLeaderboard(),
    ]);
  }
  function showSnackbar(message, type = "info", duration = 4000) {
    const container = document.getElementById("snackbar-container");
    if (!container) return;
    const snackbar = document.createElement("div");
    snackbar.className = `snackbar ${type} show`;
    snackbar.textContent = message;
    container.appendChild(snackbar);
    setTimeout(() => {
      snackbar.classList.remove("show");
      snackbar.addEventListener("transitionend", () => snackbar.remove());
    }, duration);
  }

  // --- EVENT LISTENERS ---
  if (elements.registerForm) {
    elements.registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const isUsernameValid = validateFrontendUsername();
      const isPasswordValid = validateFrontendPassword();
      if (!isUsernameValid || !isPasswordValid) {
        showSnackbar("Por favor, corrija os erros no formulário.", "error");
        return;
      }
      try {
        const data = await apiRequest("/auth/register", "POST", {
          username: elements.registerUsernameInput.value,
          password: elements.registerPasswordInput.value,
        });
        await handleLoginSuccess(data);
      } catch (error) {
        showSnackbar(`Erro no registro: ${error.message}`, "error");
      }
    });
  }
  if (elements.loginForm) {
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
  }
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", async () => {
      isLeavingIntentionally = true;
      try {
        if (state.socket && state.socket.readyState === WebSocket.OPEN)
          state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
        await apiRequest("/auth/logout", "POST");
      } catch (error) {
        console.error("Erro na API de logout:", error);
      } finally {
        if (state.socket) {
          state.socket.onclose = null;
          state.socket.close();
        }
        state.currentUser = null;
        goToLobby();
      }
    });
  }
  if (elements.leaveRoomBtn) {
    elements.leaveRoomBtn.addEventListener("click", () => {
      isLeavingIntentionally = true;
      if (state.socket && state.socket.readyState === WebSocket.OPEN)
        state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
    });
  }
  if (elements.createRoomBtn) {
    elements.createRoomBtn.addEventListener("click", async () => {
      try {
        const data = await apiRequest("/rooms", "POST");
        goToGame(data.roomCode);
      } catch (error) {
        showSnackbar(
          `Não foi possível criar a sala: ${error.message}`,
          "error"
        );
      }
    });
  }
  if (elements.refreshRoomsBtn) {
    elements.refreshRoomsBtn.addEventListener("click", loadLobbyData);
  }
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
  if (elements.readyCheckBtn) {
    elements.readyCheckBtn.addEventListener("click", () => {
      if (state.socket)
        state.socket.send(JSON.stringify({ type: "VOTE_READY" }));
    });
  }
  if (elements.readyCheckDeclineBtn) {
    elements.readyCheckDeclineBtn.addEventListener("click", () => {
      isLeavingIntentionally = true;
      if (state.socket)
        state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
    });
  }
  if (elements.rematchModalAcceptBtn) {
    elements.rematchModalAcceptBtn.addEventListener("click", () => {
      if (state.socket)
        state.socket.send(JSON.stringify({ type: "VOTE_REMATCH" }));
    });
  }
  if (elements.rematchModalDeclineBtn) {
    elements.rematchModalDeclineBtn.addEventListener("click", () => {
      isLeavingIntentionally = true;
      if (state.socket)
        state.socket.send(JSON.stringify({ type: "LEAVE_ROOM" }));
    });
  }
  if (elements.playerListToggle) {
    elements.playerListToggle.addEventListener("click", () => {
      if (elements.playerListContent) {
        elements.playerListContent.classList.toggle("collapsed");
        elements.playerListToggle.classList.toggle("expanded");
      }
    });
  }
  if (elements.registerUsernameInput) {
    elements.registerUsernameInput.addEventListener(
      "input",
      validateFrontendUsername
    );
  }
  if (elements.registerPasswordInput) {
    elements.registerPasswordInput.addEventListener(
      "input",
      validateFrontendPassword
    );
  }

  // --- FUNÇÕES DE VALIDAÇÃO DO FRONTEND ---
  function validateFrontendUsername() {
    if (!elements.registerUsernameInput) return true;
    const username = elements.registerUsernameInput.value;
    const feedbackEl = elements.usernameFeedback;
    if (username.length > 0 && (username.length < 7 || username.length > 10)) {
      feedbackEl.textContent = "Deve ter entre 7 e 10 caracteres.";
      feedbackEl.className = "form-feedback";
      return false;
    }
    if (
      username.length > 0 &&
      !(/[a-zA-Z]/.test(username) && /[0-9]/.test(username))
    ) {
      feedbackEl.textContent = "Deve conter letras e números.";
      feedbackEl.className = "form-feedback";
      return false;
    }
    if (username.length > 0) {
      feedbackEl.textContent = "Usuário válido!";
      feedbackEl.className = "form-feedback valid";
    } else {
      feedbackEl.textContent = "";
    }
    return true;
  }
  function validateFrontendPassword() {
    if (!elements.registerPasswordInput) return true;
    const password = elements.registerPasswordInput.value;
    const feedbackEl = elements.passwordFeedback;
    if (password.length > 0 && !/[A-Z]/.test(password)) {
      feedbackEl.textContent = "Deve conter ao menos uma letra maiúscula.";
      feedbackEl.className = "form-feedback";
      return false;
    }
    if (password.length > 0 && !/[0-9]/.test(password)) {
      feedbackEl.textContent = "Deve conter ao menos um número.";
      feedbackEl.className = "form-feedback";
      return false;
    }
    if (password.length > 0 && password.length < 8) {
      feedbackEl.textContent = "A senha deve ter no mínimo 8 caracteres.";
      feedbackEl.className = "form-feedback";
      return false;
    }
    if (password.length > 0) {
      feedbackEl.textContent = "Senha segura!";
      feedbackEl.className = "form-feedback valid";
    } else {
      feedbackEl.textContent = "";
    }
    return true;
  }

  // --- FUNÇÃO DE INICIALIZAÇÃO DA APLICAÇÃO ---
  async function initializeApp() {
    try {
      const data = await apiRequest("/auth/status");
      if (data.isAuthenticated) {
        state.currentUser = data.user;
        const roomCodeFromStorage = localStorage.getItem("currentRoomCode");
        if (elements.gameScreen) {
          if (roomCodeFromStorage) {
            connectToGame(roomCodeFromStorage);
          } else {
            goToLobby();
          }
        } else if (elements.lobbyDashboard) {
          if (roomCodeFromStorage) {
            goToGame(roomCodeFromStorage);
          } else {
            await loadLobbyData();
            render();
          }
        }
      } else {
        if (elements.gameScreen) {
          goToLobby();
        } else {
          state.currentUser = null;
          render();
        }
      }
    } catch (error) {
      state.currentUser = null;
      render();
    }
  }

  window.addEventListener("hashchange", handleAuthView);
  initializeApp();
});
