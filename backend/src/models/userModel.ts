import db from "../config/db";
import bcrypt from "bcryptjs";

// Interfaces para tipagem
export interface UserRecord {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date;
}

interface UserCreationData {
  username: string;
  password?: string;
}

const User = {
  /**
   * Busca um usuário no banco de dados pelo seu nome de usuário.
   */
  async findByUsername(username: string): Promise<UserRecord | undefined> {
    const query = "SELECT * FROM users WHERE username = $1";
    const { rows } = await db.query<UserRecord>(query, [username]);
    return rows[0];
  },

  /**
   * Cria um novo usuário no banco de dados.
   */
  async create({ username, password }: UserCreationData): Promise<UserRecord> {
    if (!password) {
      throw new Error("Senha é obrigatória para criar usuário.");
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const query = `
      INSERT INTO users (username, password_hash)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const { rows } = await db.query<UserRecord>(query, [username, passwordHash]);
    return rows[0];
  },

  /**
   * Compara uma senha em texto plano com um hash armazenado.
   */
  async comparePassword(candidatePassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, passwordHash);
  },
};

export default User;