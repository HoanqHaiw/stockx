import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

interface TokenPayload {
  sub: string;
}

export function signToken(userId: number): string {
  return jwt.sign({}, config.JWT_SECRET, {
    subject: String(userId),
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Xác thực Bearer token, đồng thời kiểm tra tài khoản còn hoạt động. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  let payload: TokenPayload;
  try {
    payload = jwt.verify(header.slice(7), config.JWT_SECRET) as TokenPayload;
  } catch {
    return next(unauthorized());
  }
  const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
  if (!user || !user.isActive) return next(unauthorized('Tài khoản không tồn tại hoặc đã bị khoá'));
  req.user = { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  next();
};

/** Chỉ cho phép các vai trò được liệt kê. ADMIN luôn được phép. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== 'ADMIN' && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
