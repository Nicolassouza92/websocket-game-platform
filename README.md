
<p align="center">
  <img width="44" height="42" alt="logo" src="https://github.com/user-attachments/assets/3c3e9969-1215-42d0-aa4f-73cf5e85292f" />
</p>
<h2 align="center">
  3 em Linha - Plataforma de Jogo Multiplayer
</h2>


<p align="center">
  <img src="https://img.shields.io/badge/status-em%20desenvolvimento-yellow" alt="Status do Projeto">
  <img src="https://img.shields.io/badge/javascript-ES6%2B-yellow?logo=javascript&logoColor=white" alt="JavaScript">
  <img src="https://img.shields.io/badge/typescript-5.4-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/node.js-20.x-green?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/express.js-4.x-orange?logo=express&logoColor=white" alt="Express.js">
  <img src="https://img.shields.io/badge/postgresql-15-blue?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/docker-configurado-blue?logo=docker&logoColor=white" alt="Docker">
</p>

## 📋 Tabela de Conteúdos

- [Visão Geral do Projeto](#-visão-geral-do-projeto)
- [Principais Funcionalidades](#-principais-funcionalidades)
- [Tecnologias Utilizadas](#️-tecnologias-utilizadas)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Como Executar o Projeto](#-como-executar-o-projeto)
- [Demonstração Visual](#️-demonstração-visual)
- [Próximos Passos](#-próximos-passos)
- [Autor](#-autor)

## ✨ Visão Geral do Projeto

A plataforma "3 em Linha" reinventa o jogo de estratégia, aumentando o desafio ao incluir um terceiro jogador. O objetivo é ser o primeiro a alinhar três das suas peças na horizontal, vertical ou diagonal. O projeto foi construído como um monólito, com uma clara separação entre as responsabilidades do frontend e do backend, comunicando-se através de uma API REST para ações de autenticação e gerenciamento de salas, e WebSockets para a comunicação em tempo real durante as partidas.

## 🚀 Principais Funcionalidades

### 🔐 Autenticação de Usuários
- Sistema seguro de registro e login com senhas criptografadas (bcrypt)
- Gerenciamento de sessão com JSON Web Tokens (JWT) em cookies

### 🏛️ Lobby Interativo
- Visualização de salas de jogo disponíveis
- Criação de novas salas de jogo
- Histórico pessoal das últimas partidas jogadas
- Ranking com os melhores jogadores

### 🎮 Gameplay em Tempo Real
- Partidas para até 3 jogadores
- Lógica do jogo e validação de movimentos executada no servidor
- Atualização do estado do jogo para todos os jogadores na sala via WebSockets

### 💬 Chat na Sala
- Comunicação em tempo real entre os jogadores da mesma sala

### 🔄 Sistema de Revanche
- Ao final de uma partida, os jogadores podem votar para jogar novamente

### ⏰ Controle de Inatividade
- Jogadores inativos são removidos da partida após um determinado número de turnos

### 🔄 Reconexão
- Jogadores que perdem a conexão têm um tempo para retornar à partida

### 📱 Responsividade
- Interface adaptada para uma boa experiência tanto em desktops quanto em dispositivos móveis

## 🛠️ Tecnologias Utilizadas

| Categoria | Tecnologia |
|-----------|------------|
| **Backend** | Node.js, TypeScript, Express.js, PostgreSQL, WebSocket (ws), JWT, bcryptjs |
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Dev** | Docker, Docker Compose, Nginx |
| **Utilitários** | dotenv, ts-node-dev |

## 📁 Estrutura do Projeto

```
/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Controladores (lógica das rotas)
│   │   ├── game/             # Lógica e estado do jogo
│   │   ├── middleware/       # Middlewares do Express
│   │   ├── models/           # Modelos de dados e interação com o DB
│   │   ├── routes/           # Definição das rotas da API
│   │   ├── services/         # Lógica de negócio (orquestração)
│   │   ├── types/            # Tipos e interfaces customizadas
│   │   └── server.ts         # Ponto de entrada do servidor
│   ├── Dockerfile            # Configuração do container do backend
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── css/              # Arquivos de estilo
│   │   ├── img/              # Imagens e assets
│   │   ├── js/               # Scripts do cliente
│   │   ├── index.html        # Página principal
│   │   ├── lobby.html        # Página do lobby/autenticação
│   │   └── game.html         # Página do jogo
│
├── .env.example              # Exemplo de arquivo de variáveis de ambiente
├── docker-compose.yml        # Orquestração dos containers
└── nginx.conf                # Configuração do Nginx
```

## 🚀 Como Executar o Projeto

Você pode executar este projeto de duas maneiras: utilizando Docker (método recomendado para simplicidade) ou configurando o ambiente localmente.

### Pré-requisitos

- Node.js (versão 20.x ou superior)
- Docker e Docker Compose
- PostgreSQL (apenas para o setup local)

### 🐳 Executando com Docker (Recomendado)

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/Nicolassouza92/websocket-game-platform
   cd websocket-game-platform
   ```

2. **Configure as Variáveis de Ambiente:**
   - Renomeie o arquivo `.env.example` para `.env`
   - Preencha as variáveis de ambiente no arquivo `.env`:
   ```ini
   # .env
   PORT=3000
   DB_USER=seu_usuario_db
   DB_PASSWORD=sua_senha_db
   DB_HOST=db # Importante: use o nome do serviço do docker-compose
   DB_PORT=5432
   DB_NAME=seu_nome_db
   JWT_SECRET=seu_segredo_super_secreto
   URL_DB=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
   ```

3. **Inicie os containers:**
   ```bash
   docker-compose up --build
   ```
   > O comando `--build` garante que as imagens serão reconstruídas caso haja alguma alteração nos Dockerfiles.

4. **Acesse a aplicação:**
   - Abra seu navegador e acesse `http://localhost`

### 💻 Executando Localmente (Sem Docker)

#### Backend

1. **Navegue até a pasta do backend:**
   ```bash
   cd backend
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure o banco de dados:**
   - Certifique-se de que você tem uma instância do PostgreSQL rodando
   - Crie um banco de dados com o nome que você definiu em `.env`
   - Execute o script `init.sql` para criar as tabelas necessárias

4. **Configure as Variáveis de Ambiente:**
   - Crie um arquivo `.env` na pasta `backend/` e preencha com as suas credenciais:
   ```ini
   # backend/.env
   DB_HOST=localhost # Mude para 'localhost' no setup local
   # ... outras variáveis
   ```

5. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   > O servidor backend estará rodando em `http://localhost:3000`

#### Frontend

 **Sirva os arquivos estáticos:**

> **Importante:** A comunicação com a API e WebSocket do backend já está configurada para funcionar a partir da mesma origem, então não são necessários proxies no modo de desenvolvimento local sem Docker.

## 🖼️ Demonstração Visual

### Tela Inicial
<img width="1317" height="605" alt="telainicial do jogo" src="https://github.com/user-attachments/assets/fb32a325-341e-4adb-b032-5f5d01bd320a" />
<img width="1310" height="583" alt="comojogar" src="https://github.com/user-attachments/assets/68f482cf-b1c6-4146-b184-8c625f8bbd75" />

### Tela de Autenticação: Login e Registro
<img width="521" height="513" alt="registro" src="https://github.com/user-attachments/assets/d64d194b-f498-4f5b-8ac6-d1aa7ae0d323" />
<img width="532" height="486" alt="login" src="https://github.com/user-attachments/assets/6b910b93-1bde-47ba-b48c-6935fbac2742" />

### Lobby Principal: Listagem de salas, histórico e ranking
<img width="1354" height="640" alt="lobby-salas" src="https://github.com/user-attachments/assets/a47d1445-8aaa-49b3-9cfb-9f3a8973f559" />

### Tela de Jogo: Tabuleiro, chat e lista de jogadores em tempo real
<img width="1317" height="619" alt="salas" src="https://github.com/user-attachments/assets/8ada3cc4-60f1-4d08-9fcb-4a65d968ce25" />



## 👨‍💻 Autor
## Nicolas Souza  
[![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Nicolassouza92)

## Alexsander Nunes  
[![GitHub](https://img.shields.io/badge/github-%23121011.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Alenes200)

---
