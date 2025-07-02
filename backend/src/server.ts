import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import WebSocket from "ws";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes";
import roomRoutes from "./routes/roomRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares Essenciais ---
app.use(express.json()); // Para parsear o corpo de requisições JSON
app.use(cookieParser()); // Para parsear cookies

// --- Servir Arquivos Estáticos do Frontend ---
// Isso assume que sua pasta 'frontend' está no mesmo nível da pasta 'backend'
app.use(express.static(path.join(__dirname, "../../frontend/dist"))); // Servindo a pasta 'dist' do frontend

// --- Rotas da API REST ---
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// --- Configuração do Servidor HTTP e WebSocket ---
const server = http.createServer(app);
const wss = new (WebSocket as any).Server({ noServer: true });

// A lógica do WebSocket virá aqui nas próximas etapas, no evento 'upgrade'
// e na inicialização do gameService.

// --- Iniciar o Servidor ---
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});