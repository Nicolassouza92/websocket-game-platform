// backend/src/utils/validation.ts

// Interface para um retorno de validação padronizado
interface ValidationResult {
  isValid: boolean;
  message?: string;
}

/**
 * Valida o nome de usuário de acordo com as regras especificadas.
 * - Comprimento: entre 7 e 10 caracteres.
 * - Conteúdo: deve conter letras e números.
 * @param username O nome de usuário a ser validado.
 * @returns Um objeto ValidationResult.
 */
export const validateUsername = (username: string): ValidationResult => {
  if (!username) {
    return { isValid: false, message: "O nome de usuário é obrigatório." };
  }
  if (username.length < 7 || username.length > 10) {
    return {
      isValid: false,
      message: "O nome de usuário deve ter entre 7 e 10 caracteres.",
    };
  }
  const hasLetter = /[a-zA-Z]/.test(username);
  const hasNumber = /[0-9]/.test(username);
  if (!hasLetter || !hasNumber) {
    return {
      isValid: false,
      message: "O nome de usuário deve conter letras e números.",
    };
  }
  return { isValid: true };
};

/**
 * Valida a senha.
 * - Comprimento: mínimo de 8 caracteres.
 * (Você pode adicionar mais regras aqui se desejar, como caracteres especiais)
 * @param password A senha a ser validada.
 * @returns Um objeto ValidationResult.
 */
export const validatePassword = (password: string): ValidationResult => {
  if (!password) {
    return { isValid: false, message: "A senha é obrigatória." };
  }
  if (password.length < 8) {
    return {
      isValid: false,
      message: "A senha deve ter no mínimo 8 caracteres.",
    };
  }
  // NOVO: Verifica se há pelo menos uma letra maiúscula
  const hasUpperCase = /[A-Z]/.test(password);
  if (!hasUpperCase) {
    return {
      isValid: false,
      message: "A senha deve conter pelo menos uma letra maiúscula.",
    };
  }
  // NOVO: Verifica se há pelo menos um número
  const hasNumber = /[0-9]/.test(password);
  if (!hasNumber) {
    return {
      isValid: false,
      message: "A senha deve conter pelo menos um número.",
    };
  }
  return { isValid: true };
};