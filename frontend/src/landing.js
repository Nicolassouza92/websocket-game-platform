// frontend/src/landing.js
document.addEventListener("DOMContentLoaded", () => {
  const matchHistoryBody = document.getElementById("match-history-body");
  const leaderboardBody = document.getElementById("leaderboard-body");

  async function apiRequest(endpoint) {
    try {
      // A rota base é /api/history
      const response = await fetch(`/api/history${endpoint}`);
      if (!response.ok) {
        throw new Error(`Erro de rede: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Falha ao buscar dados de ${endpoint}:`, error);
      return []; // Retorna um array vazio em caso de erro
    }
  }

  function renderMatchHistory(matches) {
    if (!matchHistoryBody) return;

    if (matches.length === 0) {
      matchHistoryBody.innerHTML =
        '<tr><td colspan="3">Nenhuma partida recente encontrada.</td></tr>';
      return;
    }

    matchHistoryBody.innerHTML = matches
      .map(
        (match) => `
      <tr>
        <td>${new Date(match.finished_at).toLocaleDateString("pt-BR")}</td>
        <td>${match.players || "Jogadores desconhecidos"}</td>
        <td>${
          match.winner_name
            ? `<span class="winner">${match.winner_name}</span>`
            : "Empate"
        }</td>
      </tr>
    `
      )
      .join("");
  }

  function renderLeaderboard(leaders) {
    if (!leaderboardBody) return;

    if (leaders.length === 0) {
      leaderboardBody.innerHTML =
        '<tr><td colspan="2">Nenhum vencedor no ranking ainda.</td></tr>';
      return;
    }

    leaderboardBody.innerHTML = leaders
      .map(
        (leader) => `
      <tr>
        <td>${leader.username}</td>
        <td><span class="winner">${leader.wins}</span></td>
      </tr>
    `
      )
      .join("");
  }

  async function loadPageData() {
    // Chama as novas rotas PÚBLICAS
    const [matches, leaders] = await Promise.all([
      apiRequest("/matches-public"),
      apiRequest("/leaderboard-public"),
    ]);
    renderMatchHistory(matches);
    renderLeaderboard(leaders);
  }

  loadPageData();
});
