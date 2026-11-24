import type { Role } from '@prisma/client';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Query string đã được Zod kiểm tra (Express 5 không cho ghi đè req.query). */
      validatedQuery?: unknown;
    }
  }
}
