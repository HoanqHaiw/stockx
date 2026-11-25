import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { AppError, notFound } from './lib/errors.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { masterRouter } from './modules/master/master.routes.js';
import { partnerRouter } from './modules/master/partner.routes.js';
import { materialsRouter } from './modules/materials/materials.routes.js';
import { purchasingRouter } from './modules/purchasing/purchasing.routes.js';
import { stockRouter } from './modules/stock/stock.routes.js';
import { quotationsRouter, salesOrdersRouter } from './modules/sales/sales.routes.js';
import { debtsRouter, paymentsRouter, reportsRouter } from './modules/finance/finance.routes.js';

export function createApp() {
  const app = express();
  // Chạy sau proxy của nền tảng (Render…) nên lấy IP thật từ X-Forwarded-For để giới hạn đăng nhập đúng người.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));
  if (config.NODE_ENV !== 'test') app.use(morgan(config.NODE_ENV === 'production' ? 'tiny' : 'dev'));

  app.get('/api/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });

  // Chống dò mật khẩu: tối đa 20 lần đăng nhập / 15 phút / IP.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test',
    handler: (_req, _res, next) =>
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau ít phút')),
  });
  app.use('/api/auth/login', loginLimiter);

  app.use('/api/auth', authRouter);
  app.use('/api/master', masterRouter);
  app.use('/api/materials', materialsRouter);
  app.use('/api/suppliers', partnerRouter('supplier', ['PURCHASING']));
  app.use('/api/customers', partnerRouter('customer', ['SALES']));
  app.use('/api/purchase-orders', purchasingRouter);
  app.use('/api/stock', stockRouter);
  app.use('/api/quotations', quotationsRouter);
  app.use('/api/sales-orders', salesOrdersRouter);
  app.use('/api/debts', debtsRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api', (_req, _res, next) => next(notFound('API không tồn tại')));

  // Khi deploy một dịch vụ duy nhất: API phục vụ luôn bản build giao diện (cùng domain, không cần CORS).
  const webDist = config.WEB_DIST && path.resolve(config.WEB_DIST);
  if (webDist && fs.existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1y', immutable: true }));
    // Mọi đường dẫn còn lại là route của React → trả index.html (không cache để luôn nhận bản mới).
    app.get(/.*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((_req, _res, next) => next(notFound('Không tìm thấy trang')));
  app.use(errorHandler);
  return app;
}
