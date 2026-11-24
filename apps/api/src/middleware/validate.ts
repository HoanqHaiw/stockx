import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors.js';

/** Kiểm tra body hoặc query bằng Zod và gán dữ liệu đã chuẩn hoá lại vào request. */
export const validate =
  (schema: ZodTypeAny, source: 'body' | 'query' = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      return next(badRequest('Dữ liệu không hợp lệ', result.error.flatten()));
    }
    if (source === 'body') req.body = result.data;
    else req.validatedQuery = result.data;
    next();
  };
