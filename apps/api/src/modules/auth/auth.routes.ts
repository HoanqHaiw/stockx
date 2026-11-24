import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { unauthorized } from '../../lib/errors.js';
import { requireAuth, signToken } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

authRouter.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;
  const user = await prisma.user.findUnique({ where: { email } });
  // So sánh mật khẩu kể cả khi không có user để tránh lộ email tồn tại qua thời gian phản hồi.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok || !user.isActive) throw unauthorized('Email hoặc mật khẩu không đúng');
  res.json({
    token: signToken(user.id),
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
  });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
