import db from "../config/db";

// Não precisamos mais dos scripts de criação de tabela aqui, já que elas existem.

interface MatchHistoryRow {
  finished_at: string;
  winner_name: string | null;
  players: string; // Já vamos formatar os nomes dos jogadores na query
}

interface LeaderboardRow {
  username: string;
  wins: number;
}

const Match = {
  /**
   * Grava uma partida finalizada na sua tabela `match_history`.
   * Usa as colunas `winner_id` e o array `player_ids`.
   */
  async record(winnerId: number | null, playerIds: number[]): Promise<void> {
    const query = `
      INSERT INTO match_history (winner_id, player_ids)
      VALUES ($1, $2)
    `;
    try {
      // O PostgreSQL aceita um array de JS diretamente como `integer[]`
      await db.query(query, [winnerId, playerIds]);
      console.log(
        `[MatchModel] Partida gravada com sucesso na tabela match_history.`
      );
    } catch (error) {
      console.error("[MatchModel] Erro ao gravar partida:", error);
      throw error;
    }
  },

  /**
   * Busca as últimas partidas finalizadas da sua tabela `match_history`.
   * Esta query é mais complexa, pois precisa "desdobrar" o array `player_ids`
   * para buscar os nomes dos jogadores.
   */
  async getHistory(limit: number = 10): Promise<MatchHistoryRow[]> {
    const query = `
      WITH player_names AS (
        SELECT
          m.id AS match_id,
          STRING_AGG(u.username, ' vs. ' ORDER BY u.id) AS players
        FROM
          match_history m,
          -- UNNEST transforma o array de IDs em uma lista de linhas
          LATERAL UNNEST(m.player_ids) AS player_id
        JOIN
          users u ON u.id = player_id
        GROUP BY
          m.id
      )
      SELECT
        mh.finished_at,
        winner.username AS winner_name,
        pn.players
      FROM
        match_history mh
      LEFT JOIN
        users winner ON mh.winner_id = winner.id
      JOIN
        player_names pn ON mh.id = pn.match_id
      ORDER BY
        mh.finished_at DESC
      LIMIT $1;
    `;
    const { rows } = await db.query<MatchHistoryRow>(query, [limit]);
    return rows;
  },

  /**
   * Busca os jogadores com mais vitórias, usando sua tabela `match_history`.
   */
  async getLeaderboard(limit: number = 10): Promise<LeaderboardRow[]> {
    const query = `
      SELECT
          u.username,
          -- Contamos quantas vezes o ID do usuário aparece como winner_id
          COUNT(m.id)::int as wins
      FROM
          users u
      JOIN
          match_history m ON u.id = m.winner_id
      WHERE
          m.winner_id IS NOT NULL
      GROUP BY
          u.id, u.username
      ORDER BY
          wins DESC, u.username ASC
      LIMIT $1;
    `;
    const { rows } = await db.query<LeaderboardRow>(query, [limit]);
    return rows;
  },
};

export default Match;
