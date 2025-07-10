import { Request, Response } from "express";
import User from "../models/userModel";
import jwt from "jsonwebtoken";
import { validateUsername, validatePassword } from "../utils/validation";

const JWT_SECRET = process.env.JWT_SECRET as string;

// Função auxiliar para gerar token e definir o cookie
const generateTokenAndSetCookie = (
  res: Response,
  userId: number,
  username: string
) => {
  const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "1h" });
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600 * 1000, // 1 hora
  });
};

export const register = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { username, password } = req.body;
  
  // --- INÍCIO DA VALIDAÇÃO ---
  // 1. Chama a função que valida o NOME DE USUÁRIO (comprimento, letras, números).
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.isValid) {
    // Se for inválido, retorna a mensagem de erro específica.
    return res.status(400).json({ message: usernameValidation.message });
  }

  // 2. Chama a função que valida a SENHA (comprimento).
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    // Se for inválida, retorna a mensagem de erro específica.
    return res.status(400).json({ message: passwordValidation.message });
  }
  // --- FIM DA VALIDAÇÃO ---

  try {
    const existingUser = await User.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({ message: "Usuário já existe." });
    }
    const newUser = await User.create({ username, password });
    generateTokenAndSetCookie(res, newUser.id, newUser.username);
    return res.status(201).json({
      message: "Usuário registrado e logado com sucesso!",
      user: { userId: newUser.id, username: newUser.username },
    });
  } catch (error) {
    console.error("Erro no registro:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

export const login = async (req: Request, res: Response): Promise<Response> => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Usuário e senha são obrigatórios." });
  }

  try {
    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }
    const isMatch = await User.comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }
    generateTokenAndSetCookie(res, user.id, user.username);
    return res.json({
      message: "Login bem-sucedido!",
      userId: user.id,
      username: user.username,
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

export const logout = (req: Request, res: Response): Response => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  return res.status(200).json({ message: "Logout bem-sucedido." });
};

export const getAuthStatus = (req: Request, res: Response): Response => {
  // O middleware 'protect' já fez a validação. Se chegamos aqui, o usuário está autenticado.
  // As informações do usuário foram anexadas ao req.user pelo middleware.
  return res.status(200).json({
    isAuthenticated: true,
    user: req.user,
  });
};
