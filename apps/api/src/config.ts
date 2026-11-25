import 'dotenv/config';
import { z } from 'zod';

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET phải dài ít nhất 32 ký tự'),
    JWT_EXPIRES_IN: z.string().default('8h'),
    PORT: z.coerce.number().default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** Thư mục build của giao diện (apps/web/dist). Có giá trị thì API phục vụ luôn giao diện. */
    WEB_DIST: z.string().optional(),
  })
  .parse(process.env);

export const config = {
  ...env,
  corsOrigins: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
};
