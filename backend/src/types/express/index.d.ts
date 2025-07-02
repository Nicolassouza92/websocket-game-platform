// Importe os tipos que você vai usar, se necessário.
// Por enquanto, podemos deixar um tipo genérico.
interface UserPayload {
  userId: number;
  username: string;
}

// Estende a interface Request do Express
declare global {
  namespace Express {
    export interface Request {
      user?: UserPayload;
    }
  }
}

// Adicione esta linha se o TypeScript reclamar que o arquivo não é um módulo
export {};