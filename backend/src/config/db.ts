import { Pool } from "pg";

// Cria uma nova instância do Pool. O Pool gerencia um conjunto de conexões
// com o banco de dados, reutilizando-as para melhorar a performance.
// Ele lê as credenciais automaticamente das variáveis de ambiente (process.env)
// que o 'dotenv/config' carregou no server.ts.
const pool = new Pool({
  connectionString: process.env.URL_DB,
});

pool.on("connect", () => {
  console.log("Conectado ao PostgreSQL com sucesso!");
});

pool.on("error", (err: Error) => {
  console.error("Erro inesperado no cliente ocioso do PostgreSQL", err);
  process.exit(-1);
});

export default pool;