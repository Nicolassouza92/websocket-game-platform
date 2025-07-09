import db from "../config/db";

interface PublicMatchHistoryRow {
  finished_at: string;
  winner_name: string | null;
  players: string;
}

// Interface para a resposta do leaderboard, que agora pode incluir o ranking do usuário
interface LeaderboardResponse {
  leaderboard: LeaderboardRow[];
  userRank?: UserRankRow | null;
}

interface UserRankRow extends LeaderboardRow {
  rank: string; // O rank vem como string do banco
}

interface MatchHistoryRow {
  finished_at: string;
  winner_name: string | null;
  players: string;
  is_winner: boolean; // Para saber se o usuário atual foi o vencedor
}

interface LeaderboardRow {
  username: string;
  wins: number;
}

const Match = {
  async record(winnerId: number | null, playerIds: number[]): Promise<void> {
    const query = `
      INSERT INTO match_history (winner_id, player_ids)
      VALUES ($1, $2)
    `;
    try {
      await db.query(query, [winnerId, playerIds]);
      console.log(
        `[MatchModel] Partida gravada com sucesso na tabela match_history.`
      );
    } catch (error) {
      console.error("[MatchModel] Erro ao gravar partida:", error);
      throw error;
    }
  },

  async getPersonalHistory(
    userId: number,
    limit: number = 6
  ): Promise<MatchHistoryRow[]> {
    const query = `
      WITH player_names AS (
        SELECT
          m.id AS match_id,
          STRING_AGG(u.username, ' vs. ' ORDER BY u.id) AS players
        FROM
          match_history m,
          LATERAL UNNEST(m.player_ids) AS player_id
        JOIN
          users u ON u.id = player_id
        GROUP BY
          m.id
      )
      SELECT
        mh.finished_at,
        winner.username AS winner_name,
        pn.players,
        (mh.winner_id = $1) as is_winner
      FROM
        match_history mh
      LEFT JOIN
        users winner ON mh.winner_id = winner.id
      JOIN
        player_names pn ON mh.id = pn.match_id
      WHERE
        mh.player_ids @> ARRAY[$1]::integer[]
      ORDER BY
        mh.finished_at DESC
      LIMIT $2;
    `;
    const { rows } = await db.query<MatchHistoryRow>(query, [userId, limit]);
    return rows;
  },

  async getLeaderboard(
    limit: number = 5,
    userId?: number
  ): Promise<LeaderboardResponse> {
    const leaderboardQuery = `
      SELECT
          u.username,
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
    const { rows: leaderboard } = await db.query<LeaderboardRow>(
      leaderboardQuery,
      [limit]
    );

    let userRank: UserRankRow | null = null;
    if (userId) {
      const userRankQuery = `
        WITH user_wins AS (
          SELECT
            u.id,
            u.username,
            COUNT(m.id)::int as wins
          FROM
            users u
          LEFT JOIN
            match_history m ON u.id = m.winner_id AND m.winner_id IS NOT NULL
          GROUP BY
            u.id, u.username
        ),
        ranked_users AS (
            SELECT 
                id,
                username,
                wins,
                RANK() OVER (ORDER BY wins DESC) as rank
            FROM user_wins
        )
        SELECT * FROM ranked_users WHERE id = $1;
      `;
      const { rows: userRankRows } = await db.query<UserRankRow>(
        userRankQuery,
        [userId]
      );
      if (userRankRows.length > 0) {
        userRank = userRankRows[0];
      }
    }

    return { leaderboard, userRank };
  },
  async getPublicHistory(limit: number = 5): Promise<PublicMatchHistoryRow[]> {
    const query = `
      WITH player_names AS (
        SELECT
          m.id AS match_id,
          STRING_AGG(u.username, ' vs. ' ORDER BY u.id) AS players
        FROM
          match_history m,
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
    const { rows } = await db.query<PublicMatchHistoryRow>(query, [limit]);
    return rows;
  },
};

export default Match;
