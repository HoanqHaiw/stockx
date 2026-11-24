import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // Báo lỗi đúng trường để giao diện hiển thị ngay dưới ô nhập.
      const fields = ((err.meta?.target as string[] | undefined) ?? []).filter((f) => typeof f === 'string');
      const fieldErrors = Object.fromEntries(fields.map((f) => [f, [f === 'code' ? 'Mã này đã tồn tại' : 'Giá trị đã tồn tại']]));
      return res.status(409).json({ error: { code: 'DUPLICATE', message: 'Dữ liệu bị trùng', details: { fieldErrors } } });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy dữ liệu' } });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ error: { code: 'IN_USE', message: 'Dữ liệu đang được sử dụng ở nơi khác' } });
    }
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File quá lớn, tối đa 5MB' : 'File tải lên không hợp lệ';
    return res.status(400).json({ error: { code: err.code, message } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Tham số không hợp lệ', details: err.flatten() } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON không hợp lệ' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống' } });
};
