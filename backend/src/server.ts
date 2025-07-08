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
import historyRoutes from "./routes/historyRoutes"; // NOVO
import * as gameService from "./services/gameService";
import { Player } from "./game/state";

// --- Definição de Tipos e Interfaces ---
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
app.use(cookieParser());

// --- Servir Arquivos Estáticos do Frontend ---
// Isso servirá index.html, app.html, style.css, App.js, landing.js, etc.
app.use(express.static(path.join(__dirname, "../../frontend/src")));

// --- Rota Principal para servir o index.html (Página de boas-vindas) ---
// O express.static já faz isso por padrão, mas podemos ser explícitos.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/src/index.html"));
});

// A rota para /app.html será resolvida automaticamente pelo express.static

// --- Rotas da API REST ---
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/history", historyRoutes); // NOVO

// --- Configuração do Servidor HTTP e WebSocket ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// --- Lógica de Conexão do WebSocket (CORRIGIDA) ---
server.on("upgrade", (request, socket, head) => {
  const { query } = parse(request.url || "", true);
  const roomCode = query.roomCode as string;

  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  const token = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];

  if (!token) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;

    if (typeof decoded !== "object" || !decoded.userId || !decoded.username) {
      throw new Error("Token inválido");
    }

    const player: Player = { id: decoded.userId, username: decoded.username };

    wss.handleUpgrade(request, socket, head, (ws) => {
      console.log(
        `[Server] Cliente ${player.username} autenticado e conectando à sala ${roomCode}.`
      );
      gameService.handlePlayerConnection(ws, roomCode, player);
    });
  } catch (error) {
    console.error("Falha na autenticação do WebSocket:", error);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});

// --- Iniciar o Servidor ---
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
