import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu bị trùng', details: err.meta } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ error: { code: 'IN_USE', message: 'Dữ liệu đang được sử dụng ở nơi khác' } });
    }
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON không hợp lệ' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } });
};
