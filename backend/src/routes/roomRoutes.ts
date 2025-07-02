import express from "express";
import * as roomController from "../controllers/roomController"; // Criaremos a seguir
import { protect } from "../middleware/authHttpMiddleware";

const router = express.Router();

// A rota para criar uma sala (`/api/rooms`)
router.post("/", protect, roomController.createRoom);

// A rota para listar as salas disponíveis (`/api/rooms`)
router.get("/", protect, roomController.getAllRooms);

export default router;