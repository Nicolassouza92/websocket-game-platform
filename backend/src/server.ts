import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import WebSocket from "ws";
import cookieParser from "cookie-parser";
import { parse } from "url";
import jwt, { JwtPayload } from "jsonwebtoken"; // Importe JwtPayload

import authRoutes from "./routes/authRoutes";
import roomRoutes from "./routes/roomRoutes";
import * as gameService from "./services/gameService";
import { Player } from "./game/state";

// --- Definição de Tipos e Interfaces ---
// Interface para o nosso payload JWT específico. É mais seguro que usar 'any' ou afirmações.
interface AuthPayload extends JwtPayload {
  userId: number;
  username: string;
}

// --- Configuração do Servidor Express ---
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET as string;

// --- Middlewares Essenciais ---
app.use(express.json());
// Usamos o middleware sem passar segredo, pois vamos parsear manualmente no upgrade.
app.use(cookieParser());

// --- Servir Arquivos Estáticos do Frontend ---
app.use(express.static(path.join(__dirname, "../../frontend/src")));

// --- Rota Principal para servir o index.html ---
// Quando alguém acessar a raiz do site ('/'), envie o arquivo index.html.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/src/index.html'));
});

// --- Rotas da API REST ---
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// --- Configuração do Servidor HTTP e WebSocket ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// --- Lógica de Conexão do WebSocket (CORRIGIDA) ---
server.on("upgrade", (request, socket, head) => {
  // Extrai o 'roomCode' da URL (ex: /ws?roomCode=ABCDEF)
  const { query } = parse(request.url || "", true);
  const roomCode = query.roomCode as string;

  // 1. Autenticação via Cookie
  // O cookie-parser não funciona automaticamente no 'upgrade', então fazemos manualmente.
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // A biblioteca 'cookie' é mais simples para este caso de uso.
  const token = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];

  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // 2. Validação do Token
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;

    // Verificação de tipo mais segura
    if (typeof decoded !== "object" || !decoded.userId || !decoded.username) {
      throw new Error("Token inválido");
    }

    const player: Player = { id: decoded.userId, username: decoded.username };

    // 3. Se tudo estiver OK, passa a conexão para o 'ws' Server
    wss.handleUpgrade(request, socket, head, (ws) => {
      // **A LÓGICA AGORA FICA AQUI DENTRO!**
      // Neste ponto, a conexão WebSocket (ws) foi estabelecida.
      console.log(
        `[Server] Cliente ${player.username} autenticado e conectando à sala ${roomCode}.`
      );

      // Chamamos o gameService com todos os dados que já temos em mãos.
      gameService.handlePlayerConnection(ws, roomCode, player);
    });
  } catch (error) {
    console.error("Falha na autenticação do WebSocket:", error);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});

// **NÃO PRECISAMOS MAIS DO wss.on('connection') SEPARADO**
// A lógica foi movida para dentro do handleUpgrade, que é o local correto.

// --- Iniciar o Servidor ---
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
